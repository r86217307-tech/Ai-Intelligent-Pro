/**
 * PHASE 14 — TOOL PERMISSION MANAGER
 * Enforces strict safety and permission rules for action execution.
 */

import { ToolDefinition, PermissionLevel } from './toolTypes';

export class ToolPermissionManager {
  private static instance: ToolPermissionManager;

  private constructor() {}

  public static getInstance(): ToolPermissionManager {
    if (!ToolPermissionManager.instance) {
      ToolPermissionManager.instance = new ToolPermissionManager();
    }
    return ToolPermissionManager.instance;
  }

  /**
   * Evaluates if a tool can be executed and whether it requires confirmation.
   */
  public evaluatePermission(tool: ToolDefinition): {
    canExecute: boolean;
    requiresConfirmation: boolean;
    reason?: string;
  } {
    if (tool.permissionLevel === 'FORBIDDEN') {
      return {
        canExecute: false,
        requiresConfirmation: false,
        reason: `Execution of tool ${tool.toolId} is permanently forbidden.`,
      };
    }

    if (tool.permissionLevel === 'CONFIRMATION_REQUIRED' || tool.requiresConfirmation) {
      return {
        canExecute: true,
        requiresConfirmation: true,
        reason: 'Requires explicit user confirmation before execution.',
      };
    }

    return {
      canExecute: true,
      requiresConfirmation: false,
    };
  }

  /**
   * Specialized check for trading actions.
   * Ensures Sufia NEVER executes real trades automatically.
   */
  public isTradingExecutionSafe(toolId: string): boolean {
    if (toolId.includes('EXECUTE_TRADE') || toolId.includes('BUY') || toolId.includes('SELL')) {
      return false; // Real money execution is explicitly forbidden.
    }
    return true; // Analysis is fine.
  }
}

export const toolPermissionManager = ToolPermissionManager.getInstance();
