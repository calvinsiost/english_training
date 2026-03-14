/**
 * Analytics System - Performance tracking and statistics
 * Calculates user progress, streaks, and FUVEST score predictions
 */

// Analytics Store Manager
class AnalyticsManager {
  constructor(db) {
    this.db = db;
    this.storeName = 'analytics';
    this.dailyStoreName = 'daily_stats';
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  // Record a study session
  async recordSession(session) {
    if (!this.db) return null;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);

    const record = {
      id: `session_${Date.now()}`,
      date: new Date().toISOString(),
      dateKey: this._getDateKey(),
      passageCount: session.passageCount || 0,
      questionCount: session.questionCount || 0,
      correctCount: session.correctCount || 0,
      incorrectCount: session.incorrectCount || 0,
      timeSpent: session.timeSpent || 0, // seconds
      passages: session.passageIds || [],
      questions: session.questionDetails || [],
      source: session.source || 'mixed'
    };

    await idbAdd(store, record);
    await this._updateDailyStats(record);
    return record;
  }

  // Record a single question attempt
  async recordQuestionAttempt(questionId, isCorrect, confidence, timeSpent, helpUsed = []) {
    if (!this.db) return null;

    const tx = this.db.transaction('question_attempts', 'readwrite');
    const store = tx.objectStore('question_attempts');

    const attempt = {
      id: `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      questionId,
      date: new Date().toISOString(),
      dateKey: this._getDateKey(),
      isCorrect,
      confidence: confidence || 1, // 1-4 scale
      timeSpent: timeSpent || 0,
      helpUsed: helpUsed || []
    };

    await idbAdd(store, attempt);
    return attempt;
  }

  // Update daily aggregated stats
  async _updateDailyStats(sessionRecord) {
    if (!this.db) return;

    const tx = this.db.transaction(this.dailyStoreName, 'readwrite');
    const store = tx.objectStore(this.dailyStoreName);

    const dateKey = this._getDateKey();
    let dailyStats = await idbGet(store, dateKey);

    if (!dailyStats) {
      dailyStats = {
        dateKey,
        date: new Date().toISOString(),
        questionsAttempted: 0,
        questionsCorrect: 0,
        questionsIncorrect: 0,
        timeSpent: 0,
        passagesRead: 0,
        sessionsCompleted: 0,
        streakContinued: false
      };
    }

    dailyStats.questionsAttempted += sessionRecord.questionCount;
    dailyStats.questionsCorrect += sessionRecord.correctCount;
    dailyStats.questionsIncorrect += sessionRecord.incorrectCount;
    dailyStats.timeSpent += sessionRecord.timeSpent;
    dailyStats.passagesRead += sessionRecord.passageCount;
    dailyStats.sessionsCompleted += 1;

    await idbPut(store, dailyStats);
  }

  // Get daily stats for a date range
  async getDailyStatsRange(days = 30) {
    if (!this.db) return [];

    const stats = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = this._getDateKey(date);

      const tx = this.db.transaction(this.dailyStoreName, 'readonly');
      const store = tx.objectStore(this.dailyStoreName);
      const dayStats = await idbGet(store, dateKey);

      stats.push({
        date: dateKey,
        dateObj: date,
        questionsAttempted: dayStats?.questionsAttempted || 0,
        questionsCorrect: dayStats?.questionsCorrect || 0,
        accuracy: dayStats?.questionsAttempted > 0
          ? Math.round((dayStats.questionsCorrect / dayStats.questionsAttempted) * 100)
          : 0,
        timeSpent: dayStats?.timeSpent || 0,
        passagesRead: dayStats?.passagesRead || 0,
        sessionsCompleted: dayStats?.sessionsCompleted || 0,
        hasActivity: !!dayStats
      });
    }

    return stats;
  }

  // Calculate current streak
  async getStreak() {
    if (!this.db) return { current: 0, longest: 0 };

    const tx = this.db.transaction(this.dailyStoreName, 'readonly');
    const store = tx.objectStore(this.dailyStoreName);
    const allStats = await idbGetAll(store);

    // Sort by date descending
    const sortedStats = allStats
      .filter(s => s.questionsAttempted > 0)
      .sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey));

    if (sortedStats.length === 0) return { current: 0, longest: 0 };

    // Calculate current streak
    let currentStreak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    // Check if studied today
    const todayKey = this._getDateKey();
    const studiedToday = sortedStats.some(s => s.dateKey === todayKey);

    // If didn't study today, start checking from yesterday
    if (!studiedToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (const stat of sortedStats) {
      const statDate = new Date(stat.dateKey);
      statDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((checkDate - statDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (diffDays > 0) {
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;

    const chronologicalStats = [...sortedStats].sort((a, b) =>
      new Date(a.dateKey) - new Date(b.dateKey)
    );

    for (const stat of chronologicalStats) {
      if (!lastDate) {
        tempStreak = 1;
      } else {
        const currDate = new Date(stat.dateKey);
        const prevDate = new Date(lastDate);
        const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      lastDate = stat.dateKey;
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return { current: currentStreak, longest: longestStreak };
  }

  // Get performance by source/institution
  async getPerformanceBySource() {
    if (!this.db) return {};

    const tx = this.db.transaction('question_attempts', 'readonly');
    const store = tx.objectStore('question_attempts');
    const attempts = await idbGetAll(store);

    // Also need question bank to get source info
    const bankTx = this.db.transaction('question_bank', 'readonly');
    const bankStore = bankTx.objectStore('question_bank');
    const passages = await idbGetAll(bankStore);

    // Build question -> source mapping
    const questionSourceMap = {};
    passages.forEach(passage => {
      const source = passage.source || 'FUVEST';
      passage.questions?.forEach(q => {
        questionSourceMap[q.id] = source;
      });
    });

    // Aggregate by source
    const bySource = {};
    attempts.forEach(attempt => {
      const source = questionSourceMap[attempt.questionId] || 'Unknown';
      if (!bySource[source]) {
        bySource[source] = { correct: 0, incorrect: 0, total: 0 };
      }
      bySource[source].total++;
      if (attempt.isCorrect) {
        bySource[source].correct++;
      } else {
        bySource[source].incorrect++;
      }
    });

    // Calculate percentages
    Object.keys(bySource).forEach(source => {
      const stats = bySource[source];
      stats.accuracy = stats.total > 0
        ? Math.round((stats.correct / stats.total) * 100)
        : 0;
    });

    return bySource;
  }

  // Get overall statistics
  async getOverallStats() {
    if (!this.db) return this._getDefaultStats();

    const [streak, dailyStats, bySource] = await Promise.all([
      this.getStreak(),
      this.getDailyStatsRange(30),
      this.getPerformanceBySource()
    ]);

    const totalQuestions = dailyStats.reduce((sum, d) => sum + d.questionsAttempted, 0);
    const totalCorrect = dailyStats.reduce((sum, d) => sum + d.questionsCorrect, 0);
    const totalTime = dailyStats.reduce((sum, d) => sum + d.timeSpent, 0);
    const totalPassages = dailyStats.reduce((sum, d) => sum + d.passagesRead, 0);

    // Calculate FUVEST score prediction (0-30 scale)
    // Based on accuracy rate mapped to FUVEST scoring
    const overallAccuracy = totalQuestions > 0
      ? (totalCorrect / totalQuestions)
      : 0;

    // FUVEST scoring: roughly linear from 0 to 30 based on accuracy
    // Using a conservative estimate
    const predictedScore = Math.round(overallAccuracy * 30 * 10) / 10;

    return {
      totalQuestions,
      totalCorrect,
      totalIncorrect: totalQuestions - totalCorrect,
      overallAccuracy: totalQuestions > 0
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0,
      totalTimeSpent: totalTime,
      totalPassages,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      dailyStats,
      bySource,
      predictedScore: Math.min(30, predictedScore),
      activeDays: dailyStats.filter(d => d.hasActivity).length
    };
  }

  // Get activity heatmap data (for calendar view)
  async getActivityHeatmap(year = new Date().getFullYear()) {
    if (!this.db) return [];

    const tx = this.db.transaction(this.dailyStoreName, 'readonly');
    const store = tx.objectStore(this.dailyStoreName);
    const allStats = await idbGetAll(store);

    return allStats
      .filter(s => s.dateKey.startsWith(year.toString()))
      .map(s => ({
        date: s.dateKey,
        count: s.questionsAttempted,
        intensity: Math.min(4, Math.ceil(s.questionsAttempted / 5)) // 0-4 scale
      }));
  }

  // Get weak areas (topics with lowest accuracy)
  async getWeakAreas(limit = 5) {
    // This would require topic classification of questions
    // For now, return placeholder based on sources
    const bySource = await this.getPerformanceBySource();

    return Object.entries(bySource)
      .map(([source, stats]) => ({ source, ...stats }))
      .filter(s => s.total >= 5) // Minimum sample size
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit);
  }

  // Helper: Get date key string (YYYY-MM-DD)
  _getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _getDefaultStats() {
    return {
      totalQuestions: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      overallAccuracy: 0,
      totalTimeSpent: 0,
      totalPassages: 0,
      currentStreak: 0,
      longestStreak: 0,
      dailyStats: [],
      bySource: {},
      predictedScore: 0,
      activeDays: 0
    };
  }
}

// Export
window.AnalyticsManager = AnalyticsManager;
