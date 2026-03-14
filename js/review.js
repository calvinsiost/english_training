/**
 * Review View - Shows pending SRS reviews
 */

class ReviewView {
  constructor() {
    this.container = document.getElementById('review-list');
    this.statsContainer = document.getElementById('review-stats');
    this.startBtn = document.getElementById('btn-start-srs-review');
    this.dueCountEl = document.getElementById('review-due-count');
    this.totalCountEl = document.getElementById('review-total-count');
    
    this.init();
  }
  
  init() {
    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => this.startSRSReview());
    }
    
    // Listen for view activation
    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#/review') {
        this.loadReviewList();
      }
    });
  }
  
  async loadReviewList() {
    if (!window.srsManager) {
      this.showEmpty('Sistema de revisão não inicializado');
      return;
    }
    
    try {
      const [dueCards, allCards, stats] = await Promise.all([
        window.srsManager.getDueCards(),
        window.srsManager.getAllCards(),
        window.srsManager.getStats()
      ]);
      
      // Update stats
      if (this.dueCountEl) this.dueCountEl.textContent = dueCards.length;
      if (this.totalCountEl) this.totalCountEl.textContent = allCards.length;
      
      // Show/hide start button
      if (this.startBtn) {
        this.startBtn.style.display = dueCards.length > 0 ? 'flex' : 'none';
      }
      
      if (dueCards.length === 0) {
        this.showEmpty(allCards.length === 0 
          ? 'Nenhuma questão no SRS ainda. Responda questões incorretamente para adicioná-las.' 
          : 'Nenhuma revisão pendente no momento! 🎉'
        );
        return;
      }
      
      // Render list (show first 10)
      this.renderReviewList(dueCards.slice(0, 10));
      
    } catch (error) {
      console.error('Error loading review list:', error);
      this.showEmpty('Erro ao carregar revisões');
    }
  }
  
  renderReviewList(cards) {
    if (!this.container) return;
    
    this.container.innerHTML = cards.map(card => {
      const dueDate = new Date(card.nextReview);
      const isDue = dueDate <= new Date();
      const dueText = isDue 
        ? 'Para revisar agora' 
        : `Revisar em ${dueDate.toLocaleDateString('pt-BR')}`;
      
      return `
        <div class="review-item">
          <div class="review-item-content">
            <div class="review-item-question">${card.question_text || 'Questão sem texto'}</div>
            <div class="review-item-meta">
              <span class="review-item-source">${card.passage_title || 'FUVEST'}</span>
              <span class="review-item-due ${isDue ? '' : 'future'}">${dueText}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    if (cards.length > 10) {
      this.container.innerHTML += `
        <p class="empty-state">...e mais ${cards.length - 10} questões</p>
      `;
    }
  }
  
  showEmpty(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="check-circle"></i>
        <p>${message}</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
  
  async startSRSReview() {
    // Navigate to SRS review mode
    // This could open an overlay or navigate to a dedicated review mode
    if (window.srsManager) {
      const dueCards = await window.srsManager.getDueCards();
      if (dueCards.length > 0) {
        // Start SRS review session
        this.showSRSReviewOverlay(dueCards[0]);
      }
    }
  }
  
  showSRSReviewOverlay(card) {
    // Create overlay for SRS review
    const overlay = document.createElement('div');
    overlay.className = 'srs-review-overlay';
    overlay.id = 'srs-review-overlay';
    
    overlay.innerHTML = `
      <div class="srs-review-header">
        <button class="btn-back" onclick="document.getElementById('srs-review-overlay').remove()">
          <i data-lucide="x"></i> Sair
        </button>
        <span class="srs-review-progress">Revisão SRS</span>
      </div>
      <div class="srs-review-content" id="srs-review-content">
        <div class="srs-question-card">
          <div class="srs-passage-text">${card.passage_text || 'Passagem não disponível'}</div>
          <div class="srs-question-text">${card.question_text}</div>
          <div class="srs-options" id="srs-options">
            <p style="color: var(--text-secondary); text-align: center;">
              Clique na alternativa que você acha correta
            </p>
          </div>
        </div>
      </div>
      <div class="srs-rating-buttons" id="srs-rating-buttons" style="display: none;">
        <button class="srs-rating-btn again" data-quality="0">
          <span class="srs-rating-label">De Novo</span>
          <span class="srs-rating-hint">&lt; 1 min</span>
        </button>
        <button class="srs-rating-btn hard" data-quality="3">
          <span class="srs-rating-label">Difícil</span>
          <span class="srs-rating-hint">2 dias</span>
        </button>
        <button class="srs-rating-btn good" data-quality="4">
          <span class="srs-rating-label">Bom</span>
          <span class="srs-rating-hint">3 dias</span>
        </button>
        <button class="srs-rating-btn easy" data-quality="5">
          <span class="srs-rating-label">Fácil</span>
          <span class="srs-rating-hint">5 dias</span>
        </button>
      </div>
    `;
    
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
    
    // TODO: Add question options and handle answering
    // For now, just show the rating buttons after a delay
    setTimeout(() => {
      const ratingBtns = document.getElementById('srs-rating-buttons');
      if (ratingBtns) ratingBtns.style.display = 'grid';
    }, 1000);
  }
}

// Initialize
window.reviewView = new ReviewView();
