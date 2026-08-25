import { sufiaTradingBridge, NormalizedTradingResult, BridgeAnalysisResponse, TradingQueryAspect } from './sufiaTradingBridge';

export interface TradingManagerOptions {
  broker?: string;
  asset?: string;
  timeframe?: string;
  marketMode?: string;
}

export class TradingManager {
  /**
   * Evaluates if a given speech transcription or text query is related to trading analysis
   */
  public isTradingQuery(text: string): boolean {
    return sufiaTradingBridge.isTradingIntent(text);
  }

  /**
   * Evaluates if a given query is about macroeconomic forex news (NFP, CPI, etc.)
   */
  public isNewsQuery(text: string): boolean {
    return sufiaTradingBridge.isNewsIntent(text);
  }

  /**
   * Analyzes the current chart through Sufia's trading bridge
   */
  public async analyzeCurrentChart(options?: TradingManagerOptions): Promise<BridgeAnalysisResponse> {
    return sufiaTradingBridge.analyzeCurrentChart(options);
  }

  /**
   * Responds to follow-up trading questions using the latest analysis context
   */
  public handleFollowUp(query: string): string {
    const aspect = sufiaTradingBridge.detectTradingQueryType(query);
    return sufiaTradingBridge.explainAspect(aspect);
  }

  /**
   * Get the latest structured analysis result
   */
  public getLatestAnalysis(): NormalizedTradingResult | null {
    return sufiaTradingBridge.getLatestAnalysis();
  }

  /**
   * Checks if current analysis is fresh (< 2 minutes old)
   */
  public isAnalysisFresh(): boolean {
    return sufiaTradingBridge.isAnalysisFresh();
  }

  /**
   * Reset analysis state
   */
  public clear(): void {
    sufiaTradingBridge.clearAnalysis();
  }
}

export const tradingManager = new TradingManager();
