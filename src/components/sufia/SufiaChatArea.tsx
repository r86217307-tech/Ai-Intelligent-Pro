import React, { useRef, useEffect } from 'react';
import { useAssistant } from '../../lib/voice/AssistantProvider';

export default function SufiaChatArea() {
  const { messages } = useAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-2 space-y-4 scroll-smooth"
    >
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-center opacity-50">
          <p className="text-sm font-medium">Hello. I am Sufia.<br/>How can I help you today?</p>
        </div>
      ) : (
        messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user' 
                  ? 'bg-primary text-white rounded-br-sm' 
                  : msg.role === 'system'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 text-center mx-auto'
                  : 'bg-surface-light text-gray-200 border border-white/5 rounded-bl-sm shadow-[0_4px_15px_rgba(0,0,0,0.2)]'
              }`}
            >
              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
