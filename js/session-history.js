/**
 * Session History - Track and display study sessions
 * Complete record of study sessions with detailed summaries
 */

class SessionHistory {
  constructor(db) {
    this.db = db;
    this.storeName = 'study_sessions';
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  /**
   * Start a new study session
   * @returns {Object} Session object
   */
  startSession(type = 'study') {
    const session = {
      id: `session_${Date.now()}`,
      type, // 'study', 'exam', 'review'
      startTime: new Date().toISOString(),
      endTime: null,
      passageIds: [],
      questions: [],
      stats: {
        totalQuestions: 0,
        correct: 0,
        incorrect: 0,
        timeSpent: 0
      }
    };

    // Store in memory for current session
    this.currentSession = session;
    return session;
  }

  /**
   * Record a question attempt in current session
   */
  recordQuestionAttempt(questionData) {
    if (!this.currentSession) return;

    this.currentSession.questions.push({
      questionId: questionData.questionId,
      passageId: questionData.passageId,
      questionText: questionData.questionText?.substring(0, 100) + '...',
      selectedAnswer: questionData.selectedAnswer,
      correctAnswer: questionData.correctAnswer,
      isCorrect: questionData.isCorrect,
      confidence: questionData.confidence,
      timeSpent: questionData.timeSpent || 0,
      helpUsed: questionData.helpUsed || [],
      timestamp: new Date().toISOString()
    });

    // Update stats
    this.currentSession.stats.totalQuestions++;
    if (questionData.isCorrect) {
      this.currentSession.stats.correct++;
    } else {
      this.currentSession.stats.incorrect++;
    }
  }

  /**
   * Add passage to current session
   */
  addPassage(passageId) {
    if (!this.currentSession) return;
    if (!this.currentSession.passageIds.includes(passageId)) {
      this.currentSession.passageIds.push(passageId);
    }
  }

  /**
   * End current session and save to database
   */
  async endSession() {
    if (!this.currentSession) return null;

    this.currentSession.endTime = new Date().toISOString();
    
    // Calculate total time
    const start = new Date(this.currentSession.startTime);
    const end = new Date(this.currentSession.endTime);
    this.currentSession.stats.timeSpent = Math.round((end - start) / 1000);

    // Save to database
    if (this.db) {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      await idbAdd(store, this.currentSession);
    }

    const savedSession = { ...this.currentSession };
    this.currentSession = null;
    return savedSession;
  }

  /**
   * Get all sessions
   */
  async getAllSessions(limit = 50) {
    if (!this.db) return [];

    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const sessions = await idbGetAll(store);

    // Sort by date descending
    return sessions
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, limit);
  }

  /**
   * Get sessions by date range
   */
  async getSessionsByDateRange(startDate, endDate) {
    if (!this.db) return [];

    const sessions = await this.getAllSessions(1000);
    return sessions.filter(s => {
      const sessionDate = new Date(s.startTime);
      return sessionDate >= startDate && sessionDate <= endDate;
    });
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    if (!this.db) return null;

    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    return idbGet(store, sessionId);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    if (!this.db) return;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await idbDelete(store, sessionId);
  }

  /**
   * Get statistics summary
   */
  async getStatsSummary() {
    if (!this.db) return this._getDefaultStats();

    const sessions = await this.getAllSessions(1000);

    if (sessions.length === 0) {
      return this._getDefaultStats();
    }

    const totalTime = sessions.reduce((sum, s) => sum + (s.stats?.timeSpent || 0), 0);
    const totalQuestions = sessions.reduce((sum, s) => sum + (s.stats?.totalQuestions || 0), 0);
    const totalCorrect = sessions.reduce((sum, s) => sum + (s.stats?.correct || 0), 0);

    // Calculate sessions this week
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const sessionsThisWeek = sessions.filter(s => new Date(s.startTime) >= weekAgo).length;

    // Calculate average session length
    const avgSessionTime = sessions.length > 0
      ? Math.round(totalTime / sessions.length)
      : 0;

    // Calculate average accuracy
    const avgAccuracy = totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;

    return {
      totalSessions: sessions.length,
      totalTime,
      totalQuestions,
      totalCorrect,
      avgAccuracy,
      avgSessionTime,
      sessionsThisWeek,
      longestSession: Math.max(...sessions.map(s => s.stats?.timeSpent || 0), 0),
      bestAccuracy: Math.max(...sessions.map(s => {
        const total = s.stats?.totalQuestions || 0;
        const correct = s.stats?.correct || 0;
        return total > 0 ? Math.round((correct / total) * 100) : 0;
      }), 0)
    };
  }

  /**
   * Export sessions as CSV
   */
  async exportToCSV() {
    const sessions = await this.getAllSessions(1000);
    
    if (sessions.length === 0) return null;

    const headers = ['Data', 'Tipo', 'Questões', 'Acertos', 'Erros', 'Aproveitamento%', 'Tempo(min)', 'Textos'];
    
    const rows = sessions.map(s => {
      const date = new Date(s.startTime).toLocaleDateString('pt-BR');
      const accuracy = s.stats.totalQuestions > 0
        ? Math.round((s.stats.correct / s.stats.totalQuestions) * 100)
        : 0;
      const timeMinutes = Math.round((s.stats.timeSpent || 0) / 60);
      
      return [
        date,
        s.type,
        s.stats.totalQuestions,
        s.stats.correct,
        s.stats.incorrect,
        accuracy,
        timeMinutes,
        s.passageIds.length
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  _getDefaultStats() {
    return {
      totalSessions: 0,
      totalTime: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      avgAccuracy: 0,
      avgSessionTime: 0,
      sessionsThisWeek: 0,
      longestSession: 0,
      bestAccuracy: 0
    };
  }
}

// UI Component for Session History
class SessionHistoryUI {
  constructor(sessionHistory) {
    this.history = sessionHistory;
  }

  async render(containerId = 'session-history-view') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.container.innerHTML = '<div class="stats-loading">Carregando histórico...</div>';

    const [sessions, stats] = await Promise.all([
      this.history.getAllSessions(30),
      this.history.getStatsSummary()
    ]);

    this.container.innerHTML = `
      <div class="session-history">
        ${this._renderSummary(stats)}
        ${this._renderSessionsList(sessions)}
      </div>
    `;

    this._attachEventListeners();
  }

  _renderSummary(stats) {
    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      if (hours > 0) return `${hours}h ${mins}min`;
      return `${mins}min`;
    };

    return `
      <div class="session-summary">
        <h3>Resumo de Sessões</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-value">${stats.totalSessions}</span>
            <span class="summary-label">Total de Sessões</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">${formatTime(stats.totalTime)}</span>
            <span class="summary-label">Tempo Total</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">${stats.avgAccuracy}%</span>
            <span class="summary-label">Média de Acerto</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">${stats.sessionsThisWeek}</span>
            <span class="summary-label">Esta Semana</span>
          </div>
        </div>
        <div class="session-actions">
          <button id="export-sessions-btn" class="btn-secondary">
            <i data-lucide="download"></i> Exportar CSV
          </button>
        </div>
      </div>
    `;
  }

  _renderSessionsList(sessions) {
    if (sessions.length === 0) {
      return `
        <div class="sessions-list">
          <h3>Histórico de Sessões</h3>
          <div class="empty-state">
            <i data-lucide="calendar-x"></i>
            <p>Nenhuma sessão registrada ainda.</p>
            <p class="empty-hint">Comece a estudar para ver seu histórico!</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="sessions-list">
        <h3>Histórico de Sessões</h3>
        <div class="sessions-timeline">
          ${sessions.map(session => this._renderSessionCard(session)).join('')}
        </div>
      </div>
    `;
  }

  _renderSessionCard(session) {
    const date = new Date(session.startTime);
    const dateStr = date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short',
      year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const typeIcons = {
      study: '📚',
      exam: '📝',
      review: '🔄'
    };

    const typeLabels = {
      study: 'Estudo',
      exam: 'Simulado',
      review: 'Revisão'
    };

    const duration = session.stats?.timeSpent 
      ? Math.round(session.stats.timeSpent / 60) 
      : 0;

    const accuracy = session.stats?.totalQuestions > 0
      ? Math.round((session.stats.correct / session.stats.totalQuestions) * 100)
      : 0;

    return `
      <div class="session-card" data-session-id="${session.id}">
        <div class="session-header">
          <div class="session-type">
            <span class="session-icon">${typeIcons[session.type] || '📚'}</span>
            <span class="session-type-label">${typeLabels[session.type] || 'Estudo'}</span>
          </div>
          <div class="session-date">
            <span class="date">${dateStr}</span>
            <span class="time">${timeStr}</span>
          </div>
        </div>
        <div class="session-stats">
          <div class="stat-item">
            <span class="stat-value">${session.stats?.totalQuestions || 0}</span>
            <span class="stat-label">Questões</span>
          </div>
          <div class="stat-item">
            <span class="stat-value ${accuracy >= 70 ? 'good' : accuracy >= 50 ? 'medium' : 'poor'}">${accuracy}%</span>
            <span class="stat-label">Acerto</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${duration}min</span>
            <span class="stat-label">Duração</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${session.passageIds?.length || 0}</span>
            <span class="stat-label">Textos</span>
          </div>
        </div>
        <div class="session-footer">
          <button class="btn-expand" data-session-id="${session.id}">
            <i data-lucide="chevron-down"></i> Ver detalhes
          </button>
        </div>
        <div class="session-details" id="details-${session.id}" style="display: none;">
          ${this._renderSessionDetails(session)}
        </div>
      </div>
    `;
  }

  _renderSessionDetails(session) {
    if (!session.questions || session.questions.length === 0) {
      return '<p class="no-details">Detalhes não disponíveis</p>';
    }

    return `
      <div class="questions-list">
        ${session.questions.map((q, i) => `
          <div class="question-item ${q.isCorrect ? 'correct' : 'incorrect'}">
            <span class="question-num">${i + 1}</span>
            <span class="question-text">${q.questionText}</span>
            <span class="question-result">${q.isCorrect ? '✓' : '✗'} ${q.selectedAnswer}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  _attachEventListeners() {
    // Export button
    const exportBtn = document.getElementById('export-sessions-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        const csv = await this.history.exportToCSV();
        if (csv) {
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `historico_sessoes_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }

    // Expand buttons
    this.container.querySelectorAll('.btn-expand').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = e.currentTarget.dataset.sessionId;
        const details = document.getElementById(`details-${sessionId}`);
        if (details) {
          const isVisible = details.style.display !== 'none';
          details.style.display = isVisible ? 'none' : 'block';
          e.currentTarget.innerHTML = isVisible 
            ? '<i data-lucide="chevron-down"></i> Ver detalhes'
            : '<i data-lucide="chevron-up"></i> Ocultar detalhes';
          if (window.lucide) window.lucide.createIcons();
        }
      });
    });
  }
}

// Export
window.SessionHistory = SessionHistory;
window.SessionHistoryUI = SessionHistoryUI;
