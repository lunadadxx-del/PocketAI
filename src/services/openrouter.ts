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
   * Helper to perform chat completions with intelligent retry and fallback if a free model is rate-limited (429)
   */
  private static async postChatCompletion(
    messages: { role: string; content: string }[],
    temperature: number = 0.2,
    maxTokens: number = 400
  ): Promise<string> {
    const config = ConfigService.getConfig();
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is missing. Please configure it in Settings.');
    }

    const primaryModel = config.agentModel || 'google/gemma-4-31b-it:free';
    const fallbackModels = [
      primaryModel,
      'google/gemma-4-31b-it:free',
      'inclusionai/ling-3.0-flash-vl:free',
      'nex-agi/nex-n2.5-mini:free'
    ];
    // Remove duplicates while preserving order
    const candidateModels = Array.from(new Set(fallbackModels));

    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          return content;
        }

        const errText = await response.text();
        console.warn(`Model ${model} returned HTTP ${response.status}:`, errText);

        // If 429 (rate-limited) or 503, try next candidate model
        if (response.status === 429 || response.status === 503 || response.status === 404) {
          lastError = new Error(`Model ${model} was temporarily rate-limited upstream (${response.status}). Trying alternative...`);
          continue;
        } else {
          throw new Error(`OpenRouter error (${response.status}): ${errText}`);
        }
      } catch (err: any) {
        lastError = err;
        if (err.name === 'AbortError') {
          console.warn(`Request to ${model} timed out, trying fallback...`);
          continue;
        }
      }
    }

    throw lastError || new Error('All candidate AI brain models failed or are temporarily rate-limited.');
  }

  /**
   * Phase 1: Gemma analyzes the user's input, context, and determines whether an action or conversation is needed
   */
  public static async reasonAboutIntent(
    userSpeech: string,
    history: { role: string; content: string }[] = []
  ): Promise<AgentDecision> {
    const toolsDescription = Object.values(TOOL_REGISTRY)
      .map(t => `- ${t.name}: ${t.description}\n  Required arguments schema: ${JSON.stringify(t.parametersSchema.properties)}`)
      .join('\n');

    const systemPrompt = `You are Pocket AI, a natural, friendly, voice-first personal mobile AI assistant inspired by Siri.
You have access to real mobile phone tools.

AVAILABLE MOBILE TOOLS:
${toolsDescription}

YOUR BEHAVIOR AND PERSONALITY RULES:
1. Always be conversational, warm, concise, and helpful.
2. If the user asks a normal question or makes small talk (e.g. "What is an API?", "Hey Pocket, what can you do?", "How are you?"), generate a natural conversational answer directly.
   - For conversational queries: set "tool": "none" and provide the natural answer in "spoken_response".
   - Keep answers clear, natural, and not unnecessarily verbose.
3. If the user request requires an action on their device (e.g. "Set an alarm for 7 AM", "Start a 5 minute timer", "Take a note saying project meeting tomorrow", "What's the weather today?", "Open YouTube"):
   - You MUST produce a structured tool call.
   - Do NOT say "Sure, I set an alarm" right now because the tool has not executed yet.
   - Set "tool" to the chosen tool name.
   - Provide the required structured parameters in "arguments".
4. Parameter constraints:
   - "set_alarm": "time" in 24-hour "HH:mm" format (e.g. 7 AM is "07:00", 8:30 PM is "20:30").
   - "start_timer": "duration_seconds" as a positive integer (e.g. 5 minutes is 300).
   - "create_note": "title" and "content" strings.
   - "open_app": "app_id" (youtube, maps, camera, calculator, dialer, whatsapp).
   - "get_weather": "location" (city name, or "current").
5. Sensitive actions (deleting data, wiping notes): set "requires_confirmation": true and supply "confirmation_prompt".
6. Respond ONLY with a valid JSON object. Do not include markdown code block backticks or extra text.

JSON FORMAT:
{
  "thought": "Brief internal step-by-step reasoning",
  "tool": "set_alarm" | "start_timer" | "create_note" | "open_app" | "get_weather" | "get_information" | "none",
  "arguments": { ... },
  "requires_confirmation": false,
  "confirmation_prompt": "",
  "spoken_response": "Natural conversational response if no tool is required, or empty if calling a tool"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4),
      { role: 'user', content: userSpeech }
    ];

    const rawContent = await this.postChatCompletion(messages, 0.15, 450);
    return this.parseAgentDecision(rawContent);
  }

  /**
   * Phase 2: Feed tool execution result back to Gemma to generate the final natural response
   */
  public static async synthesizeFinalResponse(
    userSpeech: string,
    toolName: ToolName,
    toolResult: ToolExecutionResult,
    agentThought?: string
  ): Promise<string> {
    if (toolName === 'none') {
      return toolResult.message || "I'm here to help. What would you like me to do?";
    }

    const systemPrompt = `You are Pocket AI, a friendly personal mobile assistant inspired by Siri.
The user asked: "${userSpeech}"

The device tool "${toolName}" just executed with the following outcome:
Execution Status: ${toolResult.success ? 'SUCCESS' : 'FAILED'}
Result Data: ${JSON.stringify(toolResult.data)}
Execution Message: "${toolResult.message}"

CRITICAL RULES FOR FINAL VOICE RESPONSE:
1. Speak naturally, concisely, and conversationally in 1-2 friendly sentences.
2. If SUCCESS: Confirm what was accomplished clearly (e.g., "Done. I've set your alarm for 7 AM." or "I've started a 5 minute timer for your tea.").
3. If FAILED: Honestly explain that the action couldn't be completed (e.g., "I couldn't create the alarm right now. Please try again."). Never pretend an action succeeded when it failed!
4. Do NOT output JSON, markdown, bullets, emojis, or technical codes. Output ONLY the natural speech text that will be spoken aloud to the user.`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Provide the natural spoken confirmation text.' }
      ];
      const rawContent = await this.postChatCompletion(messages, 0.3, 150);
      const cleaned = rawContent.replace(/[{}"`]/g, '').trim();
      return cleaned || toolResult.message;
    } catch (err) {
      console.warn('Fallback to standard tool message:', err);
      return toolResult.message;
    }
  }

  private static parseAgentDecision(rawContent: string): AgentDecision {
    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      // Support both "arguments" and "parameters" keys
      const params = parsed.arguments || parsed.parameters || {};

      return {
        thought: parsed.thought || 'Processed user request',
        tool: (parsed.tool || 'none') as ToolName,
        parameters: params,
        requires_confirmation: Boolean(parsed.requires_confirmation),
        confirmation_prompt: parsed.confirmation_prompt || '',
        spoken_response: parsed.spoken_response || ''
      };
    } catch (e) {
      console.warn('Failed to parse Gemma JSON output, extracting text fallback:', rawContent);
      return {
        thought: 'Direct conversational answer',
        tool: 'none',
        parameters: {},
        requires_confirmation: false,
        spoken_response: rawContent.replace(/[{}"`]/g, '').trim()
      };
    }
  }
}
