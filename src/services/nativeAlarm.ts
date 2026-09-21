import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeAlarmResponse {
  success: boolean;
  message: string;
  time?: string;
  displayTime?: string;
  label?: string;
  triggerMillis?: number;
  isExact?: boolean;
}

export interface NativeAlarmPluginInterface {
  setAlarm(options: { hour: number; minute: number; label: string }): Promise<NativeAlarmResponse>;
  cancelAlarm(options: { hour: number; minute: number }): Promise<{ success: boolean; message: string }>;
}

const NativeAlarm = registerPlugin<NativeAlarmPluginInterface>('NativeAlarm');

export class NativeAlarmService {
  public static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public static async scheduleAlarm(hour: number, minute: number, label: string): Promise<NativeAlarmResponse> {
    if (this.isNative()) {
      try {
        const response = await NativeAlarm.setAlarm({ hour, minute, label });
        return response;
      } catch (e: any) {
        console.error('NativeAlarm call error:', e);
        return {
          success: false,
          message: e.message || 'Failed to schedule alarm via Android AlarmManager.'
        };
      }
    }

    return {
      success: false,
      message: 'Not running on native Android platform.'
    };
  }

  public static async cancelAlarm(hour: number, minute: number): Promise<boolean> {
    if (this.isNative()) {
      try {
        const res = await NativeAlarm.cancelAlarm({ hour, minute });
        return res.success;
      } catch (e) {
        return false;
      }
    }
    return false;
  }
}
