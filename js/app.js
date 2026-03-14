/**
 * English Training - Main Application
 * Entry point and initialization
 */

import { AIConfig } from './config/ai-providers.js';
import { STORES, DB_NAME, DB_VERSION } from './config/constants.js';
import { initProviderSettings } from './provider-settings.js';
import { requestJsonWithFallback } from './core/request-with-fallback.js';

// IndexedDB Promise Helpers
function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(store, value) {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbAdd(store, value) {
  return new Promise((resolve, reject) => {
    const request = store.add(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbCount(store) {
  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

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

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize IndexedDB
    await initDatabase();
    
    // Initialize question bank from JSON
    await initializeQuestionBank();
    
    // Setup router
    setupRouter();
    
    // Setup event listeners
    setupEventListeners();
    
    // Register service worker
    registerServiceWorker();
    
    // Update dashboard
    await updateDashboard();

    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }

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
    request.onsuccess = () => {
      state.db = request.result;
      resolve(state.db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Question Bank store
      if (!db.objectStoreNames.contains(STORES.QUESTION_BANK)) {
        const bankStore = db.createObjectStore(STORES.QUESTION_BANK, { keyPath: 'id' });
        bankStore.createIndex('question_type', 'question_type', { multiEntry: true });
        bankStore.createIndex('passage_topic', 'passage_topic', { unique: false });
        bankStore.createIndex('times_served', 'times_served', { unique: false });
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
    };
  });
}

// Initialize Question Bank from JSON
async function initializeQuestionBank() {
  const db = state.db;
  const tx = db.transaction(STORES.META, 'readonly');
  const metaStore = tx.objectStore(STORES.META);
  const isInitialized = await idbGet(metaStore, 'bank_initialized');
  
  if (isInitialized?.value) {
    console.log('[App] Question bank already initialized');
    return;
  }
  
  try {
    console.log('Carregando banco de questões...');
    const data = await requestJsonWithFallback('./data/initial-bank.json', {}, {
      context: 'initial-bank',
      fallbackMessage: 'Nao foi possivel carregar o banco inicial.',
      retries: 2,
      timeoutMs: 10000
    });
    
    // Populate question bank
    const writeTx = db.transaction(STORES.QUESTION_BANK, 'readwrite');
    const bankStore = writeTx.objectStore(STORES.QUESTION_BANK);
    
    for (const passage of data.passages) {
      const bankEntry = {
        ...passage,
        times_served: 0,
        last_served_at: null,
        source_type: 'official',
        created_at: new Date().toISOString()
      };
      await idbPut(bankStore, bankEntry);
    }
    
    // Mark as initialized
    const metaWriteTx = db.transaction(STORES.META, 'readwrite');
    await idbPut(metaWriteTx.objectStore(STORES.META), {
      key: 'bank_initialized',
      value: true,
      version: data.schema_version,
      timestamp: new Date().toISOString()
    });
    
    console.log(`${data.total_passages} passagens carregadas`);
    console.log(`[App] Initialized question bank with ${data.total_passages} passages`);
  } catch (error) {
    console.error('[App] Failed to initialize question bank:', error);
    showToast('Usando banco vazio. Configure API para gerar questões.', 'warning');
  }
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
    '#/analytics': 'analytics',
    '#/settings': 'settings'
  };
  
  const viewId = viewMap[hash] || 'dashboard';
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

  // Update bottom nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  // Update dashboard data if entering dashboard
  if (viewId === 'dashboard') {
    updateDashboard();
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
    summaryEl.innerHTML = `<span class="filter-count">${filtered.length} passagens · ${totalQuestions} questões disponíveis</span>`;
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
  
  document.getElementById('settings-back')?.addEventListener('click', () => {
    window.location.hash = '#/';
  });
  
  document.getElementById('study-back')?.addEventListener('click', () => {
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
  document.getElementById('btn-analytics')?.addEventListener('click', () => {
    window.location.hash = '#/analytics';
  });
  
  // Settings
  document.getElementById('daily-goal')?.addEventListener('input', (e) => {
    document.getElementById('daily-goal-value').textContent = e.target.value;
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
    // TODO: Implement SRS review count
    const reviewCount = 0;
    const reviewBtn = document.getElementById('btn-review');
    const reviewBadge = document.getElementById('review-count');
    
    if (reviewBadge) reviewBadge.textContent = reviewCount;
    if (reviewBtn) reviewBtn.disabled = reviewCount === 0;
    
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
      showToast('Nenhuma passagem disponível com os filtros atuais. Ajuste as configurações.', 'warning');
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
    
    // Load passage into UI
    loadPassageIntoUI(selectedPassage);
    
    // Switch to study view
    window.location.hash = '#/study';
    
  } catch (error) {
    console.error('Start study error:', error);
    showToast('Erro ao carregar passagem', 'error');
  }
}

// Load Passage into UI
function loadPassageIntoUI(passage) {
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
  
  // Hide feedback and confidence sections
  document.getElementById('confidence-section').style.display = 'none';
  document.getElementById('feedback-section').style.display = 'none';
  document.getElementById('next-container').style.display = 'none';
  
  // Expand passage if collapsed
  const passageContainer = document.getElementById('passage-panel');
  if (passageContainer) {
    passageContainer.classList.remove('collapsed');
  }
}

// Handle Option Selection
function handleOptionSelect(button, question) {
  // Disable all options
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
  });
  
  // Mark selected
  button.classList.add('selected');
  
  // Show confidence prompt
  const confidenceSection = document.getElementById('confidence-section');
  confidenceSection.style.display = 'block';
  
  // Setup confidence buttons
  confidenceSection.querySelectorAll('.confidence-btn').forEach(btn => {
    btn.onclick = () => handleConfidenceSelect(btn.dataset.confidence, button.dataset.value, question);
  });
}

// Handle Confidence Selection
function handleConfidenceSelect(confidenceLevel, selectedAnswer, question) {
  const isCorrect = selectedAnswer === question.correct_answer;
  
  // Show feedback
  const feedbackSection = document.getElementById('feedback-section');
  feedbackSection.style.display = 'block';
  feedbackSection.className = `feedback-section ${isCorrect ? 'correct' : 'incorrect'}`;
  feedbackSection.innerHTML = `
    <h4>${isCorrect ? '✓ Correto!' : '✗ Incorreto'}</h4>
    <p>Resposta correta: ${question.correct_answer}</p>
  `;
  
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
  document.getElementById('confidence-section').style.display = 'none';
  
  // Save attempt (async, don't block)
  saveAttempt(question, selectedAnswer, parseInt(confidenceLevel), isCorrect);
}

// Handle Next Question
function handleNextQuestion() {
  state.currentQuestionIndex++;
  
  if (state.currentQuestionIndex < state.currentPassage.questions.length) {
    // Load next question
    loadPassageIntoUI(state.currentPassage);
  } else {
    // Passage complete
    showToast('Passagem completa!', 'success');
    window.location.hash = '#/';
  }
}

// Save Question Attempt
async function saveAttempt(question, answer, confidence, isCorrect) {
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

// Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.error('[SW] Registration failed:', err));
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
  
  // TTS button
  const ttsBtn = document.getElementById('help-btn-tts');
  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      const passageText = document.getElementById('passage-text');
      if (window.helpFeatures && passageText) {
        const text = passageText.textContent;
        window.helpFeatures.speakText(text);
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

