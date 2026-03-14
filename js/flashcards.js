/**
 * Flashcards System - Vocabulary flashcards with SRS
 */

class FlashcardSystem {
  constructor(db) {
    this.db = db;
    this.storeName = 'flashcards';
    this.engine = new SRSEngine(); // Reuse SRS algorithm
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  async createFlashcard(word, translation, context = '', deck = 'FUVEST') {
    if (!this.db) return null;
    
    const card = {
      id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      word,
      translation,
      context,
      deck,
      createdAt: new Date().toISOString(),
      ...this.engine.createCard(word).srs
    };

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await idbAdd(store, card);
    return card;
  }

  async getDueCards(deck = null, limit = 20) {
    if (!this.db) return [];
    
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const cards = await idbGetAll(store);
    
    let dueCards = cards.filter(c => this.engine.isDue(c));
    if (deck) {
      dueCards = dueCards.filter(c => c.deck === deck);
    }
    
    return dueCards.slice(0, limit);
  }

  async reviewCard(cardId, quality) {
    if (!this.db) return null;
    
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    
    const card = await idbGet(store, cardId);
    if (!card) return null;
    
    const updated = this.engine.review(card, quality);
    await idbPut(store, updated);
    return updated;
  }

  async getAllDecks() {
    if (!this.db) return [];
    
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const cards = await idbGetAll(store);
    
    const decks = [...new Set(cards.map(c => c.deck))];
    return decks.map(name => ({
      name,
      totalCards: cards.filter(c => c.deck === name).length,
      dueCards: cards.filter(c => c.deck === name && this.engine.isDue(c)).length
    }));
  }

  async getStats() {
    if (!this.db) return { total: 0, due: 0, new: 0 };
    
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const cards = await idbGetAll(store);
    
    return {
      total: cards.length,
      due: cards.filter(c => this.engine.isDue(c)).length,
      new: cards.filter(c => c.repetitions === 0).length,
      mature: cards.filter(c => c.repetitions >= 3).length
    };
  }
}

class FlashcardUI {
  constructor(flashcardSystem) {
    this.system = flashcardSystem;
    this.currentCard = null;
    this.isFlipped = false;
  }

  async renderDeckSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const decks = await this.system.getAllDecks();
    const stats = await this.system.getStats();

    container.innerHTML = `
      <div class="flashcard-decks">
        <h3>Seus Decks</h3>
        <div class="decks-grid">
          ${decks.map(deck => `
            <div class="deck-card" data-deck="${deck.name}">
              <span class="deck-name">${deck.name}</span>
              <span class="deck-stats">${deck.dueCards} para revisar / ${deck.totalCards} total</span>
            </div>
          `).join('')}
        </div>
        <div class="flashcard-stats">
          <div class="fc-stat">Total: ${stats.total}</div>
          <div class="fc-stat">Para revisar: ${stats.due}</div>
          <div class="fc-stat">Novos: ${stats.new}</div>
        </div>
        <button id="btn-start-review" class="btn-primary" ${stats.due === 0 ? 'disabled' : ''}>
          Iniciar Revisão (${stats.due})
        </button>
      </div>
    `;

    container.querySelector('#btn-start-review')?.addEventListener('click', () => {
      this.startReview();
    });
  }

  async startReview() {
    const cards = await this.system.getDueCards(null, 1);
    if (cards.length === 0) {
      if (window.showToast) showToast('Nenhum card para revisar!', 'info');
      return;
    }
    this.currentCard = cards[0];
    this.showCard();
  }

  showCard() {
    if (!this.currentCard) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal flashcard-modal';
    modal.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard ${this.isFlipped ? 'flipped' : ''}" onclick="this.classList.toggle('flipped')">
          <div class="flashcard-front">
            <span class="word">${this.currentCard.word}</span>
            <span class="context">${this.currentCard.context || ''}</span>
            <span class="hint">Clique para virar</span>
          </div>
          <div class="flashcard-back">
            <span class="translation">${this.currentCard.translation}</span>
          </div>
        </div>
        <div class="flashcard-controls ${this.isFlipped ? 'visible' : ''}">
          <button class="rating-btn again" data-quality="0">De novo</button>
          <button class="rating-btn hard" data-quality="3">Difícil</button>
          <button class="rating-btn good" data-quality="4">Bom</button>
          <button class="rating-btn easy" data-quality="5">Fácil</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle rating
    modal.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const quality = parseInt(e.target.dataset.quality);
        await this.system.reviewCard(this.currentCard.id, quality);
        modal.remove();
        this.startReview(); // Next card
      });
    });
  }
}

window.FlashcardSystem = FlashcardSystem;
window.FlashcardUI = FlashcardUI;
