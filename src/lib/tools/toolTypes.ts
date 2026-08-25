/**
 * PHASE 14 — TOOL INTELLIGENCE TYPES
 */

export type ToolCategory =
  | 'GENERAL'
  | 'CONVERSATION'
  | 'VISION'
  | 'TRADING'
  | 'FOREX_NEWS'
  | 'SETTINGS'
  | 'MEMORY'
  | 'NAVIGATION'
  | 'SYSTEM';

export type PermissionLevel = 'SAFE' | 'CONFIRMATION_REQUIRED' | 'FORBIDDEN';

export type ActionState =
  | 'IDLE'
  | 'UNDERSTANDING'
  | 'PLANNING'
  | 'WAITING_FOR_CONFIRMATION'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ToolDefinition {
  toolId: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: any; // e.g. JSON schema or Zod, using any for simplicity here
  outputSchema: any;
  permissionLevel: PermissionLevel;
  requiresConfirmation: boolean;
  supportsCancellation: boolean;
  timeoutMs: number;
  maxRetries: number;
  isIdempotent: boolean;
}

export interface ActionPlanStep {
  stepId: string;
  toolId: string;
  parameters: Record<string, any>;
  description: string;
}

export interface ActionPlan {
  planId: string;
  intent: string;
  steps: ActionPlanStep[];
}

export interface ToolExecutionResult {
  success: boolean;
  toolId: string;
  resultData?: any;
  errorMessage?: string;
  verified: boolean;
  timestamp: number;
}
