import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface NativeWakeWordPluginInterface {
  startListening(): Promise<{ success: boolean }>;
  stopListening(): Promise<{ success: boolean }>;
  isListening(): Promise<{ isListening: boolean }>;
  addListener(
    eventName: 'wakeWordDetected',
    listenerFunc: (data: { detected: boolean; timestamp: number; confidence: number }) => void
  ): Promise<PluginListenerHandle>;
}

const NativeWakeWord = registerPlugin<NativeWakeWordPluginInterface>('NativeWakeWord');

export class WakeWordService {
  private static isListeningForWake: boolean = false;
  private static nativeListenerHandle: PluginListenerHandle | null = null;
  private static lastTriggerTimestamp: number = 0;
  private static readonly DEBOUNCE_COOLDOWN_MS = 2000;

  // Web Audio fallback variables (for browser testing only)
  private static webAudioContext: AudioContext | null = null;
  private static webMediaStream: MediaStream | null = null;
  private static webProcessor: ScriptProcessorNode | null = null;

  public static isRunning(): boolean {
    return this.isListeningForWake;
  }

  /**
   * Immediate native haptic pulse & pleasant dual-tone wake chime
   */
  public static triggerWakeFeedback(): void {
    // 1. Tactile haptic pulse
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([60, 40, 80]);
      } catch (ignored) {}
    }

    // 2. Play subtle pleasant two-tone wake chime (D5: 587.33Hz -> A5: 880Hz)
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.0, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      // AudioContext suspended or unavailable
    }
  }

  /**
   * Start local acoustic wake-word monitoring
   * Raw audio frames are evaluated directly for the phonetic signature of "Piti".
   * ZERO cloud streaming, ZERO LLM calls, ZERO STT transcriptions.
   */
  public static async startWakeWordDetection(callbacks: {
    onWakeWordDetected: (confidence: number) => void;
    onVolume?: (level: number) => void;
    onError?: (err: string) => void;
  }): Promise<void> {
    if (this.isListeningForWake) {
      console.log('[WakeWord] Already listening for acoustic wake word "Piti"');
      return;
    }

    console.log('[WakeWord] Starting local acoustic wake-word detector on raw audio...');
    this.isListeningForWake = true;

    if (Capacitor.isNativePlatform()) {
      try {
        // Clean up any stale listener
        if (this.nativeListenerHandle) {
          await this.nativeListenerHandle.remove();
          this.nativeListenerHandle = null;
        }

        this.nativeListenerHandle = await NativeWakeWord.addListener('wakeWordDetected', (data) => {
          console.log('[WakeWord] Native acoustic wake word detected! Data:', data);
          const now = Date.now();
          if (now - this.lastTriggerTimestamp < this.DEBOUNCE_COOLDOWN_MS) {
            console.log('[WakeWord] Suppressing rapid duplicate wake trigger');
            return;
          }
          this.lastTriggerTimestamp = now;

          // Suspend wake-word listening
          this.stopWakeWordDetection();

          // Trigger wake feedback
          this.triggerWakeFeedback();

          // Notify caller
          callbacks.onWakeWordDetected(data.confidence || 0.85);
        });

        await NativeWakeWord.startListening();
        console.log('[WakeWord] Native AudioRecord acoustic engine is active');
      } catch (err: any) {
        console.error('[WakeWord] Failed to start native acoustic wake-word detector:', err);
        this.isListeningForWake = false;
        if (callbacks.onError) callbacks.onError(err.message || 'Failed to start wake-word detector');
      }
    } else {
      // Web Audio API Acoustic Fallback for local browser development
      this.startWebAudioAcousticDetector(callbacks);
    }
  }

  /**
   * Stop wake-word detection and release microphone hardware
   */
  public static async stopWakeWordDetection(): Promise<void> {
    this.isListeningForWake = false;

    if (Capacitor.isNativePlatform()) {
      try {
        if (this.nativeListenerHandle) {
          await this.nativeListenerHandle.remove();
          this.nativeListenerHandle = null;
        }
        await NativeWakeWord.stopListening();
        console.log('[WakeWord] Native acoustic wake-word detector stopped');
      } catch (e) {
        console.warn('[WakeWord] Error stopping native wake-word detector:', e);
      }
    } else {
      this.stopWebAudioAcousticDetector();
    }
  }

  /**
   * Web Audio Acoustic Detector (100% offline, local browser DSP on raw PCM audio)
   */
  private static async startWebAudioAcousticDetector(callbacks: {
    onWakeWordDetected: (confidence: number) => void;
    onVolume?: (level: number) => void;
    onError?: (err: string) => void;
  }): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.webMediaStream = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 16000 });
      this.webAudioContext = ctx;

      const source = ctx.createMediaStreamSource(stream);
      // Process 512 samples per audio frame
      const processor = ctx.createScriptProcessor(512, 1, 1);
      this.webProcessor = processor;

      // Acoustic state tracker for /p-ɪ-t-i/
      let state = 0; // 0=silence, 1=p_burst, 2=vowel_1, 3=t_stop, 4=vowel_2
      let framesInState = 0;
      let noiseFloor = 0.02;

      processor.onaudioprocess = (e) => {
        if (!this.isListeningForWake) return;

        const input = e.inputBuffer.getChannelData(0);
        let sumSq = 0;
        let zeroCrossings = 0;
        let prev = input[0];

        for (let i = 0; i < input.length; i++) {
          const s = input[i];
          sumSq += s * s;
          if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zeroCrossings++;
          prev = s;
        }

        const rms = Math.sqrt(sumSq / input.length);
        const zcr = zeroCrossings / input.length;

        if (callbacks.onVolume) {
          callbacks.onVolume(Math.min(1.0, rms * 5));
        }

        // Noise floor adaptation
        if (rms < noiseFloor * 1.3) {
          noiseFloor = 0.98 * noiseFloor + 0.02 * Math.max(0.005, rms);
        }

        const isVoiced = rms > noiseFloor * 2.2 && zcr < 0.25;
        const isPlosiveBurst = rms > noiseFloor * 1.8 && zcr > 0.22;
        const isSilence = rms < noiseFloor * 1.5;

        framesInState++;

        switch (state) {
          case 0: // Silence
            if (isPlosiveBurst || (rms > noiseFloor * 2.5 && zcr > 0.18)) {
              state = 1; // P burst
              framesInState = 1;
            }
            break;
          case 1: // P burst
            if (isVoiced) {
              state = 2; // Vowel 1 (/ɪ/)
              framesInState = 1;
            } else if (framesInState > 6) {
              state = 0;
            }
            break;
          case 2: // Vowel 1 (/ɪ/)
            if (isSilence || isPlosiveBurst) {
              if (framesInState >= 5 && framesInState <= 22) {
                state = 3; // T stop
                framesInState = 1;
              } else {
                state = 0;
              }
            } else if (!isVoiced && framesInState > 22) {
              state = 0;
            }
            break;
          case 3: // T stop
            if (isVoiced) {
              if (framesInState >= 2 && framesInState <= 10) {
                state = 4; // Vowel 2 (/i/)
                framesInState = 1;
              } else {
                state = 0;
              }
            } else if (framesInState > 12) {
              state = 0;
            }
            break;
          case 4: // Vowel 2 (/i/)
            if (isVoiced && framesInState >= 7) {
              const now = Date.now();
              if (now - this.lastTriggerTimestamp > this.DEBOUNCE_COOLDOWN_MS) {
                this.lastTriggerTimestamp = now;
                console.log('[WakeWord] Web Audio acoustic wake word "Piti" detected!');
                state = 0;
                this.stopWakeWordDetection();
                this.triggerWakeFeedback();
                callbacks.onWakeWordDetected(0.9);
              }
            } else if (!isVoiced) {
              state = 0;
            }
            break;
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err: any) {
      console.error('[WakeWord] Web Audio acoustic detector failed to start:', err);
      this.isListeningForWake = false;
      if (callbacks.onError) callbacks.onError(err.message || 'Microphone error in browser');
    }
  }

  private static stopWebAudioAcousticDetector(): void {
    if (this.webProcessor) {
      this.webProcessor.disconnect();
      this.webProcessor = null;
    }
    if (this.webAudioContext) {
      this.webAudioContext.close().catch(() => {});
      this.webAudioContext = null;
    }
    if (this.webMediaStream) {
      this.webMediaStream.getTracks().forEach((track) => track.stop());
      this.webMediaStream = null;
    }
  }
}
