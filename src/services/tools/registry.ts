import { ToolName } from '../../types';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parametersSchema: Record<string, any>;
  isSensitive: boolean;
  examplePrompts: string[];
}

export const TOOL_REGISTRY: Record<ToolName, ToolDefinition> = {
  set_alarm: {
    name: 'set_alarm',
    description: 'Sets a real alarm on the device clock for a specified time (24-hour HH:mm format).',
    parametersSchema: {
      type: 'object',
      properties: {
        time: {
          type: 'string',
          description: 'Time in 24-hour HH:mm format, e.g. "07:00", "08:30", "19:00"'
        },
        label: {
          type: 'string',
          description: 'Optional label or message for the alarm, e.g. "Wake up", "Work"'
        }
      },
      required: ['time']
    },
    isSensitive: false,
    examplePrompts: ['Set an alarm for 7 AM', 'Wake me up at 6:30 tomorrow', 'Set an alarm for 8 PM called Gym']
  },
  start_timer: {
    name: 'start_timer',
    description: 'Starts a real countdown timer for a specified duration in seconds.',
    parametersSchema: {
      type: 'object',
      properties: {
        duration_seconds: {
          type: 'integer',
          description: 'Duration in seconds. E.g. 5 minutes = 300 seconds, 10 minutes = 600 seconds'
        },
        label: {
          type: 'string',
          description: 'Optional label for the timer, e.g. "Tea", "Workout", "Pizza"'
        }
      },
      required: ['duration_seconds']
    },
    isSensitive: false,
    examplePrompts: ['Start a 5 minute timer', 'Set a timer for 10 minutes for cooking', 'Start a 30 second timer']
  },
  create_note: {
    name: 'create_note',
    description: 'Creates and saves a persistent note on the mobile device.',
    parametersSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short descriptive title for the note'
        },
        content: {
          type: 'string',
          description: 'Full body content of the note'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional category tags, e.g. ["work", "meeting"]'
        }
      },
      required: ['title', 'content']
    },
    isSensitive: false,
    examplePrompts: ['Create a note saying I have a project meeting tomorrow', 'Note down buy groceries milk and eggs', 'Take a note: ideas for mobile app']
  },
  open_app: {
    name: 'open_app',
    description: 'Launches an approved mobile application on the Android device (YouTube, Chrome, Settings, WhatsApp, Google Maps).',
    parametersSchema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          enum: [
            'com.google.android.youtube',
            'com.android.chrome',
            'com.android.settings',
            'com.whatsapp',
            'com.google.android.apps.maps'
          ],
          description: 'Android package identifier, e.g. "com.google.android.youtube" or "com.android.settings"'
        },
        app_name: {
          type: 'string',
          description: 'Human-friendly app name, e.g. "YouTube", "Chrome", "Settings"'
        }
      },
      required: ['package']
    },
    isSensitive: false,
    examplePrompts: ['Open YouTube', 'Launch YouTube', 'Open Chrome', 'Open Settings', 'Open WhatsApp']
  },
  get_weather: {
    name: 'get_weather',
    description: 'Retrieves real live weather conditions and temperature from Open-Meteo for the user current location or a requested city.',
    parametersSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name (e.g. "San Francisco", "London", "Tokyo"). If empty or "current", uses real device GPS coordinates.'
        }
      }
    },
    isSensitive: false,
    examplePrompts: ["What's the weather today?", 'How is the weather in New York?', 'Is it raining outside?']
  },
  get_information: {
    name: 'get_information',
    description: 'Answers factual questions, general queries, or queries that do not require mobile hardware actions.',
    parametersSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search or question query'
        }
      },
      required: ['query']
    },
    isSensitive: false,
    examplePrompts: ['Who was the first person on the moon?', 'What is the speed of light?', 'Explain quantum computing in one sentence']
  },
  none: {
    name: 'none',
    description: 'Used for conversational greetings, small talk, or clarifications when no mobile action is required.',
    parametersSchema: { type: 'object', properties: {} },
    isSensitive: false,
    examplePrompts: ['Hello', 'How are you?', 'Thank you']
  }
};
