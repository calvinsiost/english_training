/**
 * SRS Engine - Spaced Repetition System (SM-2 Algorithm)
 * Based on SuperMemo-2 algorithm for optimal review scheduling
 */

class SRSEngine {
  constructor() {
    // Default SM-2 parameters
    this.defaultEaseFactor = 2.5;
    this.minEaseFactor = 1.3;
    this.graduatingInterval = 1; // days
    this.easyInterval = 4; // days
  }

  /**
   * Calculate next review based on answer quality
   * @param {Object} card - Current card state
   * @param {number} quality - Answer quality (0-5)
   *   0 = Blackout (complete failure)
   *   1 = Incorrect (remembered correct answer)
   *   2 = Incorrect (easy to recall)
   *   3 = Correct (difficult recall)
   *   4 = Correct (hesitated)
   *   5 = Correct (perfect)
   * @returns {Object} Updated card
   */
  review(card, quality) {
    // Ensure quality is within bounds
    quality = Math.max(0, Math.min(5, quality));

    // Clone card to avoid mutation
    const updated = { ...card };

    // Initialize if new card
    if (!updated.repetitions) updated.repetitions = 0;
    if (!updated.easeFactor) updated.easeFactor = this.defaultEaseFactor;
    if (!updated.interval) updated.interval = 0;

    // Calculate new interval and ease factor
    if (quality < 3) {
      // Failed - reset repetitions but keep ease factor
      updated.repetitions = 0;
      updated.interval = 1; // Review tomorrow
    } else {
      // Passed
      updated.repetitions += 1;

      if (updated.repetitions === 1) {
        updated.interval = this.graduatingInterval;
      } else if (updated.repetitions === 2) {
        updated.interval = this.easyInterval;
      } else {
        // Multiply previous interval by ease factor
        updated.interval = Math.round(updated.interval * updated.easeFactor);
      }
    }

    // Update ease factor
    updated.easeFactor = updated.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    updated.easeFactor = Math.max(this.minEaseFactor, updated.easeFactor);

    // Calculate next review date
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + updated.interval);
    updated.nextReview = nextReview.toISOString();

    // Update metadata
    updated.lastReviewed = new Date().toISOString();
    updated.reviewCount = (updated.reviewCount || 0) + 1;

    // Add to history
    if (!updated.history) updated.history = [];
    updated.history.push({
      date: new Date().toISOString(),
      quality,
      interval: updated.interval,
      easeFactor: updated.easeFactor
    });

    // Limit history to last 20 entries
    if (updated.history.length > 20) {
      updated.history = updated.history.slice(-20);
    }

    return updated;
  }

  /**
   * Create a new SRS card for a question
   * @param {string} questionId - Question identifier
   * @param {Object} metadata - Additional metadata
   * @returns {Object} New card
   */
  createCard(questionId, metadata = {}) {
    const now = new Date();
    return {
      id: `srs_${questionId}`,
      questionId,
      createdAt: now.toISOString(),
      nextReview: now.toISOString(), // Due immediately
      repetitions: 0,
      easeFactor: this.defaultEaseFactor,
      interval: 0,
      reviewCount: 0,
      history: [],
      ...metadata
    };
  }

  /**
   * Check if a card is due for review
   * @param {Object} card - Card to check
   * @param {Date} date - Date to check against (default: now)
   * @returns {boolean}
   */
  isDue(card, date = new Date()) {
    if (!card.nextReview) return true;
    return new Date(card.nextReview) <= date;
  }

  /**
   * Get cards due for review
   * @param {Array} cards - All cards
   * @param {Date} date - Date to check (default: now)
   * @returns {Array} Due cards
   */
  getDueCards(cards, date = new Date()) {
    return cards.filter(card => this.isDue(card, date));
  }

  /**
   * Get learning statistics
   * @param {Array} cards - All cards
   * @returns {Object} Statistics
   */
  getStats(cards) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const newCards = cards.filter(c => c.repetitions === 0);
    const learningCards = cards.filter(c => c.repetitions > 0 && c.repetitions < 3);
    const matureCards = cards.filter(c => c.repetitions >= 3);
    const dueToday = this.getDueCards(cards, tomorrow);

    // Calculate average ease factor
    const avgEase = cards.length > 0
      ? cards.reduce((sum, c) => sum + (c.easeFactor || this.defaultEaseFactor), 0) / cards.length
      : 0;

    return {
      total: cards.length,
      new: newCards.length,
      learning: learningCards.length,
      mature: matureCards.length,
      dueToday: dueToday.length,
      averageEase: Math.round(avgEase * 100) / 100,
      retention: this.calculateRetention(cards)
    };
  }

  /**
   * Calculate retention rate based on history
   * @param {Array} cards - All cards
   * @returns {number} Retention percentage
   */
  calculateRetention(cards) {
    let totalReviews = 0;
    let successfulReviews = 0;

    cards.forEach(card => {
      if (card.history) {
        card.history.forEach(h => {
          totalReviews++;
          if (h.quality >= 3) successfulReviews++;
        });
      }
    });

    return totalReviews > 0
      ? Math.round((successfulReviews / totalReviews) * 100)
      : 0;
  }

  /**
   * Get recommended daily new cards based on workload
   * @param {Object} stats - Current statistics
   * @param {number} targetReviews - Target reviews per day (default: 50)
   * @returns {number} Recommended new cards
   */
  getRecommendedNewCards(stats, targetReviews = 50) {
    const dueReviews = stats.learning + stats.mature * 0.1; // Estimate
    const remainingCapacity = Math.max(0, targetReviews - dueReviews);
    return Math.min(remainingCapacity, 20); // Cap at 20 new cards
  }
}

// SRS Manager - Handles persistence and UI coordination
class SRSManager {
  constructor(db) {
    this.db = db;
    this.engine = new SRSEngine();
    this.storeName = 'srs_cards';
  }

  /**
   * Initialize SRS store in database
   */
  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  /**
   * Get all SRS cards
   */
  async getAllCards() {
    if (!this.db) return [];
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    return idbGetAll(store);
  }

  /**
   * Get cards due for review
   */
  async getDueCards() {
    const cards = await this.getAllCards();
    return this.engine.getDueCards(cards);
  }

  /**
   * Get or create card for a question
   */
  async getOrCreateCard(questionId, metadata = {}) {
    if (!this.db) return null;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);

    // Try to find existing card by questionId
    const allCards = await idbGetAll(store);
    let card = allCards.find(c => c.questionId === questionId);

    if (!card) {
      card = this.engine.createCard(questionId, metadata);
      await idbAdd(store, card);
    }

    return card;
  }

  /**
   * Schedule a question for review
   * Called when user answers incorrectly or wants to review
   */
  async scheduleQuestion(questionId, metadata = {}) {
    return this.getOrCreateCard(questionId, metadata);
  }

  /**
   * Process a review
   * @param {string} cardId - Card ID
   * @param {number} quality - Answer quality (0-5)
   */
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

  /**
   * Delete a card
   */
  async deleteCard(cardId) {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await idbDelete(store, cardId);
  }

  /**
   * Get statistics
   */
  async getStats() {
    const cards = await this.getAllCards();
    return this.engine.getStats(cards);
  }

  /**
   * Get daily review summary
   */
  async getDailySummary() {
    const stats = await this.getStats();
    const dueCards = await this.getDueCards();

    return {
      ...stats,
      dueNow: dueCards.length,
      recommendedNew: this.engine.getRecommendedNewCards(stats),
      cards: dueCards.slice(0, 10) // Limit to 10 for display
    };
  }

  /**
   * Suspend a card (temporarily stop reviews)
   */
  async suspendCard(cardId, days = 7) {
    if (!this.db) return;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);

    const card = await idbGet(store, cardId);
    if (!card) return;

    const suspendedUntil = new Date();
    suspendedUntil.setDate(suspendedUntil.getDate() + days);

    card.suspended = true;
    card.suspendedUntil = suspendedUntil.toISOString();
    card.nextReview = suspendedUntil.toISOString();

    await idbPut(store, card);
  }

  /**
   * Resume a suspended card
   */
  async resumeCard(cardId) {
    if (!this.db) return;

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);

    const card = await idbGet(store, cardId);
    if (!card) return;

    delete card.suspended;
    delete card.suspendedUntil;
    card.nextReview = new Date().toISOString();

    await idbPut(store, card);
  }
}

// Make available globally
window.SRSEngine = SRSEngine;
window.SRSManager = SRSManager;
