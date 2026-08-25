export type AssistantState = 'IDLE' | 'LISTENING' | 'USER_SPEAKING' | 'PROCESSING' | 'SPEAKING' | 'INTERRUPTED' | 'ERROR';
export type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'FAILED';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  turnId?: number;
  visualMeta?: any;
}

export interface AssistantSettings {
  voiceEnabled: boolean;
  voiceLanguage: string;
  voiceSpeed: number;
  voiceVolume: number;
  continuousListening: boolean;
  autoListening: boolean;
  interruptEnabled: boolean;
  soundEffects: boolean;
  theme: 'dark' | 'light' | 'system';
}

export interface MultimodalInput {
  type: 'TEXT' | 'VOICE' | 'SCREEN' | 'IMAGE' | 'SYSTEM';
  payload: any;
}
