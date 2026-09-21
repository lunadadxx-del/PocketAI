import React, { useState, useEffect, useRef } from 'react';
import { 
  AgentState, 
  AgentDecision, 
  ToolExecutionResult, 
  ActiveTimer, 
  AppConfig 
} from './types';
import { PocketAgent } from './services/agent';
import { SttService } from './services/stt';
import { TtsService } from './services/tts';
import { ConfigService } from './services/config';
import { ToolExecutor } from './services/tools/executor';
import { WakeWordService } from './services/wakeWord';

import { SiriOrb } from './components/SiriOrb';
import { ToolCard } from './components/ToolCard';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SettingsModal } from './components/SettingsModal';
import { ActionHistory } from './components/ActionHistory';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

import { 
  Mic, 
  MicOff, 
  Settings as SettingsIcon, 
  History as HistoryIcon, 
  Send, 
  Sparkles, 
  Volume2, 
  VolumeX,
  Keyboard,
  ShieldCheck,
  Radio
} from 'lucide-react';

export const App: React.FC = () => {
  const [state, setState] = useState<AgentState>('idle');
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(
    () => ConfigService.getConfig().wakeWordEnabled ?? true
  );
  const [userSpeech, setUserSpeech] = useState<string>('');
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [agentResponse, setAgentResponse] = useState<string>('');
  const [agentThought, setAgentThought] = useState<string>('');
  const [toolResult, setToolResult] = useState<ToolExecutionResult | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [showTextInput, setShowTextInput] = useState<boolean>(false);
  const [textInputValue, setTextInputValue] = useState<string>('');

  // Confirmation state
  const [confirmationState, setConfirmationState] = useState<{
    isOpen: boolean;
    prompt: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({
    isOpen: false,
    prompt: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Register real timer listener
  useEffect(() => {
    ToolExecutor.registerTimerCallback((timer) => {
      setActiveTimer({
        id: timer.id,
        durationSeconds: timer.duration,
        remainingSeconds: timer.duration,
        label: timer.label,
        isRunning: true,
        startedAt: Date.now()
      });
    });
  }, []);

  // Handle Android Hardware Back Button & Modal Hierarchy
  useEffect(() => {
    let backListenerHandle: any = null;

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => {
        console.log('[BackButton] Android back pressed.');

        // 1. If text input / keyboard drawer is open -> dismiss it first
        if (showTextInput) {
          console.log('[BackButton] Closing text input drawer');
          setShowTextInput(false);
          return;
        }

        // 2. If confirmation modal is open -> dismiss confirmation
        if (confirmationState.isOpen) {
          console.log('[BackButton] Closing confirmation modal');
          setConfirmationState(prev => ({ ...prev, isOpen: false }));
          return;
        }

        // 3. If settings modal is open -> dismiss settings
        if (isSettingsOpen) {
          console.log('[BackButton] Closing settings modal');
          setIsSettingsOpen(false);
          return;
        }

        // 4. If history modal is open -> dismiss history
        if (isHistoryOpen) {
          console.log('[BackButton] Closing history modal');
          setIsHistoryOpen(false);
          return;
        }

        // 5. If on root screen with no overlays open -> allow normal Android app exit
        console.log('[BackButton] On root screen, exiting app');
        CapacitorApp.exitApp();
      }).then(handle => {
        backListenerHandle = handle;
      });
    }

    // Also handle browser/web back button navigation gracefully
    const handlePopState = () => {
      if (showTextInput) { setShowTextInput(false); return; }
      if (confirmationState.isOpen) { setConfirmationState(prev => ({ ...prev, isOpen: false })); return; }
      if (isSettingsOpen) { setIsSettingsOpen(false); return; }
      if (isHistoryOpen) { setIsHistoryOpen(false); return; }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      if (backListenerHandle) {
        backListenerHandle.remove();
      }
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showTextInput, confirmationState.isOpen, isSettingsOpen, isHistoryOpen]);

  // Quick prompt helper
  const handleQuickPrompt = (prompt: string) => {
    handleProcessInput(prompt);
  };

  // Main input processor (voice or text)
  const handleProcessInput = async (input: string) => {
    if (!input || !input.trim()) return;
    setUserSpeech(input);
    setInterimSpeech('');
    setErrorMessage(null);

    await PocketAgent.processVoiceInput(input, {
      onStateChange: (newState) => setState(newState),
      onDecision: (decision: AgentDecision) => {
        setAgentThought(decision.thought);
      },
      onToolResult: (res: ToolExecutionResult) => {
        setToolResult(res);
      },
      onSpokenResponse: (response: string) => {
        setAgentResponse(response);
      },
      onError: (err: string) => {
        setErrorMessage(err);
      },
      onRequestConfirmation: (prompt, onConfirm, onCancel) => {
        setConfirmationState({
          isOpen: true,
          prompt,
          onConfirm: () => {
            setConfirmationState(prev => ({ ...prev, isOpen: false }));
            onConfirm();
          },
          onCancel: () => {
            setConfirmationState(prev => ({ ...prev, isOpen: false }));
            onCancel();
          }
        });
      }
    });
  };

  // Direct active command listening (after wake word or manual mic tap)
  const startCommandListening = async () => {
    WakeWordService.stopWakeWordDetection();
    setState('listening_for_command');
    setInterimSpeech('');
    setErrorMessage(null);

    try {
      await SttService.startListening({
        onStart: () => {
          setState('listening_for_command');
        },
        onInterim: (text) => setInterimSpeech(text),
        onFinal: (text) => {
          setUserSpeech(text);
          setInterimSpeech('');
          handleProcessInput(text);
        },
        onError: (err) => {
          setErrorMessage(err);
          setState('idle');
        },
        onEnd: () => {
          setState(prev => (prev === 'listening_for_command' || prev === 'listening') ? 'idle' : prev);
        },
        onVolume: (vol) => setMicAudioLevel(vol)
      });
    } catch (e: any) {
      console.error('[App] startCommandListening failed:', e);
      setErrorMessage(e.message || 'Could not start voice recognition.');
      setState('idle');
    }
  };

  // Microphone toggle
  const toggleListening = async () => {
    // If currently listening for wake word "Piti", tap switches immediately to direct active command listening
    if (state === 'listening_for_piti') {
      WakeWordService.stopWakeWordDetection();
      startCommandListening();
      return;
    }

    if (state === 'listening' || state === 'listening_for_command') {
      SttService.stopListening();
      setState('idle');
      return;
    }

    if (state === 'speaking') {
      TtsService.stop();
      setState('idle');
      return;
    }

    startCommandListening();
  };

  // Manage Wake Word "Piti" Detection Loop
  useEffect(() => {
    if (!wakeWordEnabled) {
      WakeWordService.stopWakeWordDetection();
      return;
    }

    // Wake word runs whenever the app is idle and no dialog/drawer is open
    const isBusyWithModal = showTextInput || confirmationState.isOpen || isSettingsOpen || isHistoryOpen;
    if (state === 'idle' && !isBusyWithModal) {
      const timer = setTimeout(() => {
        setState('listening_for_piti');
        WakeWordService.startWakeWordDetection({
          onWakeWordDetected: (confidence: number) => {
            console.log('[App] Acoustic wake word "Piti" detected from raw audio! Confidence:', confidence);
            setState('wake_word_detected');

            // Acoustic "Piti" detected -> immediately transition to command listening
            setTimeout(() => {
              startCommandListening();
            }, 550);
          },
          onVolume: (vol) => setMicAudioLevel(vol),
          onError: (err) => {
            console.warn('[App] Wake-word detector note:', err);
          }
        });
      }, 350);

      return () => {
        clearTimeout(timer);
        WakeWordService.stopWakeWordDetection();
      };
    } else if (state !== 'listening_for_piti') {
      WakeWordService.stopWakeWordDetection();
    }
  }, [state, wakeWordEnabled, showTextInput, confirmationState.isOpen, isSettingsOpen, isHistoryOpen]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInputValue.trim()) {
      handleProcessInput(textInputValue);
      setTextInputValue('');
      setShowTextInput(false);
    }
  };

  return (
    <div className="relative min-h-screen max-w-md mx-auto flex flex-col justify-between p-4 sm:p-6 siri-glow overflow-hidden select-none">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between z-20 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Pocket AI
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                v1.0
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Voice-First Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Wake Word "Piti" quick toggle badge */}
          <button
            onClick={() => {
              const nextVal = !wakeWordEnabled;
              setWakeWordEnabled(nextVal);
              ConfigService.updateConfig({ wakeWordEnabled: nextVal });
              if (!nextVal) {
                WakeWordService.stopWakeWordDetection();
                setState('idle');
              }
            }}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              wakeWordEnabled
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm shadow-teal-500/10 hover:bg-teal-500/30'
                : 'glass-pill text-slate-400 hover:text-slate-300'
            }`}
            title={wakeWordEnabled ? 'Wake word "Piti" is active (listening)' : 'Wake word "Piti" is disabled'}
          >
            <Radio className={`w-3.5 h-3.5 ${wakeWordEnabled ? 'animate-pulse text-teal-400' : 'text-slate-500'}`} />
            <span>Piti</span>
          </button>

          <button
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 rounded-xl glass-pill text-slate-300 hover:text-white transition-colors"
            title="Activity & Notes"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl glass-pill text-slate-300 hover:text-white transition-colors"
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Center Stage: Siri Orb & Live Transcript */}
      <main className="flex-1 flex flex-col items-center justify-center z-20 my-auto py-4">
        {/* Active Tool or Timer Card */}
        <div className="w-full mb-4">
          <ToolCard 
            result={toolResult} 
            activeTimer={activeTimer}
            onClearTimer={() => setActiveTimer(null)}
          />
        </div>

        {/* Fluid Siri Orb */}
        <div className="my-2">
          <SiriOrb
            state={state}
            onClick={toggleListening}
            audioLevel={micAudioLevel}
          />
        </div>

        {/* Live Subtitle Transcript Area */}
        <div className="w-full text-center px-4 mt-4 min-h-[70px] flex flex-col items-center justify-center">
          {interimSpeech ? (
            <p className="text-base text-cyan-300 font-medium italic animate-pulse">
              "{interimSpeech}"
            </p>
          ) : state === 'listening_for_piti' ? (
            <p className="text-xs text-teal-300/80 font-mono flex items-center justify-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse text-teal-400" />
              Say "Piti" or tap orb to speak
            </p>
          ) : state === 'wake_word_detected' ? (
            <p className="text-sm text-amber-300 font-semibold animate-pulse">
              "Piti" detected! Listening for your command...
            </p>
          ) : state === 'listening_for_command' ? (
            <p className="text-sm text-cyan-300 font-medium animate-pulse">
              Listening for your command...
            </p>
          ) : userSpeech && state === 'thinking' ? (
            <div className="space-y-1">
              <p className="text-sm text-slate-300 font-medium">
                "{userSpeech}"
              </p>
              {agentThought && (
                <p className="text-xs text-purple-400/80 font-mono">
                  {agentThought}
                </p>
              )}
            </div>
          ) : agentResponse ? (
            <p className="text-base text-white font-medium leading-relaxed animate-fade-in">
              {agentResponse}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Tap the orb or speak to give a mobile command
            </p>
          )}

          {errorMessage && (
            <div className="mt-2 text-xs text-rose-400 bg-rose-950/40 px-3 py-1 rounded-full border border-rose-500/20">
              {errorMessage}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Area: Suggestions & Controls */}
      <footer className="z-20 space-y-3 pb-2">
        {/* Suggestion Chips */}
        {(state === 'idle' || state === 'listening_for_piti') && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none justify-start sm:justify-center">
            {[
              'Set an alarm for 7 AM',
              'Start a 5 min timer',
              'Create a note: project meeting tomorrow',
              'What is the weather today?',
              'Open YouTube'
            ].map(prompt => (
              <button
                key={prompt}
                onClick={() => handleQuickPrompt(prompt)}
                className="whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-medium bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:border-cyan-500/40 transition-colors shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Text Input Drawer (fallback if mic is unavailable or user chooses to type) */}
        {showTextInput ? (
          <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={textInputValue}
              onChange={e => setTextInputValue(e.target.value)}
              placeholder="Ask Pocket AI..."
              autoFocus
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
            />
            <button
              type="submit"
              className="p-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowTextInput(false)}
              className="p-3 rounded-2xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <Mic className="w-5 h-5" />
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setShowTextInput(true)}
              className="p-3 rounded-full glass-pill text-slate-400 hover:text-slate-200 transition-colors"
              title="Type a command"
            >
              <Keyboard className="w-5 h-5" />
            </button>

            {/* Large Talk Button */}
            <button
              onClick={toggleListening}
              className={`p-5 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 ${
                state === 'listening' || state === 'listening_for_command'
                  ? 'bg-gradient-to-tr from-cyan-400 to-blue-500 text-slate-950 scale-105 shadow-cyan-500/50'
                  : state === 'listening_for_piti'
                  ? 'bg-gradient-to-tr from-teal-500 to-cyan-600 text-white shadow-teal-500/30'
                  : state === 'speaking'
                  ? 'bg-gradient-to-tr from-pink-500 to-purple-600 text-white shadow-pink-500/50'
                  : 'bg-gradient-to-tr from-cyan-500 to-purple-600 text-white hover:opacity-95 shadow-purple-500/30'
              }`}
            >
              {state === 'listening' || state === 'listening_for_command' ? (
                <Mic className="w-7 h-7 animate-pulse" />
              ) : state === 'listening_for_piti' ? (
                <Radio className="w-7 h-7 animate-pulse" />
              ) : state === 'speaking' ? (
                <Volume2 className="w-7 h-7 animate-bounce" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </button>

            <button
              onClick={() => {
                if (TtsService.isAudioPlaying()) {
                  TtsService.stop();
                  setState('idle');
                } else if (agentResponse) {
                  TtsService.speak(agentResponse, () => setState('speaking'), () => setState('idle'));
                }
              }}
              className="p-3 rounded-full glass-pill text-slate-400 hover:text-slate-200 transition-colors"
              title="Replay Voice Response"
            >
              {TtsService.isAudioPlaying() ? <VolumeX className="w-5 h-5 text-pink-400" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        )}
      </footer>

      {/* Confirmation Modal for Sensitive Actions */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        prompt={confirmationState.prompt}
        onConfirm={confirmationState.onConfirm}
        onCancel={confirmationState.onCancel}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(newCfg: AppConfig) => {
          if (newCfg.wakeWordEnabled !== undefined) {
            setWakeWordEnabled(newCfg.wakeWordEnabled);
          }
        }}
      />

      {/* History & Notes Modal */}
      <ActionHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        conversationHistory={PocketAgent.getHistory()}
      />
    </div>
  );
};
