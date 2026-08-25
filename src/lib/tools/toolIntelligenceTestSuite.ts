/**
 * PHASE 14 — TOOL INTELLIGENCE TEST SUITE
 * Verifies routing, permission, execution, and security rules.
 */

import { toolRouter } from './toolRouter';
import { toolPermissionManager } from './toolPermissionManager';
import { actionPlanner } from './actionPlanner';
import { toolRegistry } from './toolRegistry';

export interface ToolTestCaseResult {
  id: string;
  name: string;
  category: 'ROUTING' | 'PERMISSION' | 'EXECUTION' | 'SECURITY';
  passed: boolean;
  expectedBehavior: string;
  actualOutput: string;
}

export class ToolIntelligenceTestSuite {
  public async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: ToolTestCaseResult[];
  }> {
    const results: ToolTestCaseResult[] = [];

    // ROUTING
    results.push(this.testRoutingTrading());
    results.push(this.testRoutingNews());
    results.push(this.testRoutingCancellation());
    
    // PERMISSION & SECURITY
    results.push(this.testPermissionSafe());
    results.push(this.testPermissionForbiddenTrading());
    results.push(this.testPermissionConfirmation());

    // EXECUTION
    results.push(await this.testExecutionSuccess());
    results.push(await this.testExecutionCancellation());
    results.push(await this.testDuplicateProtection());

    const passed = results.filter(r => r.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };
  }

  private testRoutingTrading(): ToolTestCaseResult {
    const res = toolRouter.routeIntent('এই chartটা analyze করো');
    const passed = res.tool?.toolId === 'TRADING_ANALYZE_CHART';
    return {
      id: 'TC-14-01',
      name: 'Route Intent: Trading Analysis',
      category: 'ROUTING',
      passed,
      expectedBehavior: 'Routes to TRADING_ANALYZE_CHART',
      actualOutput: res.tool?.toolId || 'UNKNOWN',
    };
  }

  private testRoutingNews(): ToolTestCaseResult {
    const res = toolRouter.routeIntent('আজকে news আছে?');
    const passed = res.tool?.toolId === 'FOREX_NEWS_CHECK';
    return {
      id: 'TC-14-02',
      name: 'Route Intent: Forex News',
      category: 'ROUTING',
      passed,
      expectedBehavior: 'Routes to FOREX_NEWS_CHECK',
      actualOutput: res.tool?.toolId || 'UNKNOWN',
    };
  }

  private testRoutingCancellation(): ToolTestCaseResult {
    const res = toolRouter.routeIntent('বন্ধ করো');
    const passed = res.tool?.toolId === 'CANCEL_ACTIVE_TASK';
    return {
      id: 'TC-14-03',
      name: 'Route Intent: Cancel Active Task',
      category: 'ROUTING',
      passed,
      expectedBehavior: 'Routes to CANCEL_ACTIVE_TASK',
      actualOutput: res.tool?.toolId || 'UNKNOWN',
    };
  }

  private testPermissionSafe(): ToolTestCaseResult {
    const tool = toolRegistry.getTool('FOREX_NEWS_CHECK')!;
    const perm = toolPermissionManager.evaluatePermission(tool);
    const passed = perm.canExecute && !perm.requiresConfirmation;
    return {
      id: 'TC-14-04',
      name: 'Permission: Safe Action',
      category: 'PERMISSION',
      passed,
      expectedBehavior: 'Can execute safely without confirmation',
      actualOutput: `canExecute: ${perm.canExecute}, requiresConfirmation: ${perm.requiresConfirmation}`,
    };
  }

  private testPermissionForbiddenTrading(): ToolTestCaseResult {
    const tool = toolRegistry.getTool('EXECUTE_TRADE')!;
    const perm = toolPermissionManager.evaluatePermission(tool);
    const safeTradingCheck = toolPermissionManager.isTradingExecutionSafe(tool.toolId);
    const passed = !perm.canExecute || !safeTradingCheck;
    return {
      id: 'TC-14-05',
      name: 'Permission: Real Money Trading Forbidden',
      category: 'SECURITY',
      passed,
      expectedBehavior: 'Real money execution is strictly forbidden',
      actualOutput: `canExecute: ${perm.canExecute}, safeTradingCheck: ${safeTradingCheck}`,
    };
  }
  
  private testPermissionConfirmation(): ToolTestCaseResult {
    const tool = toolRegistry.getTool('CLEAR_MEMORY')!;
    const perm = toolPermissionManager.evaluatePermission(tool);
    const passed = perm.requiresConfirmation;
    return {
      id: 'TC-14-06',
      name: 'Permission: Requires Confirmation',
      category: 'PERMISSION',
      passed,
      expectedBehavior: 'Requires confirmation',
      actualOutput: `requiresConfirmation: ${perm.requiresConfirmation}`,
    };
  }

  private async testExecutionSuccess(): Promise<ToolTestCaseResult> {
    const tool = toolRegistry.getTool('FOREX_NEWS_CHECK')!;
    const res = await actionPlanner.executeTool(tool);
    const passed = res.success && res.verified;
    return {
      id: 'TC-14-07',
      name: 'Execution: Success & Verified',
      category: 'EXECUTION',
      passed,
      expectedBehavior: 'Tool executes successfully and verification passes',
      actualOutput: `success: ${res.success}, verified: ${res.verified}`,
    };
  }

  private async testExecutionCancellation(): Promise<ToolTestCaseResult> {
    const tool = toolRegistry.getTool('FOREX_NEWS_CHECK')!;
    tool.timeoutMs = 5000; // Give it time to be cancelled
    
    // Start but immediately cancel
    const execPromise = actionPlanner.executeTool(tool);
    actionPlanner.cancelActiveTask();
    const res = await execPromise;
    
    const passed = res.success === false && res.errorMessage?.includes('cancelled');
    return {
      id: 'TC-14-08',
      name: 'Execution: Cancellation',
      category: 'EXECUTION',
      passed,
      expectedBehavior: 'Task fails cleanly with cancelled error',
      actualOutput: res.errorMessage || 'Unknown',
    };
  }

  private async testDuplicateProtection(): Promise<ToolTestCaseResult> {
    const tool = toolRegistry.getTool('FOREX_NEWS_CHECK')!;
    // Start one
    const p1 = actionPlanner.executeTool(tool);
    // Start another immediately
    const res2 = await actionPlanner.executeTool(tool);
    // Cleanup
    await p1;

    const passed = res2.success === false && res2.errorMessage?.includes('currently executing');
    return {
      id: 'TC-14-09',
      name: 'Security: Duplicate Action Protection',
      category: 'SECURITY',
      passed,
      expectedBehavior: 'Second concurrent action is blocked',
      actualOutput: res2.errorMessage || 'Unknown',
    };
  }
}

export const toolIntelligenceTestSuite = new ToolIntelligenceTestSuite();
