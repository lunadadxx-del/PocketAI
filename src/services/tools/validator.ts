import { ToolName, AgentDecision } from '../../types';
import { TOOL_REGISTRY } from './registry';

export interface ValidationResult {
  isValid: boolean;
  sanitizedParams?: any;
  error?: string;
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
}

export class ToolValidator {
  public static validate(tool: ToolName, params: any): ValidationResult {
    if (tool === 'none') {
      return { isValid: true, sanitizedParams: {}, requiresConfirmation: false };
    }

    const definition = TOOL_REGISTRY[tool];
    if (!definition) {
      return {
        isValid: false,
        error: `Unsupported tool '${tool}'. Pocket AI does not support this action.`,
        requiresConfirmation: false
      };
    }

    const safeParams = params && typeof params === 'object' ? { ...params } : {};

    switch (tool) {
      case 'set_alarm': {
        let timeStr = String(safeParams.time || '').trim();
        // Handle variations like "7:00 AM", "07:00", "7:00", "7"
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(\s*(AM|PM))?$/i);
        if (timeMatch) {
          let h = parseInt(timeMatch[1], 10);
          const m = parseInt(timeMatch[2], 10);
          const period = timeMatch[4]?.toUpperCase();

          if (period === 'PM' && h < 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;

          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            safeParams.time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          } else {
            return { isValid: false, error: `Invalid alarm time format: ${timeStr}. Expected 24h format HH:mm.`, requiresConfirmation: false };
          }
        } else {
          // If the model supplied just hours, e.g. "07:00" or "7"
          const simpleMatch = timeStr.match(/^(\d{1,2})$/);
          if (simpleMatch) {
            const h = parseInt(simpleMatch[1], 10);
            if (h >= 0 && h <= 23) {
              safeParams.time = `${h.toString().padStart(2, '0')}:00`;
            } else {
              return { isValid: false, error: `Invalid alarm hour: ${timeStr}.`, requiresConfirmation: false };
            }
          } else {
            return { isValid: false, error: `Invalid alarm time format: '${timeStr}'. Please specify time like '07:00' or '7:30 AM'.`, requiresConfirmation: false };
          }
        }

        safeParams.label = safeParams.label ? String(safeParams.label).trim() : 'Alarm';
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
      }

      case 'start_timer': {
        let sec = parseInt(safeParams.duration_seconds, 10);
        if (isNaN(sec) || sec <= 0) {
          return { isValid: false, error: 'Timer duration must be a positive number of seconds.', requiresConfirmation: false };
        }
        if (sec > 86400) {
          return { isValid: false, error: 'Timer duration cannot exceed 24 hours (86,400 seconds).', requiresConfirmation: false };
        }
        safeParams.duration_seconds = sec;
        safeParams.label = safeParams.label ? String(safeParams.label).trim() : 'Timer';
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
      }

      case 'create_note': {
        const title = String(safeParams.title || '').trim();
        const content = String(safeParams.content || '').trim();
        if (!content && !title) {
          return { isValid: false, error: 'Note content cannot be empty.', requiresConfirmation: false };
        }
        safeParams.title = title || 'Quick Note';
        safeParams.content = content || title;
        safeParams.tags = Array.isArray(safeParams.tags) ? safeParams.tags : ['general'];
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
      }

      case 'open_app': {
        const rawPackage = String(safeParams.package || safeParams.app || safeParams.app_id || safeParams.app_name || '').toLowerCase().trim();

        // Strict canonical allowlist of supported applications
        const APP_MAP: Record<string, { package: string; appName: string }> = {
          'youtube': { package: 'com.google.android.youtube', appName: 'YouTube' },
          'yt': { package: 'com.google.android.youtube', appName: 'YouTube' },
          'com.google.android.youtube': { package: 'com.google.android.youtube', appName: 'YouTube' },

          'chrome': { package: 'com.android.chrome', appName: 'Chrome' },
          'google chrome': { package: 'com.android.chrome', appName: 'Chrome' },
          'browser': { package: 'com.android.chrome', appName: 'Chrome' },
          'com.android.chrome': { package: 'com.android.chrome', appName: 'Chrome' },

          'settings': { package: 'com.android.settings', appName: 'Settings' },
          'android settings': { package: 'com.android.settings', appName: 'Settings' },
          'system settings': { package: 'com.android.settings', appName: 'Settings' },
          'com.android.settings': { package: 'com.android.settings', appName: 'Settings' },

          'whatsapp': { package: 'com.whatsapp', appName: 'WhatsApp' },
          'com.whatsapp': { package: 'com.whatsapp', appName: 'WhatsApp' },

          'maps': { package: 'com.google.android.apps.maps', appName: 'Google Maps' },
          'google maps': { package: 'com.google.android.apps.maps', appName: 'Google Maps' },
          'com.google.android.apps.maps': { package: 'com.google.android.apps.maps', appName: 'Google Maps' }
        };

        const resolved = APP_MAP[rawPackage];
        if (!resolved) {
          return {
            isValid: false,
            error: `Application '${rawPackage}' is not in the approved allowlist (YouTube, Chrome, Settings, WhatsApp, Google Maps).`,
            requiresConfirmation: false
          };
        }

        safeParams.package = resolved.package;
        safeParams.app_name = resolved.appName;
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
      }

      case 'get_weather': {
        safeParams.location = safeParams.location ? String(safeParams.location).trim() : 'current';
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
      }

      case 'get_information': {
        const query = String(safeParams.query || '').trim();
        if (!query) {
          return { isValid: false, error: 'Information query cannot be empty.', requiresConfirmation: false };
        }
        safeParams.query = query;
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
      }

      default:
        return { isValid: true, sanitizedParams: safeParams, requiresConfirmation: false };
    }
  }

  /**
   * Check if a requested user action requires explicit confirmation
   */
  public static checkSensitivity(actionDescription: string): { requiresConfirmation: boolean; prompt: string } {
    const lower = actionDescription.toLowerCase();
    if (
      lower.includes('delete all') ||
      lower.includes('clear all') ||
      lower.includes('erase') ||
      lower.includes('wipe') ||
      lower.includes('send message to') ||
      lower.includes('send email to')
    ) {
      return {
        requiresConfirmation: true,
        prompt: `Are you sure you want to perform this sensitive action?`
      };
    }
    return { requiresConfirmation: false, prompt: '' };
  }
}
