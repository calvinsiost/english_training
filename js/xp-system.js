/**
 * XP System - English Training
 * Experience points, leveling, rewards, and treasure questions.
 * Loaded as classic script after idb-helpers.js.
 */

const XP_LEVEL_BASE = 100;
const XP_LEVEL_EXPONENT = 1.5;
const TREASURE_CHANCE = 0.10;

const XP_REWARDS = {
  ANSWER_CORRECT: 10,
  ANSWER_CORRECT_CERTEZA: 15,
  ANSWER_INCORRECT: 3,
  STREAK_BONUS_PER_DAY: 5,
  STREAK_BONUS_CAP: 30,
  FLASHCARD_REVIEW: 3,
  SRS_REVIEW: 5,
  DAILY_CHALLENGE: 25,
  LESSON_COMPLETE: 20,
  EXAM_COMPLETE: 50,
  TREASURE_MULTIPLIER: 2
};

const XP_REASONS = [
  'answer_correct', 'answer_incorrect', 'streak_bonus', 'daily_challenge',
  'lesson_complete', 'flashcard_review', 'srs_review', 'exam_complete', 'treasure',
  'expedition'
];

const COSMETIC_REWARDS = [
  { level: 3, id: 'badge_iniciante', label: 'Badge Iniciante', type: 'badge' },
  { level: 5, id: 'theme_neon', label: 'Tema Neon', type: 'theme' },
  { level: 5, id: 'theme_ocean', label: 'Tema Ocean', type: 'theme' },
  { level: 10, id: 'title_dedicado', label: 'Estudante Dedicado', type: 'title' },
  { level: 15, id: 'theme_sunset', label: 'Tema Sunset', type: 'theme' },
  { level: 20, id: 'title_veterano', label: 'Veterano FUVEST', type: 'title' },
  { level: 30, id: 'theme_gold', label: 'Tema Gold', type: 'theme' },
  { level: 50, id: 'title_mestre', label: 'Mestre', type: 'title' }
];

class XPSystem {
  constructor(db) {
    this.db = db;
    this._profile = null;
  }

  async init() {
    await this._loadProfile();
    console.log('[XPSystem] Initialized - Level', this._profile.level, 'XP', this._profile.totalXP);
  }

  /**
   * Award XP to the user.
   * @param {number} amount - Base XP amount (>= 0)
   * @param {string} reason - One of XP_REASONS
   * @param {number} multiplier - XP multiplier (default 1)
   * @returns {Promise<{id, amount, reason, level, leveledUp, newRewards}>}
   */
  async awardXP(amount, reason, multiplier = 1) {
    if (amount < 0) throw new Error('XP nao pode ser negativo');
    if (!XP_REASONS.includes(reason)) {
      console.warn('[XPSystem] Unknown reason:', reason);
    }

    const finalAmount = Math.round(amount * multiplier);
    if (finalAmount === 0) return null;

    const now = new Date();
    const dayKey = now.toISOString().split('T')[0];
    const weekStart = this._getWeekStart(now);

    // Reset daily/weekly if needed
    if (this._profile.dailyXPDate !== dayKey) {
      this._profile.dailyXP = 0;
      this._profile.dailyXPDate = dayKey;
    }
    if (this._profile.weeklyStart !== weekStart) {
      this._profile.weeklyXP = 0;
      this._profile.weeklyStart = weekStart;
    }

    const oldLevel = this._profile.level;
    this._profile.totalXP += finalAmount;
    this._profile.dailyXP += finalAmount;
    this._profile.weeklyXP += finalAmount;

    // Calculate new level
    const newLevel = this.getLevelForXP(this._profile.totalXP);
    this._profile.level = newLevel;

    // Check for new rewards
    const newRewards = [];
    for (const reward of COSMETIC_REWARDS) {
      if (reward.level <= newLevel && !this._profile.unlockedRewards.includes(reward.id)) {
        this._profile.unlockedRewards.push(reward.id);
        newRewards.push(reward);
      }
    }

    // Log XP event
    const xpEvent = {
      id: 'xp_' + now.getTime(),
      amount: finalAmount,
      reason,
      multiplier,
      timestamp: now.toISOString(),
      dayKey
    };

    // Persist
    try {
      const tx = this.db.transaction(['xp_log', 'meta'], 'readwrite');
      tx.objectStore('xp_log').put(xpEvent);
      tx.objectStore('meta').put({ key: 'xp_profile', ...this._profile });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    } catch (e) {
      console.error('[XPSystem] Save error:', e);
    }

    const leveledUp = newLevel > oldLevel;

    // Show UI feedback
    this._showXPPopup(finalAmount, multiplier > 1);
    if (leveledUp) {
      this._showLevelUpModal(newLevel, newRewards);
    }

    return {
      id: xpEvent.id,
      amount: finalAmount,
      reason,
      level: newLevel,
      leveledUp,
      newRewards
    };
  }

  /** Calculate level for given total XP */
  getLevelForXP(xp) {
    let level = 0;
    let cumulative = 0;
    while (true) {
      const nextLevelXP = this.getXPForLevel(level + 1);
      if (cumulative + nextLevelXP > xp) break;
      cumulative += nextLevelXP;
      level++;
    }
    return level;
  }

  /** XP required FOR a specific level (not cumulative) */
  getXPForLevel(level) {
    return Math.round(XP_LEVEL_BASE * Math.pow(level, XP_LEVEL_EXPONENT));
  }

  /** Get cumulative XP needed to reach a level */
  getCumulativeXPForLevel(level) {
    let total = 0;
    for (let i = 1; i <= level; i++) {
      total += this.getXPForLevel(i);
    }
    return total;
  }

  /** Get current profile */
  getProfile() {
    const cumulativeCurrent = this.getCumulativeXPForLevel(this._profile.level);
    const cumulativeNext = this.getCumulativeXPForLevel(this._profile.level + 1);
    return {
      ...this._profile,
      currentLevelXP: this._profile.totalXP - cumulativeCurrent,
      xpToNextLevel: cumulativeNext - this._profile.totalXP
    };
  }

  /** Determine if current question should be a treasure question */
  isTreasureQuestion() {
    return Math.random() < TREASURE_CHANCE;
  }

  /** Get XP reward constants */
  static get REWARDS() {
    return XP_REWARDS;
  }

  // --- Internal ---

  async _loadProfile() {
    try {
      const tx = this.db.transaction('meta', 'readonly');
      const stored = await idbGet(tx.objectStore('meta'), 'xp_profile');
      if (stored) {
        this._profile = {
          totalXP: stored.totalXP || 0,
          level: stored.level || 0,
          dailyXP: stored.dailyXP || 0,
          dailyXPDate: stored.dailyXPDate || '',
          weeklyXP: stored.weeklyXP || 0,
          weeklyStart: stored.weeklyStart || '',
          unlockedRewards: stored.unlockedRewards || []
        };
        return;
      }
    } catch (e) {
      console.warn('[XPSystem] Load profile error:', e);
    }
    this._profile = {
      totalXP: 0,
      level: 0,
      dailyXP: 0,
      dailyXPDate: '',
      weeklyXP: 0,
      weeklyStart: '',
      unlockedRewards: []
    };
  }

  _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.toISOString().split('T')[0];
  }

  _showXPPopup(amount, isTreasure) {
    const popup = document.createElement('div');
    popup.className = 'xp-popup' + (isTreasure ? ' xp-popup--treasure' : '');
    popup.textContent = '+' + amount + ' XP';
    document.body.appendChild(popup);

    // Trigger animation
    requestAnimationFrame(() => popup.classList.add('xp-popup--visible'));

    setTimeout(() => {
      popup.classList.add('xp-popup--fade');
      setTimeout(() => popup.remove(), 500);
    }, 1500);
  }

  _showLevelUpModal(level, newRewards) {
    const overlay = document.createElement('div');
    overlay.className = 'levelup-overlay';

    let rewardsHtml = '';
    if (newRewards.length > 0) {
      rewardsHtml = '<div class="levelup-rewards">' +
        newRewards.map(r => `<div class="levelup-reward">${r.label}</div>`).join('') +
        '</div>';
    }

    overlay.innerHTML = `
      <div class="levelup-modal">
        <div class="levelup-confetti"></div>
        <div class="levelup-badge">${level}</div>
        <h2>Level Up!</h2>
        <p>Voce alcancou o nivel ${level}</p>
        ${rewardsHtml}
        <button class="btn btn--primary levelup-close">Continuar</button>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('levelup-overlay--visible'));

    overlay.querySelector('.levelup-close').addEventListener('click', () => {
      overlay.classList.remove('levelup-overlay--visible');
      setTimeout(() => overlay.remove(), 300);
    });

    // Auto-dismiss after 5s
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.classList.remove('levelup-overlay--visible');
        setTimeout(() => overlay.remove(), 300);
      }
    }, 5000);
  }

  /** Update the XP bar in dashboard */
  updateDashboardXP() {
    const profile = this.getProfile();

    const levelEl = document.getElementById('xp-level');
    const xpBarEl = document.getElementById('xp-bar-fill');
    const xpTextEl = document.getElementById('xp-bar-text');
    const dailyXPEl = document.getElementById('xp-daily');

    if (levelEl) levelEl.textContent = profile.level;
    if (xpBarEl) {
      const nextLevelXP = this.getXPForLevel(profile.level + 1);
      const pct = nextLevelXP > 0 ? Math.min(100, (profile.currentLevelXP / nextLevelXP) * 100) : 0;
      xpBarEl.style.width = pct + '%';
    }
    if (xpTextEl) {
      const nextLevelXP = this.getXPForLevel(profile.level + 1);
      xpTextEl.textContent = `${profile.currentLevelXP} / ${nextLevelXP} XP`;
    }
    if (dailyXPEl) dailyXPEl.textContent = profile.dailyXP;
  }
}

// Export to global scope
window.XPSystem = XPSystem;
