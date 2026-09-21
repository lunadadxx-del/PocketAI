import React, { useState, useEffect } from 'react';
import { 
  ToolExecutionResult, 
  ToolName, 
  ActiveTimer, 
  WeatherData,
  NoteItem 
} from '../types';
import { 
  AlarmClock, 
  Timer as TimerIcon, 
  FileText, 
  CloudSun, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  Play, 
  Pause, 
  RotateCcw,
  Compass
} from 'lucide-react';
import { ToolExecutor } from '../services/tools/executor';

interface ToolCardProps {
  result: ToolExecutionResult | null;
  activeTimer: ActiveTimer | null;
  onClearTimer: () => void;
}

export const ToolCard: React.FC<ToolCardProps> = ({ result, activeTimer, onClearTimer }) => {
  const [copied, setCopied] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);

  useEffect(() => {
    if (activeTimer) {
      setTimerSeconds(activeTimer.remainingSeconds);
      setIsTimerPaused(false);
    }
  }, [activeTimer]);

  // Live timer tick
  useEffect(() => {
    if (!activeTimer || isTimerPaused || timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          ToolExecutor.triggerAlarmSound(activeTimer.label);
          return 0;
        }
        return prev - 1;
      });
    } , 1000);

    return () => clearInterval(interval);
  }, [activeTimer, isTimerPaused, timerSeconds]);

  if (!result && !activeTimer) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimerDisplay = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-sm mx-auto glass-panel rounded-2xl p-4 shadow-2xl transition-all duration-300 border border-slate-700/50">
      {/* 1. Active Timer View */}
      {activeTimer && (
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-between w-full mb-2">
            <div className="flex items-center gap-2 text-cyan-400">
              <TimerIcon className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-wide uppercase">Timer Active</span>
            </div>
            <button 
              onClick={onClearTimer}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Dismiss
            </button>
          </div>

          <div className="my-3 text-4xl font-mono font-bold text-white tracking-wider">
            {formatTimerDisplay(timerSeconds)}
          </div>
          <div className="text-xs text-slate-400 mb-3">{activeTimer.label}</div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTimerPaused(!isTimerPaused)}
              className="p-2.5 rounded-full bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              {isTimerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setTimerSeconds(activeTimer.durationSeconds)}
              className="p-2.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Tool Execution Result View */}
      {result && result.tool !== 'none' && (
        <div className={activeTimer ? 'mt-4 pt-4 border-t border-slate-800' : ''}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {result.tool === 'set_alarm' && <AlarmClock className="w-4 h-4 text-purple-400" />}
              {result.tool === 'start_timer' && <TimerIcon className="w-4 h-4 text-cyan-400" />}
              {result.tool === 'create_note' && <FileText className="w-4 h-4 text-emerald-400" />}
              {result.tool === 'get_weather' && <CloudSun className="w-4 h-4 text-amber-400" />}
              {result.tool === 'open_app' && <ExternalLink className="w-4 h-4 text-blue-400" />}
              {result.tool === 'get_information' && <Compass className="w-4 h-4 text-indigo-400" />}
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {result.tool.replace('_', ' ')}
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs">
              {result.success ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Done
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Failed
                </span>
              )}
            </div>
          </div>

          {/* Alarm Details */}
          {result.tool === 'set_alarm' && result.data && (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-purple-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {result.data.displayTime || result.data.time}
                  </div>
                  <div className="text-xs text-slate-400">{result.data.label}</div>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium">
                  Active
                </div>
              </div>
            </div>
          )}

          {/* Note Details */}
          {result.tool === 'create_note' && result.data && (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-sm font-semibold text-white truncate">{result.data.title}</div>
                <button
                  onClick={() => copyToClipboard(result.data.content)}
                  className="text-slate-400 hover:text-emerald-300 p-1"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                {result.data.content}
              </p>
            </div>
          )}

          {/* Weather Details */}
          {result.tool === 'get_weather' && result.data && (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">{result.data.city}</div>
                  <div className="text-2xl font-bold text-white mt-0.5">
                    {result.data.temperature}°C
                  </div>
                  <div className="text-xs text-amber-300 mt-0.5">{result.data.condition}</div>
                </div>
                <div className="text-right text-xs text-slate-400 space-y-1">
                  <div>Wind: {result.data.windSpeed} km/h</div>
                  {result.data.humidity && <div>Humidity: {result.data.humidity}%</div>}
                </div>
              </div>
            </div>
          )}

          {/* Open App Details */}
          {result.tool === 'open_app' && result.data && (
            <div className="bg-slate-900/60 rounded-xl p-3 border border-blue-500/20 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{result.data.appName}</div>
                {result.data.query && <div className="text-xs text-slate-400">"{result.data.query}"</div>}
              </div>
              <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium">
                Launched
              </div>
            </div>
          )}

          {/* Intent / Launch Button for mobile devices */}
          {result.intentUrl && (
            <div className="mt-2.5 flex justify-end">
              <a
                href={result.intentUrl}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors"
              >
                <span>Trigger Native Intent</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
