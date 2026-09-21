import { 
  AgentState, 
  AgentDecision, 
  ToolExecutionResult, 
  ConversationTurn,
  ToolName 
} from '../types';
import { OpenRouterService } from './openrouter';
import { ToolValidator } from './tools/validator';
import { ToolExecutor } from './tools/executor';
import { TtsService } from './tts';
import { ConfigService } from './config';

export interface AgentCallbacks {
  onStateChange: (state: AgentState) => void;
  onDecision: (decision: AgentDecision) => void;
  onToolResult: (result: ToolExecutionResult) => void;
  onSpokenResponse: (response: string) => void;
  onError: (error: string) => void;
  onRequestConfirmation?: (prompt: string, onConfirm: () => void, onCancel: () => void) => void;
}

export class PocketAgent {
  private static conversationHistory: ConversationTurn[] = [];
  private static currentState: AgentState = 'idle';

  public static getState(): AgentState {
    return this.currentState;
  }

  public static getHistory(): ConversationTurn[] {
    return this.conversationHistory;
  }

  public static async processVoiceInput(
    userSpeech: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    const trimmedInput = userSpeech.trim();
    if (!trimmedInput) return;

    const turnId = 'turn_' + Date.now();
    this.setState('thinking', callbacks);

    try {
      // 1. LLM Agent Intent Understanding & Tool Decision
      const chatHistory = this.conversationHistory.slice(-3).map(turn => ({
        role: 'user',
        content: turn.userSpeech
      }));

      const decision = await OpenRouterService.reasonAboutIntent(trimmedInput, chatHistory);
      callbacks.onDecision(decision);

      // 2. Validate Tool & Arguments
      const validation = ToolValidator.validate(decision.tool, decision.parameters);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid action parameters.');
      }

      // 3. Check for Confirmation on sensitive actions
      const sensitivity = ToolValidator.checkSensitivity(trimmedInput);
      const needsConfirm = decision.requires_confirmation || sensitivity.requiresConfirmation;

      if (needsConfirm && callbacks.onRequestConfirmation) {
        this.setState('awaiting_confirmation', callbacks);
        const confirmPrompt = decision.confirmation_prompt || sensitivity.prompt || 'Do you want to proceed with this action?';
        
        // Speak the confirmation question
        await TtsService.speak(confirmPrompt, () => this.setState('speaking', callbacks));

        return new Promise((resolve) => {
          callbacks.onRequestConfirmation!(
            confirmPrompt,
            async () => {
              // Confirmed
              await this.executeAndRespond(turnId, trimmedInput, decision, validation.sanitizedParams, callbacks);
              resolve();
            },
            () => {
              // Cancelled
              this.setState('idle', callbacks);
              const cancelMsg = 'Action cancelled.';
              callbacks.onSpokenResponse(cancelMsg);
              TtsService.speak(cancelMsg);
              resolve();
            }
          );
        });
      }

      // 4. Directly execute and complete the loop
      await this.executeAndRespond(turnId, trimmedInput, decision, validation.sanitizedParams, callbacks);

    } catch (err: any) {
      console.error('Agent processing error:', err);
      this.setState('error', callbacks);
      const errorMsg = err.message || 'Sorry, I encountered an error processing your request.';
      callbacks.onError(errorMsg);
      callbacks.onSpokenResponse(errorMsg);

      if (ConfigService.getConfig().autoSpeak) {
        await TtsService.speak(errorMsg, () => this.setState('speaking', callbacks));
      }
      this.setState('idle', callbacks);
    }
  }

  private static async executeAndRespond(
    turnId: string,
    userSpeech: string,
    decision: AgentDecision,
    sanitizedParams: any,
    callbacks: AgentCallbacks
  ): Promise<void> {
    let toolResult: ToolExecutionResult;

    // Step A: Real Mobile Action Execution
    if (decision.tool !== 'none') {
      this.setState('executing', callbacks);
      toolResult = await ToolExecutor.execute(decision.tool, sanitizedParams);
      callbacks.onToolResult(toolResult);
    } else {
      toolResult = {
        success: true,
        tool: 'none',
        data: {},
        message: decision.spoken_response || "I'm here to help.",
        timestamp: Date.now()
      };
    }

    // Step B: Loop tool result back to Agent for final natural spoken response
    this.setState('thinking', callbacks);
    let spokenText = decision.spoken_response;
    if (decision.tool !== 'none') {
      spokenText = await OpenRouterService.synthesizeFinalResponse(
        userSpeech,
        decision.tool,
        toolResult,
        decision.thought
      );
    }

    spokenText = spokenText || toolResult.message;
    callbacks.onSpokenResponse(spokenText);

    // Save to conversation history
    const turn: ConversationTurn = {
      id: turnId,
      timestamp: Date.now(),
      userSpeech,
      agentThought: decision.thought,
      toolCalled: decision.tool,
      toolResult,
      agentResponse: spokenText
    };
    this.conversationHistory.push(turn);

    // Step C: Voice Output via OpenRouter TTS
    if (ConfigService.getConfig().autoSpeak) {
      this.setState('speaking', callbacks);
      await TtsService.speak(
        spokenText,
        () => this.setState('speaking', callbacks),
        () => this.setState('idle', callbacks)
      );
    } else {
      this.setState('idle', callbacks);
    }
  }

  private static setState(state: AgentState, callbacks: AgentCallbacks): void {
    this.currentState = state;
    callbacks.onStateChange(state);
  }

  public static clearHistory(): void {
    this.conversationHistory = [];
  }
}
