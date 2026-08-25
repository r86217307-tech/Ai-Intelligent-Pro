/**
 * PHASE 14 — ACTION VERIFIER
 * Ensures an action actually completed successfully before Sufia reports it.
 */

import { ToolExecutionResult } from './toolTypes';

export class ActionVerifier {
  private static instance: ActionVerifier;

  private constructor() {}

  public static getInstance(): ActionVerifier {
    if (!ActionVerifier.instance) {
      ActionVerifier.instance = new ActionVerifier();
    }
    return ActionVerifier.instance;
  }

  public verify(result: Omit<ToolExecutionResult, 'verified' | 'timestamp'>): ToolExecutionResult {
    // If the tool execution threw an error or marked success=false
    if (!result.success) {
      return {
        ...result,
        verified: false,
        timestamp: Date.now(),
      };
    }

    // In a real system, we might double-check application state here.
    // For now, if success is true, we consider it verified.
    return {
      ...result,
      verified: true,
      timestamp: Date.now(),
    };
  }
}

export const actionVerifier = ActionVerifier.getInstance();
