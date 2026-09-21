import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface NativeSpeechPluginInterface {
  checkSpeechPermissions(): Promise<{ granted: boolean; state: string }>;
  requestSpeechPermissions(): Promise<{ granted: boolean }>;
  isAvailable(): Promise<{ available: boolean }>;
  startListening(): Promise<{ success: boolean; message: string }>;
  stopListening(): Promise<{ success: boolean }>;
  addListener(eventName: 'speechStart', listenerFunc: (data: { status: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'speechVolume', listenerFunc: (data: { level: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'speechPartial', listenerFunc: (data: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'speechFinal', listenerFunc: (data: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'speechError', listenerFunc: (data: { error: string; code?: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'speechEnd', listenerFunc: (data: { status: string }) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const NativeSpeech = registerPlugin<NativeSpeechPluginInterface>('NativeSpeechRecognition');

export class NativeSpeechService {
  public static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public static async isAvailable(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await NativeSpeech.isAvailable();
      return res.available;
    } catch (e) {
      console.warn('[NativeSpeech] isAvailable check failed:', e);
      return false;
    }
  }

  public static async checkPermissions(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await NativeSpeech.checkSpeechPermissions();
      console.log('[NativeSpeech] Permission check:', res);
      return res.granted;
    } catch (e) {
      console.warn('[NativeSpeech] Permission check error:', e);
      return false;
    }
  }

  public static async requestPermissions(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await NativeSpeech.requestSpeechPermissions();
      console.log('[NativeSpeech] Permission request result:', res);
      return res.granted;
    } catch (e) {
      console.warn('[NativeSpeech] Permission request error:', e);
      return false;
    }
  }

  public static async startListening(callbacks: {
    onStart?: () => void;
    onInterim?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
    onVolume?: (level: number) => void;
  }): Promise<() => void> {
    console.log('[NativeSpeech] Initializing native speech recognition...');
    
    // Clear previous listeners
    try {
      await NativeSpeech.removeAllListeners();
    } catch (ignored) {}

    const handles: PluginListenerHandle[] = [];

    const hStart = await NativeSpeech.addListener('speechStart', () => {
      console.log('[NativeSpeech] Event: speechStart (Ready for user speech)');
      if (callbacks.onStart) callbacks.onStart();
    });
    handles.push(hStart);

    const hVol = await NativeSpeech.addListener('speechVolume', data => {
      if (callbacks.onVolume) callbacks.onVolume(data.level);
    });
    handles.push(hVol);

    const hPartial = await NativeSpeech.addListener('speechPartial', data => {
      console.log('[NativeSpeech] Event: speechPartial ->', data.text);
      if (callbacks.onInterim) callbacks.onInterim(data.text);
    });
    handles.push(hPartial);

    const hFinal = await NativeSpeech.addListener('speechFinal', data => {
      console.log('[NativeSpeech] Event: speechFinal ->', data.text);
      if (callbacks.onFinal) callbacks.onFinal(data.text);
    });
    handles.push(hFinal);

    const hError = await NativeSpeech.addListener('speechError', data => {
      console.warn('[NativeSpeech] Event: speechError ->', data.error, '(code:', data.code, ')');
      if (callbacks.onError) callbacks.onError(data.error);
    });
    handles.push(hError);

    const hEnd = await NativeSpeech.addListener('speechEnd', () => {
      console.log('[NativeSpeech] Event: speechEnd');
      if (callbacks.onEnd) callbacks.onEnd();
    });
    handles.push(hEnd);

    try {
      const res = await NativeSpeech.startListening();
      console.log('[NativeSpeech] startListening call resolved:', res);
    } catch (err: any) {
      console.error('[NativeSpeech] startListening call rejected:', err);
      if (callbacks.onError) {
        callbacks.onError(err.message || 'Could not start Android speech recognition.');
      }
    }

    return () => {
      handles.forEach(h => h.remove());
      NativeSpeech.stopListening().catch(() => {});
    };
  }

  public static async stopListening(): Promise<void> {
    if (!this.isNative()) return;
    try {
      console.log('[NativeSpeech] Stopping native speech recognition');
      await NativeSpeech.stopListening();
    } catch (e) {
      console.warn('[NativeSpeech] Error in stopListening:', e);
    }
  }
}
