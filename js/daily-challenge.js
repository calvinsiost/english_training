/**
 * Daily Challenge - English Training
 * Rotating daily challenges with XP rewards.
 * Loaded as classic script after idb-helpers.js.
 */

const DAILY_CHALLENGE_TYPES = [
  { type: 'speed', title: 'Velocista', description: '5 questoes em 3 minutos', target: 5, metric: 'speed_answers' },
  { type: 'accuracy', title: 'Precisao', description: '3 corretas consecutivas', target: 3, metric: 'consecutive_correct' },
  { type: 'vocabulary', title: 'Vocabulario', description: 'Traduzir 5 palavras', target: 5, metric: 'translations' },
  { type: 'review', title: 'Revisao', description: '10 cards SRS revisados', target: 10, metric: 'srs_reviews' },
  { type: 'variety', title: 'Variedade', description: '1 questao de cada tipo (min 4)', target: 4, metric: 'unique_types' },
  { type: 'marathon', title: 'Maratona', description: '15 questoes respondidas', target: 15, metric: 'total_answers' },
  { type: 'perfect', title: 'Perfeicao', description: '5 corretas sem ajuda', target: 5, metric: 'correct_no_help' },
  { type: 'expedition', title: 'Explorador', description: 'Complete 1 expedicao', target: 1, metric: 'expeditions_completed' }
];

const DAILY_CHALLENGE_XP = 25;

class DailyChallenge {
  constructor(db) {
    this.db = db;
    this._challenge = null;
    this._counters = {};
  }

  async init() {
    await this._loadOrCreateChallenge();
    console.log('[DailyChallenge] Initialized -', this._challenge.title,
      '(' + this._challenge.progress + '/' + this._challenge.target + ')');
  }

  /** Get today's challenge */
  getTodayChallenge() {
    return { ...this._challenge };
  }

  /**
   * Record progress toward today's challenge.
   * @param {string} metric - The metric that changed
   * @param {number} amount - Amount to add
   * @returns {Promise<{progress, completed, xpAwarded}>}
   */
  async recordProgress(metric, amount = 1) {
    if (!this._challenge || this._challenge.completed) {
      return { progress: this._challenge?.progress || 0, completed: true, xpAwarded: 0 };
    }

    if (amount < 0) return { progress: this._challenge.progress, completed: false, xpAwarded: 0 };

    // Check if this metric matches the current challenge
    if (metric !== this._challenge.metric) {
      return { progress: this._challenge.progress, completed: false, xpAwarded: 0 };
    }

    this._challenge.progress = Math.min(this._challenge.progress + amount, this._challenge.target);

    let xpAwarded = 0;
    if (this._challenge.progress >= this._challenge.target && !this._challenge.completed) {
      this._challenge.completed = true;
      this._challenge.completedAt = new Date().toISOString();

      // Award XP
      if (window.xpSystem) {
        const result = await window.xpSystem.awardXP(DAILY_CHALLENGE_XP, 'daily_challenge');
        xpAwarded = result ? result.amount : 0;
      }

      // Show celebration
      this._showCompletionAnimation();
    }

    // Persist
    await this._saveChallenge();

    // Update dashboard UI
    this.updateDashboardCard();

    return {
      progress: this._challenge.progress,
      completed: this._challenge.completed,
      xpAwarded
    };
  }

  /** Get completion rate over last N days */
  async getCompletionRate(days = 30) {
    try {
      const tx = this.db.transaction('meta', 'readonly');
      const history = await idbGet(tx.objectStore('meta'), 'daily_challenge_history');
      if (!history || !history.value) return 0;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const recent = history.value.filter(h => h.dayKey >= cutoffStr);
      if (recent.length === 0) return 0;

      const completed = recent.filter(h => h.completed).length;
      return Math.round((completed / recent.length) * 100);
    } catch (e) {
      return 0;
    }
  }

  /** Get challenge history */
  async getHistory(days = 30) {
    try {
      const tx = this.db.transaction('meta', 'readonly');
      const history = await idbGet(tx.objectStore('meta'), 'daily_challenge_history');
      if (!history || !history.value) return [];

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      return history.value.filter(h => h.dayKey >= cutoffStr).reverse();
    } catch (e) {
      return [];
    }
  }

  /** Update the dashboard card UI */
  updateDashboardCard() {
    const card = document.getElementById('daily-challenge-card');
    if (!card) return;

    const c = this._challenge;
    const pct = c.target > 0 ? Math.min(100, (c.progress / c.target) * 100) : 0;

    const titleEl = card.querySelector('.challenge-title');
    const descEl = card.querySelector('.challenge-desc');
    const progressBarEl = card.querySelector('.challenge-progress-fill');
    const progressTextEl = card.querySelector('.challenge-progress-text');
    const statusEl = card.querySelector('.challenge-status');

    if (titleEl) titleEl.textContent = c.title;
    if (descEl) descEl.textContent = c.description;
    if (progressBarEl) progressBarEl.style.width = pct + '%';
    if (progressTextEl) progressTextEl.textContent = c.progress + '/' + c.target;
    if (statusEl) {
      if (c.completed) {
        statusEl.textContent = 'Completo!';
        statusEl.className = 'challenge-status challenge-status--done';
        card.classList.add('challenge-card--done');
      } else {
        statusEl.textContent = '+' + DAILY_CHALLENGE_XP + ' XP';
        statusEl.className = 'challenge-status';
        card.classList.remove('challenge-card--done');
      }
    }
  }

  // --- Internal ---

  async _loadOrCreateChallenge() {
    const dayKey = new Date().toISOString().split('T')[0];
    const metaKey = 'daily_challenge_' + dayKey;

    try {
      const tx = this.db.transaction('meta', 'readonly');
      const stored = await idbGet(tx.objectStore('meta'), metaKey);
      if (stored && stored.value) {
        this._challenge = stored.value;
        return;
      }
    } catch (e) {
      console.warn('[DailyChallenge] Load error:', e);
    }

    // Archive yesterday's challenge before creating new one
    await this._archiveYesterday();

    // Create new challenge based on day of week
    const dow = new Date().getDay(); // 0=Sun, 1=Mon...
    const challengeDef = DAILY_CHALLENGE_TYPES[dow];

    // Add weekly variation: increase target on even weeks
    const weekNum = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
    const targetBonus = weekNum % 2 === 0 ? Math.ceil(challengeDef.target * 0.2) : 0;

    this._challenge = {
      id: 'dc_' + dayKey,
      dayKey,
      type: challengeDef.type,
      title: challengeDef.title,
      description: challengeDef.description,
      metric: challengeDef.metric,
      target: challengeDef.target + targetBonus,
      progress: 0,
      completed: false,
      completedAt: null,
      xpReward: DAILY_CHALLENGE_XP
    };

    await this._saveChallenge();
  }

  async _saveChallenge() {
    try {
      const metaKey = 'daily_challenge_' + this._challenge.dayKey;
      const tx = this.db.transaction('meta', 'readwrite');
      await idbPut(tx.objectStore('meta'), { key: metaKey, value: this._challenge });
    } catch (e) {
      console.warn('[DailyChallenge] Save error:', e);
    }
  }

  async _archiveYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    const metaKey = 'daily_challenge_' + yesterdayKey;

    try {
      const tx = this.db.transaction('meta', 'readwrite');
      const meta = tx.objectStore('meta');
      const stored = await idbGet(meta, metaKey);
      if (!stored) return;

      // Load or create history array
      const historyRec = await idbGet(meta, 'daily_challenge_history');
      const history = historyRec?.value || [];

      history.push({
        dayKey: yesterdayKey,
        type: stored.value.type,
        completed: stored.value.completed,
        progress: stored.value.progress,
        target: stored.value.target
      });

      // Keep last 90 days
      while (history.length > 90) history.shift();

      await idbPut(meta, { key: 'daily_challenge_history', value: history });
    } catch (e) {
      console.warn('[DailyChallenge] Archive error:', e);
    }
  }

  _showCompletionAnimation() {
    const card = document.getElementById('daily-challenge-card');
    if (card) {
      card.classList.add('challenge-card--celebrating');
      setTimeout(() => card.classList.remove('challenge-card--celebrating'), 2000);
    }

    // Show toast
    if (typeof showToast === 'function') {
      showToast('Desafio diario completo! +' + DAILY_CHALLENGE_XP + ' XP', 'success');
    }
  }
}

// Export to global scope
window.DailyChallenge = DailyChallenge;
