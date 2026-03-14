/**
 * Exam Results - Display exam results and comparison
 */

class ExamResults {
  constructor() {
    this.cutoffData = {
      // FUVEST historical cutoff data (approximate)
      // Format: { year: { course: { passing_score, average_score } } }
      2026: {
        'medicina': { passing: 24.5, average: 18.2 },
        'direito': { passing: 22.0, average: 16.5 },
        'engenharia': { passing: 20.0, average: 15.0 },
        'administracao': { passing: 18.0, average: 14.0 },
        'ciencias': { passing: 16.0, average: 12.5 }
      },
      2025: {
        'medicina': { passing: 24.0, average: 17.8 },
        'direito': { passing: 21.5, average: 16.0 },
        'engenharia': { passing: 19.5, average: 14.5 },
        'administracao': { passing: 17.5, average: 13.5 },
        'ciencias': { passing: 15.5, average: 12.0 }
      }
    };
  }

  /**
   * Render exam results
   */
  render(containerId, results) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="exam-results">
        ${this._renderHeader(results)}
        ${this._renderScoreCard(results)}
        ${this._renderBreakdown(results)}
        ${this._renderComparison(results)}
        ${this._renderActions()}
      </div>
    `;

    this._attachEventListeners(container);
  }

  _renderHeader(results) {
    const isPassing = results.fuvestScore >= 21; // Approximate passing
    const status = isPassing ? 'Aprovado!' : 'Continue Estudando';
    const statusClass = isPassing ? 'passing' : 'not-passing';

    return `
      <div class="exam-results-header">
        <h2>📝 Resultado do Simulado</h2>
        <div class="exam-status ${statusClass}">${status}</div>
        <p class="exam-date">${new Date().toLocaleDateString('pt-BR')}</p>
      </div>
    `;
  }

  _renderScoreCard(results) {
    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      if (hours > 0) return `${hours}h ${mins}min`;
      return `${mins}min`;
    };

    return `
      <div class="score-card">
        <div class="main-score">
          <span class="score-value">${results.fuvestScore.toFixed(1)}</span>
          <span class="score-label">Nota Estimada FUVEST</span>
          <span class="score-scale">Escala 0-30</span>
        </div>
        <div class="score-details">
          <div class="detail-item">
            <span class="detail-value">${results.correct}</span>
            <span class="detail-label">Acertos</span>
          </div>
          <div class="detail-item">
            <span class="detail-value">${results.incorrect}</span>
            <span class="detail-label">Erros</span>
          </div>
          <div class="detail-item">
            <span class="detail-value">${results.unanswered}</span>
            <span class="detail-label">Em branco</span>
          </div>
          <div class="detail-item">
            <span class="detail-value">${formatTime(results.timeSpent)}</span>
            <span class="detail-label">Tempo</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderBreakdown(results) {
    const accuracy = results.percentage;
    let performanceText = '';
    let performanceClass = '';

    if (accuracy >= 80) {
      performanceText = 'Excelente! Você está muito bem preparado.';
      performanceClass = 'excellent';
    } else if (accuracy >= 60) {
      performanceText = 'Bom desempenho. Continue praticando!';
      performanceClass = 'good';
    } else if (accuracy >= 40) {
      performanceText = 'Desempenho regular. Foque nas áreas de dificuldade.';
      performanceClass = 'average';
    } else {
      performanceText = 'Precisa melhorar. Estude mais as questões erradas.';
      performanceClass = 'needs-work';
    }

    return `
      <div class="breakdown-section">
        <h3>Análise de Desempenho</h3>
        <div class="accuracy-bar">
          <div class="accuracy-fill" style="width: ${accuracy}%"></div>
          <span class="accuracy-text">${accuracy}% de aproveitamento</span>
        </div>
        <p class="performance-text ${performanceClass}">${performanceText}</p>
        
        ${results.unanswered > 0 ? `
          <div class="warning-box">
            <i data-lucide="alert-circle"></i>
            <span>Você deixou ${results.unanswered} questão(ões) em branco. Tente responder todas na próxima vez!</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderComparison(results) {
    const currentYear = new Date().getFullYear();
    const yearData = this.cutoffData[currentYear] || this.cutoffData[2026];

    return `
      <div class="comparison-section">
        <h3>📊 Comparativo FUVEST</h3>
        <p class="comparison-subtitle">Comparativo com notas de corte ${currentYear}</p>
        
        <div class="comparison-chart">
          ${Object.entries(yearData).map(([course, data]) => {
            const yourScore = results.fuvestScore;
            const passingScore = data.passing;
            const isAbove = yourScore >= passingScore;
            
            return `
              <div class="course-bar">
                <span class="course-name">${this._formatCourseName(course)}</span>
                <div class="score-bars">
                  <div class="bar-container">
                    <div class="bar-label">Você</div>
                    <div class="bar your-bar ${isAbove ? 'above' : 'below'}" 
                         style="width: ${Math.min(yourScore / 30 * 100, 100)}%"></div>
                    <span class="bar-value">${yourScore.toFixed(1)}</span>
                  </div>
                  <div class="bar-container">
                    <div class="bar-label">Corte</div>
                    <div class="bar cutoff-bar" 
                         style="width: ${Math.min(passingScore / 30 * 100, 100)}%"></div>
                    <span class="bar-value">${passingScore}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div class="comparison-legend">
          <div class="legend-item">
            <span class="legend-color your-color"></span>
            <span>Sua nota</span>
          </div>
          <div class="legend-item">
            <span class="legend-color cutoff-color"></span>
            <span>Nota de corte</span>
          </div>
        </div>
      </div>
    `;
  }

  _formatCourseName(course) {
    const names = {
      'medicina': 'Medicina',
      'direito': 'Direito',
      'engenharia': 'Engenharia',
      'administracao': 'Administração',
      'ciencias': 'Ciências'
    };
    return names[course] || course;
  }

  _renderActions() {
    return `
      <div class="exam-actions">
        <button id="btn-review-exam" class="btn-primary">
          <i data-lucide="list-checks"></i>
          Revisar Questões
        </button>
        <button id="btn-new-exam" class="btn-secondary">
          <i data-lucide="rotate-ccw"></i>
          Novo Simulado
        </button>
        <button id="btn-share-result" class="btn-secondary">
          <i data-lucide="share-2"></i>
          Compartilhar
        </button>
      </div>
    `;
  }

  _attachEventListeners(container) {
    // Review button
    const reviewBtn = container.querySelector('#btn-review-exam');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => {
        // Navigate to review mode with exam questions
        window.location.hash = '#/review';
      });
    }

    // New exam button
    const newExamBtn = container.querySelector('#btn-new-exam');
    if (newExamBtn) {
      newExamBtn.addEventListener('click', () => {
        window.location.hash = '#/exam';
      });
    }

    // Share button
    const shareBtn = container.querySelector('#btn-share-result');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        this._shareResult();
      });
    }
  }

  _shareResult() {
    const text = `Fiz um simulado FUVEST no English Training! 📚`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Meu Resultado - English Training',
        text: text,
        url: window.location.href
      });
    } else {
      // Copy to clipboard fallback
      navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) {
          showToast('Resultado copiado!', 'success');
        }
      });
    }
  }
}

// Export
window.ExamResults = ExamResults;
