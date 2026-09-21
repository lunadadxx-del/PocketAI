import React, { useState, useEffect } from 'react';
import { ConversationTurn, AlarmItem, NoteItem } from '../types';
import { ToolExecutor } from '../services/tools/executor';
import { History, AlarmClock, FileText, Trash2, X, Clock, Brain } from 'lucide-react';

interface ActionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  conversationHistory: ConversationTurn[];
}

export const ActionHistory: React.FC<ActionHistoryProps> = ({
  isOpen,
  onClose,
  conversationHistory
}) => {
  const [activeTab, setActiveTab] = useState<'conversations' | 'alarms' | 'notes'>('conversations');
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      setAlarms(ToolExecutor.getSavedAlarms());
      setNotes(ToolExecutor.getSavedNotes());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeleteNote = (id: string) => {
    ToolExecutor.deleteNote(id);
    setNotes(ToolExecutor.getSavedNotes());
  };

  const handleDeleteAlarm = (id: string) => {
    ToolExecutor.deleteAlarm(id);
    setAlarms(ToolExecutor.getSavedAlarms());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">Pocket AI Activity</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 my-4 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setActiveTab('conversations')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'conversations'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Agent Logs
          </button>
          <button
            onClick={() => setActiveTab('alarms')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'alarms'
                ? 'bg-slate-800 text-purple-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Alarms ({alarms.length})
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'notes'
                ? 'bg-slate-800 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Notes ({notes.length})
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
          {/* Tab 1: Agent Conversation Turns & Reasoning */}
          {activeTab === 'conversations' && (
            <div>
              {conversationHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No interactions yet. Tap the orb to speak with Pocket AI.
                </div>
              ) : (
                <div className="space-y-3">
                  {conversationHistory.map(turn => (
                    <div key={turn.id} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-semibold text-cyan-400">User: "{turn.userSpeech}"</span>
                        <span className="text-[10px]">{new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {turn.agentThought && (
                        <div className="flex items-start gap-1.5 text-purple-400/90 font-mono text-[11px] bg-purple-950/20 p-2 rounded-lg border border-purple-500/10">
                          <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Thought: {turn.agentThought}</span>
                        </div>
                      )}
                      {turn.toolCalled && turn.toolCalled !== 'none' && (
                        <div className="text-[11px] text-emerald-400 font-medium">
                          Tool executed: <code className="bg-emerald-950/30 px-1.5 py-0.5 rounded text-emerald-300">{turn.toolCalled}</code>
                        </div>
                      )}
                      <div className="text-slate-200">
                        Response: {turn.agentResponse}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Saved Alarms */}
          {activeTab === 'alarms' && (
            <div>
              {alarms.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No active alarms. Say "Set an alarm for 7 AM" to create one.
                </div>
              ) : (
                <div className="space-y-2">
                  {alarms.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-purple-500/20">
                      <div className="flex items-center gap-3">
                        <AlarmClock className="w-5 h-5 text-purple-400" />
                        <div>
                          <div className="text-lg font-bold font-mono text-white">{a.time}</div>
                          <div className="text-xs text-slate-400">{a.label}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteAlarm(a.id)}
                        className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Saved Notes */}
          {activeTab === 'notes' && (
            <div>
              {notes.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No notes saved yet. Say "Create a note..." to take a note.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {notes.map(n => (
                    <div key={n.id} className="p-3 rounded-xl bg-slate-900 border border-emerald-500/20 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-white text-xs">{n.title}</div>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{n.content}</p>
                      <div className="text-[10px] text-slate-500 pt-1">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
