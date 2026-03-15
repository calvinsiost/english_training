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
      { id: 'gpt-5.4', name: 'GPT-5.4 (Mais capaz)', context: 1050000 },
      { id: 'gpt-5', name: 'GPT-5', context: 400000 },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', context: 400000 },
      { id: 'gpt-4.1', name: 'GPT-4.1', context: 1047576 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', context: 1047576 },
      { id: 'gpt-4o', name: 'GPT-4o', context: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recomendado)', context: 128000 },
      { id: 'o3', name: 'o3 (Raciocínio avançado)', context: 200000 },
      { id: 'o4-mini', name: 'o4-mini (Raciocínio econômico)', context: 200000 },
      { id: 'o3-mini', name: 'o3-mini (Raciocínio rápido)', context: 200000 }
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
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (Mais capaz)', context: 1000000 },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Recomendado)', context: 1000000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Econômico)', context: 200000 },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', context: 200000 },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', context: 200000 }
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
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Mais capaz, Preview)', context: 1000000 },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', context: 1000000 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: 1000000 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recomendado)', context: 1000000 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Econômico)', context: 1000000 }
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
    name: 'OpenRouter ✓ GitHub Pages',
    icon: 'plug',
    website: 'https://openrouter.ai/keys',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { id: 'openai/gpt-5.4', name: 'GPT-5.4 (Mais capaz)', context: 1050000 },
      { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', context: 400000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', context: 128000 },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Recomendado)', context: 128000 },
      { id: 'openai/o3', name: 'o3 (Raciocínio)', context: 200000 },
      { id: 'openai/o4-mini', name: 'o4-mini (Raciocínio econômico)', context: 200000 },
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', context: 1000000 },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', context: 200000 },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: 1000000 },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1000000 },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', context: 1000000 },
      { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', context: 512000 },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', context: 128000 },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Raciocínio)', context: 64000 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', context: 64000 },
      { id: 'qwen/qwen3-235b-a22b', name: 'Qwen 3 235B', context: 128000 },
      { id: 'x-ai/grok-3', name: 'Grok 3', context: 131072 }
    ],
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    keyPrefix: 'sk-or',
    keyPlaceholder: 'sk-or-...',
    validateKey: (key) => key.startsWith('sk-or') && key.length > 20,
    corsFriendly: true,
    description: 'Funciona no GitHub Pages! Acesso a GPT, Claude, Gemini e mais.'
  },
  local: {
    id: 'local',
    name: 'Local (Ollama)',
    icon: 'house',
    website: 'https://ollama.com',
    defaultModel: 'llama3.3',
    models: [
      { id: 'llama4', name: 'Llama 4 (Mais recente)', context: 512000 },
      { id: 'llama3.3', name: 'Llama 3.3 (Recomendado)', context: 128000 },
      { id: 'llama3.2', name: 'Llama 3.2', context: 128000 },
      { id: 'deepseek-r1', name: 'DeepSeek R1 (Raciocínio)', context: 128000 },
      { id: 'qwen3', name: 'Qwen 3', context: 128000 },
      { id: 'qwen2.5', name: 'Qwen 2.5', context: 128000 },
      { id: 'mistral', name: 'Mistral', context: 32000 },
      { id: 'phi4', name: 'Phi-4', context: 16000 },
      { id: 'gemma3', name: 'Gemma 3', context: 128000 },
      { id: 'command-r', name: 'Command R', context: 128000 }
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
  
  // Check if running in environment with CORS restrictions (GitHub Pages, etc.)
  static isCORSRestricted() {
    // Check if we're on a hosted domain (not localhost)
    const hostname = window.location.hostname;
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
  }
  
  // Providers known to have CORS issues when hosted
  static hasCORSIssues(providerId) {
    const corsRestrictedProviders = ['anthropic', 'openai', 'kimi'];
    return corsRestrictedProviders.includes(providerId) && this.isCORSRestricted();
  }

  static async testConnection(providerId, key, model) {
    const config = PROVIDERS[providerId];
    
    // Check for CORS issues
    if (this.hasCORSIssues(providerId)) {
      return { 
        success: false, 
        error: 'CORS_RESTRICTED',
        message: 'Teste de conexão indisponível no GitHub Pages devido a restrições de segurança (CORS). A API funcionará normalmente se você usar a aplicação localmente (localhost). Alternativa: use OpenRouter, que suporta CORS.'
      };
    }

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
      } else if (providerId === 'openrouter') {
        // OpenRouter supports CORS and should work on GitHub Pages
        response = await requestWithFallback(config.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'English Training App'
          },
          body: JSON.stringify({
            model: model || config.defaultModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        }, retryConfig);
      } else {
        // Generic test for other providers
        return { success: true, error: null, message: 'Configuração salva. Teste será feito ao gerar questões.' };
      }

      if (response.ok) {
        return { success: true, error: null };
      }

      const data = await response.json().catch(() => ({}));
      const providerMessage = data.error?.message || data.error || data.message;
      return { success: false, error: providerMessage || `Erro ${response.status}` };
    } catch (error) {
      // Check if it's a CORS error
      if (error.message && error.message.includes('Failed to fetch')) {
        return {
          success: false,
          error: 'CORS_ERROR',
          message: 'Erro de CORS: Navegador bloqueou a requisição. Use a aplicação localmente ou mude para OpenRouter.'
        };
      }
      return { success: false, error: error.message };
    }
  }
}

