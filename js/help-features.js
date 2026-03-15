/**
 * Help Features Module
 * Provides AI-assisted learning features during study sessions
 */

import { AIConfig, PROVIDERS } from './config/ai-providers.js';

class HelpFeatures {
  constructor() {
    this.settings = {
      translate: true,
      lesson: true,
      alternatives: false,
      hints: false,
      tts: false
    };
    this.currentPassage = null;
    this.currentQuestion = null;
    this.translationPopup = null;
    this.selectionTooltip = null;
    this.helpModal = null;
    this.isLoading = false;

    // TTS state management
    this.ttsState = 'idle'; // 'idle' | 'playing' | 'paused'
    this._ttsTransitioning = false;
    this._ttsWatchdogInterval = null;
    this._ttsPausedDuration = 0;
    this._ttsButtonRef = null;

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createHelpModal();
    this.setupEventListeners();
  }

  // Get meta store helper
  getMetaStore() {
    if (window.state?.db) {
      const tx = window.state.db.transaction('meta', 'readwrite');
      return tx.objectStore('meta');
    }
    return null;
  }

  // Load settings from storage
  async loadSettings() {
    try {
      const store = this.getMetaStore();
      if (store) {
        const saved = await idbGet(store, 'help_settings');
        if (saved) {
          this.settings = { ...this.settings, ...saved };
        }
      }
    } catch (e) {
      console.log('No saved help settings, using defaults');
    }
    this.updateUI();
  }

  // Save settings to storage
  async saveSettings() {
    try {
      const store = this.getMetaStore();
      if (store) {
        await idbPut(store, this.settings, 'help_settings');
      }
    } catch (e) {
      console.error('Failed to save help settings:', e);
    }
  }

  // Update settings from UI
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    this.updateUI();
  }

  // Update UI based on current settings
  updateUI() {
    // Update checkboxes
    const checkboxes = {
      'help-translate': this.settings.translate,
      'help-lesson': this.settings.lesson,
      'help-alternatives': this.settings.alternatives,
      'help-hints': this.settings.hints,
      'help-tts': this.settings.tts
    };

    Object.entries(checkboxes).forEach(([id, checked]) => {
      const cb = document.getElementById(id);
      if (cb) cb.checked = checked;
    });

    // Update passage text class for translate feature
    const passageText = document.querySelector('.passage-text');
    if (passageText) {
      passageText.classList.toggle('translate-enabled', this.settings.translate);
    }

    // Show/hide help toolbar
    const toolbar = document.querySelector('.study-help-toolbar');
    if (toolbar) {
      const hasEnabledFeature = Object.values(this.settings).some(v => v);
      toolbar.style.display = hasEnabledFeature ? 'flex' : 'none';
    }
  }

  // Create help modal structure
  createHelpModal() {
    // Remove existing modal if any
    const existing = document.getElementById('help-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'help-modal-overlay';
    overlay.className = 'help-modal-overlay';
    overlay.innerHTML = `
      <div class="help-modal">
        <div class="help-modal-header">
          <h3><i data-lucide="sparkles"></i> <span id="help-modal-title">Ajuda</span></h3>
          <button class="help-modal-close" id="help-modal-close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="help-modal-body" id="help-modal-body">
          <div class="spinner"></div>
          <p>Consultando o assistente de estudos...</p>
        </div>
        <div class="help-modal-footer">
          <button class="btn-secondary" id="help-modal-done">Fechar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.helpModal = overlay;

    // Event listeners
    overlay.querySelector('#help-modal-close').addEventListener('click', () => this.closeModal());
    overlay.querySelector('#help-modal-done').addEventListener('click', () => this.closeModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });

    // Initialize icons
    if (window.lucide) lucide.createIcons({ parent: overlay });
  }

  // Show help modal with content
  showModal(title, content, icon = 'sparkles') {
    const titleEl = document.getElementById('help-modal-title');
    const bodyEl = document.getElementById('help-modal-body');
    
    if (titleEl) {
      titleEl.textContent = title;
      const titleRow = titleEl.parentElement;
      let iconEl = titleRow.querySelector('i[data-lucide]');
      if (!iconEl) {
        iconEl = document.createElement('i');
        iconEl.setAttribute('data-lucide', icon);
        titleRow.prepend(iconEl);
      } else {
        iconEl.setAttribute('data-lucide', icon);
      }
    }
    
    if (bodyEl) {
      bodyEl.innerHTML = content;
      bodyEl.classList.remove('loading');
    }

    if (window.lucide) lucide.createIcons({ parent: this.helpModal });
    
    this.helpModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Show loading state
  showLoading(title = 'Consultando o assistente...') {
    const titleEl = document.getElementById('help-modal-title');
    const bodyEl = document.getElementById('help-modal-body');
    
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="spinner"></div>
        <p>Analisando com IA...</p>
      `;
      bodyEl.classList.add('loading');
    }

    this.helpModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Close modal
  closeModal() {
    this.helpModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Setup event listeners
  setupEventListeners() {
    // Text selection for translation
    document.addEventListener('mouseup', (e) => this.handleTextSelection(e));
    document.addEventListener('click', (e) => this.handleDocumentClick(e));
  }

  // Handle text selection
  handleTextSelection(e) {
    if (!this.settings.translate) return;
    
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0 && text.length < 200) {
      this.showSelectionTooltip(selection, text);
    } else {
      this.hideSelectionTooltip();
    }
  }

  // Show tooltip for selected text
  showSelectionTooltip(selection, text) {
    this.hideSelectionTooltip();
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'text-selection-tooltip';
    tooltip.innerHTML = `🔤 Traduzir "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`;
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 40}px`;
    tooltip.style.transform = 'translateX(-50%)';
    
    tooltip.addEventListener('click', () => {
      this.translateText(text);
      this.hideSelectionTooltip();
      window.getSelection().removeAllRanges();
    });
    
    document.body.appendChild(tooltip);
    this.selectionTooltip = tooltip;
  }

  // Hide selection tooltip
  hideSelectionTooltip() {
    if (this.selectionTooltip) {
      this.selectionTooltip.remove();
      this.selectionTooltip = null;
    }
  }

  // Handle document clicks
  handleDocumentClick(e) {
    // Close translation popup when clicking outside
    if (this.translationPopup && !this.translationPopup.contains(e.target)) {
      this.translationPopup.remove();
      this.translationPopup = null;
    }
    
    // Handle word clicks in passage
    if (this.settings.translate && e.target.classList.contains('word')) {
      e.preventDefault();
      this.translateText(e.target.textContent, e.target);
    }
  }

  // Set current passage and question context
  setContext(passage, question) {
    this.currentPassage = passage;
    this.currentQuestion = question;
  }

  // Translate text using LLM
  async translateText(text, element = null) {
    if (this.isLoading) return;

    // Log help usage
    if (window.behaviorLogger) {
      window.behaviorLogger.log('help_use', 'study', 'translate', { text: text.substring(0, 50) });
    }
    // Track help used this question
    if (window.state) {
      window.state._helpUsedThisQuestion = window.state._helpUsedThisQuestion || [];
      if (!window.state._helpUsedThisQuestion.includes('translate')) {
        window.state._helpUsedThisQuestion.push('translate');
      }
    }
    // Daily challenge: vocabulary translations
    if (window.dailyChallenge) {
      window.dailyChallenge.recordProgress('translations', 1);
    }

    this.isLoading = true;
    this.showLoading('Traduzindo...');

    try {
      const prompt = this.buildTranslationPrompt(text);
      const response = await this.callLLM(prompt);

      if (window.wordIntelligence) {
        const context = {
          textId: this.currentPassage?.id,
          questionId: this.currentQuestion?.id,
          examId: this.currentPassage?.exam_id,
          topic: this.currentPassage?.topic,
          institution: this.currentPassage?.source || 'FUVEST',
          translation: response,
          textSnippet: this.currentPassage?.text?.slice(0, 120) || ''
        };
        // Fire-and-forget: failures here should never block study flow.
        window.wordIntelligence.recordTranslationSignal(text, context).catch(() => null);
      }
      
      this.closeModal();
      
      if (element) {
        this.showTranslationPopup(element, text, response);
      } else {
        this.showModal('Tradução', `
          <div class="lesson-content">
            <div class="example">
              <div class="example-label">Original</div>
              <p><em>${this.escapeHtml(text)}</em></p>
            </div>
            <div class="example" style="border-left-color: var(--color-success);">
              <div class="example-label">Tradução</div>
              <p>${this.escapeHtml(response)}</p>
            </div>
          </div>
        `, 'languages');
      }
    } catch (error) {
      this.showModal('Erro', `<p>Não foi possível traduzir: ${error.message}</p>`, 'alert-circle');
    } finally {
      this.isLoading = false;
    }
  }

  // Show translation popup near element
  showTranslationPopup(element, original, translation) {
    this.hideTranslationPopup();
    
    const rect = element.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'translation-popup';
    popup.innerHTML = `
      <button class="translation-popup-close">×</button>
      <div class="translation-popup-header">${this.escapeHtml(original)}</div>
      <div class="translation-popup-body">${this.escapeHtml(translation)}</div>
    `;
    
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
    popup.style.top = `${rect.bottom + 10}px`;
    
    popup.querySelector('.translation-popup-close').addEventListener('click', () => {
      this.hideTranslationPopup();
    });
    
    document.body.appendChild(popup);
    this.translationPopup = popup;
  }

  // Hide translation popup
  hideTranslationPopup() {
    if (this.translationPopup) {
      this.translationPopup.remove();
      this.translationPopup = null;
    }
  }

  // Get grammar lesson
  async getGrammarLesson() {
    if (!this.currentQuestion || this.isLoading) return;

    // Log help usage
    if (window.behaviorLogger) {
      window.behaviorLogger.log('help_use', 'study', 'lesson', {
        questionId: this.currentQuestion?.id
      });
    }
    if (window.state) {
      window.state._helpUsedThisQuestion = window.state._helpUsedThisQuestion || [];
      if (!window.state._helpUsedThisQuestion.includes('lesson')) {
        window.state._helpUsedThisQuestion.push('lesson');
      }
    }

    this.isLoading = true;
    this.showLoading('Preparando aula...');

    try {
      const prompt = this.buildLessonPrompt();
      const response = await this.callLLM(prompt);
      
      this.showModal('💡 Aula Rápida', `
        <div class="lesson-content">
          ${this.formatLessonContent(response)}
        </div>
      `, 'lightbulb');
    } catch (error) {
      this.showModal('Erro', `<p>Não foi possível carregar a aula: ${error.message}</p>`, 'alert-circle');
    } finally {
      this.isLoading = false;
    }
  }

  // Get alternative explanations
  async getAlternativeExplanations() {
    if (!this.currentQuestion || this.isLoading) return;
    
    this.isLoading = true;
    this.showLoading('Analisando alternativas...');

    try {
      const prompt = this.buildAlternativesPrompt();
      const response = await this.callLLM(prompt);
      
      this.showModal('🎯 Por que cada alternativa?', `
        <div class="lesson-content">
          ${this.formatAlternativesContent(response)}
        </div>
      `, 'check-circle');
    } catch (error) {
      this.showModal('Erro', `<p>Não foi possível analisar: ${error.message}</p>`, 'alert-circle');
    } finally {
      this.isLoading = false;
    }
  }

  // Get contextual hints
  async getHints() {
    if (!this.currentPassage || this.isLoading) return;
    
    this.isLoading = true;
    this.showLoading('Gerando dicas...');

    try {
      const prompt = this.buildHintsPrompt();
      const response = await this.callLLM(prompt);
      
      this.showModal('🎓 Dicas para esta Questão', `
        <div class="lesson-content">
          ${this.formatLessonContent(response)}
        </div>
      `, 'graduation-cap');
    } catch (error) {
      this.showModal('Erro', `<p>Não foi possível gerar dicas: ${error.message}</p>`, 'alert-circle');
    } finally {
      this.isLoading = false;
    }
  }

  // Text to Speech — toggle play/pause/resume
  toggleSpeech(text, buttonRef) {
    if (this._ttsTransitioning) return this.ttsState;
    this._ttsTransitioning = true;
    setTimeout(() => { this._ttsTransitioning = false; }, 100);

    if (buttonRef) this._ttsButtonRef = buttonRef;

    if (this.ttsState === 'playing') {
      // Pause
      window.speechSynthesis.pause();
      this.ttsState = 'paused';
      this._clearWatchdog();
      this._updateButton(this._ttsButtonRef, 'paused');
      return this.ttsState;
    }

    if (this.ttsState === 'paused') {
      // Resume
      window.speechSynthesis.resume();
      this.ttsState = 'playing';
      this._startWatchdog();
      this._updateButton(this._ttsButtonRef, 'playing');
      return this.ttsState;
    }

    // Idle → start speaking
    if (!window.speechSynthesis) {
      alert('Seu navegador não suporta leitura em voz alta');
      return this.ttsState;
    }

    if (!text || !text.trim()) return this.ttsState;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;

    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onend = () => {
      this.ttsState = 'idle';
      this._clearWatchdog();
      this._resetButton(this._ttsButtonRef);
    };
    utterance.onerror = () => {
      this.ttsState = 'idle';
      this._clearWatchdog();
      this._resetButton(this._ttsButtonRef);
    };

    window.speechSynthesis.speak(utterance);
    this.ttsState = 'playing';
    this._startWatchdog();
    this._updateButton(this._ttsButtonRef, 'playing');
    return this.ttsState;
  }

  stopSpeaking(buttonRef) {
    this._clearWatchdog();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.ttsState = 'idle';
    this._resetButton(buttonRef || this._ttsButtonRef);
  }

  _updateButton(btn, state) {
    if (!btn) return;
    const idle = btn.querySelector('.tts-icon--idle');
    const playing = btn.querySelector('.tts-icon--playing');
    const paused = btn.querySelector('.tts-icon--paused');

    if (idle) idle.style.display = 'none';
    if (playing) playing.style.display = 'none';
    if (paused) paused.style.display = 'none';

    btn.classList.remove('playing', 'paused');

    if (state === 'playing') {
      if (playing) playing.style.display = 'inline-flex';
      btn.classList.add('playing');
      btn.setAttribute('aria-label', 'Pausar leitura');
      btn.setAttribute('title', 'Pausar leitura');
    } else if (state === 'paused') {
      if (paused) paused.style.display = 'inline-flex';
      btn.classList.add('paused');
      btn.setAttribute('aria-label', 'Continuar leitura');
      btn.setAttribute('title', 'Continuar leitura');
    }
  }

  _resetButton(btn) {
    if (!btn) return;
    const idle = btn.querySelector('.tts-icon--idle');
    const playing = btn.querySelector('.tts-icon--playing');
    const paused = btn.querySelector('.tts-icon--paused');

    if (idle) idle.style.display = 'inline-flex';
    if (playing) playing.style.display = 'none';
    if (paused) paused.style.display = 'none';

    btn.classList.remove('playing', 'paused');
    btn.setAttribute('aria-label', 'Ouvir texto em voz alta');
    btn.setAttribute('title', 'Ouvir texto em voz alta');
  }

  _startWatchdog() {
    this._clearWatchdog();
    this._ttsPausedDuration = 0;
    this._ttsWatchdogInterval = setInterval(() => {
      // Chrome bug: speechSynthesis enters phantom pause while playing
      if (this.ttsState === 'playing' && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Auto-stop if paused too long (user likely abandoned)
      if (this.ttsState === 'paused') {
        this._ttsPausedDuration += 3000;
        if (this._ttsPausedDuration >= 30000) {
          this.stopSpeaking();
        }
      } else {
        this._ttsPausedDuration = 0;
      }
    }, 3000);
  }

  _clearWatchdog() {
    if (this._ttsWatchdogInterval) {
      clearInterval(this._ttsWatchdogInterval);
      this._ttsWatchdogInterval = null;
    }
    this._ttsPausedDuration = 0;
  }

  // Build prompts for LLM
  buildTranslationPrompt(text) {
    return `Traduza o seguinte texto do inglês para o português brasileiro de forma natural e contextual:

"${text}"

Forneça apenas a tradução, sem explicações adicionais.`;
  }

  buildLessonPrompt() {
    const passage = this.currentPassage?.text?.substring(0, 1000) || '';
    const question = this.currentQuestion?.question_text || '';
    const correctLetter = this.currentQuestion?.correct_answer || '';
    const correctIdx = correctLetter ? correctLetter.charCodeAt(0) - 65 : -1;
    const correctText = correctIdx >= 0 ? this.currentQuestion?.options?.[correctIdx] || '' : '';
    const correct = correctLetter ? `(${correctLetter}) ${correctText}` : '';

    return `Você é um professor de inglês experiente preparando alunos para o vestibular FUVEST. 

**Texto base:**
${passage}

**Questão:**
${question}

**Resposta correta:**
${correct}

Forneça uma breve aula (máximo 200 palavras) sobre:
1. O ponto gramatical ou vocabulário-chave sendo testado
2. Por que a resposta correta é a melhor escolha
3. Uma dica rápida para identificar questões similares

Use formatação simples com títulos em maiúsculas.`;
  }

  buildAlternativesPrompt() {
    const question = this.currentQuestion;
    const options = question?.options?.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n') || '';
    const correct = question?.correct_answer || '';

    return `Analise cada alternativa da seguinte questão de inglês do vestibular:

**Questão:**
${question?.question_text || ''}

**Alternativas:**
${options}

**Resposta correta:** ${correct}

Para CADA alternativa (A, B, C, D, E), explique brevemente:
- Se está CORRETA: por que é a melhor resposta
- Se está ERRADA: qual o erro ou por que não se encaixa

Seja objetivo, máximo 2 linhas por alternativa.`;
  }

  buildHintsPrompt() {
    const passage = this.currentPassage?.text?.substring(0, 800) || '';
    const question = this.currentQuestion?.question_text || '';

    return `Como professor de inglês para vestibular FUVEST, dê 3 dicas estratégicas para ajudar o aluno a responder esta questão:

**Texto (resumo):**
${passage}

**Questão:**
${question}

As dicas devem incluir:
1. Estratégia de leitura (ex: "Preste atenção no segundo parágrafo onde...")
2. Vocabulário-chave (palavras importantes sem dar a resposta)
3. Armadilha comum a evitar

Não revele a resposta correta.`;
  }

  // Call LLM API
  async callLLM(prompt) {
    const providerId = AIConfig.getSelectedProvider() || 'openrouter';
    const apiKey = AIConfig.getStoredKey(providerId);

    if (!apiKey && providerId !== 'local') {
      throw new Error('Chave de API não configurada. Configure em Configurações > Provedores de IA.');
    }

    const provider = AIConfig.getProviderConfig(providerId);
    if (!provider) {
      throw new Error('Provedor não encontrado');
    }

    const model = AIConfig.getSelectedModel(providerId);
    const body = this.buildRequestBody(providerId, model, prompt);

    // Build URL and headers per provider
    let url = provider.baseUrl;
    let headers = { 'Content-Type': 'application/json' };

    switch (providerId) {
      case 'anthropic':
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'gemini':
        url = `${provider.baseUrl}/${model}:generateContent?key=${apiKey}`;
        break;
      case 'openrouter':
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = window.location.href;
        headers['X-Title'] = 'English Training App';
        break;
      case 'local':
        url = provider.baseUrl.replace('/api/generate', '/api/chat');
        break;
      default:
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Erro ${response.status}`);
    }

    const data = await response.json();
    return this.extractResponseText(providerId, data);
  }

  // Build request body based on provider
  buildRequestBody(providerId, model, prompt) {
    const messages = [{ role: 'user', content: prompt }];

    switch (providerId) {
      case 'anthropic':
        return {
          model,
          messages,
          max_tokens: 1000
        };
      case 'gemini':
        return {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1000 }
        };
      case 'local':
        return {
          model,
          messages,
          stream: false
        };
      case 'openrouter':
        return {
          model,
          messages,
          max_tokens: 1000,
          temperature: 0.7
        };
      default:
        return {
          model,
          messages,
          max_tokens: 1000,
          temperature: 0.7
        };
    }
  }

  // Extract text from response based on provider
  extractResponseText(providerId, data) {
    switch (providerId) {
      case 'anthropic':
        return data.content?.[0]?.text || '';
      case 'gemini':
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      case 'local':
        return data.message?.content || '';
      default:
        return data.choices?.[0]?.message?.content || '';
    }
  }

  // Format lesson content with HTML
  formatLessonContent(text) {
    // Convert markdown to HTML
    let html = text
      // Headers: ## Title or ### Title
      .replace(/^#{1,3}\s+(.+)$/gm, '<h4>$1</h4>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Numbered lists: "1. item"
      .replace(/^\d+\.\s+(.+)$/gm, '<li class="numbered">$1</li>')
      // Bullet lists: "- item" or "• item"
      .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
      // UPPERCASE HEADERS:
      .replace(/^([A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s]{4,}):$/gm, '<h4>$1</h4>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Separator lines
      .replace(/^[-=]{3,}$/gm, '<hr>')
      // Paragraphs (double newline)
      .replace(/\n\n+/g, '</p><p>')
      // Single newlines between non-list items
      .replace(/([^>])\n([^<])/g, '$1<br>$2');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

    // Wrap in paragraph tags
    html = '<p>' + html + '</p>';

    // Clean empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    // Don't wrap block elements in <p>
    html = html.replace(/<p>(\s*<(?:h4|ul|hr|div))/g, '$1');
    html = html.replace(/<\/(?:h4|ul|hr|div)>\s*<\/p>/g, '</h4>');

    return html;
  }

  // Format alternatives content
  formatAlternativesContent(text) {
    const correctAnswer = this.currentQuestion?.correct_answer || '';
    // Clean markdown bold/emphasis from text
    const cleaned = text.replace(/\*\*/g, '').replace(/\*/g, '');
    const lines = cleaned.split('\n').filter(l => l.trim());
    let html = '';
    let currentAlt = null;
    let currentBody = '';

    const flushAlt = () => {
      if (currentAlt) {
        html += `<div class="alt-text">${currentBody.trim()}</div></div>`;
        currentBody = '';
      }
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      // Match patterns: "A)", "(A)", "A.", "A -", "A:", "A )"
      const match = trimmed.match(/^\(?([A-E])\)?[\s).\-:]+(.*)$/);
      if (match) {
        flushAlt();
        const letter = match[1];
        const isCorrect = letter === correctAnswer;
        currentAlt = letter;
        const icon = isCorrect ? '✅' : '❌';
        const label = isCorrect ? 'CORRETA' : 'Incorreta';
        html += `<div class="alternative-explanation ${isCorrect ? 'correct' : 'incorrect'}">`;
        html += `<div class="alt-label">${icon} (${letter}) ${label}</div>`;
        currentBody = match[2].trim();
      } else if (currentAlt) {
        // Skip separator lines like "---"
        if (/^[-=]{3,}$/.test(trimmed)) return;
        currentBody += ' ' + trimmed;
      }
    });

    flushAlt();
    return html || this.formatLessonContent(text);
  }

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Wrap words in passage text for click-to-translate
  wrapWordsInPassage() {
    const passageText = document.querySelector('.passage-text');
    if (!passageText || !this.settings.translate) return;

    // Only wrap if not already wrapped
    if (passageText.querySelector('.word')) return;

    const walker = document.createTreeWalker(
      passageText,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.parentElement.tagName !== 'SCRIPT' &&
          walker.currentNode.parentElement.tagName !== 'STYLE') {
        textNodes.push(walker.currentNode);
      }
    }

    textNodes.forEach(node => {
      const words = node.textContent.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      
      words.forEach(word => {
        if (/^\s+$/.test(word)) {
          fragment.appendChild(document.createTextNode(word));
        } else if (/^[a-zA-Z]+$/.test(word)) {
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = word;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(word));
        }
      });

      node.parentNode.replaceChild(fragment, node);
    });
  }
}

// Initialize help features
let helpFeatures;
function initHelpFeatures() {
  helpFeatures = new HelpFeatures();
  return helpFeatures;
}

// Get help features instance
function getHelpFeatures() {
  return helpFeatures;
}

window.initHelpFeatures = initHelpFeatures;
window.getHelpFeatures = getHelpFeatures;
