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

  public static isSupported(): boolean {
    const win = window as unknown as IWindow;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  public static async checkPermission(): Promise<MicPermissionState> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'unsupported';
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // @ts-ignore
        const result = await navigator.permissions.query({ name: 'microphone' });
        return result.state as MicPermissionState;
      }
    } catch (e) {
      // Permission API not supported for microphone on some browsers
    }
    return 'prompt';
  }

  public static async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (e) {
      console.warn('Microphone permission denied', e);
      return false;
    }
  }

  public static getMicAnalyser(): AnalyserNode | null {
    return this.micAnalyser;
  }

  public static startListening(callbacks: {
    onStart?: () => void;
    onInterim?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
    onVolume?: (level: number) => void;
  }): void {
    if (this.isListening) {
      this.stopListening();
    }

    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (callbacks.onError) {
        callbacks.onError('Speech Recognition is not supported in this browser. Please use Chrome or Edge, or type your request.');
      }
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
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
          callbacks.onInterim(interimTranscript);
        }

        if (finalTranscript && callbacks.onFinal) {
          callbacks.onFinal(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('STT Error event:', event.error);
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
        this.isListening = false;
        this.stopMicStream();
        if (callbacks.onEnd) callbacks.onEnd();
      };

      this.recognition = recognition;
      recognition.start();
    } catch (err: any) {
      this.isListening = false;
      console.error('Failed to start speech recognition:', err);
      if (callbacks.onError) {
        callbacks.onError(err.message || 'Could not start voice recognition.');
      }
    }
  }

  public static stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }
    this.isListening = false;
    this.stopMicStream();
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
      console.warn('Microphone audio stream monitoring unavailable:', e);
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
      } catch (e) {
        // ignore
      }
      this.audioContext = null;
    }
    this.micAnalyser = null;
  }
}
