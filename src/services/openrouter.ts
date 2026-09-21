import { ConfigService } from './config';
import { AgentDecision, ToolName, ToolExecutionResult } from '../types';
import { TOOL_REGISTRY } from './tools/registry';

export class OpenRouterService {
  private static getHeaders(): Record<string, string> {
    const config = ConfigService.getConfig();
    return {
      'Authorization': `Bearer ${config.apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pocketai.app',
      'X-OpenRouter-Title': 'Pocket AI'
    };
  }

  /**
   * Phase 1: Analyze user voice request, reason about required mobile tool, and extract parameters
   */
  public static async reasonAboutIntent(
    userSpeech: string,
    history: { role: string; content: string }[] = []
  ): Promise<AgentDecision> {
    const config = ConfigService.getConfig();
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is missing. Please enter it in Settings.');
    }

    const toolsDescription = Object.values(TOOL_REGISTRY)
      .map(t => `- ${t.name}: ${t.description} Parameters: ${JSON.stringify(t.parametersSchema.properties)}`)
      .join('\n');

    const systemPrompt = `You are Pocket AI, a voice-first personal mobile AI assistant inspired by Siri.
Your job is to listen to the user's voice input, reason step-by-step, and decide if a mobile tool action is required.

AVAILABLE TOOLS:
${toolsDescription}

RULES:
1. If the user request requires an action (e.g. set alarm, start timer, create note, open app, check weather, search), choose the appropriate tool and provide structured parameters.
2. If the user request is just conversational (e.g. "Hello", "How are you?"), set "tool": "none".
3. For "set_alarm": ensure "time" is in 24-hour "HH:mm" format (e.g. 7 AM is "07:00", 8:30 PM is "20:30").
4. For "start_timer": "duration_seconds" must be an integer (e.g. 5 minutes is 300).
5. For "open_app": "app_id" must be one of: youtube, maps, camera, calculator, dialer, whatsapp.
6. For "get_weather": if user specifies a city, pass it in "location", otherwise use "current".
7. For sensitive actions (e.g. deleting data, sending messages), set "requires_confirmation": true and provide "confirmation_prompt".
8. Always respond ONLY with a single valid JSON object. Do not include markdown code blocks, backticks, or any surrounding text.

JSON FORMAT SPECIFICATION:
{
  "thought": "Your internal step-by-step reasoning",
  "tool": "set_alarm" | "start_timer" | "create_note" | "open_app" | "get_weather" | "get_information" | "none",
  "parameters": { ... },
  "requires_confirmation": false,
  "confirmation_prompt": "",
  "spoken_response": "Short natural Siri-style spoken response if no tool is required, or initial acknowledgment"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4),
      { role: 'user', content: userSpeech }
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: config.agentModel || 'inclusionai/ling-3.0-flash-vl:free',
          messages,
          temperature: 0.1,
          max_tokens: 500
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter Agent failed (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      return this.parseAgentDecision(content);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('OpenRouter reasoning error:', err);
      throw err;
    }
  }

  /**
   * Phase 2: Feed tool execution result back to the Agent to generate the natural spoken response
   */
  public static async synthesizeFinalResponse(
    userSpeech: string,
    toolName: ToolName,
    toolResult: ToolExecutionResult,
    agentThought?: string
  ): Promise<string> {
    const config = ConfigService.getConfig();

    // If no tool was needed, return clean conversational reply
    if (toolName === 'none') {
      return toolResult.message || "I'm here to help. What would you like me to do?";
    }

    const systemPrompt = `You are Pocket AI, a voice-first personal mobile assistant inspired by Siri.
The user asked: "${userSpeech}"
The tool "${toolName}" was executed on the device with the following result:
Status: ${toolResult.success ? 'SUCCESS' : 'FAILED'}
Result Data: ${JSON.stringify(toolResult.data)}
Execution Message: ${toolResult.message}

Generate a concise, natural, friendly Siri-style spoken confirmation (1-2 sentences maximum).
Do NOT include markdown, bullets, emojis, or technical jargon. Speak naturally as a voice assistant.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: config.agentModel || 'inclusionai/ling-3.0-flash-vl:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Provide the voice response.' }
          ],
          temperature: 0.3,
          max_tokens: 150
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Graceful fallback to tool execution message if response generation fails
        return toolResult.message;
      }

      const data = await response.json();
      const voiceText = data.choices?.[0]?.message?.content?.trim();
      return voiceText || toolResult.message;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Fallback to standard tool message:', err);
      return toolResult.message;
    }
  }

  private static parseAgentDecision(rawContent: string): AgentDecision {
    // Strip markdown formatting, code blocks (e.g. ```json ... ```)
    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    // Try finding first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      return {
        thought: parsed.thought || 'Processed user intent',
        tool: (parsed.tool || 'none') as ToolName,
        parameters: parsed.parameters || {},
        requires_confirmation: Boolean(parsed.requires_confirmation),
        confirmation_prompt: parsed.confirmation_prompt || '',
        spoken_response: parsed.spoken_response || ''
      };
    } catch (e) {
      console.warn('Failed to parse agent JSON, falling back:', rawContent);
      // Heuristic fallback for simple queries
      return {
        thought: 'Direct answer without tool',
        tool: 'none',
        parameters: {},
        requires_confirmation: false,
        spoken_response: rawContent.replace(/[{}"`]/g, '').trim()
      };
    }
  }
}
