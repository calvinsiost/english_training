/**
 * AI Provider Configuration
 * Handles API keys and provider selection
 */

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-'
  },
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-3-sonnet-20240229',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    baseUrl: 'https://api.anthropic.com/v1/messages',
    keyPrefix: 'sk-ant-'
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPrefix: null
  }
};

export class AIConfig {
  static getStoredKey(provider) {
    return localStorage.getItem(`api_key_${provider}`);
  }
  
  static setStoredKey(provider, key) {
    localStorage.setItem(`api_key_${provider}`, key);
  }
  
  static getPreferredProvider() {
    return localStorage.getItem('preferred_provider') || 'openai';
  }
  
  static setPreferredProvider(provider) {
    localStorage.setItem('preferred_provider', provider);
  }
  
  static getProviderConfig(provider) {
    return PROVIDERS[provider] || PROVIDERS.openai;
  }
  
  static hasValidKey(provider) {
    const key = this.getStoredKey(provider);
    if (!key) return false;
    const config = PROVIDERS[provider];
    if (config.keyPrefix && !key.startsWith(config.keyPrefix)) return false;
    return key.length > 20;
  }
  
  static getAvailableProviders() {
    return Object.keys(PROVIDERS).filter(p => this.hasValidKey(p));
  }
  
  static validateKey(provider, key) {
    const config = PROVIDERS[provider];
    if (!key || key.length < 20) return { valid: false, error: 'Chave muito curta' };
    if (config.keyPrefix && !key.startsWith(config.keyPrefix)) {
      return { valid: false, error: `Chave deve começar com ${config.keyPrefix}` };
    }
    return { valid: true };
  }
}