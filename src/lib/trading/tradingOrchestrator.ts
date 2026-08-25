import { sufiaTradingBridge, NormalizedTradingResult } from './sufiaTradingBridge';
import { tradingGuardrails } from './tradingGuardrails';
import { newsManager } from '../news/newsManager';
import { visionContextManager } from '../vision/visionContextManager';

export interface ConfluenceScore {
  score: number;
  maxScore: number;
  factors: string[];
  conflicts: string[];
}


export interface DynamicSRZone {
  type: 'SUPPORT' | 'RESISTANCE' | 'FLIPPED';
  price: string | number;
  strength: number;
  reactionCount: number;
  recency: 'RECENT' | 'OLD';
  status: 'ACTIVE' | 'TESTED' | 'BROKEN' | 'FLIPPED' | 'INVALIDATED';
  structuralRole: string;
}

export interface Phase17Config {
  pivotPeriod: number;
  pivotSource: 'CLOSE' | 'OPEN';
  maxChannelWidthPercent: number;
  minStrength: number;
  maxSrCount: number;
}

export interface Phase16OrchestrationResult {
  marketType: 'OTC' | 'REAL_FOREX' | 'UNKNOWN';
  symbol: string | null;
  timeframe: string;
  dataValid: boolean;
  structure: string;
  liquidity: string[];
  smcDetected: boolean;
  snrStrength: number;
  trend: string;
  volatility: string;
  indicators: string[];
  newsContext: string | null;
  confluence: ConfluenceScore;
  freshnessValid: boolean;
  finalSignal: 'CALL' | 'PUT' | 'NO_TRADE' | 'INSUFFICIENT_DATA';
  dynamicSRZones?: DynamicSRZone[];
  signalState: 'CONFIRMED' | 'POSSIBLE' | 'WEAK' | 'NO_TRADE' | 'INSUFFICIENT_DATA';
  explanation: string;
}

class TradingOrchestrator {
  private static instance: TradingOrchestrator;
  
  private constructor() {}

  public static getInstance(): TradingOrchestrator {
    if (!TradingOrchestrator.instance) {
      TradingOrchestrator.instance = new TradingOrchestrator();
    }
    return TradingOrchestrator.instance;
  }

  public async orchestrate1MTrading(options?: {
    broker?: string;
    asset?: string;
    timeframe?: string;
    marketMode?: string;
  }): Promise<Phase16OrchestrationResult> {
    
    const result: Phase16OrchestrationResult = {
      marketType: 'UNKNOWN',
      symbol: options?.asset || 'UNKNOWN',
      timeframe: options?.timeframe || '1M',
      dataValid: false,
      structure: 'UNCLEAR',
      liquidity: [],
      smcDetected: false,
      snrStrength: 0,
      trend: 'UNKNOWN',
      volatility: 'UNKNOWN',
      indicators: [],
      newsContext: null,
      confluence: { score: 0, maxScore: 10, factors: [], conflicts: [] },
      freshnessValid: false,
      finalSignal: 'INSUFFICIENT_DATA',
      signalState: 'INSUFFICIENT_DATA',
      explanation: 'Analysis initializing...',
      dynamicSRZones: []
    };


    // 1 & 2. Identify Market Type and Symbol
    const upperAsset = (options?.asset || '').toUpperCase();
    if (upperAsset.includes('OTC') || (options?.broker || '').toUpperCase().includes('POCKET OPTION')) {
      result.marketType = 'OTC';
    } else if (upperAsset.length >= 6 && !upperAsset.includes('UNKNOWN')) {
      result.marketType = 'REAL_FOREX';
    } else {
      result.marketType = 'UNKNOWN';
    }

    if (result.marketType === 'UNKNOWN') {
       result.finalSignal = 'INSUFFICIENT_DATA';
       result.explanation = 'Market type (OTC or Real Forex) is UNKNOWN. Cannot safely orchestrate 1M trading without market context.';
       return result;
    }

    // 3. Confirm 1M Timeframe Priority
    if (result.timeframe !== '1M' && !result.timeframe.includes('1')) {
      result.explanation = 'Sufia Phase 16 prioritizes 1-Minute analysis. Timeframe is non-standard but continuing...';
    }

    // 16. Check Freshness Early
    const visualCtx = visionContextManager.getContext();
    if (!visualCtx.isSharing || visualCtx.state === 'UNAVAILABLE') {
       result.finalSignal = 'INSUFFICIENT_DATA';
       result.explanation = 'Chart data is unavailable. Please share a valid 1M chart.';
       return result;
    }
    
    // We enforce 1M freshness strictness (45 seconds max age)
    const frameAge = visualCtx.frameAgeMs || 0;
    if (frameAge > 45000) {
      result.freshnessValid = false;
      result.finalSignal = 'NO_TRADE'; // Stale data downgrade
      result.explanation = 'Chart data is stale (>45s). 1M trading requires live data. Please refresh the screen.';
      return result;
    }
    result.freshnessValid = true;

    // 18. Query the authoritative analyzer
    const bridgeResponse = await sufiaTradingBridge.analyzeCurrentChart(options);
    
    if (!bridgeResponse.success || !bridgeResponse.result) {
      result.dataValid = false;
      result.finalSignal = 'INSUFFICIENT_DATA';
      result.explanation = bridgeResponse.error || 'Failed to analyze chart.';
      return result;
    }
    
    const analysis = bridgeResponse.result;
    result.dataValid = true;

    // 5. Evaluate Candle/Price Action
    // 6. Map Market Structure
    result.structure = analysis.marketStructure || 'UNCLEAR';
    result.trend = analysis.marketStructure || 'UNCLEAR';
    
    // 7. Detect Liquidity
    const allEvidence = [...(analysis.bullishEvidence || []), ...(analysis.bearishEvidence || []), ...(analysis.structureEvidence || [])];
    const liqMatches = allEvidence.filter(e => e.toLowerCase().includes('liquid') || e.toLowerCase().includes('sweep'));
    result.liquidity = liqMatches;

    // 8. Detect SMC
    if (analysis.smc && (analysis.smc.orderBlock || analysis.smc.fvg || analysis.smc.displacement)) {
      result.smcDetected = true;
    }

    // 9. Calculate/Inspect Dynamic S/R and SNR
    // Since we don't have raw OHLC, we deterministically score SNR based on authoritative output
    let snrScore = 0;
    if (analysis.supportResistance) {
      snrScore += (analysis.supportResistance.support?.length || 0);
      snrScore += (analysis.supportResistance.resistance?.length || 0);
    }

    // Boost score if explicitly mentioned in evidence as "strong" or "rejection"
    if (allEvidence.some(e => e.toLowerCase().includes('strong support') || e.toLowerCase().includes('strong resistance'))) {
      snrScore += 2;
    }
    
    // Add Phase 17 Dynamic S/R Clustering Logic
    const p17Config: Phase17Config = {
      pivotPeriod: 14,
      pivotSource: 'CLOSE',
      maxChannelWidthPercent: 0.15,
      minStrength: 2,
      maxSrCount: 5
    };
    
    const parsedZones: DynamicSRZone[] = [];
    
    // Since we lack raw OHLC data, we parse the textual SR outputs and cluster them
    const parseLevel = (val: string, type: 'SUPPORT' | 'RESISTANCE'): DynamicSRZone | null => {
      // Basic extraction if it looks like a number
      const numMatch = val.match(/[\d.]+/);
      if (numMatch) {
        return {
          type,
          price: parseFloat(numMatch[0]),
          strength: val.toLowerCase().includes('strong') ? 4 : 2,
          reactionCount: val.toLowerCase().includes('rejection') ? 3 : 1,
          recency: 'RECENT',
          status: 'ACTIVE',
          structuralRole: `VISUAL_S/R ${type}`
        };
      }
      return {
          type,
          price: val,
          strength: val.toLowerCase().includes('strong') ? 4 : 2,
          reactionCount: val.toLowerCase().includes('rejection') ? 3 : 1,
          recency: 'RECENT',
          status: 'ACTIVE',
          structuralRole: `DATA_LIMITED_S/R ${type}`
      };
    };

    if (analysis.supportResistance?.support) {
      analysis.supportResistance.support.forEach(s => {
        const zone = parseLevel(s, 'SUPPORT');
        if (zone) parsedZones.push(zone);
      });
    }
    
    if (analysis.supportResistance?.resistance) {
      analysis.supportResistance.resistance.forEach(r => {
        const zone = parseLevel(r, 'RESISTANCE');
        if (zone) parsedZones.push(zone);
      });
    }

    // Attempt clustering if they are numeric
    let clusteredZones: DynamicSRZone[] = [];
    
    // Filter and sort by strength
    let finalZones = parsedZones.filter(z => z.strength >= p17Config.minStrength);
    finalZones.sort((a, b) => b.strength - a.strength);
    
    // Cap
    if (finalZones.length > p17Config.maxSrCount) {
      finalZones = finalZones.slice(0, p17Config.maxSrCount);
    }
    
    result.dynamicSRZones = finalZones;
    
    // Advance SNR based on dynamic zones
    let dynamicSnr = snrScore;
    if (finalZones.length > 0) {
      dynamicSnr = Math.min(10, snrScore + (finalZones[0].strength));
    }
    
    // Apply OTC logic: Trap/False Breakout detection
    if (result.marketType === 'OTC') {
      const isTrap = allEvidence.some(e => 
        e.toLowerCase().includes('trap') || 
        e.toLowerCase().includes('false breakout') || 
        e.toLowerCase().includes('fake out') || 
        e.toLowerCase().includes('liquidity grab')
      );
      if (isTrap) {
         result.confluence.factors.push('OTC False Breakout/Trap Detected');
         dynamicSnr += 2; // High confidence in OTC if we catch the trap
      }
    }

    result.snrStrength = Math.min(dynamicSnr, 10); // Cap at 10


    // 10 & 11. Evaluate Volatility & 12. Technical Indicators
    const indicatorsList = allEvidence.filter(e => e.toUpperCase().includes('EMA') || e.toUpperCase().includes('RSI') || e.toUpperCase().includes('MACD') || e.toUpperCase().includes('BOLLINGER'));
    result.indicators = indicatorsList;
    if (allEvidence.some(e => e.toLowerCase().includes('volatil') || e.toLowerCase().includes('momentum'))) {
      result.volatility = 'HIGH';
    } else {
      result.volatility = 'NORMAL';
    }

    // 13. Evaluate Fundamental/News context for Real Forex only
    if (result.marketType === 'REAL_FOREX') {
       const newsResult = await newsManager.analyzePairFundamentals(result.symbol || '');
       if (newsResult && newsResult.newsSignal !== 'NO_TRADE') {
         result.newsContext = newsResult.newsSignal;
         result.confluence.factors.push(`Fundamental Bias: ${newsResult.newsSignal}`);
       }
    } else if (result.marketType === 'OTC') {
       // 14. OTC-Specific Safety
       // We explicitly block real-world news logic from affecting OTC confluence
       result.newsContext = 'N/A (OTC Market)';
    }

    // 14. Measure Confluence
    let confluence = 0;
    if (result.structure === 'BULLISH' || result.structure === 'BEARISH') { confluence += 3; result.confluence.factors.push(`Clear Structure (${result.structure})`); }
    if (result.smcDetected) { confluence += 2; result.confluence.factors.push('SMC Evidence'); }
    if (result.snrStrength >= 2) { confluence += 2; result.confluence.factors.push(`Strong SNR (Score: ${result.snrStrength})`); }
    if (result.liquidity.length > 0) { confluence += 1; result.confluence.factors.push('Liquidity Sweep'); }
    if (result.indicators.length > 0) { confluence += 1; result.confluence.factors.push('Indicator Confluence'); }
    if (analysis.contradictions && analysis.contradictions.length === 0) { confluence += 1; result.confluence.factors.push('No Contradictions'); }
    
    result.confluence.score = confluence;
    result.confluence.conflicts = analysis.contradictions || [];

    // 15. Check conflicting evidence
    const hasConflicts = result.confluence.conflicts.length > 0;
    if (hasConflicts && result.marketType === 'REAL_FOREX' && result.newsContext) {
      if ((result.structure === 'BULLISH' && result.newsContext === 'PUT') || 
          (result.structure === 'BEARISH' && result.newsContext === 'CALL')) {
        result.confluence.conflicts.push('Technical Structure conflicts with Fundamental News Bias');
      }
    }

    // 17. Apply safety guardrails
    const safetyCheck = await tradingGuardrails.evaluateTradingSafety(analysis);

    // 19. Preserve authoritative final signal
    result.finalSignal = analysis.signal;

    // Determine Signal State
    if (result.finalSignal === 'NO_TRADE') {
      result.signalState = 'NO_TRADE';
    } else {
      if (result.confluence.score >= 8 && !hasConflicts && safetyCheck.isValid) {
        result.signalState = 'CONFIRMED';
      } else if (result.confluence.score >= 5 && safetyCheck.isValid) {
        result.signalState = 'POSSIBLE';
      } else {
        result.signalState = 'WEAK';
        // 16. 1-Minute Signal Discipline: If signal is weak, downgrade to NO_TRADE
        result.finalSignal = 'NO_TRADE';
        result.signalState = 'NO_TRADE';
      }
    }

    // Explicit override from Guardrails
    if (!safetyCheck.isValid) {
      result.finalSignal = 'NO_TRADE';
      result.signalState = 'NO_TRADE';
    }


    // 20. Explain the result naturally
    if (result.finalSignal === 'NO_TRADE' || (result.finalSignal as any) === 'INSUFFICIENT_DATA') {
      result.explanation = `Analyzer সিদ্ধান্ত: ${result.finalSignal}। ${safetyCheck?.spokenExplanation || analysis.reasoning}`;
    } else {
      if (result.marketType === 'OTC') {
        result.explanation = `Market: OTC
Timeframe: 1M
Structure: ${result.structure}
S/R: ${result.dynamicSRZones?.length ? result.dynamicSRZones.map(z => z.price).join(', ') : 'N/A'}
SNR: ${result.snrStrength}/10
Liquidity: ${result.liquidity.length > 0 ? 'Swept' : 'None'}
SMC: ${result.smcDetected ? 'Detected' : 'None'}
Price Action: ${analysis.bullishEvidence?.join(', ') || ''} ${analysis.bearishEvidence?.join(', ') || ''}
Decision: ${result.finalSignal} (${result.signalState})`;
      } else {
        result.explanation = `Market: REAL FOREX
Timeframe: 1M
Technical Bias: ${result.structure}
Fundamental Bias: ${result.newsContext || 'N/A'}
S/R: ${result.dynamicSRZones?.length ? result.dynamicSRZones.map(z => z.price).join(', ') : 'N/A'}
SNR: ${result.snrStrength}/10
Liquidity: ${result.liquidity.length > 0 ? 'Swept' : 'None'}
Volatility: ${result.volatility}
Decision: ${result.finalSignal} (${result.signalState})`;
      }
    }

    return result;
  }
}

export const tradingOrchestrator = TradingOrchestrator.getInstance();