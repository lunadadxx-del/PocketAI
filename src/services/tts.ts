import { ConfigService } from './config';

export class TtsService {
  private static audioCtx: AudioContext | null = null;
  private static analyser: AnalyserNode | null = null;
  private static currentSource: AudioBufferSourceNode | null = null;
  private static isPlaying: boolean = false;

  private static initAudioContext(): { ctx: AudioContext; analyser: AnalyserNode } {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return { ctx: this.audioCtx, analyser: this.analyser! };
  }

  public static getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public static isAudioPlaying(): boolean {
    return this.isPlaying;
  }

  public static stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
  }

  /**
   * Generates speech via OpenRouter deepgram/flux-tts:free and plays it with audio analysis
   */
  public static async speak(
    text: string,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stop();

    const config = ConfigService.getConfig();
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is missing. Please enter it in Settings.');
    }

    if (!text || text.trim().length === 0) {
      return;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pocketai.app',
          'X-OpenRouter-Title': 'Pocket AI'
        },
        body: JSON.stringify({
          model: config.ttsModel || 'deepgram/flux-tts:free',
          input: text.trim(),
          voice: config.ttsVoice || 'flux-cole-en'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter TTS failed (${response.status}): ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const { ctx, analyser } = this.initAudioContext();
      
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      this.currentSource = source;
      this.isPlaying = true;

      if (onStart) onStart();

      source.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        if (onEnd) onEnd();
      };

      source.start(0);
    } catch (err: unknown) {
      this.isPlaying = false;
      this.currentSource = null;
      console.error('TtsService error:', err);
      // Fallback to browser SpeechSynthesis if network or TTS fails
      this.speakBrowserFallback(text, onStart, onEnd);
    }
  }

  /**
   * Graceful fallback in case OpenRouter TTS quota is reached or network is unavailable
   */
  private static speakBrowserFallback(
    text: string,
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onstart = () => {
        this.isPlaying = true;
        if (onStart) onStart();
      };
      utterance.onend = () => {
        this.isPlaying = false;
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        this.isPlaying = false;
        if (onEnd) onEnd();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      if (onEnd) onEnd();
    }
  }
}
