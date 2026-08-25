export type ActionCategory = 
  | 'NAVIGATION'
  | 'ANALYZER'
  | 'TRADING'
  | 'FOREX_NEWS'
  | 'HISTORY'
  | 'SETTINGS'
  | 'SUFIA'
  | 'UI_CONTROL';

export type ActionConfirmationLevel = 'SAFE' | 'CONFIRM_REQUIRED' | 'UNSUPPORTED';

export type ActionIntentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ActionStatus = 
  | 'PENDING'
  | 'CONFIRMATION_REQUIRED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNSUPPORTED';

export type ActionType = 
  | 'OPEN_DASHBOARD'
  | 'OPEN_SUFIA'
  | 'OPEN_ANALYZER'
  | 'OPEN_TRADING'
  | 'OPEN_NEWS'
  | 'OPEN_TEST_MODE'
  | 'OPEN_HISTORY'
  | 'OPEN_SETTINGS'
  | 'CLEAR_HISTORY_REQUEST'
  | 'CLEAR_HISTORY_CONFIRMED'
  | 'TRIGGER_CHART_ANALYSIS'
  | 'QUERY_NEWS_SIGNAL'
  | 'START_VISION'
  | 'STOP_VISION'
  | 'TOGGLE_VOICE_LISTENING'
  | 'CANCEL_ACTIVE_TASK'
  | 'GO_BACK'
  | 'SCROLL_TO_TOP'
  | 'UNSUPPORTED_TRADE_EXECUTION'
  | 'UNKNOWN_ACTION';

export interface ActionDefinition {
  type: ActionType;
  category: ActionCategory;
  confirmationLevel: ActionConfirmationLevel;
  description: string;
  routeTarget?: string;
}

export interface ActionRequest {
  actionId: string;
  type: ActionType;
  confidence: ActionIntentConfidence;
  originalUtterance: string;
  parameters?: Record<string, any>;
  turnId?: number;
  timestamp: number;
}

export interface ActionResult {
  success: boolean;
  actionId: string;
  type: ActionType;
  status: ActionStatus;
  message: string;
  spokenResponse: string;
  errorCode?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  data?: any;
  timestamp: number;
}
