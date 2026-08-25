import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AssistantState, ConnectionState, ChatMessage, AssistantSettings } from './types';
import { voiceManager } from './voiceManager';
import { conversationManager, taskStateManager } from '../conversation/conversationManager';
import { visionManager, VisionState } from '../vision/visionManager';
import { ScreenShareState } from '../vision/screenShareManager';
import { actionManager } from '../actions/actionManager';

interface AssistantContextValue {
  state: AssistantState;
  connectionState: ConnectionState;
  messages: ChatMessage[];
  settings: AssistantSettings;
  updateSettings: (newSettings: Partial<AssistantSettings>) => void;
  sendMessage: (text: string) => Promise<void>;
  toggleVoiceListening: () => void;
  interrupt: () => void;
  clearHistory: () => void;
  // Vision & Screen Share
  isScreenSharing: boolean;
  screenShareStatus: ScreenShareState;
  isScreenShareSupported: boolean;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => void;
  captureAndSendFrame: () => boolean;
}

const defaultSettings: AssistantSettings = {
  voiceEnabled: true,
  voiceLanguage: 'en-US',
  voiceSpeed: 1.0,
  voiceVolume: 1.0,
  continuousListening: false,
  autoListening: false,
  interruptEnabled: true,
  soundEffects: true,
  theme: 'dark'
};

const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AssistantState>('IDLE');
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [visionState, setVisionState] = useState<VisionState>(() => visionManager.getState());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<AssistantSettings>(() => {
    try {
      const saved = localStorage.getItem('sufia_settings');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const addMessage = useCallback((msg: ChatMessage) => {
    conversationManager.addMessage(msg);
    setMessages([...conversationManager.getContext()]);
  }, []);

  useEffect(() => {
    localStorage.setItem('sufia_settings', JSON.stringify(settings));
    voiceManager.setContinuousMode(settings.continuousListening);
  }, [settings]);

  useEffect(() => {
    let mounted = true;
    
    // Connect vision callbacks
    visionManager.onStateChange = (vState) => {
      if (mounted) {
        setVisionState({ ...vState });
        if (vState.error) {
          addMessage({
            id: Date.now().toString(),
            role: 'system',
            content: vState.error,
            timestamp: Date.now(),
          });
        }
      }
    };

    // Connect voice callbacks
    voiceManager.onStateChange = (s) => { if (mounted) setState(s); };
    voiceManager.onConnectionChange = (c) => { if (mounted) setConnectionState(c); };
    voiceManager.onTextReceived = (text) => {
      if (mounted) {
        addMessage({
          id: Date.now().toString() + Math.random(),
          role: 'assistant',
          content: text,
          timestamp: Date.now()
        });
      }
    };
    voiceManager.onError = (err) => {
      if (mounted) {
        addMessage({
          id: Date.now().toString(),
          role: 'system',
          content: err,
          timestamp: Date.now()
        });
      }
    };

    // Initialize connection
    voiceManager.initialize().then(() => {
      if (mounted) {
        addMessage({
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Hello, I am Sufia. I am now ready for real-time conversation. You can speak to me or share your screen.',
          timestamp: Date.now()
        });
      }
    });

    return () => { 
      mounted = false; 
    };
  }, [addMessage]);

  const updateSettings = useCallback((newSettings: Partial<AssistantSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const interrupt = useCallback(() => {
    voiceManager.stopSpeaking();
    conversationManager.handleInterrupt();
  }, []);

  const startScreenShare = useCallback(async () => {
    const success = await visionManager.startScreenShare();
    if (success) {
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: 'Screen sharing started. Sufia can now see your screen.',
        timestamp: Date.now()
      });
    }
    return success;
  }, [addMessage]);

  const stopScreenShare = useCallback(() => {
    visionManager.stopScreenShare();
    addMessage({
      id: Date.now().toString(),
      role: 'system',
      content: 'Screen sharing stopped.',
      timestamp: Date.now()
    });
  }, [addMessage]);

  const captureAndSendFrame = useCallback(() => {
    return visionManager.captureAndSendNow();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    interrupt(); // Stop current speech if any

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    addMessage(userMsg);

    // Check for high/medium confidence actionable commands
    const actionReq = actionManager.parseIntent(text, conversationManager.getCurrentTurnId());
    if (actionReq && (actionReq.confidence === 'HIGH' || actionReq.confidence === 'MEDIUM')) {
      taskStateManager.startTask(actionReq.type, conversationManager.getCurrentTurnId(), {
        description: actionReq.originalUtterance,
      });
      taskStateManager.setProcessing();

      const result = await actionManager.executeAction(actionReq);

      if (result.status === 'COMPLETED') {
        taskStateManager.completeTask(result.message);
      } else if (result.status === 'CANCELLED') {
        taskStateManager.cancelTask(result.message);
      } else if (result.status === 'CONFIRMATION_REQUIRED') {
        // Pending user confirmation
      } else if (result.status === 'UNSUPPORTED' || result.status === 'FAILED') {
        taskStateManager.failTask(result.message);
      }

      addMessage({
        id: Date.now().toString() + '_action',
        role: 'assistant',
        content: result.spokenResponse,
        timestamp: Date.now(),
      });
      return;
    }
    
    voiceManager.sendText(text);
  }, [addMessage, interrupt]);

  const toggleVoiceListening = useCallback(() => {
    if (state === 'LISTENING' || state === 'USER_SPEAKING') {
      voiceManager.stopListening(true);
    } else {
      interrupt();
      voiceManager.startListening();
    }
  }, [state, interrupt]);

  const clearHistory = useCallback(() => {
    conversationManager.clear();
    setMessages([]);
    setState('IDLE');
  }, []);

  return (
    <AssistantContext.Provider value={{
      state,
      connectionState,
      messages,
      settings,
      updateSettings,
      sendMessage,
      toggleVoiceListening,
      interrupt,
      clearHistory,
      isScreenSharing: visionState.screenShareActive,
      screenShareStatus: visionState.status,
      isScreenShareSupported: visionManager.isScreenShareSupported(),
      startScreenShare,
      stopScreenShare,
      captureAndSendFrame,
    }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error('useAssistant must be used within an AssistantProvider');
  return context;
}
