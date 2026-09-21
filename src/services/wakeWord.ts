import { SttService } from './stt';

export interface WakeWordResult {
  detected: boolean;
  rawText: string;
  commandAfterWake: string;
}

export class WakeWordService {
  private static isListeningForWake: boolean = false;
  private static lastTriggerTimestamp: number = 0;
  private static readonly DEBOUNCE_COOLDOWN_MS = 2500;

  // Comprehensive phonetic variants for "Piti"
  private static readonly WAKE_REGEX = /^(?:hey\s+|hi\s+|ok\s+)?(piti|pity|petey|peeti|pitti|pt|pee\s*tee)\b/i;
  private static readonly INLINE_WAKE_REGEX = /\b(piti|pity|petey|peeti|pitti|pt|pee\s*tee)\b/i;

  public static isRunning(): boolean {
    return this.isListeningForWake;
  }

  /**
   * Check if a recognized text contains the wake word "Piti" and extract any trailing command
   */
  public static checkPhrase(text: string): WakeWordResult {
    const trimmed = text.trim();
    if (!trimmed) {
      return { detected: false, rawText: '', commandAfterWake: '' };
    }

    // Check if phrase contains wake word
    const match = trimmed.match(this.INLINE_WAKE_REGEX);
    if (!match) {
      return { detected: false, rawText: trimmed, commandAfterWake: '' };
    }

    // Extract trailing command (e.g. "Piti, open YouTube" -> "open YouTube")
    const matchIndex = match.index || 0;
    const matchLength = match[0].length;
    let trailing = trimmed.substring(matchIndex + matchLength).trim();

    // Clean leading punctuation like commas or colons: ", open YouTube" -> "open YouTube"
    trailing = trailing.replace(/^[,:;\s-]+/, '').trim();

    return {
      detected: true,
      rawText: trimmed,
      commandAfterWake: trailing
    };
  }

  /**
   * Play an immediate native wake-up sound and haptic pulse
   */
  public static triggerWakeFeedback(): void {
    // 1. Haptic pulse on physical phone
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([60, 40, 80]);
      } catch (ignored) {}
    }

    // 2. Play subtle pleasant two-tone wake chime
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Tone 1: 587.33 Hz (D5) -> Tone 2: 880 Hz (A5)
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.0, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      // AudioContext unavailable or suspended
    }
  }

  /**
   * Start lightweight local wake-word monitoring
   */
  public static startWakeWordDetection(callbacks: {
    onWakeWordDetected: (commandAfterWake: string) => void;
    onVolume?: (level: number) => void;
    onError?: (err: string) => void;
  }): void {
    if (this.isListeningForWake) {
      console.log('[WakeWord] Already listening for "Piti"');
      return;
    }

    console.log('[WakeWord] Starting local wake-word detector for "Piti"...');
    this.isListeningForWake = true;

    const runRecognitionLoop = () => {
      if (!this.isListeningForWake) return;

      SttService.startListening({
        onStart: () => {
          console.log('[WakeWord] Microphoned listening for wake word "Piti"');
        },
        onInterim: (interimText) => {
          // Check interim speech for ultra-fast wake detection
          const res = this.checkPhrase(interimText);
          if (res.detected) {
            this.handleWakeDetected(res.commandAfterWake, callbacks.onWakeWordDetected);
          }
        },
        onFinal: (finalText) => {
          console.log('[WakeWord] Phrase heard in wake mode:', finalText);
          const res = this.checkPhrase(finalText);
          if (res.detected) {
            this.handleWakeDetected(res.commandAfterWake, callbacks.onWakeWordDetected);
          } else {
            // Normal speech without "Piti": ignore and continue wake listening loop
            console.log('[WakeWord] Phrase does not contain "Piti", discarded locally.');
          }
        },
        onVolume: callbacks.onVolume,
        onError: (err) => {
          // If no speech detected or speech timeout in wake mode, loop again smoothly
          if (this.isListeningForWake) {
            setTimeout(() => {
              if (this.isListeningForWake) runRecognitionLoop();
            }, 300);
          } else if (callbacks.onError) {
            callbacks.onError(err);
          }
        },
        onEnd: () => {
          // Restart listening loop if still in wake detection mode
          if (this.isListeningForWake) {
            setTimeout(() => {
              if (this.isListeningForWake) runRecognitionLoop();
            }, 200);
          }
        }
      });
    };

    runRecognitionLoop();
  }

  public static stopWakeWordDetection(): void {
    console.log('[WakeWord] Stopping wake-word detector');
    this.isListeningForWake = false;
    SttService.stopListening();
  }

  private static handleWakeDetected(
    commandAfterWake: string,
    callback: (command: string) => void
  ): void {
    const now = Date.now();
    // Debounce duplicate triggers
    if (now - this.lastTriggerTimestamp < this.DEBOUNCE_COOLDOWN_MS) {
      console.log('[WakeWord] Duplicate trigger suppressed (cooldown active)');
      return;
    }
    this.lastTriggerTimestamp = now;

    console.log('[WakeWord] Wake word "Piti" DETECTED! Command after wake:', commandAfterWake || '(none)');
    
    // 1. Suspend wake listening
    this.stopWakeWordDetection();

    // 2. Play wake feedback
    this.triggerWakeFeedback();

    // 3. Dispatch to agent controller
    callback(commandAfterWake);
  }
}
