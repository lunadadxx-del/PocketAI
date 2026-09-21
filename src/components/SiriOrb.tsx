import React, { useEffect, useRef } from 'react';
import { AgentState } from '../types';
import { TtsService } from '../services/tts';
import { SttService } from '../services/stt';

interface SiriOrbProps {
  state: AgentState;
  onClick: () => void;
  audioLevel?: number; // 0 to 1 for mic volume
}

export const SiriOrb: React.FC<SiriOrbProps> = ({ state, onClick, audioLevel = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = 280);
    let height = (canvas.height = 280);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      phaseRef.current += 0.04;
      const phase = phaseRef.current;

      const centerX = width / 2;
      const centerY = height / 2;

      // Base radius & pulsation
      let baseRadius = 65;
      let waveCount = 4;
      let colors = ['rgba(56, 189, 248, 0.4)', 'rgba(168, 85, 247, 0.35)', 'rgba(236, 72, 153, 0.3)'];

      // Adjust animation based on state
      if (state === 'listening') {
        baseRadius = 65 + audioLevel * 35;
        colors = ['rgba(6, 182, 212, 0.6)', 'rgba(56, 189, 248, 0.5)', 'rgba(168, 85, 247, 0.4)'];
      } else if (state === 'thinking') {
        baseRadius = 65 + Math.sin(phase * 2) * 8;
        colors = ['rgba(168, 85, 247, 0.6)', 'rgba(236, 72, 153, 0.5)', 'rgba(129, 140, 248, 0.5)'];
      } else if (state === 'executing') {
        baseRadius = 70 + Math.cos(phase * 1.5) * 6;
        colors = ['rgba(16, 185, 129, 0.6)', 'rgba(6, 182, 212, 0.5)', 'rgba(56, 189, 248, 0.4)'];
      } else if (state === 'speaking') {
        // Read from TTS Analyser
        const analyser = TtsService.getAnalyser();
        let freqAvg = 0;
        if (analyser) {
          const buffer = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < 32; i++) sum += buffer[i];
          freqAvg = sum / 32 / 255;
        } else {
          freqAvg = 0.3 + Math.sin(phase * 3) * 0.2;
        }
        baseRadius = 65 + freqAvg * 40;
        colors = ['rgba(236, 72, 153, 0.6)', 'rgba(168, 85, 247, 0.6)', 'rgba(56, 189, 248, 0.5)'];
      }

      // Draw multi-layered organic fluid wave circles
      for (let i = 0; i < waveCount; i++) {
        ctx.beginPath();
        const wavePhase = phase + (i * Math.PI) / 2;
        const color = colors[i % colors.length];

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        const points = 36;
        for (let p = 0; p <= points; p++) {
          const angle = (p / points) * Math.PI * 2;
          const waveDeform = Math.sin(angle * 3 + wavePhase) * (8 + (state === 'speaking' || state === 'listening' ? 12 : 4));
          const r = baseRadius + waveDeform + i * 4;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (p === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Core Glowing Sphere
      const grad = ctx.createRadialGradient(centerX - 15, centerY - 15, 10, centerX, centerY, baseRadius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, state === 'executing' ? '#34d399' : '#38bdf8');
      grad.addColorStop(0.7, state === 'thinking' ? '#ec4899' : '#a855f7');
      grad.addColorStop(1, 'rgba(13, 17, 29, 0.8)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = state === 'speaking' ? '#ec4899' : '#38bdf8';
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [state, audioLevel]);

  return (
    <div 
      className="relative flex flex-col items-center justify-center cursor-pointer group select-none"
      onClick={onClick}
    >
      {/* Outer ambient glow */}
      <div 
        className={`absolute w-72 h-72 rounded-full transition-all duration-700 pointer-events-none blur-3xl ${
          state === 'listening' 
            ? 'bg-cyan-500/25 scale-110' 
            : state === 'speaking' 
            ? 'bg-pink-500/30 scale-120' 
            : state === 'thinking'
            ? 'bg-purple-500/30 scale-105'
            : state === 'executing'
            ? 'bg-emerald-500/30 scale-110'
            : 'bg-blue-600/15 scale-90 group-hover:scale-100'
        }`}
      />

      {/* Fluid Canvas */}
      <canvas 
        ref={canvasRef} 
        className="w-[280px] h-[280px] z-10 transition-transform duration-300 transform group-active:scale-95" 
      />

      {/* State label badge */}
      <div className="z-20 mt-2 px-4 py-1 rounded-full text-xs font-semibold tracking-wider uppercase glass-pill transition-all duration-300">
        {state === 'listening' && (
          <span className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            Listening...
          </span>
        )}
        {state === 'thinking' && (
          <span className="flex items-center gap-1.5 text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            Pocket AI Reasoning...
          </span>
        )}
        {state === 'executing' && (
          <span className="flex items-center gap-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
            Performing Action...
          </span>
        )}
        {state === 'speaking' && (
          <span className="flex items-center gap-1.5 text-pink-300">
            <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
            Speaking...
          </span>
        )}
        {state === 'awaiting_confirmation' && (
          <span className="flex items-center gap-1.5 text-amber-300">
            Awaiting Confirmation
          </span>
        )}
        {state === 'error' && (
          <span className="text-rose-400">Tap to Retry</span>
        )}
        {state === 'idle' && (
          <span className="text-slate-400 group-hover:text-slate-200">
            Tap to Speak
          </span>
        )}
      </div>
    </div>
  );
};
