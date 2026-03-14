// AI Provider Settings
import { PROVIDERS, AIConfig } from './config/ai-providers.js';

export function initProviderSettings(showToast) {
  const providerGrid = document.getElementById('provider-grid');
  const modelSelect = document.getElementById('model-select');
  const apiKeyInput = document.getElementById('api-key');
  const apiKeyStatus = document.getElementById('api-key-status');
  const testBtn = document.getElementById('btn-test-connection');
  const customEndpointGroup = document.getElementById('custom-endpoint-group');
  const customEndpoint = document.getElementById('custom-endpoint');
  const providerLink = document.getElementById('provider-link');
  const connectionStatus = document.getElementById('connection-status');
  const corsNotice = document.getElementById('cors-notice');
  
  // Check if elements exist
  if (!providerGrid) {
    console.error('[ProviderSettings] provider-grid element not found');
    return;
  }
  
  // Check if we're on GitHub Pages (CORS restricted)
  const isGitHubPages = window.location.hostname.includes('github.io');
  
  // Show/hide CORS notice
  if (corsNotice) {
    corsNotice.classList.toggle('hidden', !isGitHubPages);
  }
  
  let selectedProvider = AIConfig.getSelectedProvider();
  
  console.log('[ProviderSettings] Initializing with provider:', selectedProvider);
  
  // Render provider cards
  function renderProviders() {
    providerGrid.innerHTML = '';
    
    Object.values(PROVIDERS).forEach(provider => {
      const card = document.createElement('div');
      card.className = 'provider-card';
      if (provider.corsFriendly) {
        card.classList.add('cors-friendly');
      }
      card.dataset.provider = provider.id;
      
      const hasKey = AIConfig.hasValidKey(provider.id);
      const isSelected = selectedProvider === provider.id;
      
      if (isSelected) card.classList.add('selected');
      
      const statusText = hasKey ? '✓ Configurado' : 
                        (isGitHubPages && !provider.corsFriendly ? '⚠️ Apenas localhost' : 'Não configurado');
      
      card.innerHTML = `
        <span class="provider-icon"><i data-lucide="${provider.icon}"></i></span>
        <span class="provider-name">${provider.name}</span>
        <span class="provider-status">${statusText}</span>
      `;
      
      card.addEventListener('click', () => selectProvider(provider.id));
      providerGrid.appendChild(card);
    });
  }
  
  // Select provider
  function selectProvider(providerId) {
    selectedProvider = providerId;
    AIConfig.setSelectedProvider(providerId);
    
    // Update UI
    document.querySelectorAll('.provider-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.provider === providerId);
    });
    
    const config = PROVIDERS[providerId];
    
    // Update models dropdown
    modelSelect.innerHTML = config.models.map(m =>
      `<option value="${m.id}">${m.name}</option>`
    ).join('');
    
    // Select saved model or default
    const savedModel = AIConfig.getSelectedModel(providerId);
    if (savedModel && config.models.find(m => m.id === savedModel)) {
      modelSelect.value = savedModel;
    }
    
    updateModelInfo();
    
    // Show/hide API key input
    const apiKeyGroup = document.getElementById('api-key-group');
    if (config.requireKey === false) {
      apiKeyGroup.style.display = 'none';
      testBtn.disabled = false;
    } else {
      apiKeyGroup.style.display = 'block';
      apiKeyInput.placeholder = config.keyPlaceholder;
      
      // Load saved key
      const savedKey = AIConfig.getStoredKey(providerId);
      if (savedKey) {
        apiKeyInput.value = savedKey;
        validateKey(savedKey);
      } else {
        apiKeyInput.value = '';
        apiKeyStatus.textContent = '';
        apiKeyStatus.className = 'api-status';
        testBtn.disabled = true;
      }
    }
    
    // Show/hide custom endpoint
    customEndpointGroup.style.display = providerId === 'custom' ? 'block' : 'none';
    if (providerId === 'custom') {
      customEndpoint.value = AIConfig.getCustomEndpoint();
    }
    
    // Update provider link
    if (config.website) {
      providerLink.href = config.website;
      providerLink.style.display = 'inline';
    } else {
      providerLink.style.display = 'none';
    }
    
    // Show CORS warning for non-friendly providers on GitHub Pages
    if (isGitHubPages && !config.corsFriendly && config.requireKey !== false) {
      connectionStatus.style.display = 'block';
      connectionStatus.className = 'connection-status warning';
      connectionStatus.innerHTML = `
        <strong>⚠️ Teste indisponível no GitHub Pages</strong><br>
        <small>Este provedor bloqueia requisições de sites hospedados (CORS). 
        A API ainda funcionará se sua key for válida, mas o teste de conexão só funciona no localhost.
        <br><br>
        <strong>Dica:</strong> Use <strong>OpenRouter</strong> para testar conexões no GitHub Pages.</small>
      `;
    } else {
      connectionStatus.style.display = 'none';
    }
  }
  
  // Update model info
  function updateModelInfo() {
    const config = PROVIDERS[selectedProvider];
    const model = config.models.find(m => m.id === modelSelect.value);
    if (model) {
      const el = document.getElementById('model-context');
      el.innerHTML = `<i data-lucide="bar-chart-3"></i> Contexto: ${model.context.toLocaleString()} tokens`;
      if (window.lucide) window.lucide.createIcons({ nameAttr: 'data-lucide' });
    }
  }
  
  // Validate key
  function validateKey(key) {
    const result = AIConfig.validateKey(selectedProvider, key);
    
    if (result.valid) {
      apiKeyStatus.textContent = 'Válida';
      apiKeyStatus.className = 'api-status valid';
      testBtn.disabled = false;
      AIConfig.setStoredKey(selectedProvider, key);
    } else if (key.length > 0) {
      apiKeyStatus.textContent = result.error;
      apiKeyStatus.className = 'api-status invalid';
      testBtn.disabled = true;
    } else {
      apiKeyStatus.textContent = '';
      apiKeyStatus.className = 'api-status';
      testBtn.disabled = true;
    }
  }
  
  // Event listeners
  apiKeyInput?.addEventListener('input', (e) => validateKey(e.target.value));
  
  modelSelect?.addEventListener('change', () => {
    AIConfig.setSelectedModel(selectedProvider, modelSelect.value);
    updateModelInfo();
  });
  
  customEndpoint?.addEventListener('blur', (e) => {
    AIConfig.setCustomEndpoint(e.target.value);
  });
  
  testBtn?.addEventListener('click', async () => {
    const config = PROVIDERS[selectedProvider];
    const key = AIConfig.getStoredKey(selectedProvider);
    const model = modelSelect.value;
    
    connectionStatus.style.display = 'block';
    connectionStatus.className = 'connection-status loading';
    connectionStatus.textContent = 'Testando conexão...';
    
    const result = await AIConfig.testConnection(selectedProvider, key, model);
    
    if (result.success) {
      connectionStatus.className = 'connection-status success';
      connectionStatus.textContent = result.message || '✓ Conexão bem-sucedida!';
      showToast(result.message || 'Conexão testada com sucesso!', 'success');
    } else if (result.error === 'CORS_RESTRICTED' || result.error === 'CORS_ERROR') {
      // CORS error - show warning instead of error
      connectionStatus.className = 'connection-status warning';
      connectionStatus.innerHTML = `⚠️ <strong>Teste indisponível no GitHub Pages</strong><br><small>${result.message}</small>`;
      showToast('Teste de conexão indisponível no GitHub Pages (CORS). A API ainda funciona localmente.', 'warning');
    } else {
      connectionStatus.className = 'connection-status error';
      connectionStatus.textContent = `✗ Erro: ${result.error}`;
      showToast(`Falha na conexão: ${result.error}`, 'error');
    }
  });
  
  // Initialize
  renderProviders();
  selectProvider(selectedProvider);

  // Render Lucide icons in dynamic content
  if (window.lucide) {
    window.lucide.createIcons();
  }

  console.log('[ProviderSettings] Initialization complete');
}

