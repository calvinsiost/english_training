/**
 * English Training - Main Application
 * Entry point and initialization
 */

import { AIConfig } from './config/ai-providers.js';
import { STORES, DB_NAME, DB_VERSION } from './config/constants.js';

// Global state
const state = {
  db: null,
  currentView: 'dashboard',
  activeSession: null,
  currentPassage: null,
  currentQuestionIndex: 0,
  isProcessing: false
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
    
    showToast('Bem-vindo ao English Training!', 'success');
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
  const isInitialized = await metaStore.get('bank_initialized');
  
  if (isInitialized?.value) {
    console.log('[App] Question bank already initialized');
    return;
  }
  
  try {
    showToast('Carregando banco de questões...', 'info');
    
    // Fetch from same domain (works with GitHub Pages)
    const response = await fetch('./data/initial-bank.json');
    if (!response.ok) throw new Error('Failed to load question bank');
    
    const data = await response.json();
    
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
      await bankStore.put(bankEntry);
    }
    
    // Mark as initialized
    const metaWriteTx = db.transaction(STORES.META, 'readwrite');
    await metaWriteTx.objectStore(STORES.META).put({
      key: 'bank_initialized',
      value: true,
      version: data.schema_version,
      timestamp: new Date().toISOString()
    });
    
    showToast(`${data.total_passages} passagens carregadas!`, 'success');
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
  
  // Update dashboard data if entering dashboard
  if (viewId === 'dashboard') {
    updateDashboard();
  }
}

// Event Listeners
function setupEventListeners() {
  // Navigation
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    window.location.hash = '#/settings';
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
  
  document.getElementById('btn-export')?.addEventListener('click', exportData);
  document.getElementById('import-file')?.addEventListener('change', importData);
  
  // Save API keys
  document.getElementById('api-openai')?.addEventListener('blur', (e) => {
    if (e.target.value) AIConfig.setStoredKey('openai', e.target.value);
  });
  
  document.getElementById('api-anthropic')?.addEventListener('blur', (e) => {
    if (e.target.value) AIConfig.setStoredKey('anthropic', e.target.value);
  });
}

// Update Dashboard Stats
async function updateDashboard() {
  if (!state.db) return;
  
  try {
    // Get bank count
    const tx = state.db.transaction(STORES.QUESTION_BANK, 'readonly');
    const store = tx.objectStore(STORES.QUESTION_BANK);
    const count = await store.count();
    
    document.getElementById('bank-count').textContent = count;
    
    // Update bank info in settings
    const bankInfo = document.getElementById('bank-info');
    if (bankInfo) {
      bankInfo.textContent = `${count} questões no banco`;
    }
    
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
    // Get a fresh passage from question bank
    const tx = state.db.transaction(STORES.QUESTION_BANK, 'readonly');
    const store = tx.objectStore(STORES.QUESTION_BANK);
    
    // Get all passages
    const passages = await store.getAll();
    
    // Filter fresh passages (times_served === 0)
    const freshPassages = passages.filter(p => p.times_served === 0);
    
    let selectedPassage;
    
    if (freshPassages.length > 0) {
      // Pick random fresh passage
      selectedPassage = freshPassages[Math.floor(Math.random() * freshPassages.length)];
    } else if (passages.length > 0) {
      // Pick random from all (for now)
      selectedPassage = passages[Math.floor(Math.random() * passages.length)];
    } else {
      showToast('Nenhuma passagem disponível. Configure uma API key.', 'error');
      return;
    }
    
    // Update times_served
    const writeTx = state.db.transaction(STORES.QUESTION_BANK, 'readwrite');
    const writeStore = writeTx.objectStore(STORES.QUESTION_BANK);
    selectedPassage.times_served++;
    selectedPassage.last_served_at = new Date().toISOString();
    await writeStore.put(selectedPassage);
    
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
  
  if (passageEl) {
    // Format passage with paragraphs
    const formattedText = passage.text
      .split('\n\n')
      .map(p => `<p>${p}</p>`)
      .join('');
    passageEl.innerHTML = formattedText;
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
  
  // Hide feedback and confidence sections
  document.getElementById('confidence-section').style.display = 'none';
  document.getElementById('feedback-section').style.display = 'none';
  document.getElementById('btn-next').style.display = 'none';
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
    <p>${question.correct_explanation}</p>
  `;
  
  // Show next button
  const nextBtn = document.getElementById('btn-next');
  nextBtn.style.display = 'block';
  nextBtn.onclick = handleNextQuestion;
  
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
    
    await store.add({
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
      data.stores[storeName] = await store.getAll();
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
    
    // Validate
    if (!data.stores) {
      throw new Error('Formato inválido');
    }
    
    // Import to stores
    for (const [storeName, records] of Object.entries(data.stores)) {
      const tx = state.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      for (const record of records) {
        await store.put(record);
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
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
};