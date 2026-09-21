import React, { useState } from 'react';
import { AppConfig } from '../types';
import { ConfigService } from '../services/config';
import { TtsService } from '../services/tts';
import { Settings, Key, Bot, Volume2, Check, X, Shield, RefreshCw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (config: AppConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const currentConfig = ConfigService.getConfig();
  const [apiKey, setApiKey] = useState(currentConfig.apiKey);
  const [agentModel, setAgentModel] = useState(currentConfig.agentModel);
  const [ttsModel, setTtsModel] = useState(currentConfig.ttsModel);
  const [ttsVoice, setTtsVoice] = useState(currentConfig.ttsVoice);
  const [autoSpeak, setAutoSpeak] = useState(currentConfig.autoSpeak);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    const updated = ConfigService.updateConfig({
      apiKey: apiKey.trim(),
      agentModel: agentModel.trim(),
      ttsModel: ttsModel.trim(),
      ttsVoice: ttsVoice.trim(),
      autoSpeak
    });
    onSaved(updated);
    onClose();
  };

  const testVoiceSynthesis = async () => {
    setIsTestingAudio(true);
    setTestStatus('Generating speech...');
    try {
      // Temporarily update config so test uses current form values
      ConfigService.updateConfig({
        apiKey: apiKey.trim(),
        ttsModel: ttsModel.trim(),
        ttsVoice: ttsVoice.trim()
      });
      await TtsService.speak(
        'Hello! This is Pocket AI speaking with your configured voice model.',
        () => setTestStatus('Playing test audio...'),
        () => {
          setIsTestingAudio(false);
          setTestStatus('Test complete!');
          setTimeout(() => setTestStatus(null), 3000);
        }
      );
    } catch (e: any) {
      setIsTestingAudio(false);
      setTestStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Settings</h2>
              <p className="text-xs text-slate-400">OpenRouter & Voice Agent Configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          {/* API Key */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono text-xs transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" />
              Stored strictly in your local device browser. Never committed to Git.
            </p>
          </div>

          {/* Agent Model */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              Agent Reasoning Model
            </label>
            <input
              type="text"
              value={agentModel}
              onChange={e => setAgentModel(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-purple-400"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                'google/gemma-4-31b-it:free',
                'inclusionai/ling-3.0-flash-vl:free',
                'nex-agi/nex-n2.5-mini:free',
                'openai/gpt-4o-mini'
              ].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAgentModel(m)}
                  className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                    agentModel === m
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {m.split('/')[1] || m}
                </button>
              ))}
            </div>
          </div>

          {/* TTS Model & Voice */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
                <Volume2 className="w-3.5 h-3.5 text-pink-400" />
                TTS Model
              </label>
              <input
                type="text"
                value={ttsModel}
                onChange={e => setTtsModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                TTS Voice
              </label>
              <input
                type="text"
                value={ttsVoice}
                onChange={e => setTtsVoice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-pink-400"
              />
            </div>
          </div>

          {/* Test Voice Button */}
          <div>
            <button
              type="button"
              onClick={testVoiceSynthesis}
              disabled={isTestingAudio}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 text-xs font-medium border border-pink-500/20 transition-colors disabled:opacity-50"
            >
              {isTestingAudio ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Audio...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Test Voice Synthesis ({ttsVoice})</span>
                </>
              )}
            </button>
            {testStatus && (
              <p className="text-[11px] text-center text-slate-400 mt-1">{testStatus}</p>
            )}
          </div>

          {/* Auto Speak Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div>
              <div className="text-xs font-medium text-slate-200">Auto-speak Responses</div>
              <div className="text-[11px] text-slate-500">Automatically play voice output via TTS</div>
            </div>
            <button
              type="button"
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                autoSpeak ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  autoSpeak ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-colors"
          >
            <Check className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
