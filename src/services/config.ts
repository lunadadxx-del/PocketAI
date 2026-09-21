import { AppConfig } from '../types';

const STORAGE_KEY = 'pocket_ai_config_v1';

const DEFAULT_CONFIG: AppConfig = {
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  agentModel: import.meta.env.VITE_OPENROUTER_AGENT_MODEL || 'google/gemma-4-31b-it:free',
  ttsModel: import.meta.env.VITE_OPENROUTER_TTS_MODEL || 'deepgram/flux-tts:free',
  ttsVoice: import.meta.env.VITE_OPENROUTER_TTS_VOICE || 'flux-cole-en',
  autoSpeak: true,
  wakeWordEnabled: true,
};

export class ConfigService {
  private static config: AppConfig = ConfigService.loadConfig();

  private static loadConfig(): AppConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const agentModel = (!parsed.agentModel || parsed.agentModel === 'inclusionai/ling-3.0-flash-vl:free')
          ? (import.meta.env.VITE_OPENROUTER_AGENT_MODEL || 'google/gemma-4-31b-it:free')
          : parsed.agentModel;
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          agentModel,
          // Priority to env/stored key
          apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || parsed.apiKey || DEFAULT_CONFIG.apiKey,
        };
      }
    } catch (e) {
      console.warn('Failed to load saved config from localStorage', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  public static getConfig(): AppConfig {
    return this.config;
  }

  public static updateConfig(newConfig: Partial<AppConfig>): AppConfig {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save config to localStorage', e);
    }
    return this.config;
  }

  public static hasApiKey(): boolean {
    return Boolean(this.config.apiKey && this.config.apiKey.trim().length > 10);
  }
}
