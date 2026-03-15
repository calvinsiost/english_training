/**
 * Achievements System - Gamification
 */

const ACHIEVEMENTS = {
  first_question: {
    id: 'first_question',
    name: 'Primeira Questão',
    description: 'Responda sua primeira questão',
    icon: '🎯',
    condition: (stats) => stats.totalQuestions >= 1
  },
  streak_7: {
    id: 'streak_7',
    name: 'Maratonista',
    description: '7 dias de streak',
    icon: '🔥',
    condition: (stats) => stats.currentStreak >= 7
  },
  streak_30: {
    id: 'streak_30',
    name: 'Mestre da Consistência',
    description: '30 dias de streak',
    icon: '👑',
    condition: (stats) => stats.currentStreak >= 30
  },
  expert_fuvest: {
    id: 'expert_fuvest',
    name: 'Expert FUVEST',
    description: '80% de acerto em 50 questões FUVEST',
    icon: '🧠',
    condition: (stats) => stats.fuvestAccuracy >= 80 && stats.fuvestQuestions >= 50
  },
  polyglot: {
    id: 'polyglot',
    name: 'Poliglota',
    description: 'Traduza 100 palavras',
    icon: '🌍',
    condition: (stats) => stats.translations >= 100
  },
  speedster: {
    id: 'speedster',
    name: 'Velocista',
    description: 'Responda uma questão em menos de 30s',
    icon: '⚡',
    condition: (stats) => stats.fastAnswers >= 1
  },
  master_english: {
    id: 'master_english',
    name: 'Mestre do Inglês',
    description: 'Complete todas as questões do banco',
    icon: '🎓',
    condition: (stats) => stats.completionRate >= 100
  },
  exam_taker: {
    id: 'exam_taker',
    name: 'Vestibulando',
    description: 'Complete 5 simulados',
    icon: '📝',
    condition: (stats) => stats.examsCompleted >= 5
  },
  note_taker: {
    id: 'note_taker',
    name: 'Anotador',
    description: 'Crie 20 anotações',
    icon: '📌',
    condition: (stats) => stats.notesCreated >= 20
  },
  flashcard_master: {
    id: 'flashcard_master',
    name: 'Revisor de Cartões',
    description: 'Revise 100 flashcards',
    icon: '🎴',
    condition: (stats) => stats.flashcardsReviewed >= 100
  },
  first_expedition: {
    id: 'first_expedition',
    name: 'Primeira Expedição',
    description: 'Complete sua primeira expedição',
    icon: '🧭',
    condition: (stats) => stats.expeditionsCompleted >= 1
  },
  expedition_floor_5: {
    id: 'expedition_floor_5',
    name: 'Explorador',
    description: 'Alcance o andar 5 na expedição',
    icon: '🗺️',
    condition: (stats) => stats.expeditionBestFloor >= 5
  },
  expedition_floor_10: {
    id: 'expedition_floor_10',
    name: 'Aventureiro',
    description: 'Alcance o andar 10 na expedição',
    icon: '⛰️',
    condition: (stats) => stats.expeditionBestFloor >= 10
  },
  expedition_perfect: {
    id: 'expedition_perfect',
    name: 'Intocável',
    description: 'Complete uma expedição sem perder coração',
    icon: '💎',
    condition: (stats) => stats.expeditionPerfectRuns >= 1
  },
  expedition_boss_hunter: {
    id: 'expedition_boss_hunter',
    name: 'Caçador de Bosses',
    description: 'Derrote 10 bosses na expedição',
    icon: '🐉',
    condition: (stats) => stats.expeditionBossesDefeated >= 10
  },
  expedition_relic_collector: {
    id: 'expedition_relic_collector',
    name: 'Colecionador',
    description: 'Desbloqueie todas as relíquias',
    icon: '🏺',
    condition: (stats) => stats.expeditionRelicsUnlocked >= 5
  }
};

class AchievementsManager {
  constructor(db) {
    this.db = db;
    this.storeName = 'achievements';
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  async checkAchievements(stats) {
    const unlocked = [];
    
    for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
      const alreadyUnlocked = await this.isUnlocked(key);
      if (!alreadyUnlocked && achievement.condition(stats)) {
        await this.unlockAchievement(key);
        unlocked.push(achievement);
      }
    }
    
    return unlocked;
  }

  async isUnlocked(achievementId) {
    if (!this.db) return false;
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const result = await idbGet(store, achievementId);
    return !!result;
  }

  async unlockAchievement(achievementId) {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await idbPut(store, {
      id: achievementId,
      unlockedAt: new Date().toISOString()
    });

    // Trigger cloud sync (debounced)
    if (window.syncManager) {
      window.syncManager._scheduleSyncToCloud();
    }
  }

  async getUnlockedAchievements() {
    if (!this.db) return [];
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const unlocked = await idbGetAll(store);
    
    return unlocked.map(u => ({
      ...ACHIEVEMENTS[u.id],
      unlockedAt: u.unlockedAt
    }));
  }

  async getProgress() {
    const total = Object.keys(ACHIEVEMENTS).length;
    const unlocked = await this.getUnlockedAchievements();
    return {
      total,
      unlocked: unlocked.length,
      percentage: Math.round((unlocked.length / total) * 100)
    };
  }
}

class AchievementsUI {
  constructor(achievementsManager) {
    this.manager = achievementsManager;
  }

  async render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const [unlocked, progress] = await Promise.all([
      this.manager.getUnlockedAchievements(),
      this.manager.getProgress()
    ]);

    const unlockedIds = new Set(unlocked.map(u => u.id));

    container.innerHTML = `
      <div class="achievements-container">
        <div class="achievements-progress">
          <h3>Conquistas</h3>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress.percentage}%"></div>
          </div>
          <span>${progress.unlocked}/${progress.total} desbloqueadas</span>
        </div>
        
        <div class="achievements-grid">
          ${Object.values(ACHIEVEMENTS).map(ach => {
            const isUnlocked = unlockedIds.has(ach.id);
            return `
              <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
                <span class="achievement-icon">${ach.icon}</span>
                <span class="achievement-name">${ach.name}</span>
                <span class="achievement-desc">${ach.description}</span>
                ${isUnlocked ? '<span class="achievement-badge">✓</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  showUnlockNotification(achievement) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
      <span class="achievement-icon">${achievement.icon}</span>
      <div>
        <strong>Conquista Desbloqueada!</strong>
        <span>${achievement.name}</span>
      </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

window.AchievementsManager = AchievementsManager;
window.AchievementsUI = AchievementsUI;
