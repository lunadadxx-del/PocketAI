export type ToolName = 
  | 'set_alarm'
  | 'start_timer'
  | 'create_note'
  | 'open_app'
  | 'get_weather'
  | 'get_information'
  | 'none';

export type AgentState = 
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'executing'
  | 'speaking'
  | 'awaiting_confirmation'
  | 'error';

export interface SetAlarmParams {
  time: string; // HH:mm format, e.g. "07:00", "19:30"
  label?: string;
  days?: string[];
}

export interface StartTimerParams {
  duration_seconds: number; // Duration in seconds, e.g. 300 for 5 minutes
  label?: string;
}

export interface CreateNoteParams {
  title: string;
  content: string;
  tags?: string[];
}

export interface OpenAppParams {
  app_id: 'youtube' | 'maps' | 'camera' | 'calculator' | 'dialer' | 'whatsapp' | 'browser';
  app_name: string;
  query?: string;
}

export interface GetWeatherParams {
  location?: string;
  unit?: 'celsius' | 'fahrenheit';
}

export interface GetInfoParams {
  query: string;
}

export interface AgentDecision {
  thought: string;
  tool: ToolName;
  parameters: any;
  requires_confirmation: boolean;
  confirmation_prompt?: string;
  spoken_response?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  tool: ToolName;
  data: any;
  message: string;
  timestamp: number;
  intentUrl?: string;
}

export interface ConversationTurn {
  id: string;
  timestamp: number;
  userSpeech: string;
  agentThought?: string;
  toolCalled?: ToolName;
  toolResult?: ToolExecutionResult;
  agentResponse: string;
  audioUrl?: string;
}

export interface AlarmItem {
  id: string;
  time: string; // HH:mm
  label: string;
  enabled: boolean;
  timestamp: number;
}

export interface ActiveTimer {
  id: string;
  durationSeconds: number;
  remainingSeconds: number;
  label: string;
  isRunning: boolean;
  startedAt: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  tags: string[];
}

export interface WeatherData {
  city: string;
  temperature: number;
  weatherCode: number;
  condition: string;
  windSpeed: number;
  humidity?: number;
  isDay: boolean;
}

export interface AppConfig {
  apiKey: string;
  agentModel: string;
  ttsModel: string;
  ttsVoice: string;
  autoSpeak: boolean;
}
