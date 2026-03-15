/**
 * Vocabulary Intelligence
 * Bayesian difficulty scoring for words/phrases based on local user behavior.
 */

class WordIntelligence {
  constructor(db, options = {}) {
    this.db = db;
    this.storeName = 'vocabulary';
    this.maxConcurrencyRetries = options.maxConcurrencyRetries || 3;
    this.translationDedupeMs = options.translationDedupeMs || 15000;
    this.translationDailyCap = options.translationDailyCap || 10;
    this.processedSignalMaxAgeMs = options.processedSignalMaxAgeMs || (10 * 60 * 1000);
    this.termQueues = new Map();
    this.signalDedupe = new Map();
    this.processedSignals = new Map();
    this.translationDailyCounts = new Map();
    this.defaultPrior = { alpha: 1, beta: 1, observations: 0 };
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  normalizeTerm(termRaw) {
    if (typeof termRaw !== 'string') return '';
    return termRaw
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[^a-z0-9]+/i, '')
      .replace(/[^a-z0-9]+$/i, '');
  }

  classifyTermType(normalizedTerm) {
    return normalizedTerm.includes(' ') ? 'phrase' : 'word';
  }

  _validateSignal(input) {
    if (!input || typeof input !== 'object') {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Payload ausente.' } };
    }
    if (typeof input.termRaw !== 'string' || input.termRaw.trim().length === 0) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'termRaw inválido.' } };
    }
    if (!['translate_click', 'flashcard_review'].includes(input.source)) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'source inválido.' } };
    }
    if (Number.isNaN(Date.parse(input.observedAtISO))) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'observedAtISO inválido.' } };
    }
    if (input.source === 'flashcard_review') {
      if (!Number.isInteger(input.quality) || input.quality < 0 || input.quality > 5) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'quality inválido.' } };
      }
    }
    return { ok: true };
  }

  _getSignalProbabilityAndWeight(source, quality) {
    if (source === 'translate_click') {
      return { probability: 0.2, weight: 0.8 };
    }

    const qualityMap = {
      0: 0.0,
      1: 0.15,
      2: 0.35,
      3: 0.65,
      4: 0.85,
      5: 0.97
    };
    return { probability: qualityMap[quality], weight: 1.0 };
  }

  _getDayKey(dateIso) {
    const dt = new Date(dateIso);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _isDuplicateSignal(normalizedTerm, source, questionId, observedAtISO) {
    const dedupeKey = `${normalizedTerm}::${questionId || 'none'}::${source}`;
    const observedAt = new Date(observedAtISO).getTime();
    const lastSeen = this.signalDedupe.get(dedupeKey);

    if (lastSeen && observedAt - lastSeen < this.translationDedupeMs) {
      return true;
    }

    this.signalDedupe.set(dedupeKey, observedAt);
    return false;
  }

  _buildSignalId(input, normalizedTerm) {
    const questionId = input.context?.questionId || 'none';
    const sessionId = input.sessionId || 'none';
    const quality = Number.isInteger(input.quality) ? input.quality : 'na';
    return [
      normalizedTerm,
      input.source,
      questionId,
      sessionId,
      input.observedAtISO,
      quality
    ].join('::');
  }

  _cleanupProcessedSignals(nowMs = Date.now()) {
    for (const [id, timestamp] of this.processedSignals.entries()) {
      if (nowMs - timestamp > this.processedSignalMaxAgeMs) {
        this.processedSignals.delete(id);
      }
    }
  }

  _hasProcessedSignal(signalId) {
    this._cleanupProcessedSignals();
    return this.processedSignals.has(signalId);
  }

  _markProcessedSignal(signalId) {
    this._cleanupProcessedSignals();
    this.processedSignals.set(signalId, Date.now());
  }

  _isTranslationDailyCapped(normalizedTerm, observedAtISO) {
    const dayKey = this._getDayKey(observedAtISO);
    const key = `${dayKey}::${normalizedTerm}`;
    const current = this.translationDailyCounts.get(key) || 0;
    if (current >= this.translationDailyCap) return true;
    this.translationDailyCounts.set(key, current + 1);
    return false;
  }

  _enqueueTermUpdate(normalizedTerm, task) {
    const pending = this.termQueues.get(normalizedTerm) || Promise.resolve();
    const next = pending
      .catch(() => null)
      .then(task);

    this.termQueues.set(normalizedTerm, next);
    return next.finally(() => {
      if (this.termQueues.get(normalizedTerm) === next) {
        this.termQueues.delete(normalizedTerm);
      }
    });
  }

  _mergeUnique(list = [], value) {
    if (!value) return list;
    if (list.includes(value)) return list;
    return [...list, value];
  }

  _calculateScore(record) {
    const denominator = record.alpha + record.beta;
    const difficulty = denominator > 0
      ? Math.round((record.beta / denominator) * 100)
      : 0;
    const reliability = Math.min(100, Math.round((record.observations / 12) * 100));

    return {
      difficultyScore: Math.max(0, Math.min(100, difficulty)),
      reliability: Math.max(0, Math.min(100, reliability))
    };
  }

  _toOutput(record) {
    return {
      id: record.id,
      normalizedTerm: record.normalizedTerm,
      termType: record.termType,
      alpha: record.alpha,
      beta: record.beta,
      observations: record.observations,
      difficultyScore: record.difficultyScore,
      reliability: record.reliability,
      updatedAtISO: record.updatedAtISO
    };
  }

  async recordSignal(input) {
    const validation = this._validateSignal(input);
    if (!validation.ok) return { error: validation.error };

    const normalizedTerm = this.normalizeTerm(input.termRaw);
    if (!normalizedTerm) {
      return {
        error: { code: 'VALIDATION_ERROR', message: 'Termo vazio após normalização.' }
      };
    }

    const signalId = this._buildSignalId(input, normalizedTerm);
    if (this._hasProcessedSignal(signalId)) {
      return { ignored: true, code: 'IDEMPOTENT_REPLAY' };
    }

    const questionId = input.context?.questionId || null;
    if (
      input.source === 'translate_click' &&
      this._isDuplicateSignal(normalizedTerm, input.source, questionId, input.observedAtISO)
    ) {
      return { ignored: true, code: 'DUPLICATE_SIGNAL' };
    }

    if (input.source === 'translate_click' && this._isTranslationDailyCapped(normalizedTerm, input.observedAtISO)) {
      return { ignored: true, code: 'DAILY_CAP' };
    }

    return this._enqueueTermUpdate(
      normalizedTerm,
      () => this._recordSignalWithRetry(input, normalizedTerm, signalId)
    );
  }

  async _recordSignalWithRetry(input, normalizedTerm, signalId) {
    const signal = this._getSignalProbabilityAndWeight(input.source, input.quality);
    const vocabId = `voc_${normalizedTerm.replace(/\s+/g, '_')}`;
    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxConcurrencyRetries) {
      attempt += 1;
      try {
        const snapshot = await this._readVocabularyRecord(vocabId);
        const expectedRevision = snapshot?.revision || 0;
        const result = await this._recordSignalOnce(
          input,
          normalizedTerm,
          signal,
          expectedRevision,
          snapshot
        );
        if (!result?.error) {
          this._markProcessedSignal(signalId);
        }
        return result;
      } catch (error) {
        lastError = error;
        if (error?.code !== 'CONCURRENCY_CONFLICT') {
          console.warn('[WordIntelligence] Signal processing failed:', error);
          return { error: { code: 'WRITE_FAILED', message: 'Falha ao persistir sinal.' } };
        }
      }
    }

    console.warn('[WordIntelligence] Dropping signal after retries:', lastError);
    return { error: { code: 'CONCURRENCY_DROPPED', message: 'Concorrência alta, sinal descartado.' } };
  }

  async _readVocabularyRecord(vocabId) {
    const tx = this.db.transaction(this.storeName, 'readonly');
    return idbGet(tx.objectStore(this.storeName), vocabId);
  }

  _createBaseRecord(vocabId, normalizedTerm, input, nowIso) {
    return {
      id: vocabId,
      normalizedTerm,
      term: input.termRaw.trim(),
      termType: this.classifyTermType(normalizedTerm),
      alpha: this.defaultPrior.alpha,
      beta: this.defaultPrior.beta,
      observations: this.defaultPrior.observations,
      signals: {
        translateClicks: 0,
        flashcardReviews: 0,
        flashcardFails: 0,
        flashcardSuccesses: 0
      },
      sourceRefs: {
        textIds: [],
        topics: [],
        institutions: [],
        examIds: []
      },
      flashcardLink: {
        cardId: null,
        autoCreated: false
      },
      revision: 0,
      createdAtISO: nowIso,
      updatedAtISO: nowIso,
      lastSeenAtISO: nowIso
    };
  }

  async _recordSignalOnce(input, normalizedTerm, signal, expectedRevision = 0, snapshot = null) {
    if (!this.db) {
      return { error: { code: 'DB_NOT_READY', message: 'Banco não inicializado.' } };
    }

    const vocabId = `voc_${normalizedTerm.replace(/\s+/g, '_')}`;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const existing = await idbGet(store, vocabId);
    const nowIso = new Date().toISOString();

    const currentRevision = existing?.revision || 0;
    if (currentRevision !== expectedRevision) {
      const err = new Error('Version changed before write');
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    const base = existing || snapshot || this._createBaseRecord(vocabId, normalizedTerm, input, nowIso);
    base.signals = {
      translateClicks: 0,
      flashcardReviews: 0,
      flashcardFails: 0,
      flashcardSuccesses: 0,
      ...(base.signals || {})
    };
    base.sourceRefs = base.sourceRefs || {};
    base.sourceRefs.textIds = Array.isArray(base.sourceRefs.textIds) ? base.sourceRefs.textIds : [];
    base.sourceRefs.topics = Array.isArray(base.sourceRefs.topics) ? base.sourceRefs.topics : [];
    base.sourceRefs.institutions = Array.isArray(base.sourceRefs.institutions) ? base.sourceRefs.institutions : [];
    base.sourceRefs.examIds = Array.isArray(base.sourceRefs.examIds) ? base.sourceRefs.examIds : [];
    base.flashcardLink = base.flashcardLink || { cardId: null, autoCreated: false };
    base.alpha = Number.isFinite(base.alpha) ? Math.max(1, base.alpha) : this.defaultPrior.alpha;
    base.beta = Number.isFinite(base.beta) ? Math.max(1, base.beta) : this.defaultPrior.beta;
    base.observations = Number.isFinite(base.observations)
      ? Math.max(0, base.observations)
      : this.defaultPrior.observations;
    base.termType = base.termType || this.classifyTermType(normalizedTerm);
    base.normalizedTerm = normalizedTerm;
    base.revision = currentRevision;

    base.term = input.termRaw.trim();
    base.alpha += signal.probability * signal.weight;
    base.beta += (1 - signal.probability) * signal.weight;
    base.observations += signal.weight;

    if (input.source === 'translate_click') {
      base.signals.translateClicks += 1;
    } else {
      base.signals.flashcardReviews += 1;
      if (input.quality >= 3) base.signals.flashcardSuccesses += 1;
      else base.signals.flashcardFails += 1;
    }

    const context = input.context || {};
    base.sourceRefs.textIds = this._mergeUnique(base.sourceRefs.textIds, context.textId);
    base.sourceRefs.topics = this._mergeUnique(base.sourceRefs.topics, context.topic);
    base.sourceRefs.institutions = this._mergeUnique(base.sourceRefs.institutions, context.institution);
    base.sourceRefs.examIds = this._mergeUnique(base.sourceRefs.examIds, context.examId);
    base.sessionId = input.sessionId || base.sessionId || null;

    const { difficultyScore, reliability } = this._calculateScore(base);
    base.previousDifficultyScore = base.difficultyScore ?? difficultyScore;
    base.difficultyScore = difficultyScore;
    base.reliability = reliability;
    base.lastSignalSource = input.source;
    base.lastSeenAtISO = input.observedAtISO;
    base.updatedAtISO = nowIso;
    base.revision = currentRevision + 1;

    await idbPut(store, base);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });

    const verifyTx = this.db.transaction(this.storeName, 'readonly');
    const verifyStore = verifyTx.objectStore(this.storeName);
    const latest = await idbGet(verifyStore, vocabId);
    if (!latest || (latest.revision || 0) < base.revision) {
      const err = new Error('Version verification failed');
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    if (context.textId) {
      await this._updateTextDifficultyMetadata(context.textId);
    }

    await this._ensureAutoFlashcard(latest, context);

    return this._toOutput(latest);
  }

  _evaluateAutoCard(record) {
    if (!record) return { shouldCreate: false, reason: 'threshold_not_met' };
    if (record.termType !== 'word') return { shouldCreate: false, reason: 'threshold_not_met' };
    if (record.flashcardLink?.cardId) return { shouldCreate: false, reason: 'already_linked' };
    if (record.difficultyScore < 70) return { shouldCreate: false, reason: 'threshold_not_met' };
    if (record.observations < 3) return { shouldCreate: false, reason: 'threshold_not_met' };
    if ((record.signals?.translateClicks || 0) < 2) return { shouldCreate: false, reason: 'threshold_not_met' };
    return { shouldCreate: true, reason: 'created' };
  }

  async _persistFlashcardLink(vocabId, cardId, autoCreated = true, pending = false) {
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const record = await idbGet(store, vocabId);
    if (!record) return;
    record.flashcardLink = record.flashcardLink || {};
    record.flashcardLink.cardId = cardId || null;
    record.flashcardLink.autoCreated = !!autoCreated;
    record.pendingAutoCard = !!pending;
    record.updatedAtISO = new Date().toISOString();
    await idbPut(store, record);
  }

  async _ensureAutoFlashcard(record, context = {}) {
    const decision = this._evaluateAutoCard(record);
    if (!decision.shouldCreate) return decision;

    if (!window.flashcardSystem || typeof window.flashcardSystem.createFlashcard !== 'function') {
      await this._persistFlashcardLink(record.id, null, false, true);
      return { shouldCreate: false, reason: 'threshold_not_met' };
    }

    const cardId = `fc_auto_${record.normalizedTerm.replace(/\s+/g, '_')}`;
    let createdCard = null;
    try {
      createdCard = await window.flashcardSystem.createFlashcard(
        record.term,
        context.translation || '',
        context.textSnippet || '',
        'Vocabulário Difícil',
        {
          id: cardId,
          termNormalized: record.normalizedTerm,
          termType: record.termType,
          sourceType: 'auto_bayes',
          sourceRefs: {
            textId: context.textId || null,
            examId: context.examId || null,
            topic: context.topic || null,
            institution: context.institution || null
          },
          difficultySnapshot: {
            score: record.difficultyScore,
            reliability: record.reliability,
            updatedAt: record.updatedAtISO
          },
          autoGenerated: true,
          vocabId: record.id
        }
      );
    } catch (error) {
      console.warn('[WordIntelligence] Auto flashcard creation failed:', error);
    }

    if (!createdCard) return { shouldCreate: false, reason: 'threshold_not_met' };
    await this._persistFlashcardLink(record.id, createdCard.id, true, false);
    return { shouldCreate: true, reason: 'created', cardId: createdCard.id };
  }

  _getTrend(record) {
    const prev = typeof record.previousDifficultyScore === 'number'
      ? record.previousDifficultyScore
      : record.difficultyScore;
    if (record.difficultyScore > prev) return 'up';
    if (record.difficultyScore < prev) return 'down';
    return 'stable';
  }

  async getTopDifficultTerms(limit = 5) {
    if (!this.db) return [];
    try {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const all = await idbGetAll(store);

      return all
        .filter(item => (item.observations || 0) >= 3)
        .sort((a, b) => {
          if (b.difficultyScore !== a.difficultyScore) return b.difficultyScore - a.difficultyScore;
          return (b.reliability || 0) - (a.reliability || 0);
        })
        .slice(0, limit)
        .map(item => ({
          term: item.term || item.normalizedTerm,
          score: item.difficultyScore,
          reliability: item.reliability || 0,
          trend: this._getTrend(item)
        }));
    } catch (error) {
      console.warn('[WordIntelligence] Failed to fetch difficult terms:', error);
      return [];
    }
  }

  async getTextDifficultySummary(textId, limit = 5) {
    if (!this.db || !textId) return { textId, topTerms: [], avgDifficulty: null };
    try {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const all = await idbGetAll(store);
      const related = all
        .filter(item => (item.sourceRefs?.textIds || []).includes(textId) && (item.observations || 0) >= 3)
        .sort((a, b) => b.difficultyScore - a.difficultyScore);

      const top = related.slice(0, limit);
      const avgDifficulty = top.length > 0
        ? Math.round(top.reduce((sum, item) => sum + item.difficultyScore, 0) / top.length)
        : null;

      return {
        textId,
        topTerms: top.map(item => item.term || item.normalizedTerm),
        avgDifficulty
      };
    } catch (error) {
      console.warn('[WordIntelligence] Failed text difficulty summary:', error);
      return { textId, topTerms: [], avgDifficulty: null };
    }
  }

  async _updateTextDifficultyMetadata(textId) {
    if (!this.db || !textId) return;
    try {
      const summary = await this.getTextDifficultySummary(textId, 5);
      const tx = this.db.transaction('question_bank', 'readwrite');
      const store = tx.objectStore('question_bank');
      const textEntry = await idbGet(store, textId);
      if (!textEntry) return;

      textEntry.text_metadata = textEntry.text_metadata || {};
      textEntry.text_metadata.vocabDifficulty = {
        topTerms: summary.topTerms || [],
        avgDifficulty: summary.avgDifficulty
      };
      await idbPut(store, textEntry);
    } catch (error) {
      console.warn('[WordIntelligence] Failed to update text metadata:', error);
    }
  }

  async recordTranslationSignal(termRaw, context = {}) {
    return this.recordSignal({
      termRaw,
      source: 'translate_click',
      context,
      observedAtISO: new Date().toISOString(),
      sessionId: context.sessionId || null
    });
  }

  async recordFlashcardReview(termRaw, quality, context = {}) {
    return this.recordSignal({
      termRaw,
      source: 'flashcard_review',
      quality,
      context,
      observedAtISO: new Date().toISOString(),
      sessionId: context.sessionId || null
    });
  }
}

window.WordIntelligence = WordIntelligence;
