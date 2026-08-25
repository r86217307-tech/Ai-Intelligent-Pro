import React from 'react';
import { useAssistant } from '../../lib/voice/AssistantProvider';
import { Settings, Mic, X, Repeat } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function SufiaSettings({ onClose }: Props) {
  const { settings, updateSettings } = useAssistant();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-white">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Assistant Settings
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          {/* Voice Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Voice Interaction</h3>
            
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Continuous Mode</div>
                  <div className="text-xs text-gray-400">Keep microphone active between turns</div>
                </div>
              </div>
              <div className={`w-12 h-7 rounded-full p-1 transition-colors ${settings.continuousListening ? 'bg-blue-500' : 'bg-gray-700'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${settings.continuousListening ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={settings.continuousListening} 
                onChange={(e) => updateSettings({ continuousListening: e.target.checked })} 
              />
            </label>
          </div>
        </div>
        
        <div className="p-4 border-t border-white/5 bg-black/20">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
