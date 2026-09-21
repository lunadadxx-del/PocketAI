import { ToolName, ToolExecutionResult, AlarmItem, NoteItem, WeatherData } from '../../types';
import { NativeAlarmService } from '../nativeAlarm';
import { NativeAppLauncherService } from '../nativeAppLauncher';

const STORAGE_ALARMS = 'pocket_ai_alarms_v1';
const STORAGE_NOTES = 'pocket_ai_notes_v1';

export class ToolExecutor {
  private static onTimerStartCallback?: (timer: { id: string; duration: number; label: string }) => void;

  public static registerTimerCallback(cb: (timer: { id: string; duration: number; label: string }) => void) {
    this.onTimerStartCallback = cb;
  }

  public static async execute(tool: ToolName, params: any): Promise<ToolExecutionResult> {
    const timestamp = Date.now();

    try {
      switch (tool) {
        case 'set_alarm':
          return await this.executeSetAlarm(params, timestamp);

        case 'start_timer':
          return await this.executeStartTimer(params, timestamp);

        case 'create_note':
          return await this.executeCreateNote(params, timestamp);

        case 'open_app':
          return await this.executeOpenApp(params, timestamp);

        case 'get_weather':
          return await this.executeGetWeather(params, timestamp);

        case 'get_information':
          return {
            success: true,
            tool,
            data: { query: params.query },
            message: `Information query processed for: "${params.query}"`,
            timestamp
          };

        case 'none':
        default:
          return {
            success: true,
            tool: 'none',
            data: {},
            message: 'No mobile action needed.',
            timestamp
          };
      }
    } catch (err: any) {
      console.error(`Error executing tool ${tool}:`, err);
      return {
        success: false,
        tool,
        data: null,
        message: err.message || `Failed to execute ${tool}.`,
        timestamp
      };
    }
  }

  // --- Real Tool 1: Set Alarm ---
  private static async executeSetAlarm(params: { time: string; label?: string }, timestamp: number): Promise<ToolExecutionResult> {
    const [hStr, mStr] = params.time.split(':');
    const hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    const label = params.label || 'Pocket AI Alarm';

    // 1. Android Native Execution via AlarmManager
    if (NativeAlarmService.isNative()) {
      const nativeRes = await NativeAlarmService.scheduleAlarm(hour, minute, label);
      if (!nativeRes.success) {
        return {
          success: false,
          tool: 'set_alarm',
          data: null,
          message: nativeRes.message || 'Unable to schedule alarm on Android device.',
          timestamp
        };
      }

      const newAlarm: AlarmItem = {
        id: 'alarm_' + timestamp,
        time: params.time,
        label,
        enabled: true,
        timestamp
      };
      this.saveAlarm(newAlarm);

      return {
        success: true,
        tool: 'set_alarm',
        data: {
          time: params.time,
          displayTime: nativeRes.displayTime || params.time,
          label,
          alarmId: newAlarm.id,
          isNative: true
        },
        message: nativeRes.message || `Alarm scheduled for ${nativeRes.displayTime || params.time}`,
        timestamp
      };
    }

    // 2. Android Clock Intent URI Fallback (Web / PWA)
    const intentUrl = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};B.android.intent.extra.alarm.SKIP_UI=false;end`;

    // 2. Persist in local alarm storage
    const newAlarm: AlarmItem = {
      id: 'alarm_' + timestamp,
      time: params.time,
      label,
      enabled: true,
      timestamp
    };
    this.saveAlarm(newAlarm);

    // 3. Request Notification & Schedule Audio Buzzer for target time
    this.scheduleInAppAlarm(hour, minute, label);

    // 4. On Android mobile devices, dispatch the intent
    this.dispatchMobileIntent(intentUrl);

    // Format 12-hour display for human voice
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMin = minute === 0 ? '' : `:${minute.toString().padStart(2, '0')}`;
    const displayTime = `${displayHour}${displayMin} ${period}`;

    return {
      success: true,
      tool: 'set_alarm',
      data: {
        time: params.time,
        displayTime,
        label,
        alarmId: newAlarm.id
      },
      message: `Alarm set for ${displayTime} ("${label}").`,
      timestamp,
      intentUrl
    };
  }

  // --- Real Tool 2: Start Timer ---
  private static async executeStartTimer(params: { duration_seconds: number; label?: string }, timestamp: number): Promise<ToolExecutionResult> {
    const seconds = params.duration_seconds;
    const label = params.label || 'Timer';

    // 1. Android Timer Intent
    const intentUrl = `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${seconds};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};B.android.intent.extra.alarm.SKIP_UI=false;end`;

    // 2. Notify active timer listener in UI
    const timerId = 'timer_' + timestamp;
    if (this.onTimerStartCallback) {
      this.onTimerStartCallback({ id: timerId, duration: seconds, label });
    }

    // 3. Dispatch Android mobile intent if on mobile
    this.dispatchMobileIntent(intentUrl);

    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    let formattedDuration = '';
    if (minutes > 0) {
      formattedDuration += `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    if (remainingSecs > 0) {
      formattedDuration += (minutes > 0 ? ' ' : '') + `${remainingSecs} second${remainingSecs > 1 ? 's' : ''}`;
    }

    return {
      success: true,
      tool: 'start_timer',
      data: {
        timerId,
        seconds,
        formattedDuration,
        label
      },
      message: `Started ${formattedDuration} timer for "${label}".`,
      timestamp,
      intentUrl
    };
  }

  // --- Real Tool 3: Create Note ---
  private static async executeCreateNote(params: { title: string; content: string; tags?: string[] }, timestamp: number): Promise<ToolExecutionResult> {
    const note: NoteItem = {
      id: 'note_' + timestamp,
      title: params.title || 'Pocket AI Note',
      content: params.content,
      createdAt: timestamp,
      tags: params.tags || ['general']
    };

    // Save to persistent storage
    this.saveNote(note);

    // Android Share Intent (can save directly to Google Keep, Notes, etc.)
    const intentUrl = `intent:#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.TEXT=${encodeURIComponent(params.content)};S.android.intent.extra.SUBJECT=${encodeURIComponent(note.title)};end`;

    return {
      success: true,
      tool: 'create_note',
      data: note,
      message: `Saved note "${note.title}".`,
      timestamp,
      intentUrl
    };
  }

  // --- Real Tool 4: Open Mobile App ---
  private static async executeOpenApp(params: { package?: string; app_name?: string; app_id?: string; query?: string }, timestamp: number): Promise<ToolExecutionResult> {
    const packageName = params.package || 'com.google.android.youtube';
    const appName = params.app_name || 'Application';

    console.log(`[ToolExecutor] executeOpenApp: package=${packageName}, appName=${appName}`);

    // 1. Android Native Execution via NativeAppLauncherPlugin
    if (NativeAppLauncherService.isNative()) {
      const nativeResult = await NativeAppLauncherService.launchApp(packageName, appName);
      return {
        success: nativeResult.success,
        tool: 'open_app',
        data: {
          package: packageName,
          appName: appName,
          isNative: true
        },
        message: nativeResult.message,
        timestamp
      };
    }

    // 2. Web / Browser Preview Fallback
    let webFallbackUrl = 'https://www.youtube.com';
    if (packageName.includes('chrome')) webFallbackUrl = 'https://www.google.com';
    if (packageName.includes('maps')) webFallbackUrl = 'https://maps.google.com';
    if (packageName.includes('whatsapp')) webFallbackUrl = 'https://web.whatsapp.com';

    if (webFallbackUrl) {
      window.open(webFallbackUrl, '_blank', 'noopener,noreferrer');
    }

    return {
      success: true,
      tool: 'open_app',
      data: {
        package: packageName,
        appName: appName,
        isNative: false
      },
      message: `${appName} opened in browser preview.`,
      timestamp
    };
  }

  // --- Real Tool 5: Live Weather via Open-Meteo REST API ---
  private static async executeGetWeather(params: { location?: string }, timestamp: number): Promise<ToolExecutionResult> {
    let lat = 37.7749;
    let lon = -122.4194;
    let cityName = 'Current Location';

    const locationQuery = (params.location || '').trim().toLowerCase();

    if (locationQuery && locationQuery !== 'current' && locationQuery !== 'here') {
      // 1. Geocode city name via Open-Meteo Geocoding API
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(params.location!)}&count=1&language=en&format=json`);
      if (!geoRes.ok) {
        throw new Error(`Could not find coordinates for "${params.location}".`);
      }
      const geoData = await geoRes.json();
      if (!geoData.results || geoData.results.length === 0) {
        throw new Error(`City "${params.location}" not found.`);
      }
      lat = geoData.results[0].latitude;
      lon = geoData.results[0].longitude;
      cityName = `${geoData.results[0].name}${geoData.results[0].country ? ', ' + geoData.results[0].country : ''}`;
    } else {
      // Try device GPS location
      try {
        const coords = await this.getDeviceCoordinates();
        lat = coords.latitude;
        lon = coords.longitude;
        cityName = 'Your Location';
      } catch (e) {
        console.warn('GPS location unavailable, using default coordinates');
      }
    }

    // 2. Fetch live weather conditions from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,is_day,weather_code,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=kmh`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      throw new Error('Failed to retrieve weather data from Open-Meteo.');
    }
    const weatherJson = await weatherRes.json();
    const current = weatherJson.current;

    const weatherCode = current.weather_code;
    const condition = this.interpretWmoCode(weatherCode);
    const tempC = Math.round(current.temperature_2m);
    const windKmh = Math.round(current.wind_speed_10m);
    const humidity = current.relative_humidity_2m;
    const isDay = current.is_day === 1;

    const weatherData: WeatherData = {
      city: cityName,
      temperature: tempC,
      weatherCode,
      condition,
      windSpeed: windKmh,
      humidity,
      isDay
    };

    return {
      success: true,
      tool: 'get_weather',
      data: weatherData,
      message: `Weather in ${cityName}: ${tempC}°C, ${condition}, wind ${windKmh} km/h.`,
      timestamp
    };
  }

  // --- Helper: WMO Weather Interpretation ---
  private static interpretWmoCode(code: number): string {
    if (code === 0) return 'Clear sky';
    if (code === 1) return 'Mainly clear';
    if (code === 2) return 'Partly cloudy';
    if (code === 3) return 'Overcast';
    if (code === 45 || code === 48) return 'Fog';
    if (code >= 51 && code <= 55) return 'Drizzle';
    if (code >= 61 && code <= 65) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Cloudy';
  }

  // --- Helper: GPS Coordinates ---
  private static getDeviceCoordinates(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation not supported by browser.'));
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        err => reject(err),
        { timeout: 8000 }
      );
    });
  }

  // --- Helper: Dispatch Android Intent safely ---
  private static dispatchMobileIntent(intentUrl: string): void {
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = intentUrl;
      document.body.appendChild(iframe);
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (e) {
          // ignore
        }
      }, 2000);
    }
  }

  // --- In-App Alarm Audio buzzer ---
  private static scheduleInAppAlarm(hour: number, minute: number, label: string): void {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1); // next day
    }

    const delay = target.getTime() - now.getTime();
    setTimeout(() => {
      this.triggerAlarmSound(label);
    }, Math.min(delay, 2147483647));

    // Request notification permission if not yet granted
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  public static triggerAlarmSound(label: string): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pocket AI Alarm', {
        body: label || 'Time to wake up!',
        icon: '/favicon.ico'
      });
    }

    if (navigator.vibrate) {
      navigator.vibrate([300, 200, 300, 200, 500]);
    }

    // Play synthesized alarm chime with Web Audio API
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      // ignore
    }
  }

  // --- Storage Helpers ---
  public static getSavedAlarms(): AlarmItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_ALARMS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  private static saveAlarm(alarm: AlarmItem): void {
    const alarms = this.getSavedAlarms();
    alarms.unshift(alarm);
    localStorage.setItem(STORAGE_ALARMS, JSON.stringify(alarms.slice(0, 50)));
  }

  public static getSavedNotes(): NoteItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_NOTES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  private static saveNote(note: NoteItem): void {
    const notes = this.getSavedNotes();
    notes.unshift(note);
    localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes.slice(0, 100)));
  }

  public static deleteNote(id: string): void {
    const notes = this.getSavedNotes().filter(n => n.id !== id);
    localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes));
  }

  public static deleteAlarm(id: string): void {
    const alarms = this.getSavedAlarms().filter(a => a.id !== id);
    localStorage.setItem(STORAGE_ALARMS, JSON.stringify(alarms));
  }
}
