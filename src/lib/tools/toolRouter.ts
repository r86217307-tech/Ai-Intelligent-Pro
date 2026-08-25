/**
 * PHASE 14 — TOOL ROUTER
 * Maps natural language intents to structured action requests.
 */

import { toolRegistry } from './toolRegistry';
import { ToolDefinition } from './toolTypes';

export class ToolRouter {
  private static instance: ToolRouter;

  private constructor() {}

  public static getInstance(): ToolRouter {
    if (!ToolRouter.instance) {
      ToolRouter.instance = new ToolRouter();
    }
    return ToolRouter.instance;
  }

  /**
   * Extremely simple rule-based routing for now.
   * Can be augmented with LLM intent extraction later.
   */
  public routeIntent(text: string): { tool?: ToolDefinition; confidence: 'HIGH' | 'LOW' } {
    const lower = text.toLowerCase().trim();

    // System commands
    if (lower.includes('থামো') || lower.includes('বন্ধ করো') || lower.includes('cancel') || lower.includes('stop') || lower.includes('বাদ দাও') || lower.includes('আর দরকার নেই')) {
      return { tool: toolRegistry.getTool('CANCEL_ACTIVE_TASK'), confidence: 'HIGH' };
    }

    if (lower.includes('settings') && (lower.includes('খুলে') || lower.includes('open'))) {
      return { tool: toolRegistry.getTool('OPEN_SETTINGS'), confidence: 'HIGH' };
    }

    // Trading commands
    if (lower.includes('chart') && (lower.includes('analyze') || lower.includes('অ্যানালাইজ'))) {
      return { tool: toolRegistry.getTool('TRADING_ANALYZE_CHART'), confidence: 'HIGH' };
    }

    if (lower.includes('news') && (lower.includes('check') || lower.includes('আছে'))) {
      return { tool: toolRegistry.getTool('FOREX_NEWS_CHECK'), confidence: 'HIGH' };
    }
    
    // Trade execution (forbidden check)
    if (lower.includes('trade নাও') || lower.includes('execute trade')) {
      return { tool: toolRegistry.getTool('EXECUTE_TRADE'), confidence: 'HIGH' };
    }

    // Memory clear
    if (lower.includes('সব মেমোরি') && lower.includes('মুছে')) {
       return { tool: toolRegistry.getTool('CLEAR_MEMORY'), confidence: 'HIGH' };
    }

    return { tool: undefined, confidence: 'LOW' };
  }
}

export const toolRouter = ToolRouter.getInstance();
