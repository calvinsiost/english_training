/**
 * Stats Dashboard - UI for displaying analytics and statistics
 * Charts, graphs, and performance metrics
 */

class StatsDashboard {
  constructor(analyticsManager) {
    this.analytics = analyticsManager;
    this.container = null;
  }

  // Initialize and render the dashboard
  async render(containerId = 'stats-view') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('Stats container not found:', containerId);
      return;
    }

    // Show loading state
    this.container.innerHTML = '<div class="stats-loading">Carregando estatísticas...</div>';

    // Load data
    const [stats, weakTerms] = await Promise.all([
      this.analytics.getOverallStats(),
      window.wordIntelligence ? window.wordIntelligence.getTopDifficultTerms(10) : Promise.resolve([])
    ]);

    // Render dashboard
    this.container.innerHTML = `
      <div class="stats-dashboard">
        ${this._renderHeader()}
        ${this._renderOverviewCards(stats)}
        ${this._renderProgressChart(stats)}
        ${this._renderSourceBreakdown(stats)}
        ${this._renderWeakTerms(weakTerms)}
        ${this._renderActivityCalendar(stats)}
        ${this._renderInsights(stats)}
      </div>
    `;

    // Initialize charts after DOM update
    this._initCharts(stats);
  }

  _renderHeader() {
    return `
      <div class="stats-header">
        <h2>📊 Estatísticas de Desempenho</h2>
        <p class="stats-subtitle">Acompanhe seu progresso na preparação FUVEST</p>
      </div>
    `;
  }

  _renderOverviewCards(stats) {
    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      if (hours > 0) return `${hours}h ${mins}min`;
      return `${mins}min`;
    };

    return `
      <div class="stats-overview">
        <div class="stats-card stats-card--primary">
          <div class="stats-card__icon">🎯</div>
          <div class="stats-card__value">${stats.predictedScore.toFixed(1)}</div>
          <div class="stats-card__label">Nota Estimada FUVEST</div>
          <div class="stats-card__sublabel">Escala 0-30</div>
        </div>

        <div class="stats-card">
          <div class="stats-card__icon">📚</div>
          <div class="stats-card__value">${stats.totalQuestions}</div>
          <div class="stats-card__label">Questões Respondidas</div>
          <div class="stats-card__sublabel">${stats.overallAccuracy}% de acerto</div>
        </div>

        <div class="stats-card">
          <div class="stats-card__icon">🔥</div>
          <div class="stats-card__value">${stats.currentStreak}</div>
          <div class="stats-card__label">Dias Seguidos</div>
          <div class="stats-card__sublabel">Recorde: ${stats.longestStreak}</div>
        </div>

        <div class="stats-card">
          <div class="stats-card__icon">⏱️</div>
          <div class="stats-card__value">${formatTime(stats.totalTimeSpent)}</div>
          <div class="stats-card__label">Tempo de Estudo</div>
          <div class="stats-card__sublabel">${stats.activeDays} dias ativos</div>
        </div>

        <div class="stats-card">
          <div class="stats-card__icon">📖</div>
          <div class="stats-card__value">${stats.totalPassages}</div>
          <div class="stats-card__label">Textos Lidos</div>
          <div class="stats-card__sublabel">Média: ${stats.totalQuestions > 0 ? (stats.totalQuestions / stats.totalPassages || 0).toFixed(1) : 0} questões/texto</div>
        </div>

        <div class="stats-card">
          <div class="stats-card__icon">✅</div>
          <div class="stats-card__value">${stats.totalCorrect}</div>
          <div class="stats-card__label">Acertos</div>
          <div class="stats-card__sublabel">${stats.totalIncorrect} erros</div>
        </div>
      </div>
    `;
  }

  _renderProgressChart(stats) {
    if (stats.dailyStats.length === 0) {
      return `
        <div class="stats-section">
          <h3>📈 Progresso ao Longo do Tempo</h3>
          <div class="stats-empty">Comece a estudar para ver seu progresso!</div>
        </div>
      `;
    }

    // Prepare data for the chart
    const activeDays = stats.dailyStats.filter(d => d.hasActivity);
    const chartData = stats.dailyStats.slice(-14); // Last 14 days

    // Calculate cumulative accuracy over time
    let cumulativeCorrect = 0;
    let cumulativeTotal = 0;
    const accuracyTrend = chartData.map(day => {
      cumulativeCorrect += day.questionsCorrect;
      cumulativeTotal += day.questionsAttempted;
      return cumulativeTotal > 0 ? Math.round((cumulativeCorrect / cumulativeTotal) * 100) : 0;
    });

    const maxQuestions = Math.max(...chartData.map(d => d.questionsAttempted), 5);
    const maxAccuracy = Math.max(...accuracyTrend, 100);

    return `
      <div class="stats-section">
        <h3>📈 Progresso (Últimos 14 dias)</h3>
        <div class="progress-chart-container">
          <div class="progress-chart">
            <div class="chart-y-axis">
              <span>${maxQuestions}</span>
              <span>${Math.round(maxQuestions / 2)}</span>
              <span>0</span>
            </div>
            <div class="chart-bars">
              ${chartData.map((day, i) => {
                const height = day.questionsAttempted > 0
                  ? (day.questionsAttempted / maxQuestions * 100)
                  : 0;
                const accuracy = day.questionsAttempted > 0
                  ? Math.round((day.questionsCorrect / day.questionsAttempted) * 100)
                  : 0;
                return `
                  <div class="chart-bar-wrapper">
                    <div class="chart-bar ${day.hasActivity ? 'has-data' : ''}"
                         style="height: ${Math.max(height, 2)}%"
                         title="${day.date}: ${day.questionsAttempted} questões, ${accuracy}% acerto">
                      ${day.questionsAttempted > 0 ? `<span class="bar-value">${day.questionsAttempted}</span>` : ''}
                    </div>
                    <div class="chart-label">${this._formatDayLabel(day.dateObj)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          ${accuracyTrend.some(a => a > 0) ? `
            <div class="accuracy-trend">
              <div class="trend-header">
                <span>Tendência de Acerto</span>
                <span class="trend-value">${accuracyTrend[accuracyTrend.length - 1]}%</span>
              </div>
              <div class="trend-line">
                ${this._renderTrendLine(accuracyTrend)}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderTrendLine(values) {
    if (values.length < 2) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Create SVG path
    const width = 100;
    const height = 40;
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return `
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#4eadea"
          stroke-width="2"
          points="${points}"
        />
        ${values.map((v, i) => {
          const x = (i / (values.length - 1)) * width;
          const y = height - ((v - min) / range) * height;
          return `<circle cx="${x}" cy="${y}" r="1.5" fill="#4eadea"/>`;
        }).join('')}
      </svg>
    `;
  }

  _renderSourceBreakdown(stats) {
    const sources = Object.entries(stats.bySource);
    if (sources.length === 0) {
      return '';
    }

    const colors = {
      'FUVEST': '#e94560',
      'UNICAMP': '#00d9ff',
      'UFRGS': '#ff9f43',
      'UFSC': '#10ac84',
      'TEAP': '#5f27cd',
      'CENEX-UFMG': '#f368e0'
    };

    return `
      <div class="stats-section">
        <h3>📊 Desempenho por Instituição</h3>
        <div class="source-breakdown">
          ${sources.map(([source, data]) => {
            const color = colors[source] || '#666';
            return `
              <div class="source-item">
                <div class="source-header">
                  <span class="source-name" style="color: ${color}">${source}</span>
                  <span class="source-accuracy">${data.accuracy}%</span>
                </div>
                <div class="source-bar">
                  <div class="source-bar-fill" style="width: ${data.accuracy}%; background: ${color}"></div>
                </div>
                <div class="source-details">
                  <span>${data.correct}/${data.total} questões</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  _renderActivityCalendar(stats) {
    // Simple activity grid for the last 30 days
    const days = stats.dailyStats.slice(-30);

    return `
      <div class="stats-section">
        <h3>🔥 Calendário de Atividade (30 dias)</h3>
        <div class="activity-calendar">
          ${days.map(day => {
            const intensity = day.questionsAttempted === 0 ? 0
              : day.questionsAttempted < 5 ? 1
              : day.questionsAttempted < 15 ? 2
              : day.questionsAttempted < 30 ? 3
              : 4;
            return `
              <div class="activity-day intensity-${intensity}"
                   title="${day.date}: ${day.questionsAttempted} questões">
              </div>
            `;
          }).join('')}
        </div>
        <div class="calendar-legend">
          <span>Menos</span>
          <div class="legend-box intensity-0"></div>
          <div class="legend-box intensity-1"></div>
          <div class="legend-box intensity-2"></div>
          <div class="legend-box intensity-3"></div>
          <div class="legend-box intensity-4"></div>
          <span>Mais</span>
        </div>
      </div>
    `;
  }

  _renderWeakTerms(weakTerms = []) {
    const escapeHtml = (value = '') => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    if (weakTerms.length === 0) {
      return `
        <div class="stats-section">
          <h3>🧠 Vocabulário Mais Difícil</h3>
          <div class="stats-empty">Ainda sem dados suficientes de dificuldade.</div>
        </div>
      `;
    }

    return `
      <div class="stats-section">
        <h3>🧠 Vocabulário Mais Difícil</h3>
        <div class="weak-terms-list">
          ${weakTerms.map(item => `
            <div class="weak-term-item" title="${escapeHtml(item.term)}">
              <span class="weak-term-label">${escapeHtml(item.term)}</span>
              <span class="weak-term-score">${item.score}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderInsights(stats) {
    const insights = this._generateInsights(stats);

    if (insights.length === 0) {
      return '';
    }

    return `
      <div class="stats-section">
        <h3>💡 Insights</h3>
        <div class="insights-list">
          ${insights.map(insight => `
            <div class="insight-item ${insight.type}">
              <span class="insight-icon">${insight.icon}</span>
              <span class="insight-text">${insight.text}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _generateInsights(stats) {
    const insights = [];

    if (stats.totalQuestions === 0) {
      return [{ icon: '📚', text: 'Comece sua primeira sessão de estudo para gerar insights personalizados!', type: 'info' }];
    }

    // Streak insight
    if (stats.currentStreak >= 7) {
      insights.push({
        icon: '🔥',
        text: `Você está com ${stats.currentStreak} dias de streak! Continue assim!`,
        type: 'success'
      });
    } else if (stats.currentStreak === 0 && stats.totalQuestions > 0) {
      insights.push({
        icon: '⚡',
        text: 'Que tal estudar hoje para começar um novo streak?',
        type: 'warning'
      });
    }

    // Accuracy insight
    if (stats.overallAccuracy >= 80) {
      insights.push({
        icon: '🎯',
        text: `Excelente! Você está acertando ${stats.overallAccuracy}% das questões.`,
        type: 'success'
      });
    } else if (stats.overallAccuracy < 50 && stats.totalQuestions > 20) {
      insights.push({
        icon: '📈',
        text: 'Continue praticando! A consistência é a chave para melhorar.',
        type: 'info'
      });
    }

    // Weak area insight
    const weakAreas = Object.entries(stats.bySource)
      .filter(([_, data]) => data.total >= 5)
      .sort((a, b) => a[1].accuracy - b[1].accuracy);

    if (weakAreas.length > 0 && weakAreas[0][1].accuracy < 60) {
      insights.push({
        icon: '💪',
        text: `Foque em questões ${weakAreas[0][0]} - sua taxa de acerto está em ${weakAreas[0][1].accuracy}%.`,
        type: 'warning'
      });
    }

    // Study time insight
    const avgTimePerQuestion = stats.totalTimeSpent / stats.totalQuestions;
    if (avgTimePerQuestion > 120) {
      insights.push({
        icon: '⏱️',
        text: `Você gasta em média ${Math.round(avgTimePerQuestion / 60)}min por questão. Tente acelerar um pouco!`,
        type: 'info'
      });
    }

    return insights;
  }

  _formatDayLabel(date) {
    if (!date) return '';
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days[date.getDay()];
  }

  _initCharts(stats) {
    // Any additional chart initialization (e.g., Chart.js if added later)
    // For now, our CSS-based charts are already rendered
  }
}

// Export
window.StatsDashboard = StatsDashboard;
