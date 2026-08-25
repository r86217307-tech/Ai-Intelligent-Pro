import React, { useState } from 'react';
import { useAssistant } from '../../lib/voice/AssistantProvider';
import { Send, Mic, Square } from 'lucide-react';

export default function SufiaInputArea() {
  const { state, sendMessage, toggleVoiceListening, interrupt } = useAssistant();
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      sendMessage(text);
      setText('');
    }
  };

  const isSpeaking = state === 'SPEAKING';
  const isListening = state === 'LISTENING' || state === 'USER_SPEAKING';
  const isProcessing = state === 'PROCESSING';

  return (
    <div className="p-4 bg-surface/80 backdrop-blur-md border-t border-white/5">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-4xl mx-auto">
        <button
          type="button"
          onClick={isSpeaking ? interrupt : toggleVoiceListening}
          disabled={isProcessing}
          className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isSpeaking 
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
              : isListening 
              ? 'bg-primary text-white shadow-[0_0_15px_rgba(139,92,246,0.6)] animate-pulse'
              : 'bg-surface-light text-text-muted hover:text-white hover:bg-white/10'
          }`}
        >
          {isSpeaking ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
        </button>

        <div className="flex-1 relative">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isListening ? "Listening..." : "Type a message..."}
            disabled={isListening || isProcessing}
            className="w-full bg-surface-light border border-white/10 rounded-full px-5 py-3.5 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!text.trim() || isListening || isProcessing}
          className="shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary transition-colors"
        >
          <Send className="w-5 h-5 ml-0.5" />
        </button>
      </form>
    </div>
  );
}
