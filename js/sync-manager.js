/**
 * SyncManager — bidirectional sync between IndexedDB and Supabase.
 * Uses monotonic merge rules to prevent data loss on multi-device conflicts.
 */

class SyncManager {
  /**
   * @param {object} supabaseClient
   * @param {IDBDatabase} db
   * @param {AuthManager} authManager
   */
  constructor(supabaseClient, db, authManager) {
    this._supabase = supabaseClient;
    this._db = db;
    this._auth = authManager;
    this._log = Logger.create('SyncManager');
    this._syncTimeout = null;
    this._syncInProgress = false;
    this._lastSynced = null;
    this._lastError = null;
  }

  async init() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this._log.info('Back online — triggering sync');
      if (this._auth.isLoggedIn()) {
        this.syncToCloud();
      }
    });

    // Sync on tab close (best effort)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this._auth.isLoggedIn()) {
        this.syncToCloud();
      }
    });

    // Initial sync if logged in
    if (this._auth.isLoggedIn()) {
      await this.fullSync();
    }
  }

  /**
   * Full bidirectional sync: pull → merge → push.
   * @returns {Promise<{ success: boolean, synced?: number, error?: string }>}
   */
  async fullSync() {
    if (!this._auth.isLoggedIn()) {
      return { success: false, error: 'Não autenticado' };
    }

    this._updateStatusUI('pending');

    const pullResult = await this.syncFromCloud();
    if (!pullResult.success) {
      this._updateStatusUI('error');
      return pullResult;
    }

    const pushResult = await this.syncToCloud();
    if (!pushResult.success) {
      this._updateStatusUI('error');
      return pushResult;
    }

    this._updateStatusUI('synced');
    return { success: true, synced: (pullResult.synced || 0) + (pushResult.synced || 0) };
  }

  /**
   * Push local data to Supabase.
   */
  async syncToCloud() {
    if (!this._auth.isLoggedIn()) {
      return { success: false, error: 'Não autenticado' };
    }

    if (this._syncInProgress) {
      this._log.debug('Sync already in progress, skipping');
      return { success: true, synced: 0 };
    }

    if (!navigator.onLine) {
      this._updateStatusUI('offline');
      return { success: false, error: 'Offline' };
    }

    this._syncInProgress = true;
    let synced = 0;

    try {
      const userId = this._auth.getUser()?.id;
      if (!userId) throw new Error('No user ID');

      // 1. Sync XP profile → user_progress
      const localProfile = await this._getLocalProfile();
      if (localProfile) {
        const { error } = await this._supabase
          .from('user_progress')
          .upsert({
            user_id: userId,
            total_xp: localProfile.totalXP || 0,
            level: localProfile.level || 0,
            daily_xp: localProfile.dailyXP || 0,
            daily_xp_date: localProfile.dailyXPDate || null,
            weekly_xp: localProfile.weeklyXP || 0,
            weekly_start: localProfile.weeklyStart || null,
            unlocked_rewards: localProfile.unlockedRewards || [],
            current_streak: localProfile.currentStreak || 0,
            longest_streak: localProfile.longestStreak || 0,
            total_questions: localProfile.totalQuestions || 0,
            total_correct: localProfile.totalCorrect || 0,
            expedition_best_floor: localProfile.expeditionBestFloor || 0,
            expedition_total_runs: localProfile.expeditionTotalRuns || 0,
            expedition_completed_runs: localProfile.expeditionCompletedRuns || 0,
            expedition_coins: localProfile.expeditionCoins || 50,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) {
          this._log.error('Progress sync failed:', error.message);
        } else {
          synced++;
        }
      }

      // 2. Sync achievements → user_achievements
      const localAchievements = await this._getLocalAchievements();
      if (localAchievements.length > 0) {
        const rows = localAchievements.map(a => ({
          user_id: userId,
          achievement_id: a.id,
          unlocked_at: a.unlockedAt || new Date().toISOString()
        }));

        const { error } = await this._supabase
          .from('user_achievements')
          .upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });

        if (error) {
          this._log.error('Achievements sync failed:', error.message);
        } else {
          synced++;
        }
      }

      // 3. Sync daily_stats (last 365 days)
      const localStats = await this._getLocalDailyStats();
      if (localStats.length > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (window.SUPABASE_CONFIG?.DAILY_STATS_SYNC_DAYS || 365));
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const recentStats = localStats
          .filter(s => s.dateKey >= cutoffStr)
          .map(s => ({
            user_id: userId,
            date_key: s.dateKey,
            questions_attempted: s.questionsAttempted || 0,
            questions_correct: s.questionsCorrect || 0,
            time_spent_seconds: s.timeSpentSeconds || 0,
            xp_earned: s.xpEarned || 0
          }));

        if (recentStats.length > 0) {
          const { error } = await this._supabase
            .from('daily_stats')
            .upsert(recentStats, { onConflict: 'user_id,date_key' });

          if (error) {
            this._log.error('Daily stats sync failed:', error.message);
          } else {
            synced++;
          }
        }
      }

      this._lastSynced = new Date().toISOString();
      this._lastError = null;
      this._log.info(`Synced to cloud (${synced} tables)`);
      this._updateStatusUI('synced');

      return { success: true, synced };
    } catch (e) {
      this._log.error('SyncToCloud failed:', e);
      this._lastError = e.message;
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    } finally {
      this._syncInProgress = false;
    }
  }

  /**
   * Pull data from Supabase and merge with local using monotonic rules.
   */
  async syncFromCloud() {
    if (!this._auth.isLoggedIn()) {
      return { success: false, error: 'Não autenticado' };
    }

    if (!navigator.onLine) {
      return { success: false, error: 'Offline' };
    }

    try {
      const userId = this._auth.getUser()?.id;
      if (!userId) throw new Error('No user ID');

      let synced = 0;

      // 1. Pull user_progress
      const { data: cloudProgress, error: progressError } = await this._supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (progressError && progressError.code !== 'PGRST116') {
        // PGRST116 = no rows found (first login)
        this._log.warn('Progress pull failed:', progressError.message);
      }

      if (cloudProgress) {
        await this._mergeProgress(cloudProgress);
        synced++;
      }

      // 2. Pull achievements (union merge)
      const { data: cloudAchievements, error: achError } = await this._supabase
        .from('user_achievements')
        .select('achievement_id, unlocked_at')
        .eq('user_id', userId);

      if (achError) {
        this._log.warn('Achievements pull failed:', achError.message);
      }

      if (cloudAchievements && cloudAchievements.length > 0) {
        await this._mergeAchievements(cloudAchievements);
        synced++;
      }

      this._log.info(`Synced from cloud (${synced} tables)`);
      return { success: true, synced };
    } catch (e) {
      this._log.error('SyncFromCloud failed:', e);
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * First-time migration: push all local data to cloud.
   */
  async migrateLocalData() {
    this._log.info('Migrating local data to cloud...');
    return this.syncToCloud();
  }

  /**
   * Debounced trigger for push sync. Called by XPSystem, Achievements, Expedition.
   */
  _scheduleSyncToCloud() {
    if (!this._auth.isLoggedIn()) return;

    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(() => {
      this.syncToCloud();
    }, window.SUPABASE_CONFIG?.SYNC_DEBOUNCE_MS || 30000);

    this._updateStatusUI('pending');
  }

  /**
   * @returns {object} Current sync status
   */
  getSyncStatus() {
    return {
      lastSynced: this._lastSynced,
      pending: this._syncTimeout !== null,
      error: this._lastError,
      isOnline: navigator.onLine
    };
  }

  // ─── Private Methods ───

  async _getLocalProfile() {
    try {
      const tx = this._db.transaction('meta', 'readonly');
      const profile = await idbGet(tx.objectStore('meta'), 'xp_profile');

      // Also get expedition profile
      const expProfile = await idbGet(tx.objectStore('meta'), 'expedition_profile');

      return {
        totalXP: profile?.totalXP || 0,
        level: profile?.level || 0,
        dailyXP: profile?.dailyXP || 0,
        dailyXPDate: profile?.dailyXPDate || null,
        weeklyXP: profile?.weeklyXP || 0,
        weeklyStart: profile?.weeklyStart || null,
        unlockedRewards: profile?.unlockedRewards || [],
        currentStreak: profile?.currentStreak || 0,
        longestStreak: profile?.longestStreak || 0,
        totalQuestions: profile?.totalQuestions || 0,
        totalCorrect: profile?.totalCorrect || 0,
        expeditionBestFloor: expProfile?.bestFloor || 0,
        expeditionTotalRuns: expProfile?.totalRuns || 0,
        expeditionCompletedRuns: expProfile?.completedRuns || 0,
        expeditionCoins: expProfile?.coins || 50,
        lastLocalUpdate: new Date().toISOString()
      };
    } catch (e) {
      this._log.error('Failed to read local profile:', e);
      return null;
    }
  }

  async _getLocalAchievements() {
    try {
      const tx = this._db.transaction('achievements', 'readonly');
      return await idbGetAll(tx.objectStore('achievements'));
    } catch { return []; }
  }

  async _getLocalDailyStats() {
    try {
      const tx = this._db.transaction('daily_stats', 'readonly');
      return await idbGetAll(tx.objectStore('daily_stats'));
    } catch { return []; }
  }

  /**
   * Merge cloud progress with local using monotonic rules.
   */
  async _mergeProgress(cloud) {
    try {
      const tx = this._db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      const local = await idbGet(store, 'xp_profile') || {};

      // Monotonic MAX fields
      const merged = { ...local, key: 'xp_profile' };
      merged.totalXP = Math.max(local.totalXP || 0, cloud.total_xp || 0);
      merged.level = Math.max(local.level || 0, cloud.level || 0);
      merged.longestStreak = Math.max(local.longestStreak || 0, cloud.longest_streak || 0);
      merged.totalQuestions = Math.max(local.totalQuestions || 0, cloud.total_questions || 0);
      merged.totalCorrect = Math.max(local.totalCorrect || 0, cloud.total_correct || 0);

      // LATEST for streak (based on daily_xp_date)
      const localDate = local.dailyXPDate || '';
      const cloudDate = cloud.daily_xp_date || '';
      if (cloudDate >= localDate) {
        merged.currentStreak = cloud.current_streak || 0;
        merged.dailyXP = cloud.daily_xp || 0;
        merged.dailyXPDate = cloud.daily_xp_date;
      }

      // LATEST for weekly (based on weekly_start)
      const localWeek = local.weeklyStart || '';
      const cloudWeek = cloud.weekly_start || '';
      if (cloudWeek >= localWeek) {
        merged.weeklyXP = cloud.weekly_xp || 0;
        merged.weeklyStart = cloud.weekly_start;
      }

      // UNION for rewards
      const localRewards = new Set(local.unlockedRewards || []);
      const cloudRewards = cloud.unlocked_rewards || [];
      cloudRewards.forEach(r => localRewards.add(r));
      merged.unlockedRewards = Array.from(localRewards);

      await idbPut(store, merged);

      // Merge expedition profile (LAST_WRITE_WINS for coins, MAX for others)
      const expTx = this._db.transaction('meta', 'readwrite');
      const expStore = expTx.objectStore('meta');
      const localExp = await idbGet(expStore, 'expedition_profile') || {};

      const mergedExp = { ...localExp, key: 'expedition_profile' };
      mergedExp.bestFloor = Math.max(localExp.bestFloor || 0, cloud.expedition_best_floor || 0);
      mergedExp.totalRuns = Math.max(localExp.totalRuns || 0, cloud.expedition_total_runs || 0);
      mergedExp.completedRuns = Math.max(localExp.completedRuns || 0, cloud.expedition_completed_runs || 0);

      // LAST_WRITE_WINS for coins (cloud wins if cloud updated_at is more recent)
      const cloudUpdated = cloud.updated_at || '';
      const localUpdated = localExp.lastLocalUpdate || '';
      if (cloudUpdated >= localUpdated) {
        mergedExp.coins = cloud.expedition_coins ?? 50;
      }

      await idbPut(expStore, mergedExp);

      this._log.info('Progress merged (local+cloud)');
    } catch (e) {
      this._log.error('Merge progress failed:', e);
    }
  }

  /**
   * Merge cloud achievements with local (UNION — never remove).
   */
  async _mergeAchievements(cloudAchievements) {
    try {
      const tx = this._db.transaction('achievements', 'readwrite');
      const store = tx.objectStore('achievements');
      const localAchievements = await idbGetAll(store);
      const localIds = new Set(localAchievements.map(a => a.id));

      for (const ca of cloudAchievements) {
        if (!localIds.has(ca.achievement_id)) {
          await idbPut(store, {
            id: ca.achievement_id,
            unlockedAt: ca.unlocked_at
          });
        }
      }

      this._log.info('Achievements merged (union)');
    } catch (e) {
      this._log.error('Merge achievements failed:', e);
    }
  }

  /**
   * Update sync status indicator in the header.
   */
  _updateStatusUI(status) {
    const el = document.getElementById('sync-status-indicator');
    if (!el || !this._auth.isLoggedIn()) {
      if (el) el.innerHTML = '';
      return;
    }

    const labels = {
      synced: 'Sincronizado',
      pending: 'Sincronizando...',
      offline: 'Offline',
      error: 'Erro de sync'
    };

    el.innerHTML = `<span class="sync-status sync-status--${status}">${labels[status] || ''}</span>`;
  }
}

window.SyncManager = SyncManager;
