/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_OPENROUTER_AGENT_MODEL?: string;
  readonly VITE_OPENROUTER_TTS_MODEL?: string;
  readonly VITE_OPENROUTER_TTS_VOICE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
