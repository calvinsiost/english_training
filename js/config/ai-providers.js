/**
 * AI Provider Configuration
 * Multi-provider support with model selection
 */

export const PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    website: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Mais capaz)', context: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recomendado)', context: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Mais barato)', context: 16385 }
    ],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    validateKey: (key) => key.startsWith('sk-') && key.length > 20
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    website: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-sonnet-20240229',
    models: [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Mais capaz)', context: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet (Recomendado)', context: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Mais rápido)', context: 200000 }
    ],
    baseUrl: 'https://api.anthropic.com/v1/messages',
    keyPrefix: 'sk-ant',
    keyPlaceholder: 'sk-ant-...',
    validateKey: (key) => key.startsWith('sk-ant') && key.length > 20
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '💎',
    website: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Mais capaz)', context: 1000000 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recomendado)', context: 1000000 },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', context: 32000 }
    ],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPrefix: null,
    keyPlaceholder: 'AIzaSy...',
    validateKey: (key) => key.length > 30
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    icon: '🌙',
    website: 'https://platform.moonshot.cn/console/api-keys',
    defaultModel: 'moonshot-v1-8k',
    models: [
      { id: 'moonshot-v1-128k', name: 'Kimi v1 128K (Contexto longo)', context: 128000 },
      { id: 'moonshot-v1-32k', name: 'Kimi v1 32K', context: 32000 },
      { id: 'moonshot-v1-8k', name: 'Kimi v1 8K (Recomendado)', context: 8000 }
    ],
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    keyPrefix: null,
    keyPlaceholder: 'sk-...',
    validateKey: (key) => key.startsWith('sk-') && key.length > 20
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🔌',
    website: 'https://openrouter.ai/keys',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o via OpenRouter', context: 128000 },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Recomendado)', context: 128000 },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context: 200000 },
      { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro', context: 1000000 },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Open Source)', context: 128000 }
    ],
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    keyPrefix: 'sk-or',
    keyPlaceholder: 'sk-or-...',
    validateKey: (key) => key.startsWith('sk-or') && key.length > 20
  },
  local: {
    id: 'local',
    name: 'Local (Ollama)',
    icon: '🏠',
    website: 'https://ollama.com',
    defaultModel: 'llama3.1',
    models: [
      { id: 'llama3.1', name: 'Llama 3.1 (Recomendado)', context: 128000 },
      { id: 'llama3', name: 'Llama 3', context: 8000 },
      { id: 'mistral', name: 'Mistral', context: 32000 },
      { id: 'codellama', name: 'Code Llama', context: 16000 },
      { id: 'gemma2', name: 'Gemma 2', context: 8000 }
    ],
    baseUrl: 'http://localhost:11434/api/generate',
    keyPrefix: null,
    keyPlaceholder: 'Não necessário para Ollama local',
    requireKey: false,
    validateKey: () => true
  },
  custom: {
    id: 'custom',
    name: 'API Customizada',
    icon: '⚙️',
    website: '',
    defaultModel: 'default',
    models: [
      { id: 'default', name: 'Modelo padrão', context: 32000 }
    ],
    baseUrl: '',
    keyPrefix: null,
    keyPlaceholder: 'Sua chave API',
    validateKey: (key) => key.length > 10
  }
};

export class AIConfig {
  static getStoredKey(provider) {
    return localStorage.getItem(`api_key_${provider}`);
  }
  
  static setStoredKey(provider, key) {
    localStorage.setItem(`api_key_${provider}`, key);
  }
  
  static getSelectedProvider() {
    return localStorage.getItem('selected_provider') || 'openai';
  }
  
  static setSelectedProvider(provider) {
    localStorage.setItem('selected_provider', provider);
  }
  
  static getSelectedModel(provider) {
    const saved = localStorage.getItem(`selected_model_${provider}`);
    if (saved) return saved;
    return PROVIDERS[provider]?.defaultModel;
  }
  
  static setSelectedModel(provider, model) {
    localStorage.setItem(`selected_model_${provider}`, model);
  }
  
  static getCustomEndpoint() {
    return localStorage.getItem('custom_endpoint') || '';
  }
  
  static setCustomEndpoint(endpoint) {
    localStorage.setItem('custom_endpoint', endpoint);
  }
  
  static getProviderConfig(providerId) {
    return PROVIDERS[providerId] || PROVIDERS.openai;
  }
  
  static hasValidKey(providerId) {
    const config = PROVIDERS[providerId];
    if (!config) return false;
    
    // Local/Ollama doesn't require key
    if (config.requireKey === false) return true;
    
    const key = this.getStoredKey(providerId);
    if (!key) return false;
    
    return config.validateKey(key);
  }
  
  static getAvailableProviders() {
    return Object.keys(PROVIDERS).filter(p => this.hasValidKey(p));
  }
  
  static getPreferredProvider() {
    const selected = this.getSelectedProvider();
    if (this.hasValidKey(selected)) return selected;
    
    // Fallback to first available
    const available = this.getAvailableProviders();
    return available.length > 0 ? available[0] : null;
  }
  
  static validateKey(providerId, key) {
    const config = PROVIDERS[providerId];
    if (!config) return { valid: false, error: 'Provedor não encontrado' };
    
    if (config.requireKey === false) {
      return { valid: true };
    }
    
    if (!key || key.length < 10) {
      return { valid: false, error: 'Chave muito curta' };
    }
    
    if (config.keyPrefix && !key.startsWith(config.keyPrefix)) {
      return { valid: false, error: `Chave deve começar com ${config.keyPrefix}` };
    }
    
    if (!config.validateKey(key)) {
      return { valid: false, error: 'Formato de chave inválido' };
    }
    
    return { valid: true };
  }
  
  static async testConnection(providerId, key, model) {
    const config = PROVIDERS[providerId];
    
    try {
      let response;
      
      if (providerId === 'openai') {
        response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || config.defaultModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        });
      } else if (providerId === 'anthropic') {
        response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || config.defaultModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        });
      } else if (providerId === 'gemini') {
        response = await fetch(`${config.baseUrl}/${model || config.defaultModel}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hi' }] }]
          })
        });
      } else if (providerId === 'local') {
        response = await fetch(config.baseUrl.replace('/generate', '/tags'));
        return { success: response.ok, error: null };
      } else {
        // Generic test for other providers
        return { success: true, error: null, message: 'Teste manual necessário' };
      }
      
      if (response.ok) {
        return { success: true, error: null };
      } else {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: data.error?.message || `Erro ${response.status}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}