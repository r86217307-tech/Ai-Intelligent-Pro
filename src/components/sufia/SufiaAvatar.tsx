import React from 'react';
import { useAssistant } from '../../lib/voice/AssistantProvider';

export default function SufiaAvatar() {
  const { state } = useAssistant();
  
  // Subtle premium animations depending on state
  const getAvatarAnimation = () => {
    switch (state) {
      case 'LISTENING':
        return 'shadow-[0_0_20px_rgba(139,92,246,0.3)] border-primary/50';
      case 'USER_SPEAKING':
        return 'animate-pulse shadow-[0_0_30px_rgba(139,92,246,0.8)] border-primary scale-105';
      case 'PROCESSING':
        return 'animate-bounce shadow-[0_0_15px_rgba(59,130,246,0.5)] border-blue-500';
      case 'SPEAKING':
        return 'shadow-[0_0_25px_rgba(16,185,129,0.5)] border-emerald-500 scale-105';
      case 'INTERRUPTED':
        return 'shadow-[0_0_15px_rgba(245,158,11,0.5)] border-amber-500 scale-95';
      case 'ERROR':
        return 'shadow-[0_0_15px_rgba(239,68,68,0.5)] border-red-500';
      case 'IDLE':
      default:
        return 'shadow-[0_0_10px_rgba(255,255,255,0.05)] border-white/10';
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'LISTENING': return 'Listening...';
      case 'USER_SPEAKING': return 'Hearing you...';
      case 'PROCESSING': return 'Thinking...';
      case 'SPEAKING': return 'Speaking...';
      case 'INTERRUPTED': return 'Interrupted';
      case 'ERROR': return 'Error';
      case 'IDLE': return 'Idle';
      default: return 'Online';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 my-8">
      <div className={`relative w-24 h-24 rounded-full bg-gradient-to-tr from-surface to-surface-light border-2 transition-all duration-500 flex items-center justify-center ${getAvatarAnimation()}`}>
        {/* Core AI visual representation */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-blue-500 opacity-80 blur-[2px] animate-pulse"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-black text-2xl tracking-widest text-white/90">SUFIA</span>
        </div>
        
        {/* Orbiting particles for visual flair during processing/speaking */}
        {state === 'PROCESSING' && (
          <div className="absolute inset-0 rounded-full border-t-2 border-blue-400 animate-spin"></div>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${state === 'ERROR' ? 'bg-red-500' : state === 'IDLE' ? 'bg-white/40' : 'bg-primary animate-pulse'}`}></div>
        <span className="text-xs font-semibold tracking-wider text-text-muted uppercase">
          {getStatusText()}
        </span>
      </div>
    </div>
  );
}
