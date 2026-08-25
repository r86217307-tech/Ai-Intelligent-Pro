/**
 * PHASE 14 — TOOL REGISTRY
 * Centralized registry for all available autonomous tools.
 */

import { ToolDefinition, ToolCategory } from './toolTypes';

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, ToolDefinition> = new Map();

  private constructor() {
    this.registerDefaultTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  private registerDefaultTools() {
    this.registerTool({
      toolId: 'TRADING_ANALYZE_CHART',
      name: 'Analyze Trading Chart',
      description: 'Run the authoritative trading analyzer on the current chart.',
      category: 'TRADING',
      inputSchema: {},
      outputSchema: {},
      permissionLevel: 'SAFE',
      requiresConfirmation: false,
      supportsCancellation: true,
      timeoutMs: 15000,
      maxRetries: 1,
      isIdempotent: true,
    });

    this.registerTool({
      toolId: 'FOREX_NEWS_CHECK',
      name: 'Check Forex News',
      description: 'Check today\'s high-impact forex news.',
      category: 'FOREX_NEWS',
      inputSchema: {},
      outputSchema: {},
      permissionLevel: 'SAFE',
      requiresConfirmation: false,
      supportsCancellation: true,
      timeoutMs: 5000,
      maxRetries: 2,
      isIdempotent: true,
    });

    this.registerTool({
      toolId: 'CANCEL_ACTIVE_TASK',
      name: 'Cancel Active Task',
      description: 'Cancel whatever Sufia is currently doing.',
      category: 'SYSTEM',
      inputSchema: {},
      outputSchema: {},
      permissionLevel: 'SAFE',
      requiresConfirmation: false,
      supportsCancellation: false,
      timeoutMs: 1000,
      maxRetries: 0,
      isIdempotent: true,
    });
    
    this.registerTool({
      toolId: 'OPEN_SETTINGS',
      name: 'Open Settings',
      description: 'Navigate to the settings page.',
      category: 'NAVIGATION',
      inputSchema: {},
      outputSchema: {},
      permissionLevel: 'SAFE',
      requiresConfirmation: false,
      supportsCancellation: false,
      timeoutMs: 2000,
      maxRetries: 0,
      isIdempotent: true,
    });

    this.registerTool({
      toolId: 'EXECUTE_TRADE',
      name: 'Execute Live Trade',
      description: 'Execute a live trade in the market.',
      category: 'TRADING',
      inputSchema: {},
      outputSchema: {},
      permissionLevel: 'FORBIDDEN',
      requiresConfirmation: true,
      supportsCancellation: true,
      timeoutMs: 5000,
      maxRetries: 0,
      isIdempotent: false,
    });

    this.registerTool({
      toolId: 'CLEAR_MEMORY',
      name: 'Clear Memory',
      description: 'Clear the persistent memory.',
      category: 'MEMORY',
      inputSchema: {},
      outputSchema: {},
      permissionLevel: 'CONFIRMATION_REQUIRED',
      requiresConfirmation: true,
      supportsCancellation: true,
      timeoutMs: 3000,
      maxRetries: 0,
      isIdempotent: true,
    });
  }

  public registerTool(tool: ToolDefinition) {
    if (this.tools.has(tool.toolId)) {
      console.warn(`Tool with ID ${tool.toolId} already registered.`);
      return;
    }
    this.tools.set(tool.toolId, tool);
  }

  public getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const toolRegistry = ToolRegistry.getInstance();
