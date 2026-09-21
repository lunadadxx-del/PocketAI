import { Capacitor } from '@capacitor/core';
import { NativeSpeechService } from './nativeSpeech';

// Web Speech API interface definitions
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export class SttService {
  private static recognition: any = null;
  private static isListening: boolean = false;
  private static mediaStream: MediaStream | null = null;
  private static audioContext: AudioContext | null = null;
  private static micAnalyser: AnalyserNode | null = null;
  private static volumeCheckAnim: number | null = null;
  private static stopNativeListener: (() => void) | null = null;

  public static isSupported(): boolean {
    if (Capacitor.isNativePlatform()) {
      return true; // Supported natively on Android via android.speech.SpeechRecognizer
    }
    const win = window as unknown as IWindow;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  public static async checkPermission(): Promise<MicPermissionState> {
    if (Capacitor.isNativePlatform()) {
      const granted = await NativeSpeechService.checkPermissions();
      console.log('[STT] Native permission status:', granted ? 'granted' : 'prompt');
      return granted ? 'granted' : 'prompt';
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'unsupported';
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // @ts-ignore
        const result = await navigator.permissions.query({ name: 'microphone' });
        console.log('[STT] Web microphone permission:', result.state);
        return result.state as MicPermissionState;
      }
    } catch (e) {
      // Permission API not supported for microphone on some browsers
    }
    return 'prompt';
  }

  public static async requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      console.log('[STT] Requesting native Android microphone permission...');
      return await NativeSpeechService.requestPermissions();
    }

    try {
      console.log('[STT] Requesting web microphone permission via getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (e) {
      console.warn('[STT] Microphone permission denied:', e);
      return false;
    }
  }

  public static getMicAnalyser(): AnalyserNode | null {
    return this.micAnalyser;
  }

  public static async startListening(callbacks: {
    onStart?: () => void;
    onInterim?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
    onVolume?: (level: number) => void;
  }): Promise<void> {
    if (this.isListening) {
      this.stopListening();
    }

    console.log('[STT] startListening called. Platform:', Capacitor.getPlatform());

    // 1. NATIVE ANDROID SPEECH RECOGNITION (android.speech.SpeechRecognizer)
    if (Capacitor.isNativePlatform()) {
      this.isListening = true;
      try {
        this.stopNativeListener = await NativeSpeechService.startListening({
          onStart: () => {
            console.log('[STT] Native recognition started successfully');
            if (callbacks.onStart) callbacks.onStart();
          },
          onInterim: (text) => {
            console.log('[STT] Interim speech recognized:', text);
            if (callbacks.onInterim) callbacks.onInterim(text);
          },
          onFinal: (text) => {
            console.log('[STT] Final speech recognized:', text);
            this.isListening = false;
            if (callbacks.onFinal) callbacks.onFinal(text);
          },
          onError: (error) => {
            console.warn('[STT] Native recognition error:', error);
            this.isListening = false;
            if (callbacks.onError) callbacks.onError(error);
          },
          onEnd: () => {
            console.log('[STT] Native recognition ended');
            this.isListening = false;
            if (callbacks.onEnd) callbacks.onEnd();
          },
          onVolume: (level) => {
            if (callbacks.onVolume) callbacks.onVolume(level);
          }
        });
        return;
      } catch (e: any) {
        this.isListening = false;
        console.error('[STT] Error invoking NativeSpeechService:', e);
        if (callbacks.onError) {
          callbacks.onError(e.message || 'Error starting speech recognition.');
        }
        return;
      }
    }

    // 2. WEB BROWSER FALLBACK (Web Speech API)
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('[STT] SpeechRecognition not available in this browser');
      if (callbacks.onError) {
        callbacks.onError('Speech Recognition is not supported in this browser. Please use Chrome/Edge or type your request.');
      }
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('[STT] Web SpeechRecognition started');
        this.isListening = true;
        this.startMicStream(callbacks.onVolume);
        if (callbacks.onStart) callbacks.onStart();
      };

      let finalTranscript = '';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (interimTranscript && callbacks.onInterim) {
          console.log('[STT] Web interim transcript:', interimTranscript);
          callbacks.onInterim(interimTranscript);
        }

        if (finalTranscript && callbacks.onFinal) {
          console.log('[STT] Web final transcript:', finalTranscript);
          callbacks.onFinal(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[STT] Web Speech recognition error:', event.error);
        this.stopListening();
        let errorMsg = 'Voice recognition error';
        if (event.error === 'not-allowed') {
          errorMsg = 'Microphone access was denied. Please allow microphone access in your browser settings.';
        } else if (event.error === 'no-speech') {
          errorMsg = 'No speech detected. Please try speaking again.';
        } else if (event.error === 'network') {
          errorMsg = 'Network error during voice recognition. Please check your internet connection.';
        }
        if (callbacks.onError) callbacks.onError(errorMsg);
      };

      recognition.onend = () => {
        console.log('[STT] Web Speech recognition onend');
        this.isListening = false;
        this.stopMicStream();
        if (callbacks.onEnd) callbacks.onEnd();
      };

      this.recognition = recognition;
      recognition.start();
    } catch (err: any) {
      this.isListening = false;
      console.error('[STT] Failed to start web speech recognition:', err);
      if (callbacks.onError) {
        callbacks.onError(err.message || 'Could not start voice recognition.');
      }
    }
  }

  public static stopListening(): void {
    console.log('[STT] stopListening called');
    if (Capacitor.isNativePlatform()) {
      if (this.stopNativeListener) {
        this.stopNativeListener();
        this.stopNativeListener = null;
      }
      NativeSpeechService.stopListening();
    } else {
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
        this.recognition = null;
      }
      this.stopMicStream();
    }
    this.isListening = false;
  }

  private static async startMicStream(onVolume?: (vol: number) => void): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.micAnalyser = this.audioContext.createAnalyser();
      this.micAnalyser.fftSize = 256;
      source.connect(this.micAnalyser);

      if (onVolume) {
        const buffer = new Uint8Array(this.micAnalyser.frequencyBinCount);
        const check = () => {
          if (!this.micAnalyser) return;
          this.micAnalyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i];
          }
          const avg = sum / buffer.length;
          onVolume(Math.min(1, avg / 128));
          this.volumeCheckAnim = requestAnimationFrame(check);
        };
        this.volumeCheckAnim = requestAnimationFrame(check);
      }
    } catch (e) {
      console.warn('[STT] Web microphone audio stream monitoring unavailable:', e);
    }
  }

  private static stopMicStream(): void {
    if (this.volumeCheckAnim) {
      cancelAnimationFrame(this.volumeCheckAnim);
      this.volumeCheckAnim = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
    this.micAnalyser = null;
  }
}
