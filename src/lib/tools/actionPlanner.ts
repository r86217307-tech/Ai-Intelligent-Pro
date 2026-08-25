/**
 * PHASE 14 — ACTION PLANNER
 * State machine and execution orchestrator for tools.
 */

import { ActionState, ToolDefinition, ToolExecutionResult } from './toolTypes';
import { toolPermissionManager } from './toolPermissionManager';
import { actionVerifier } from './actionVerifier';
import { memoryManager } from '../memory/memoryManager';

// Temporary mock executions for standard systems (Trading, News)
import { sufiaTradingBridge } from '../trading/sufiaTradingBridge';
import { newsManager } from '../news/newsManager';

export class ActionPlanner {
  private static instance: ActionPlanner;
  
  private activeState: ActionState = 'IDLE';
  private currentToolId: string | null = null;
  private pendingResolve: ((result: ToolExecutionResult) => void) | null = null;

  private constructor() {}

  public static getInstance(): ActionPlanner {
    if (!ActionPlanner.instance) {
      ActionPlanner.instance = new ActionPlanner();
    }
    return ActionPlanner.instance;
  }

  public getState(): ActionState {
    return this.activeState;
  }

  public cancelActiveTask() {
    if (this.activeState !== 'IDLE' && this.activeState !== 'COMPLETED' && this.activeState !== 'FAILED' && this.activeState !== 'CANCELLED') {
      this.activeState = 'CANCELLED';
      if (this.pendingResolve) {
        this.pendingResolve({
          success: false,
          toolId: this.currentToolId || 'UNKNOWN',
          verified: false,
          errorMessage: 'Task cancelled by user.',
          timestamp: Date.now(),
        });
        this.pendingResolve = null;
      }
      this.currentToolId = null;
    }
  }

  public async executeTool(tool: ToolDefinition, parameters: Record<string, any> = {}): Promise<ToolExecutionResult> {
    // 1. Duplicate & Conflict Protection
    if (this.activeState === 'EXECUTING') {
      return {
        success: false,
        toolId: tool.toolId,
        verified: false,
        errorMessage: 'Another action is currently executing.',
        timestamp: Date.now(),
      };
    }

    this.activeState = 'PLANNING';
    this.currentToolId = tool.toolId;

    // 2. Permission Check
    const perm = toolPermissionManager.evaluatePermission(tool);
    if (!perm.canExecute) {
      this.activeState = 'FAILED';
      this.currentToolId = null;
      return {
        success: false,
        toolId: tool.toolId,
        verified: false,
        errorMessage: perm.reason || 'Permission denied.',
        timestamp: Date.now(),
      };
    }

    if (perm.requiresConfirmation) {
      this.activeState = 'WAITING_FOR_CONFIRMATION';
      // In a real system, we'd pause here. For simplicity in this mock, we'll fail if confirmation is not provided beforehand.
      // We will pretend confirmation failed for now if it requires it, unless we build a full async UI wait.
      this.activeState = 'FAILED';
      this.currentToolId = null;
      return {
        success: false,
        toolId: tool.toolId,
        verified: false,
        errorMessage: 'Confirmation required but not provided.',
        timestamp: Date.now(),
      };
    }

    // 3. Execution
    this.activeState = 'EXECUTING';
    
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      
      const timeoutId = setTimeout(() => {
        if (this.activeState === 'EXECUTING') {
          this.activeState = 'FAILED';
          this.currentToolId = null;
          this.pendingResolve = null;
          resolve({
            success: false,
            toolId: tool.toolId,
            verified: false,
            errorMessage: 'Task timed out.',
            timestamp: Date.now(),
          });
        }
      }, tool.timeoutMs);

      // Async Execution Wrapper
      this.runToolLogic(tool, parameters)
        .then(rawResult => {
          clearTimeout(timeoutId);
          if (this.activeState === 'CANCELLED') return; // Handled by cancelActiveTask

          // 4. Verification
          this.activeState = 'VERIFYING';
          const finalResult = actionVerifier.verify(rawResult);

          this.activeState = finalResult.success ? 'COMPLETED' : 'FAILED';
          this.currentToolId = null;
          this.pendingResolve = null;
          resolve(finalResult);
        })
        .catch(err => {
          clearTimeout(timeoutId);
          if (this.activeState === 'CANCELLED') return;
          
          this.activeState = 'FAILED';
          this.currentToolId = null;
          this.pendingResolve = null;
          resolve({
            success: false,
            toolId: tool.toolId,
            verified: false,
            errorMessage: err.message,
            timestamp: Date.now(),
          });
        });
    });
  }

  private async runToolLogic(tool: ToolDefinition, parameters: Record<string, any>): Promise<Omit<ToolExecutionResult, 'verified' | 'timestamp'>> {
    try {
      // Mocking actual integrations
      switch (tool.toolId) {
        case 'TRADING_ANALYZE_CHART':
          // Using existing sufiaTradingBridge
          const analysis = sufiaTradingBridge.getLatestAnalysis();
          return { success: true, toolId: tool.toolId, resultData: analysis };
          
        case 'FOREX_NEWS_CHECK':
          const news = await newsManager.getHighImpactEvents();
          return { success: true, toolId: tool.toolId, resultData: news };
          
        case 'CANCEL_ACTIVE_TASK':
          this.cancelActiveTask(); // This cancels others, but for itself it's just a success
          return { success: true, toolId: tool.toolId };

        case 'OPEN_SETTINGS':
          // Mock navigation
          if (typeof window !== 'undefined') {
             window.location.hash = '#settings';
          }
          return { success: true, toolId: tool.toolId };
          
        case 'CLEAR_MEMORY':
           memoryManager.clearAllMemories();
           return { success: true, toolId: tool.toolId };

        case 'EXECUTE_TRADE':
          return { success: false, toolId: tool.toolId, errorMessage: 'Real money trading is explicitly forbidden.' };

        default:
          return { success: false, toolId: tool.toolId, errorMessage: 'Tool logic not implemented.' };
      }
    } catch (e: any) {
      return { success: false, toolId: tool.toolId, errorMessage: e.message };
    }
  }
}

export const actionPlanner = ActionPlanner.getInstance();
