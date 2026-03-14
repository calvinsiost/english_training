/**
 * AI Provider Configuration
 * Multi-provider support with model selection
 */

import { requestWithFallback } from '../core/request-with-fallback.js';

export const PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: 'bot',
    website: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Multimodal, mais capaz)', context: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recomendado)', context: 128000 },
      { id: 'o1', name: 'o1 (Raciocínio avançado)', context: 128000 },
      { id: 'o1-mini', name: 'o1-mini (Raciocínio rápido)', context: 128000 },
      { id: 'o3-mini', name: 'o3-mini (Último modelo de raciocínio)', context: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Econômico)', context: 16385 }
    ],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    validateKey: (key) => key.startsWith('sk-') && key.length > 20
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'brain',
    website: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Mais capaz)', context: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Recomendado)', context: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Mais rápido)', context: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', context: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Econômico)', context: 200000 }
    ],
    baseUrl: 'https://api.anthropic.com/v1/messages',
    keyPrefix: 'sk-ant',
    keyPlaceholder: 'sk-ant-...',
    validateKey: (key) => key.startsWith('sk-ant') && key.length > 20
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'gem',
    website: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Experimental (Mais recente)', context: 1000000 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Mais capaz)', context: 2000000 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recomendado)', context: 1000000 },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro (Legado)', context: 32000 }
    ],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPrefix: null,
    keyPlaceholder: 'AIzaSy...',
    validateKey: (key) => key.length > 30
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    icon: 'moon',
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
    icon: 'plug',
    website: 'https://openrouter.ai/keys',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o', context: 128000 },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Recomendado)', context: 128000 },
      { id: 'openai/o1', name: 'o1 (Raciocínio)', context: 128000 },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context: 200000 },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', context: 200000 },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Grátis)', context: 1000000 },
      { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro', context: 2000000 },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', context: 128000 },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', context: 128000 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', context: 64000 },
      { id: 'x-ai/grok-2', name: 'Grok 2', context: 128000 }
    ],
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    keyPrefix: 'sk-or',
    keyPlaceholder: 'sk-or-...',
    validateKey: (key) => key.startsWith('sk-or') && key.length > 20
  },
  local: {
    id: 'local',
    name: 'Local (Ollama)',
    icon: 'house',
    website: 'https://ollama.com',
    defaultModel: 'llama3.2',
    models: [
      { id: 'llama3.3', name: 'Llama 3.3 (Mais recente)', context: 128000 },
      { id: 'llama3.2', name: 'Llama 3.2 (Recomendado)', context: 128000 },
      { id: 'llama3.1', name: 'Llama 3.1', context: 128000 },
      { id: 'mistral', name: 'Mistral', context: 32000 },
      { id: 'mixtral', name: 'Mixtral 8x7B', context: 32000 },
      { id: 'codellama', name: 'Code Llama', context: 16000 },
      { id: 'qwen2.5', name: 'Qwen 2.5', context: 128000 },
      { id: 'phi4', name: 'Phi-4', context: 16000 },
      { id: 'gemma2', name: 'Gemma 2', context: 8000 },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', context: 128000 }
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
    icon: 'settings',
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
      const retryConfig = {
        context: `testConnection:${providerId}`,
        fallbackMessage: 'Sem resposta da API ao testar conexao.',
        retries: 2,
        timeoutMs: 12000
      };

      if (providerId === 'openai') {
        response = await requestWithFallback(config.baseUrl, {
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
        }, retryConfig);
      } else if (providerId === 'anthropic') {
        response = await requestWithFallback(config.baseUrl, {
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
        }, retryConfig);
      } else if (providerId === 'gemini') {
        response = await requestWithFallback(`${config.baseUrl}/${model || config.defaultModel}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hi' }] }]
          })
        }, retryConfig);
      } else if (providerId === 'local') {
        response = await requestWithFallback(config.baseUrl.replace('/generate', '/tags'), {}, {
          context: `testConnection:${providerId}`,
          fallbackMessage: 'Ollama local nao respondeu.',
          retries: 1,
          timeoutMs: 4000
        });
        return { success: response.ok, error: null };
      } else {
        // Generic test for other providers
        return { success: true, error: null, message: 'Teste manual necessário' };
      }

      if (response.ok) {
        return { success: true, error: null };
      }

      const data = await response.json().catch(() => ({}));
      const providerMessage = data.error?.message || data.error || data.message;
      return { success: false, error: providerMessage || `Erro ${response.status}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

