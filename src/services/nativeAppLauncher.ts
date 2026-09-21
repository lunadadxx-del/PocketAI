import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeAppLauncherResult {
  success: boolean;
  message: string;
  package?: string;
  appName?: string;
}

export interface NativeAppLauncherPluginInterface {
  openApp(options: { package: string; appName: string }): Promise<NativeAppLauncherResult>;
  isAppInstalled(options: { package: string }): Promise<{ installed: boolean }>;
}

const NativeAppLauncher = registerPlugin<NativeAppLauncherPluginInterface>('NativeAppLauncher');

export class NativeAppLauncherService {
  public static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public static async launchApp(packageName: string, appName: string): Promise<NativeAppLauncherResult> {
    if (!this.isNative()) {
      return {
        success: false,
        message: 'Not running on native Android platform.'
      };
    }

    try {
      console.log(`[NativeAppLauncher] Launching ${appName} (${packageName})...`);
      const result = await NativeAppLauncher.openApp({
        package: packageName,
        appName
      });
      console.log('[NativeAppLauncher] Launch result:', result);
      return result;
    } catch (e: any) {
      console.error('[NativeAppLauncher] Launch error:', e);
      return {
        success: false,
        message: e.message || `Failed to launch ${appName}.`
      };
    }
  }

  public static async checkInstalled(packageName: string): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await NativeAppLauncher.isAppInstalled({ package: packageName });
      return res.installed;
    } catch (e) {
      return false;
    }
  }
}
