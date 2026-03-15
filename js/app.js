/**
 * English Training - Main Application
 * Entry point and initialization
 */

import { AIConfig } from './config/ai-providers.js';
import { STORES, DB_NAME, DB_VERSION } from './config/constants.js';
import { initProviderSettings } from './provider-settings.js';
import { requestJsonWithFallback } from './core/request-with-fallback.js';

// IndexedDB Promise Helpers - now in idb-helpers.js
// Local references for this module
const idbGet = window.idbGet;
const idbPut = window.idbPut;
const idbAdd = window.idbAdd;
const idbCount = window.idbCount;
const idbGetAll = window.idbGetAll;
const idbDelete = window.idbDelete;

// Global state
const state = window.state = {
  db: null,
  currentView: 'dashboard',
  activeSession: null,
  currentPassage: null,
  currentQuestionIndex: 0,
  isProcessing: false
};

// Question Source Metadata Helper
const SourceMetadata = {
  // Extract metadata from exam_id (e.g., "2026-2ed" -> {year: 2025, edition: "2a", institution: "FUVEST"})
  extract(examId, examName, source) {
    const metadata = {
      examId,
      examName,
      source: source || 'FUVEST',
      year: null,
      edition: null,
      institution: 'FUVEST',
      fullName: examName || 'FUVEST'
    };
    
    // Parse exam_id like "2026-2ed" or "2025-1ed-manha"
    if (examId) {
      const match = examId.match(/(\d{4})-(\d)(?:ed)?(?:-(manha|tarde))?/i);
      if (match) {
        const yearPrefix = match[1];
        // Convert academic year to civil year (e.g., 2026 -> 2025/2026)
        metadata.year = parseInt(yearPrefix);
        metadata.edition = match[2];
        metadata.period = match[3] || null;
      }
    }
    
    // Parse exam name for more details
    if (examName) {
      if (examName.includes('UNICAMP')) metadata.institution = 'UNICAMP';
      else if (examName.includes('UFRGS')) metadata.institution = 'UFRGS';
      else if (examName.includes('UFSC')) metadata.institution = 'UFSC';
      else if (examName.includes('TEAP')) metadata.institution = 'TEAP';
      else if (examName.includes('CENEX') || examName.includes('UFMG')) metadata.institution = 'CENEX-UFMG';
      else if (examName.includes('Administração') || examName.includes('ADM')) metadata.institution = 'FUVEST-ADM';
    }
    
    return metadata;
  },
  
  // Format for display
  format(metadata) {
    const parts = [];
    if (metadata.institution) parts.push(metadata.institution);
    if (metadata.year) parts.push(metadata.year);
    if (metadata.edition) parts.push(`${metadata.edition}ª ed.`);
    if (metadata.period) parts.push(metadata.period === 'manha' ? 'Manhã' : 'Tarde');
    return parts.join(' · ');
  },
  
  // Get badge color based on institution
  getBadgeColor(institution) {
    const colors = {
      'FUVEST': '#e94560',
      'FUVEST-ADM': '#ff6b6b',
      'UNICAMP': '#00d9ff',
      'UFRGS': '#ff9f43',
      'UFSC': '#10ac84',
      'TEAP': '#5f27cd',
      'CENEX-UFMG': '#f368e0'
    };
    return colors[institution] || '#666';
  }
};

// Filter Settings Manager
const FilterSettings = {
  // Default filters
  defaults: {
    sources: ['FUVEST'],
    yearMin: 2024,
    yearMax: 2026
  },
  
  // Load from localStorage
  load() {
    const saved = localStorage.getItem('question_filters');
    if (saved) {
      return JSON.parse(saved);
    }
    return this.defaults;
  },
  
  // Save to localStorage
  save(filters) {
    localStorage.setItem('question_filters', JSON.stringify(filters));
  },
  
  // Filter passages based on settings
  filter(passages, filters) {
    return passages.filter(p => {
      const metadata = SourceMetadata.extract(p.exam_id, p.exam_name, p.source);
      
      // Check source
      if (filters.sources && filters.sources.length > 0) {
        if (!filters.sources.includes(metadata.institution)) {
          return false;
        }
      }
      
      // Check year range
      if (metadata.year) {
        if (filters.yearMin && metadata.year < filters.yearMin) return false;
        if (filters.yearMax && metadata.year > filters.yearMax) return false;
      }
      
      return true;
    });
  }
};

window.SourceMetadata = SourceMetadata;
window.FilterSettings = FilterSettings;
// Exposed for expedition-ui.js combat integration
window._loadPassageIntoUI = null; // set after function definition

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize IndexedDB
    await initDatabase();
    
    // Initialize SRS Manager
    if (typeof SRSManager !== 'undefined') {
      window.srsManager = new SRSManager(state.db);
      await window.srsManager.init();
    }
    
    // Initialize Analytics Manager
    if (typeof AnalyticsManager !== 'undefined') {
      window.analyticsManager = new AnalyticsManager(state.db);
      await window.analyticsManager.init();
    }
    
    // Initialize Session History
    if (typeof SessionHistory !== 'undefined') {
      window.sessionHistory = new SessionHistory(state.db);
      await window.sessionHistory.init();
    }
    
    // Initialize Exam Mode
    if (typeof ExamMode !== 'undefined') {
      window.examMode = new ExamMode(state.db);
      await window.examMode.init();
    }
    
    // Initialize Notes System
    if (typeof NotesSystem !== 'undefined') {
      window.notesSystem = new NotesSystem(state.db);
      await window.notesSystem.init();
    }
    
    // Initialize Flashcard System
    if (typeof FlashcardSystem !== 'undefined') {
      window.flashcardSystem = new FlashcardSystem(state.db);
      await window.flashcardSystem.init();
    }

    // Initialize Vocabulary Intelligence (Bayesian difficulty)
    if (typeof WordIntelligence !== 'undefined') {
      window.wordIntelligence = new WordIntelligence(state.db);
      await window.wordIntelligence.init();
    }
    
    // Initialize Glossary
    if (typeof Glossary !== 'undefined') {
      window.glossary = new Glossary(state.db);
      await window.glossary.init();
    }
    
    // Initialize Achievements
    if (typeof AchievementsManager !== 'undefined') {
      window.achievementsManager = new AchievementsManager(state.db);
      await window.achievementsManager.init();
    }
    
    // Initialize Backup Manager
    if (typeof BackupManager !== 'undefined') {
      window.backupManager = new BackupManager(state.db);
    }

    // Initialize Behavior Logger
    if (typeof BehaviorLogger !== 'undefined') {
      window.behaviorLogger = new BehaviorLogger(state.db);
      window.behaviorLogger.init();
    }

    // Initialize XP System
    if (typeof XPSystem !== 'undefined') {
      window.xpSystem = new XPSystem(state.db);
      await window.xpSystem.init();
    }

    // Initialize Daily Challenge
    if (typeof DailyChallenge !== 'undefined') {
      window.dailyChallenge = new DailyChallenge(state.db);
      await window.dailyChallenge.init();
    }

    // Initialize Expedition Engine (roguelite)
    if (typeof ExpeditionEngine !== 'undefined') {
      window.expeditionEngine = new ExpeditionEngine(state.db);
      await window.expeditionEngine.init();
    }

    // Initialize Expedition UI
    if (typeof ExpeditionUI !== 'undefined' && window.expeditionEngine) {
      window.expeditionUI = new ExpeditionUI(window.expeditionEngine);
    }

    // Initialize question bank from JSON
    await initializeQuestionBank();

    // Initialize default flashcards (falsos cognatos + phrasal verbs)
    await initializeDefaultFlashcards();

    // Backfills (non-blocking) for additive metadata fields
    backfillFlashcardMetadata().catch(err => console.warn('[App] Flashcard metadata backfill skipped:', err));
    backfillTextMetadata().catch(err => console.warn('[App] Text metadata backfill skipped:', err));

    // Setup router
    setupRouter();
    
    // Setup event listeners
    setupEventListeners();
    
    // Cleanup old service workers (SW removed — cache busting via git hash in CI)
    cleanupServiceWorkers();
    
    // Update dashboard
    await updateDashboard();

    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
    
    // Signal that app is ready (for tests)
    window.appReady = true;
    console.log('[App] Initialization complete');

    // Welcome toast removed - unnecessary on every load
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Erro ao inicializar. Recarregue a página.', 'error');
  }
});

// IndexedDB Initialization
async function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('[DB] Upgrade blocked — close other tabs using this app');
    };
    request.onsuccess = () => {
      state.db = request.result;
      resolve(state.db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const upgradeTx = event.target.transaction;

      const ensureIndex = (store, indexName, keyPath, options = {}) => {
        if (!store.indexNames.contains(indexName)) {
          store.createIndex(indexName, keyPath, options);
        }
      };
      
      // Question Bank store
      if (!db.objectStoreNames.contains(STORES.QUESTION_BANK)) {
        const bankStore = db.createObjectStore(STORES.QUESTION_BANK, { keyPath: 'id' });
        bankStore.createIndex('question_type', 'question_type', { multiEntry: true });
        bankStore.createIndex('passage_topic', 'passage_topic', { unique: false });
        bankStore.createIndex('times_served', 'times_served', { unique: false });
      } else {
        const bankStore = upgradeTx.objectStore(STORES.QUESTION_BANK);
        ensureIndex(bankStore, 'question_type', 'question_type', { multiEntry: true });
        ensureIndex(bankStore, 'passage_topic', 'passage_topic', { unique: false });
        ensureIndex(bankStore, 'times_served', 'times_served', { unique: false });
      }
      
      // Other stores (minimal setup for now)
      if (!db.objectStoreNames.contains(STORES.QUESTION_ATTEMPTS)) {
        db.createObjectStore(STORES.QUESTION_ATTEMPTS, { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        db.createObjectStore(STORES.SESSIONS, { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains(STORES.SRS_CARDS)) {
        db.createObjectStore(STORES.SRS_CARDS, { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.PROFILE)) {
        db.createObjectStore(STORES.PROFILE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.ACTIVE_PASSAGE)) {
        db.createObjectStore(STORES.ACTIVE_PASSAGE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.TOKEN_LOG)) {
        db.createObjectStore(STORES.TOKEN_LOG, { keyPath: 'id' });
      }
      
      // Analytics stores
      if (!db.objectStoreNames.contains(STORES.ANALYTICS)) {
        db.createObjectStore(STORES.ANALYTICS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DAILY_STATS)) {
        db.createObjectStore(STORES.DAILY_STATS, { keyPath: 'dateKey' });
      }
      if (!db.objectStoreNames.contains(STORES.STUDY_SESSIONS)) {
        db.createObjectStore(STORES.STUDY_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('flashcards')) {
        const flashStore = db.createObjectStore('flashcards', { keyPath: 'id' });
        ensureIndex(flashStore, 'termNormalized', 'termNormalized', { unique: false });
        ensureIndex(flashStore, 'sourceType', 'sourceType', { unique: false });
        ensureIndex(flashStore, 'vocabId', 'vocabId', { unique: false });
      } else {
        const flashStore = upgradeTx.objectStore('flashcards');
        ensureIndex(flashStore, 'termNormalized', 'termNormalized', { unique: false });
        ensureIndex(flashStore, 'sourceType', 'sourceType', { unique: false });
        ensureIndex(flashStore, 'vocabId', 'vocabId', { unique: false });
      }
      if (!db.objectStoreNames.contains('glossary')) {
        db.createObjectStore('glossary', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.VOCABULARY)) {
        const vocabularyStore = db.createObjectStore(STORES.VOCABULARY, { keyPath: 'id' });
        ensureIndex(vocabularyStore, 'normalizedTerm', 'normalizedTerm', { unique: true });
        ensureIndex(vocabularyStore, 'difficultyScore', 'difficultyScore', { unique: false });
        ensureIndex(vocabularyStore, 'reliability', 'reliability', { unique: false });
        ensureIndex(vocabularyStore, 'updatedAtISO', 'updatedAtISO', { unique: false });
        ensureIndex(vocabularyStore, 'termType', 'termType', { unique: false });
        ensureIndex(vocabularyStore, 'observations', 'observations', { unique: false });
      } else {
        const vocabularyStore = upgradeTx.objectStore(STORES.VOCABULARY);
        ensureIndex(vocabularyStore, 'normalizedTerm', 'normalizedTerm', { unique: true });
        ensureIndex(vocabularyStore, 'difficultyScore', 'difficultyScore', { unique: false });
        ensureIndex(vocabularyStore, 'reliability', 'reliability', { unique: false });
        ensureIndex(vocabularyStore, 'updatedAtISO', 'updatedAtISO', { unique: false });
        ensureIndex(vocabularyStore, 'termType', 'termType', { unique: false });
        ensureIndex(vocabularyStore, 'observations', 'observations', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.WEAKNESS_MAP)) {
        db.createObjectStore(STORES.WEAKNESS_MAP, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('achievements')) {
        db.createObjectStore('achievements', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('exam_attempts')) {
        db.createObjectStore('exam_attempts', { keyPath: 'id' });
      }

      // v5: Gamification stores
      if (!db.objectStoreNames.contains('event_log')) {
        const eventStore = db.createObjectStore('event_log', { keyPath: 'id' });
        eventStore.createIndex('type', 'type', { unique: false });
        eventStore.createIndex('category', 'category', { unique: false });
        eventStore.createIndex('dayKey', 'dayKey', { unique: false });
        eventStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('xp_log')) {
        db.createObjectStore('xp_log', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('lesson_progress')) {
        db.createObjectStore('lesson_progress', { keyPath: 'id' });
      }

      // v7: Expedition (roguelite) store
      if (!db.objectStoreNames.contains(STORES.EXPEDITION_RUNS)) {
        const expStore = db.createObjectStore(STORES.EXPEDITION_RUNS, { keyPath: 'id' });
        expStore.createIndex('status', 'status', { unique: false });
        expStore.createIndex('startedAt', 'startedAt', { unique: false });
        expStore.createIndex('biome', 'biome', { unique: false });
      }
    };
  });
}

// Expected bank version — bump this when initial-bank.json data changes
const EXPECTED_BANK_VERSION = "3.4";

// Initialize Question Bank from JSON
async function initializeQuestionBank() {
  const db = state.db;
  const tx = db.transaction(STORES.META, 'readonly');
  const metaStore = tx.objectStore(STORES.META);
  const isInitialized = await idbGet(metaStore, 'bank_initialized');

  const needsUpgrade = isInitialized?.value && isInitialized.version !== EXPECTED_BANK_VERSION;

  if (isInitialized?.value && !needsUpgrade) {
    console.log('[App] Question bank already initialized');
    return;
  }

  try {
    // Preserve SRS progress during upgrade
    let progressMap = null;
    if (needsUpgrade) {
      console.log(`[App] Upgrading question bank from ${isInitialized.version || 'unknown'} to ${EXPECTED_BANK_VERSION}...`);
      try {
        const readTx = db.transaction(STORES.QUESTION_BANK, 'readonly');
        const readStore = readTx.objectStore(STORES.QUESTION_BANK);
        const allRecords = await new Promise((resolve, reject) => {
          const req = readStore.getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        progressMap = new Map();
        for (const rec of allRecords) {
          if (rec.times_served > 0 || rec.last_served_at) {
            progressMap.set(rec.id, {
              times_served: rec.times_served,
              last_served_at: rec.last_served_at
            });
          }
        }
        console.log(`[App] Preserved progress for ${progressMap.size} passages`);
      } catch (e) {
        console.warn('[App] Could not read existing progress, will reset:', e);
      }
    }

    console.log('Carregando banco de questões...');
    const fetchOptions = needsUpgrade ? { cache: 'reload' } : {};
    const data = await requestJsonWithFallback('./data/initial-bank.json', fetchOptions, {
      context: 'initial-bank',
      fallbackMessage: 'Nao foi possivel carregar o banco inicial.',
      retries: 2,
      timeoutMs: 10000
    });

    // Clear existing data during upgrade
    if (needsUpgrade) {
      const clearTx = db.transaction(STORES.QUESTION_BANK, 'readwrite');
      clearTx.objectStore(STORES.QUESTION_BANK).clear();
      await new Promise((resolve, reject) => {
        clearTx.oncomplete = resolve;
        clearTx.onerror = () => reject(clearTx.error);
      });
    }

    // Populate question bank — fire all puts synchronously to keep transaction alive
    const writeTx = db.transaction(STORES.QUESTION_BANK, 'readwrite');
    const bankStore = writeTx.objectStore(STORES.QUESTION_BANK);

    for (const passage of data.passages) {
      const progress = progressMap?.get(passage.id);
      const bankEntry = {
        ...passage,
        times_served: progress?.times_served || 0,
        last_served_at: progress?.last_served_at || null,
        source_type: 'official',
        created_at: new Date().toISOString(),
        text_metadata: createTextMetadata(passage)
      };
      bankStore.put(bankEntry);
    }

    // Wait for transaction to complete
    await new Promise((resolve, reject) => {
      writeTx.oncomplete = resolve;
      writeTx.onerror = () => reject(writeTx.error);
      writeTx.onabort = () => reject(writeTx.error || new Error('Transaction aborted'));
    });

    // Mark as initialized
    const metaWriteTx = db.transaction(STORES.META, 'readwrite');
    await idbPut(metaWriteTx.objectStore(STORES.META), {
      key: 'bank_initialized',
      value: true,
      version: EXPECTED_BANK_VERSION,
      timestamp: new Date().toISOString()
    });

    if (needsUpgrade) {
      console.log(`[App] Question bank upgraded to v${EXPECTED_BANK_VERSION}`);
      showToast('Banco de questões atualizado!', 'success');
    } else {
      console.log(`${data.total_passages} textos carregados`);
      console.log(`[App] Initialized question bank with ${data.total_passages} passages`);
    }
  } catch (error) {
    console.error('[App] Failed to initialize question bank:', error);
    if (!needsUpgrade) {
      showToast('Usando banco vazio. Configure API para gerar questões.', 'warning');
    }
  }
}

// Initialize Default Flashcards from JSON
async function initializeDefaultFlashcards() {
  if (!state.db || !window.flashcardSystem) return;

  const tx = state.db.transaction(STORES.META, 'readonly');
  const isInit = await idbGet(tx.objectStore(STORES.META), 'flashcards_initialized');

  // Fetch JSON first to check version, skip if already up-to-date
  try {
    const data = await requestJsonWithFallback('./data/default-flashcards.json', {}, {
      context: 'default-flashcards',
      fallbackMessage: 'Flashcards padrão não disponíveis.',
      retries: 2,
      timeoutMs: 10000
    });

    if (isInit?.value && isInit?.version === data.schema_version) return;

    if (!Array.isArray(data.cards) || data.cards.length === 0) return;

    // Batch insert via single transaction — idempotent with deterministic IDs
    const writeTx = state.db.transaction(STORES.FLASHCARDS, 'readwrite');
    const store = writeTx.objectStore(STORES.FLASHCARDS);
    const now = new Date();
    let inserted = 0;

    data.cards.forEach((card, index) => {
      if (!card.word || !card.translation) return;

      const dayOffset = Math.floor(index / 9);
      const nextReview = new Date(now);
      nextReview.setDate(nextReview.getDate() + dayOffset);

      const id = 'fc_default_' + card.word.toLowerCase().replace(/\s+/g, '_');
      const termNormalized = card.word.toLowerCase().trim().replace(/\s+/g, ' ');
      store.put({
        id,
        word: card.word,
        translation: card.translation,
        context: card.context || '',
        deck: card.deck,
        category: card.category || '',
        difficulty: card.difficulty || 'intermediate',
        termNormalized,
        termType: termNormalized.includes(' ') ? 'phrase' : 'word',
        sourceType: 'seed',
        sourceRefs: {},
        difficultySnapshot: null,
        autoGenerated: false,
        vocabId: null,
        createdAt: now.toISOString(),
        repetitions: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReview: nextReview.toISOString(),
        reviewCount: 0,
        history: []
      });
      inserted++;
    });

    await new Promise((resolve, reject) => {
      writeTx.oncomplete = resolve;
      writeTx.onerror = () => reject(writeTx.error);
      writeTx.onabort = () => reject(writeTx.error || new Error('Transaction aborted'));
    });

    // Set META flag
    const metaTx = state.db.transaction(STORES.META, 'readwrite');
    await idbPut(metaTx.objectStore(STORES.META), {
      key: 'flashcards_initialized',
      value: true,
      version: data.schema_version,
      count: inserted,
      timestamp: now.toISOString()
    });

    console.log(`[App] Initialized ${inserted} default flashcards`);
  } catch (error) {
    console.error('[App] Failed to initialize flashcards:', error);
  }
}

function waitForIdle() {
  return new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function normalizeTerm(termRaw = '') {
  return String(termRaw)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '');
}

function computeLexicalMetadata(text = '') {
  const tokens = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) || []).map(t => t.toLowerCase());
  const wordCount = tokens.length;
  const uniqueWordCount = new Set(tokens).size;
  const lexicalDiversity = wordCount > 0 ? Number((uniqueWordCount / wordCount).toFixed(3)) : 0;
  const avgWordLength = wordCount > 0
    ? Number((tokens.reduce((sum, t) => sum + t.length, 0) / wordCount).toFixed(2))
    : 0;
  const sentenceCount = Math.max(1, text.split(/[.!?]+/).filter(Boolean).length);
  const estimatedReadingTime = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 200)) : 0;

  return {
    wordCount,
    uniqueWordCount,
    lexicalDiversity,
    avgWordLength,
    sentenceCount,
    estimatedReadingTime
  };
}

function createTextMetadata(entry) {
  const source = SourceMetadata.extract(entry.exam_id, entry.exam_name, entry.source);
  return {
    source: {
      institution: source.institution || 'FUVEST',
      year: source.year || null,
      edition: source.edition || null,
      period: source.period || null
    },
    lexical: computeLexicalMetadata(entry.text || ''),
    performance: {
      attempts: 0,
      accuracy: 0,
      avgConfidence: 0,
      lowConfidenceRate: 0,
      lastAttemptAt: null,
      _correctCount: 0,
      _confidenceSum: 0,
      _lowConfidenceCount: 0
    },
    vocabDifficulty: {
      topTerms: [],
      avgDifficulty: null
    }
  };
}

async function backfillFlashcardMetadata() {
  if (!state.db) return;
  const metaTx = state.db.transaction(STORES.META, 'readonly');
  const done = await idbGet(metaTx.objectStore(STORES.META), 'flashcards_metadata_backfill_v1_done');
  if (done?.value) return;

  const tx = state.db.transaction(STORES.FLASHCARDS, 'readwrite');
  const store = tx.objectStore(STORES.FLASHCARDS);
  const cards = await idbGetAll(store);
  let updated = 0;

  for (const card of cards) {
    let dirty = false;
    const normalized = normalizeTerm(card.word || '');
    if (!card.termNormalized) {
      card.termNormalized = normalized;
      dirty = true;
    }
    if (!card.termType) {
      card.termType = normalized.includes(' ') ? 'phrase' : 'word';
      dirty = true;
    }
    if (!card.sourceType) {
      card.sourceType = 'manual';
      dirty = true;
    }
    if (!card.sourceRefs) {
      card.sourceRefs = {};
      dirty = true;
    }
    if (!Object.prototype.hasOwnProperty.call(card, 'difficultySnapshot')) {
      card.difficultySnapshot = null;
      dirty = true;
    }
    if (!Object.prototype.hasOwnProperty.call(card, 'autoGenerated')) {
      card.autoGenerated = false;
      dirty = true;
    }
    if (!Object.prototype.hasOwnProperty.call(card, 'vocabId')) {
      card.vocabId = null;
      dirty = true;
    }
    if (dirty) {
      await idbPut(store, card);
      updated += 1;
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });

  const doneTx = state.db.transaction(STORES.META, 'readwrite');
  await idbPut(doneTx.objectStore(STORES.META), {
    key: 'flashcards_metadata_backfill_v1_done',
    value: true,
    updated,
    timestamp: new Date().toISOString()
  });
}

async function backfillTextMetadata() {
  if (!state.db) return;
  const metaTx = state.db.transaction(STORES.META, 'readonly');
  const done = await idbGet(metaTx.objectStore(STORES.META), 'metadata_backfill_v1_done');
  if (done?.value) return;

  const readTx = state.db.transaction(STORES.QUESTION_BANK, 'readonly');
  const entries = await idbGetAll(readTx.objectStore(STORES.QUESTION_BANK));
  const chunkSize = 20;
  let touched = 0;

  for (let i = 0; i < entries.length; i += chunkSize) {
    await waitForIdle();
    const chunk = entries.slice(i, i + chunkSize);
    const writeTx = state.db.transaction(STORES.QUESTION_BANK, 'readwrite');
    const store = writeTx.objectStore(STORES.QUESTION_BANK);

    for (const entry of chunk) {
      let dirty = false;
      if (!entry.text_metadata) {
        entry.text_metadata = createTextMetadata(entry);
        dirty = true;
      } else {
        if (!entry.text_metadata.source) {
          entry.text_metadata.source = createTextMetadata(entry).source;
          dirty = true;
        }
        if (!entry.text_metadata.lexical) {
          entry.text_metadata.lexical = computeLexicalMetadata(entry.text || '');
          dirty = true;
        }
        if (!entry.text_metadata.performance) {
          entry.text_metadata.performance = createTextMetadata(entry).performance;
          dirty = true;
        } else {
          const perf = entry.text_metadata.performance;
          if (!Object.prototype.hasOwnProperty.call(perf, '_correctCount')) {
            perf._correctCount = Math.round((perf.attempts || 0) * (perf.accuracy || 0) / 100);
            dirty = true;
          }
          if (!Object.prototype.hasOwnProperty.call(perf, '_confidenceSum')) {
            perf._confidenceSum = Number(((perf.avgConfidence || 0) * (perf.attempts || 0)).toFixed(4));
            dirty = true;
          }
          if (!Object.prototype.hasOwnProperty.call(perf, '_lowConfidenceCount')) {
            perf._lowConfidenceCount = Math.round((perf.lowConfidenceRate || 0) * (perf.attempts || 0) / 100);
            dirty = true;
          }
        }
        if (!entry.text_metadata.vocabDifficulty) {
          entry.text_metadata.vocabDifficulty = { topTerms: [], avgDifficulty: null };
          dirty = true;
        }
      }

      if (dirty) {
        await idbPut(store, entry);
        touched += 1;
      }
    }

    await new Promise((resolve, reject) => {
      writeTx.oncomplete = resolve;
      writeTx.onerror = () => reject(writeTx.error);
      writeTx.onabort = () => reject(writeTx.error || new Error('Transaction aborted'));
    });
  }

  const doneTx = state.db.transaction(STORES.META, 'readwrite');
  await idbPut(doneTx.objectStore(STORES.META), {
    key: 'metadata_backfill_v1_done',
    value: true,
    touched,
    timestamp: new Date().toISOString()
  });
}

async function updateTextPerformanceMetadata(textId, isCorrect, confidence) {
  if (!state.db || !textId) return;

  try {
    const tx = state.db.transaction(STORES.QUESTION_BANK, 'readwrite');
    const store = tx.objectStore(STORES.QUESTION_BANK);
    const entry = await idbGet(store, textId);
    if (!entry) return;

    entry.text_metadata = entry.text_metadata || createTextMetadata(entry);
    const perf = entry.text_metadata.performance || createTextMetadata(entry).performance;

    perf.attempts = (perf.attempts || 0) + 1;
    perf._correctCount = (perf._correctCount || 0) + (isCorrect ? 1 : 0);
    perf._confidenceSum = Number(((perf._confidenceSum || 0) + confidence).toFixed(4));
    perf._lowConfidenceCount = (perf._lowConfidenceCount || 0) + (confidence < 2 ? 1 : 0);
    perf.accuracy = perf.attempts > 0 ? Math.round((perf._correctCount / perf.attempts) * 100) : 0;
    perf.avgConfidence = perf.attempts > 0
      ? Number((perf._confidenceSum / perf.attempts).toFixed(2))
      : 0;
    perf.lowConfidenceRate = perf.attempts > 0
      ? Math.round((perf._lowConfidenceCount / perf.attempts) * 100)
      : 0;
    perf.lastAttemptAt = new Date().toISOString();
    entry.text_metadata.performance = perf;

    await idbPut(store, entry);
  } catch (error) {
    console.warn('[App] Failed to update text performance metadata:', error);
  }
}

async function updateWeaknessSection() {
  const weaknessList = document.getElementById('weakness-list');
  if (!weaknessList) return;

  if (!window.wordIntelligence) {
    weaknessList.innerHTML = '<p class="empty-state">Inteligência de vocabulário indisponível.</p>';
    return;
  }

  const weakTerms = await window.wordIntelligence.getTopDifficultTerms(5);
  if (!weakTerms.length) {
    weaknessList.innerHTML = '<p class="empty-state">Complete algumas questões para ver análise</p>';
    return;
  }

  const escapeHtml = (value = '') => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  weaknessList.innerHTML = weakTerms.map(item => `
    <div class="weakness-item" title="${escapeHtml(item.term)}">
      <span class="weakness-term">${escapeHtml(item.term)}</span>
      <span class="weakness-score">${item.score}</span>
    </div>
  `).join('');
}

// Simple Router
function setupRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute(); // Initial route
}

function handleRoute() {
  const hash = window.location.hash || '#/';
  const viewMap = {
    '#/': 'dashboard',
    '#/study': 'study',
    '#/exam': 'exam',
    '#/review': 'review',
    '#/flashcard-list': 'flashcard-list',
    '#/analytics': 'analytics',
    '#/sessions': 'sessions',
    '#/settings': 'settings',
    '#/expedition': 'expedition'
  };

  const viewId = viewMap[hash] || 'dashboard';

  // Log navigation
  if (window.behaviorLogger) {
    window.behaviorLogger.log('navigation', 'navigation', 'route_change', {
      from: state.currentView,
      to: viewId,
      hash
    });
  }

  switchView(viewId);
}

function switchView(viewId) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view--active'));
  
  // Show target view
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('view--active');
    state.currentView = viewId;
  }
  
  // Add/remove study-active class on body for CSS styling
  if (viewId === 'study') {
    document.body.classList.add('study-active');
    // Auto-load passage if navigating directly to study view
    if (!state.currentPassage) {
      startStudySession();
    }
  } else {
    document.body.classList.remove('study-active');
  }

  // Update bottom nav active state (map sub-views to nearest nav item)
  const navMap = { review: 'dashboard', 'srs-review': 'dashboard', sessions: 'dashboard', exam: 'study', 'flashcard-list': 'dashboard', expedition: 'dashboard' };
  const navViewId = navMap[viewId] || viewId;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === navViewId);
  });

  // Update dashboard data if entering dashboard
  if (viewId === 'dashboard') {
    updateDashboard();
  }
  
  // Render stats if entering analytics view
  if (viewId === 'analytics') {
    if (typeof StatsDashboard !== 'undefined' && window.analyticsManager) {
      const dashboard = new StatsDashboard(window.analyticsManager);
      dashboard.render('stats-view');
    }
  }
  
  // Render session history if entering sessions view
  if (viewId === 'sessions') {
    if (typeof SessionHistoryUI !== 'undefined' && window.sessionHistory) {
      const historyUI = new SessionHistoryUI(window.sessionHistory);
      historyUI.render('session-history-view');
    }
  }

  // Render flashcard list if entering flashcard-list view
  if (viewId === 'flashcard-list') {
    if (typeof FlashcardListUI !== 'undefined' && window.flashcardSystem) {
      const listUI = new FlashcardListUI(window.flashcardSystem);
      listUI.render('flashcard-list-view');
    }
  }

  // Render expedition view
  if (viewId === 'expedition') {
    if (window.expeditionUI) {
      window.expeditionUI.render();
    }
  }
}

// Initialize Filter Settings UI
function initFilterSettings() {
  const filters = FilterSettings.load();
  
  // Set source checkboxes
  document.querySelectorAll('#source-filters input[type="checkbox"]').forEach(cb => {
    cb.checked = filters.sources.includes(cb.value);
    
    // Add change listener
    cb.addEventListener('change', () => {
      const selectedSources = Array.from(
        document.querySelectorAll('#source-filters input[type="checkbox"]:checked')
      ).map(cb => cb.value);
      
      filters.sources = selectedSources;
      FilterSettings.save(filters);
      updateFilterSummary();
    });
  });
  
  // Set year range
  const yearMinEl = document.getElementById('year-min');
  const yearMaxEl = document.getElementById('year-max');
  
  if (yearMinEl) yearMinEl.value = filters.yearMin;
  if (yearMaxEl) yearMaxEl.value = filters.yearMax;
  
  // Add change listeners
  yearMinEl?.addEventListener('change', (e) => {
    filters.yearMin = parseInt(e.target.value);
    FilterSettings.save(filters);
    updateFilterSummary();
  });
  
  yearMaxEl?.addEventListener('change', (e) => {
    filters.yearMax = parseInt(e.target.value);
    FilterSettings.save(filters);
    updateFilterSummary();
  });
  
  // Initial summary update
  updateFilterSummary();
}

// Initialize Help Feature Settings
function initHelpFeatureSettings() {
  const checkboxes = [
    { id: 'help-translate', key: 'translate' },
    { id: 'help-lesson', key: 'lesson' },
    { id: 'help-alternatives', key: 'alternatives' },
    { id: 'help-hints', key: 'hints' },
    { id: 'help-tts', key: 'tts' }
  ];
  
  checkboxes.forEach(({ id, key }) => {
    const cb = document.getElementById(id);
    if (!cb) return;
    
    // Load saved value
    if (window.helpFeatures) {
      cb.checked = window.helpFeatures.settings[key];
    }
    
    // Add change listener
    cb.addEventListener('change', () => {
      if (window.helpFeatures) {
        window.helpFeatures.updateSettings({ [key]: cb.checked });
        // Stop TTS if it was playing and user disabled the setting
        if (key === 'tts' && !cb.checked) {
          window.helpFeatures.stopSpeaking();
        }
      }
    });
  });
}

// Update filter summary display
async function updateFilterSummary() {
  if (!state.db) return;
  
  const filters = FilterSettings.load();
  const tx = state.db.transaction(STORES.QUESTION_BANK, 'readonly');
  const store = tx.objectStore(STORES.QUESTION_BANK);
  const passages = await idbGetAll(store);
  const filtered = FilterSettings.filter(passages, filters);
  const totalQuestions = filtered.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
  
  const summaryEl = document.getElementById('filter-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<span class="filter-count">${filtered.length} textos · ${totalQuestions} questões disponíveis</span>`;
  }
}

// Event Listeners
function setupEventListeners() {
  // Initialize filter settings
  initFilterSettings();
  
  // Initialize help feature settings
  initHelpFeatureSettings();
  
  // Navigation
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    window.location.hash = '#/settings';
    updateFilterSummary();
  });
  
  document.getElementById('study-back')?.addEventListener('click', async () => {
    // End current session if active
    if (window.sessionHistory && window.sessionHistory.currentSession) {
      await window.sessionHistory.endSession();
    }
    window.location.hash = '#/';
  });
  
  // Dashboard buttons
  document.getElementById('btn-study')?.addEventListener('click', startStudySession);
  document.getElementById('btn-review')?.addEventListener('click', () => {
    window.location.hash = '#/review';
  });
  document.getElementById('btn-exam')?.addEventListener('click', () => {
    window.location.hash = '#/exam';
  });
  
  // Start exam button
  document.getElementById('btn-start-exam')?.addEventListener('click', async () => {
    if (window.examMode) {
      try {
        await window.examMode.startExam();
        // Reload exam view with active exam
        window.location.hash = '#/exam';
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
  });
  document.getElementById('btn-analytics')?.addEventListener('click', () => {
    window.location.hash = '#/analytics';
  });
  
  document.getElementById('btn-sessions')?.addEventListener('click', () => {
    window.location.hash = '#/sessions';
  });

  // Flashcards button — start review directly, fallback to list if no cards
  document.getElementById('btn-deck')?.addEventListener('click', async () => {
    if (window.flashcardSystem) {
      const ui = new FlashcardUI(window.flashcardSystem);
      const dueCards = await window.flashcardSystem.getDueCards(null, 50);
      if (dueCards.length > 0) {
        ui.cards = dueCards;
        ui.currentIndex = 0;
        ui.showCard();
        return;
      }
      const allCards = await window.flashcardSystem.getAllCards();
      if (allCards.length > 0) {
        ui.cards = allCards;
        ui.currentIndex = 0;
        ui.showCard();
        return;
      }
    }
    window.location.hash = '#/flashcard-list';
  });

  // Flashcard list "Voltar ao Treino" — reopen flashcard training
  document.getElementById('fc-list-back')?.addEventListener('click', async () => {
    if (window.flashcardSystem) {
      const ui = new FlashcardUI(window.flashcardSystem);
      const dueCards = await window.flashcardSystem.getDueCards(null, 50);
      const cards = dueCards.length > 0 ? dueCards : await window.flashcardSystem.getAllCards();
      if (cards.length > 0) {
        window.location.hash = '#/';
        ui.cards = cards;
        ui.currentIndex = 0;
        ui.showCard();
        return;
      }
    }
    window.location.hash = '#/';
  });

  // Delegated back button handler for [data-back] attribute
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) {
      e.preventDefault();
      window.location.hash = '#/';
    }
  });

  // Settings - daily goal with persistence
  const savedGoal = localStorage.getItem('dailyGoal');
  if (savedGoal) {
    const goalInput = document.getElementById('daily-goal');
    const goalValue = document.getElementById('daily-goal-value');
    if (goalInput) goalInput.value = savedGoal;
    if (goalValue) goalValue.textContent = savedGoal;
  }
  document.getElementById('daily-goal')?.addEventListener('input', (e) => {
    document.getElementById('daily-goal-value').textContent = e.target.value;
    localStorage.setItem('dailyGoal', e.target.value);
  });

  // Theme toggle
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Restore saved theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === savedTheme);
    });
  }
  
  // Initialize AI Provider Settings
  initProviderSettings(showToast);

  document.getElementById('btn-export')?.addEventListener('click', exportData);
  document.getElementById('import-file')?.addEventListener('change', importData);
}

// Update Dashboard Stats
async function updateDashboard() {
  if (!state.db) return;
  
  try {
    // Get bank statistics
    const tx = state.db.transaction(STORES.QUESTION_BANK, 'readonly');
    const store = tx.objectStore(STORES.QUESTION_BANK);
    const passages = await idbGetAll(store);
    
    const totalPassages = passages.length;
    const totalQuestions = passages.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
    const officialCount = passages.filter(p => p.source_type === 'official').length;
    
    // Update dashboard card
    const bankCountEl = document.getElementById('bank-count');
    if (bankCountEl) bankCountEl.textContent = totalPassages;
    
    // Update settings bank stats
    const bankTotalEl = document.getElementById('bank-total');
    const bankQuestionsEl = document.getElementById('bank-questions');
    const bankOfficialEl = document.getElementById('bank-official');
    
    if (bankTotalEl) bankTotalEl.textContent = totalPassages;
    if (bankQuestionsEl) bankQuestionsEl.textContent = totalQuestions;
    if (bankOfficialEl) bankOfficialEl.textContent = officialCount;
    
    // Check for review count (SRS cards due)
    let reviewCount = 0;
    try {
      if (window.srsManager) {
        const dueCards = await window.srsManager.getDueCards();
        reviewCount = dueCards.length;
        
        // Update SRS status card
        const srsStatus = document.getElementById('srs-status');
        const srsDue = document.getElementById('srs-due');
        const srsNew = document.getElementById('srs-new');
        const srsTotal = document.getElementById('srs-total');
        
        if (srsStatus && reviewCount > 0) {
          srsStatus.style.display = 'block';
          const stats = await window.srsManager.getStats();
          if (srsDue) srsDue.textContent = reviewCount;
          if (srsNew) srsNew.textContent = stats.new;
          if (srsTotal) srsTotal.textContent = stats.total;
        } else if (srsStatus) {
          srsStatus.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('SRS stats error:', e);
    }
    
    const reviewBtn = document.getElementById('btn-review');
    const reviewBadge = document.getElementById('review-count');
    
    if (reviewBadge) reviewBadge.textContent = reviewCount;
    if (reviewBtn) reviewBtn.disabled = reviewCount === 0;
    
    // Update analytics stats on dashboard
    try {
      if (window.analyticsManager) {
        const stats = await window.analyticsManager.getOverallStats();
        
        // Update readiness score
        const readinessEl = document.getElementById('readiness-score');
        if (readinessEl) {
          readinessEl.textContent = stats.totalQuestions > 0 ? stats.predictedScore.toFixed(1) : '--';
        }
        
        // Update streak
        const streakEl = document.getElementById('streak-days');
        if (streakEl) {
          streakEl.innerHTML = `${stats.currentStreak} <i data-lucide="flame" class="streak-icon"></i>`;
          if (window.lucide) window.lucide.createIcons();
        }
      }
    } catch (e) {
      console.error('Analytics stats error:', e);
    }

    // Update XP bar
    if (window.xpSystem) {
      window.xpSystem.updateDashboardXP();
    }

    // Update daily challenge card
    if (window.dailyChallenge) {
      window.dailyChallenge.updateDashboardCard();
    }

    // Update expedition badge
    if (window.expeditionUI) {
      window.expeditionUI.updateDashboardBadge();
    }

    // Check achievements (including expedition stats)
    if (window.achievementsManager) {
      try {
        const aStats = window.analyticsManager ? await window.analyticsManager.getOverallStats() : {};
        const achieveStats = {
          totalQuestions: aStats.totalQuestions || 0,
          currentStreak: aStats.currentStreak || 0,
          fuvestAccuracy: aStats.overallAccuracy || 0,
          fuvestQuestions: aStats.totalQuestions || 0,
          translations: 0, fastAnswers: 0, completionRate: 0,
          examsCompleted: 0, notesCreated: 0, flashcardsReviewed: 0
        };
        if (window.expeditionEngine) {
          const ep = window.expeditionEngine.getProfile();
          achieveStats.expeditionsCompleted = ep.completedRuns || 0;
          achieveStats.expeditionBestFloor = ep.bestFloor || 0;
          achieveStats.expeditionPerfectRuns = ep.statistics?.perfectRuns || 0;
          achieveStats.expeditionBossesDefeated = ep.statistics?.bossesDefeated || 0;
          achieveStats.expeditionRelicsUnlocked = ep.unlockedRelics?.length || 0;
        }
        window.achievementsManager.checkAchievements(achieveStats).catch(() => {});
      } catch (e) { /* achievements check non-critical */ }
    }

    await updateWeaknessSection();

  } catch (error) {
    console.error('Dashboard update error:', error);
  }
}

// Start Study Session
async function startStudySession() {
  if (!state.db) {
    showToast('Banco de dados não inicializado', 'error');
    return;
  }
  
  // Show loading state
  const loadingEl = document.getElementById('study-loading');
  if (loadingEl) loadingEl.style.display = 'flex';
  
  // Start session history tracking
  if (window.sessionHistory) {
    window.sessionHistory.startSession('study');
  }

  // Log session start
  if (window.behaviorLogger) {
    window.behaviorLogger.log('session', 'study', 'start', {});
  }
  
  try {
    // Get filter settings
    const filters = FilterSettings.load();
    
    // Get a fresh passage from question bank
    const tx = state.db.transaction(STORES.QUESTION_BANK, 'readonly');
    const store = tx.objectStore(STORES.QUESTION_BANK);
    
    // Get all passages
    let passages = await idbGetAll(store);
    
    // Apply source filters
    passages = FilterSettings.filter(passages, filters);
    
    if (passages.length === 0) {
      showToast('Nenhum texto disponível com os filtros atuais. Ajuste as configurações.', 'warning');
      return;
    }
    
    // Filter fresh passages (times_served === 0)
    const freshPassages = passages.filter(p => p.times_served === 0);
    
    let selectedPassage;
    
    if (freshPassages.length > 0) {
      // Pick random fresh passage
      selectedPassage = freshPassages[Math.floor(Math.random() * freshPassages.length)];
    } else {
      // Pick random from filtered passages
      selectedPassage = passages[Math.floor(Math.random() * passages.length)];
    }
    
    // Update times_served
    const writeTx = state.db.transaction(STORES.QUESTION_BANK, 'readwrite');
    const writeStore = writeTx.objectStore(STORES.QUESTION_BANK);
    selectedPassage.times_served++;
    selectedPassage.last_served_at = new Date().toISOString();
    await idbPut(writeStore, selectedPassage);
    
    // Set current passage
    state.currentPassage = selectedPassage;
    state.currentQuestionIndex = 0;
    
    // Add to session history
    if (window.sessionHistory) {
      window.sessionHistory.addPassage(selectedPassage.id);
    }
    
    // Load passage into UI
    loadPassageIntoUI(selectedPassage);
    
    // Switch to study view
    window.location.hash = '#/study';
    
  } catch (error) {
    console.error('Start study error:', error);
    showToast('Erro ao carregar texto', 'error');
    // Hide loading state on error
    const loadingEl = document.getElementById('study-loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// Load Passage into UI
function loadPassageIntoUI(passage) {
  // Stop any active TTS when loading a new passage
  if (window.helpFeatures) {
    const ttsBtn = document.getElementById('help-btn-tts');
    window.helpFeatures.stopSpeaking(ttsBtn);
  }

  const passageEl = document.getElementById('passage-text');
  const questionEl = document.getElementById('question-text');
  const optionsEl = document.getElementById('options-list');
  const progressEl = document.getElementById('study-progress');
  
  // Get source metadata
  const metadata = SourceMetadata.extract(passage.exam_id, passage.exam_name, passage.source);
  const sourceBadge = SourceMetadata.format(metadata);
  const badgeColor = SourceMetadata.getBadgeColor(metadata.institution);
  
  if (passageEl) {
    // Format passage with paragraphs and source badge
    const formattedText = passage.text
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => `<p>${p.trim()}</p>`)
      .join('');
    
    // Add source badge at the top
    const badgeHTML = `<div class="source-badge" style="background: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}40; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; margin-bottom: 12px; display: inline-block; font-weight: 500;">
      <i data-lucide="graduation-cap" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;"></i>
      ${sourceBadge}
    </div>`;
    
    passageEl.innerHTML = badgeHTML + formattedText;
    
    // Reset reading progress
    const progressBar = document.getElementById('reading-progress');
    if (progressBar) progressBar.style.width = '0%';
    
    // Reset scroll
    passageEl.scrollTop = 0;
    
    // Enable help features
    if (window.helpFeatures) {
      window.helpFeatures.wrapWordsInPassage();
      window.helpFeatures.setContext(passage, passage.questions[state.currentQuestionIndex]);
    }
  }
  
  // Load first question
  const question = passage.questions[state.currentQuestionIndex];
  if (question && questionEl) {
    questionEl.textContent = question.question_text;
  }
  
  // Load options
  if (optionsEl && question) {
    optionsEl.innerHTML = '';
    question.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.dataset.index = idx;
      btn.dataset.value = ['A', 'B', 'C', 'D', 'E'][idx];
      btn.addEventListener('click', () => handleOptionSelect(btn, question));
      optionsEl.appendChild(btn);
    });
  }
  
  // Update progress
  if (progressEl) {
    progressEl.textContent = `Questão ${state.currentQuestionIndex + 1}/${passage.questions.length}`;
  }
  
  // Update tab badge
  updateStudyProgressIndicator();
  
  // Reset to passage tab on mobile
  const studyContent = document.getElementById('study-content');
  if (studyContent) {
    studyContent.classList.remove('show-question');
  }
  const passageTab = document.querySelector('[data-tab="passage"]');
  if (passageTab) {
    document.querySelectorAll('.study-tab').forEach(t => t.classList.remove('active'));
    passageTab.classList.add('active');
  }

  // Hide loading state
  const loadingEl = document.getElementById('study-loading');
  if (loadingEl) loadingEl.style.display = 'none';
  
  // Hide feedback and confidence sections
  const confEl = document.getElementById('confidence-section');
  const feedEl = document.getElementById('feedback-section');
  const nextEl = document.getElementById('next-container');
  if (confEl) confEl.style.display = 'none';
  if (feedEl) feedEl.style.display = 'none';
  if (nextEl) nextEl.style.display = 'none';
  
  // Expand passage if collapsed
  const passageContainer = document.getElementById('passage-panel');
  if (passageContainer) {
    passageContainer.classList.remove('collapsed');
  }

  // Mark question load time for hesitation tracking
  if (window.behaviorLogger) {
    window.behaviorLogger.markQuestionLoad();
  }

  // Determine if this is a treasure question (10% chance)
  state._currentTreasure = window.xpSystem ? window.xpSystem.isTreasureQuestion() : false;
  state._helpUsedThisQuestion = [];

  // Show treasure indicator if applicable
  const treasureEl = document.getElementById('treasure-indicator');
  if (treasureEl) {
    treasureEl.style.display = state._currentTreasure ? 'inline-flex' : 'none';
  }
}
// Expose for expedition-ui.js combat integration
window._loadPassageIntoUI = loadPassageIntoUI;

// Handle Option Selection
function handleOptionSelect(button, question) {
  // Disable all options
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
  });

  // Mark selected
  button.classList.add('selected');

  // Log behavior
  if (window.behaviorLogger) {
    const timeFromLoad = window.behaviorLogger.getTimeSinceQuestionLoad();
    window.behaviorLogger.log('answer', 'study', 'select_option', {
      questionId: question.id,
      optionSelected: button.dataset.value,
      timeFromLoad
    });
  }

  // Show confidence prompt
  const confidenceSection = document.getElementById('confidence-section');
  if (confidenceSection) {
    confidenceSection.style.display = 'block';
    confidenceSection.querySelectorAll('.confidence-btn').forEach(btn => {
      btn.onclick = () => handleConfidenceSelect(btn.dataset.confidence, button.dataset.value, question);
    });
  }
}

// Handle Confidence Selection
function handleConfidenceSelect(confidenceLevel, selectedAnswer, question) {
  const isCorrect = selectedAnswer === question.correct_answer;
  
  // Show feedback
  const feedbackSection = document.getElementById('feedback-section');
  if (feedbackSection) {
    feedbackSection.style.display = 'block';
    feedbackSection.className = `feedback-section ${isCorrect ? 'correct' : 'incorrect'}`;
    feedbackSection.innerHTML = `
      <h4>${isCorrect ? '✓ Correto!' : '✗ Incorreto'}</h4>
      <p>Resposta correta: ${question.correct_answer}</p>
    `;
  }
  
  // Show next button
  const nextContainer = document.getElementById('next-container');
  const nextBtn = document.getElementById('btn-next');
  if (nextContainer) nextContainer.style.display = 'block';
  if (nextBtn) nextBtn.onclick = handleNextQuestion;
  
  // Mark correct/incorrect in UI
  document.querySelectorAll('.option-btn').forEach(btn => {
    if (btn.dataset.value === question.correct_answer) {
      btn.classList.add('correct');
    } else if (btn.classList.contains('selected') && !isCorrect) {
      btn.classList.add('incorrect');
    }
  });
  
  // Hide confidence section
  const confSection = document.getElementById('confidence-section');
  if (confSection) confSection.style.display = 'none';
  
  // Log behavior
  if (window.behaviorLogger) {
    window.behaviorLogger.log('answer', 'study', 'confirm_answer', {
      questionId: question.id,
      isCorrect,
      confidence: parseInt(confidenceLevel),
      selectedAnswer
    });
  }

  // Skip XP/challenge awards if inside expedition (engine handles its own rewards)
  const inExpedition = window.expeditionEngine && window.expeditionEngine.hasActiveRun();

  // Award XP
  if (window.xpSystem && !inExpedition) {
    const isTreasure = state._currentTreasure || false;
    const multiplier = isTreasure ? 2 : 1;
    if (isCorrect) {
      const baseXP = parseInt(confidenceLevel) >= 3 ? 15 : 10;
      window.xpSystem.awardXP(baseXP, 'answer_correct', multiplier);
    } else {
      window.xpSystem.awardXP(3, 'answer_incorrect', multiplier);
    }
  }

  // Update daily challenge
  if (window.dailyChallenge && !inExpedition) {
    window.dailyChallenge.recordProgress('total_answers', 1);
    if (isCorrect) {
      window.dailyChallenge.recordProgress('consecutive_correct', 1);
      // Track correct without help for "perfect" challenge
      const helpUsedThisQuestion = state._helpUsedThisQuestion || [];
      if (helpUsedThisQuestion.length === 0) {
        window.dailyChallenge.recordProgress('correct_no_help', 1);
      }
    } else {
      // Reset consecutive counter on wrong answer
      window.dailyChallenge._challenge && (window.dailyChallenge._challenge._consecutiveCorrect = 0);
    }
  }

  // Save attempt (async, don't block)
  saveAttempt(question, selectedAnswer, parseInt(confidenceLevel), isCorrect);

  // Dispatch event for expedition combat bridge
  document.dispatchEvent(new CustomEvent('question:answered', {
    detail: { questionId: question.id, isCorrect, confidence: parseInt(confidenceLevel), selectedAnswer }
  }));
}

// Handle Next Question
async function handleNextQuestion() {
  state.currentQuestionIndex++;

  if (state.currentQuestionIndex < state.currentPassage.questions.length) {
    // Load next question
    loadPassageIntoUI(state.currentPassage);
  } else {
    // Passage complete - end session
    if (window.sessionHistory) {
      await window.sessionHistory.endSession();
    }

    // Log session end
    if (window.behaviorLogger) {
      window.behaviorLogger.log('session', 'study', 'end', {
        passageId: state.currentPassage?.id,
        questionsAnswered: state.currentPassage?.questions?.length || 0
      });
    }

    showToast('Texto completo!', 'success');
    window.location.hash = '#/';
  }
}

// Save Question Attempt
async function saveAttempt(question, answer, confidence, isCorrect, timeSpent = 0, helpUsed = []) {
  if (!state.db) return;
  
  try {
    const tx = state.db.transaction(STORES.QUESTION_ATTEMPTS, 'readwrite');
    const store = tx.objectStore(STORES.QUESTION_ATTEMPTS);
    
    await idbAdd(store, {
      question_id: question.id,
      passage_id: state.currentPassage.id,
      question_type: question.question_type,
      passage_topic: state.currentPassage.topic,
      selected_answer: answer,
      correct_answer: question.correct_answer,
      is_correct: isCorrect,
      confidence: confidence,
      created_at: new Date().toISOString()
    });

    updateTextPerformanceMetadata(state.currentPassage.id, isCorrect, confidence).catch(() => null);
    
    // Record in analytics
    if (window.analyticsManager) {
      await window.analyticsManager.recordQuestionAttempt(
        question.id,
        isCorrect,
        confidence,
        timeSpent,
        helpUsed
      );
    }
    
    // Record in session history
    if (window.sessionHistory) {
      window.sessionHistory.recordQuestionAttempt({
        questionId: question.id,
        passageId: state.currentPassage.id,
        questionText: question.question_text,
        selectedAnswer: answer,
        correctAnswer: question.correct_answer,
        isCorrect: isCorrect,
        confidence: confidence,
        timeSpent: timeSpent,
        helpUsed: helpUsed
      });
    }
    
    // Add to SRS if incorrect OR if confidence was low
    if (!isCorrect || confidence < 2) {
      if (window.srsManager) {
        await window.srsManager.scheduleQuestion(question.id, {
          question_text: question.question_text,
          passage_id: state.currentPassage.id,
          passage_title: state.currentPassage.exam_name
        });
      }
    }
  } catch (error) {
    console.error('Save attempt error:', error);
  }
}

// Export Data
async function exportData() {
  try {
    const data = {
      schema_version: '3.3',
      exported_at: new Date().toISOString(),
      stores: {}
    };
    
    // Export all stores
    for (const storeName of Object.values(STORES)) {
      const tx = state.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      data.stores[storeName] = await idbGetAll(store);
    }
    
    // Download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english_training_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Backup exportado!', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showToast('Erro ao exportar', 'error');
  }
}

// Import Data
async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate structure
    if (!data.stores || typeof data.stores !== 'object') {
      throw new Error('Formato inválido: campo "stores" ausente');
    }

    const validStores = Object.values(STORES);
    for (const [storeName, records] of Object.entries(data.stores)) {
      if (!validStores.includes(storeName)) {
        console.warn(`[Import] Store desconhecida ignorada: ${storeName}`);
        continue;
      }
      if (!Array.isArray(records)) {
        console.warn(`[Import] Store ${storeName} não é array, ignorada`);
        continue;
      }

      const tx = state.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const record of records) {
        await idbPut(store, record);
      }
    }
    
    showToast('Dados importados com sucesso!', 'success');
    updateDashboard();
  } catch (error) {
    console.error('Import error:', error);
    showToast('Erro ao importar: ' + error.message, 'error');
  }
}

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Limit to 2 simultaneous toasts
  while (container.children.length >= 2) {
    container.firstChild.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Cleanup old service workers (SW removed — ADR-001)
function cleanupServiceWorkers() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => {
        reg.unregister().then(() => console.log('[SW] Unregistered service worker'));
      });
    }).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name).then(() => console.log('[SW] Cleared cache:', name));
      });
    }).catch(() => {});
  }
}

// Expose router globally for onclick handlers
window.router = {
  navigate: (hash) => {
    window.location.hash = hash;
  }
};// Study UI Enhancements - Tabs, Collapse, Reading Progress

// Setup Study UI (tabs, collapsible passage, etc.)
function setupStudyUI() {
  // Mobile tabs - use event delegation for robustness
  const tabsContainer = document.getElementById('study-tabs');
  const studyContent = document.getElementById('study-content');

  if (tabsContainer && studyContent) {
    tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.study-tab');
      if (!tab) return;

      const targetTab = tab.dataset.tab;

      // Update active tab
      tabsContainer.querySelectorAll('.study-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding panel
      if (targetTab === 'question') {
        studyContent.classList.add('show-question');
      } else {
        studyContent.classList.remove('show-question');
      }
    });
  }
  
  // Collapsible passage header
  const passageHeader = document.getElementById('passage-header');
  const passageContainer = document.getElementById('passage-panel');
  
  if (passageHeader && passageContainer) {
    passageHeader.addEventListener('click', () => {
      passageContainer.classList.toggle('collapsed');
    });
  }
  
  // Reading progress tracker
  const passageText = document.getElementById('passage-text');
  const progressBar = document.getElementById('reading-progress');
  
  if (passageText && progressBar) {
    passageText.addEventListener('scroll', () => {
      const scrollTop = passageText.scrollTop;
      const scrollHeight = passageText.scrollHeight - passageText.clientHeight;
      const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      progressBar.style.width = progress + '%';
    });
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only when in study view
    if (!document.getElementById('study').classList.contains('view--active')) return;
    
    // Options A-E (keys a-e)
    if (e.key >= 'a' && e.key <= 'e') {
      const optionIndex = e.key.charCodeAt(0) - 'a'.charCodeAt(0);
      const options = document.querySelectorAll('.option-btn:not(:disabled)');
      if (options[optionIndex]) {
        options[optionIndex].click();
      }
    }
    
    // Confidence 1-4
    if (e.key >= '1' && e.key <= '4') {
      const confidenceBtn = document.querySelector(`[data-confidence="${e.key - 1}"]`);
      if (confidenceBtn && confidenceBtn.offsetParent !== null) {
        confidenceBtn.click();
      }
    }
    
    // Enter for next question
    if (e.key === 'Enter') {
      const nextBtn = document.getElementById('btn-next');
      if (nextBtn && nextBtn.offsetParent !== null) {
        nextBtn.click();
      }
    }
  });
  
  // Help Features Toolbar
  setupHelpToolbar();
}

// Setup Help Toolbar Buttons
function setupHelpToolbar() {
  const toolbar = document.getElementById('study-help-toolbar');
  if (!toolbar) return;
  
  // Lesson button
  const lessonBtn = document.getElementById('help-btn-lesson');
  if (lessonBtn) {
    lessonBtn.addEventListener('click', () => {
      if (window.helpFeatures) window.helpFeatures.getGrammarLesson();
    });
  }
  
  // Alternatives button
  const altBtn = document.getElementById('help-btn-alternatives');
  if (altBtn) {
    altBtn.addEventListener('click', () => {
      if (window.helpFeatures) window.helpFeatures.getAlternativeExplanations();
    });
  }
  
  // Hints button
  const hintsBtn = document.getElementById('help-btn-hints');
  if (hintsBtn) {
    hintsBtn.addEventListener('click', () => {
      if (window.helpFeatures) window.helpFeatures.getHints();
    });
  }
  
  // TTS button — toggle play/pause/resume
  const ttsBtn = document.getElementById('help-btn-tts');
  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      const passageText = document.getElementById('passage-text');
      if (window.helpFeatures && passageText) {
        const text = passageText.textContent;
        window.helpFeatures.toggleSpeech(text, ttsBtn);
      }
    });
  }
}

// Update loadPassageIntoUI to handle new elements
function updateStudyProgressIndicator() {
  const badge = document.getElementById('tab-question-num');
  if (badge && state.currentPassage) {
    badge.textContent = state.currentQuestionIndex + 1;
  }
}

// Initialize Study UI on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupStudyUI();
  
  // Initialize Help Features
  if (typeof initHelpFeatures === 'function') {
    window.helpFeatures = initHelpFeatures();
  }
});

