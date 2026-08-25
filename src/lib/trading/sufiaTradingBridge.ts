import { visionContextManager } from '../vision/visionContextManager';
import { visionManager } from '../vision/visionManager';
import { AnalysisResult } from '../../types';
import { tradingGuardrails, GuardrailValidationReport, GuardrailReasonCode } from './tradingGuardrails';
import { getApiUrl } from '../api';

export interface NormalizedTradingResult {
  signal: 'CALL' | 'PUT' | 'NO_TRADE';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  confidencePercent: number;
  confidenceAvailable: boolean;
  asset: string | null;
  broker: string | null;
  timeframe: string | null;
  marketMode: string | null;
  marketStructure: 'BULLISH' | 'BEARISH' | 'RANGE' | 'TRANSITION' | 'UNCLEAR' | null;
  structureConfidence: number | null;
  structureEvidence: string[];
  structureInvalidation: string | null;
  smc: {
    orderBlock: string | null;
    fvg: string | null;
    displacement: string | null;
    mitigation: string | null;
    supplyDemand: string | null;
  } | null;
  supportResistance: {
    support: string[];
    resistance: string[];
  } | null;
  bullishEvidence: string[];
  bearishEvidence: string[];
  contradictions: string[];
  confluenceScore: number | null;
  setupQuality: string | null;
  noTradeReason: string | null;
  reasonCode?: GuardrailReasonCode;
  reasoning: string;
  invalidation: string | null;
  imageQuality: string | null;
  guardrailReport?: GuardrailValidationReport;
  timestamp: number;
}

export interface BridgeAnalysisResponse {
  success: boolean;
  result?: NormalizedTradingResult;
  conversationalSummary?: string;
  guardrailReport?: GuardrailValidationReport;
  error?: string;
  errorType?: string;
  isStale?: boolean;
}

export type TradingQueryAspect = 'general' | 'signal' | 'structure' | 'smc' | 'confirmations' | 'invalidation' | 'reasoning';

class SufiaTradingBridge {
  private latestAnalysis: NormalizedTradingResult | null = null;
  private activeAnalysisPromise: Promise<BridgeAnalysisResponse> | null = null;
  private lastAnalyzedFrameFingerprint: string | null = null;

  // Analysis freshness threshold (2 minutes)
  private static readonly FRESHNESS_TTL_MS = 120 * 1000;

  /**
   * Detects if the user query expresses an intent to analyze a chart or ask about trading signals/structure
   */
  public isTradingIntent(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    // Exclude general weather, greetings, or casual talk
    if (
      lower.includes('আবহাওয়া') ||
      lower.includes('weather') ||
      lower.includes('নাম কি') ||
      lower.includes('how are you') ||
      lower.includes('কেমন আছো')
    ) {
      return false;
    }

    const tradingKeywords = [
      'analyze', 'analysis', 'chart', 'চার্ট', 'সিগন্যাল', 'signal',
      'call', 'put', 'কল', 'পুট', 'setup', 'সেটআপ', 'market structure',
      'মার্কেট স্ট্রাকচার', 'structure', 'স্ট্রাকচার', 'smc', 'order block',
      'অর্ডার ব্লক', 'fvg', 'fair value gap', 'liquidity', 'লিকুইডিটি',
      'confirmation', 'কনফার্মেশন', 'invalidation', 'ইনভ্যালিডেশন',
      'কেন call', 'কেন put', 'কেন নো ট্রেড', 'why call', 'why put',
      'no trade', 'নো ট্রেড', 'otc', 'bias', 'বাই নাকি সেল', 'buy or sell'
    ];

    return tradingKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Detects if query is specifically about high-impact economic forex news (NFP, CPI, etc.)
   */
  public isNewsIntent(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    const newsKeywords = [
      'nfp', 'cpi', 'fomc', 'interest rate', 'fed', 'federal reserve',
      'ecb', 'boe', 'high impact news', 'news signal', 'নিউজ', 'অর্থনৈতিক খবর'
    ];
    return newsKeywords.some(k => lower.includes(k));
  }

  /**
   * Categorize the specific aspect of analysis the user is asking for
   */
  public detectTradingQueryType(text: string): TradingQueryAspect {
    const lower = text.toLowerCase().trim();

    if (lower.includes('structure') || lower.includes('স্ট্রাকচার')) return 'structure';
    if (lower.includes('smc') || lower.includes('order block') || lower.includes('fvg')) return 'smc';
    if (lower.includes('confirmation') || lower.includes('কনফার্মেশন')) return 'confirmations';
    if (lower.includes('invalidation') || lower.includes('ইনভ্যালিডেশন') || lower.includes('কোথায় বাতিল')) return 'invalidation';
    if (lower.includes('কেন') || lower.includes('why') || lower.includes('কারণ')) return 'reasoning';
    if (lower.includes('signal') || lower.includes('সিগন্যাল') || lower.includes('call') || lower.includes('put')) return 'signal';

    return 'general';
  }

  /**
   * Run or reuse authoritative chart analysis on the current visual frame
   */
  public async analyzeCurrentChart(options?: {
    broker?: string;
    asset?: string;
    timeframe?: string;
    marketMode?: string;
  }): Promise<BridgeAnalysisResponse> {
    // 1. Guard against duplicate concurrent requests
    if (this.activeAnalysisPromise) {
      return this.activeAnalysisPromise;
    }

    this.activeAnalysisPromise = this.executeAnalysisInternal(options);
    try {
      const response = await this.activeAnalysisPromise;
      return response;
    } finally {
      this.activeAnalysisPromise = null;
    }
  }

  private async executeAnalysisInternal(options?: {
    broker?: string;
    asset?: string;
    timeframe?: string;
    marketMode?: string;
  }): Promise<BridgeAnalysisResponse> {
    const visualCtx = visionContextManager.getContext();

    // 2. Check visual context availability
    if (!visualCtx.isSharing || visualCtx.state === 'UNAVAILABLE') {
      return {
        success: false,
        errorType: 'NO_VISUAL_CONTEXT',
        error: 'No visual frame available',
        conversationalSummary: 'চার্টটা এই মুহূর্তে আমার কাছে নেই। চার্টটা দেখালে আমি analyze করতে পারব।'
      };
    }

    // 3. Acquire fresh frame from vision manager or screen share
    let frameBase64 = visionManager.captureFrame();
    if (!frameBase64) {
      const lastFrame = visionManager.getLastFrame();
      frameBase64 = lastFrame?.data || null;
    }

    if (!frameBase64) {
      return {
        success: false,
        errorType: 'CAPTURE_FAILED',
        error: 'Failed to capture frame',
        conversationalSummary: 'চার্টটা পরিষ্কারভাবে দেখা যাচ্ছে না। চার্টটা আবার স্ক্রিনে আনলে analyze করতে পারব।'
      };
    }

    const isStale = visualCtx.state === 'STALE' || visualCtx.confidence === 'LOW';

    // 4. Send request to the authoritative existing /api/analyze-chart endpoint
    try {
      const payload = {
        imageBase64: frameBase64,
        broker: options?.broker || 'Pocket Option',
        marketMode: options?.marketMode || 'Trap Detection',
        asset: options?.asset || 'EUR/USD (OTC)',
        timeframe: options?.timeframe || '1M',
      };

      const res = await fetch(getApiUrl('/api/analyze-chart'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.message || errJson?.error || 'Analysis failed';
        return {
          success: false,
          errorType: errJson?.errorType || 'ANALYSIS_ERROR',
          error: errMsg,
          conversationalSummary: 'Analysis এখন সম্পন্ন করা যাচ্ছে না। একটু পরে আবার চেষ্টা করো।'
        };
      }

      const rawData: AnalysisResult = await res.json();

      // Strict validation of the returned signal
      if (!rawData || !['CALL', 'PUT', 'NO_TRADE'].includes(rawData.signal)) {
        return {
          success: false,
          errorType: 'INVALID_SIGNAL_FORMAT',
          error: 'Authoritative analyzer returned unexpected format',
          conversationalSummary: 'চার্টের সিগন্যাল নিশ্চিত করা যায়নি। অনুগ্রহ করে পরিষ্কার চার্ট প্রদর্শন করুন।'
        };
      }

      // Normalize into bridge structure
      const normalized: NormalizedTradingResult = {
        signal: rawData.signal,
        confidence: rawData.confidence || 'MEDIUM',
        confidencePercent: rawData.confidencePercent || 0,
        confidenceAvailable: !!rawData.confidenceAvailable,
        asset: rawData.asset || options?.asset || null,
        broker: rawData.broker || options?.broker || null,
        timeframe: rawData.timeframe || options?.timeframe || null,
        marketMode: rawData.marketMode || null,
        marketStructure: rawData.marketStructure || null,
        structureConfidence: rawData.structureConfidence || null,
        structureEvidence: rawData.structureEvidence || [],
        structureInvalidation: rawData.structureInvalidation || null,
        smc: rawData.smc ? {
          orderBlock: rawData.smc.orderBlock || null,
          fvg: rawData.smc.fvg || null,
          displacement: rawData.smc.displacement || null,
          mitigation: rawData.smc.mitigation || null,
          supplyDemand: rawData.smc.supplyDemand || null,
        } : null,
        supportResistance: rawData.supportResistance ? {
          support: rawData.supportResistance.support || [],
          resistance: rawData.supportResistance.resistance || [],
        } : null,
        bullishEvidence: rawData.bullishEvidence || [],
        bearishEvidence: rawData.bearishEvidence || [],
        contradictions: rawData.contradictions || [],
        confluenceScore: rawData.confluenceScore || null,
        setupQuality: rawData.setupQuality || null,
        noTradeReason: rawData.noTradeReason || null,
        reasoning: rawData.reasoning || '',
        invalidation: rawData.invalidation || null,
        imageQuality: rawData.imageQuality || null,
        timestamp: Date.now(),
      };

      // 5. Pass through Phase 9 Safety & Trading Guardrails Engine
      const guardrailReport = await tradingGuardrails.evaluateTradingSafety(normalized, {
        visualContext: visualCtx,
        imageBase64: frameBase64,
        explicitPair: options?.asset,
      });

      // Apply guarded decision
      normalized.signal = guardrailReport.finalSignal;
      normalized.reasonCode = guardrailReport.reasonCode;
      normalized.guardrailReport = guardrailReport;

      if (guardrailReport.finalSignal === 'NO_TRADE') {
        normalized.noTradeReason = guardrailReport.reasonCode;
      }

      this.latestAnalysis = normalized;

      return {
        success: true,
        result: normalized,
        conversationalSummary: guardrailReport.spokenExplanation,
        guardrailReport,
        isStale,
      };

    } catch (e: any) {
      console.error('[SufiaTradingBridge] Analysis exception:', e);
      return {
        success: false,
        errorType: 'NETWORK_OR_SERVER_ERROR',
        error: e.message || 'Server error',
        conversationalSummary: 'আমি এখন signal দিচ্ছি না। Chart/data-তে কিছু uncertainty আছে, তাই ভুল signal দেওয়ার চেয়ে NO_TRADE রাখা নিরাপদ।'
      };
    }
  }

  /**
   * Convert normalized authoritative result into natural, concise Bengali/English spoken response
   */
  public formatConversationalSummary(res: NormalizedTradingResult, isStale = false): string {
    const stalePrefix = isStale ? 'স্ক্রিনের চার্টটি কিছুটা আগের মনে হচ্ছে। ' : '';

    if (res.signal === 'NO_TRADE') {
      let reasonText = 'মার্কেটে যথেষ্ট স্পষ্ট কনফার্মেশন নেই বা বিপরীতমুখী চাপ রয়েছে।';
      if (res.noTradeReason && res.noTradeReason !== 'NONE') {
        if (res.noTradeReason === 'WEAK_CONFLUENCE') reasonText = 'কনফ্লুয়েন্স স্কোর এন্ট্রি নেওয়ার জন্য যথেষ্ট নয়।';
        else if (res.noTradeReason === 'CONFLICTING_SIGNALS') reasonText = 'বুলিশ ও বিয়ারিশ উভয় ধরনের লক্ষণ থাকায় ঝুঁকি বেশি।';
        else if (res.noTradeReason === 'TRAP_RISK') reasonText = 'লিকুইডিটি সুইপ বা ট্র্যাপের ঝুঁকি রয়েছে।';
        else if (res.noTradeReason === 'UNCLEAR_STRUCTURE') reasonText = 'মার্কেট স্ট্রাকচার এই মুহূর্তে পুরোপুরি স্পষ্ট নয়।';
        else if (res.noTradeReason === 'POOR_IMAGE_QUALITY') reasonText = 'চার্টটি পরিষ্কার দেখা যাচ্ছে না।';
      }
      return `${stalePrefix}Analyzer-এর রেজাল্ট হচ্ছে NO_TRADE। ${reasonText} এই মুহূর্তে ট্রেড এড়ানোই নিরাপদ।`;
    }

    const direction = res.signal === 'CALL' ? 'CALL (Buy)' : 'PUT (Sell)';
    const structureText = res.marketStructure ? `মার্কেট স্ট্রাকচার ${res.marketStructure} দেখাচ্ছে` : '';
    
    let confidenceText = '';
    if (res.confidencePercent > 0) {
      confidenceText = `কনফিডেন্স প্রায় ${res.confidencePercent}%।`;
    }

    let mainReason = '';
    if (res.signal === 'CALL' && res.bullishEvidence.length > 0) {
      mainReason = `মূল কনফার্মেশন: ${res.bullishEvidence[0]}`;
    } else if (res.signal === 'PUT' && res.bearishEvidence.length > 0) {
      mainReason = `মূল কনফার্মেশন: ${res.bearishEvidence[0]}`;
    } else if (res.reasoning) {
      mainReason = res.reasoning.split('.')[0] + '.';
    }

    return `${stalePrefix}Analyzer-এর রেজাল্ট হচ্ছে ${direction}। ${structureText ? structureText + ' এবং ' : ''}${mainReason} ${confidenceText} তবে এটি ১০০% নিশ্চিত নয়, সঠিক রিস্ক ম্যানেজমেন্ট মেনে চলুন।`;
  }

  /**
   * Explain a specific aspect of the most recent analysis for follow-up questions
   */
  public explainAspect(aspect: TradingQueryAspect): string {
    if (!this.latestAnalysis) {
      return 'এখনো কোনো চার্ট analyze করা হয়নি। চার্টটা দেখালে আমি analyze করে ব্যাখ্যা করতে পারব।';
    }

    const res = this.latestAnalysis;
    const ageMs = Date.now() - res.timestamp;
    const isOld = ageMs > SufiaTradingBridge.FRESHNESS_TTL_MS;
    const oldPrefix = isOld ? 'ওটা আগের analysis-এর result ছিল। ' : '';

    switch (aspect) {
      case 'structure':
        if (res.marketStructure) {
          const evidence = res.structureEvidence.length > 0 ? ` কারণ: ${res.structureEvidence.join(', ')}.` : '';
          return `${oldPrefix}মার্কেট স্ট্রাকচার হচ্ছে ${res.marketStructure}।${evidence}`;
        }
        return `${oldPrefix}মার্কেট স্ট্রাকচার নিশ্চিতভাবে নির্ধারণ করা যায়নি।`;

      case 'smc':
        if (res.smc) {
          const ob = res.smc.orderBlock ? `Order Block: ${res.smc.orderBlock}. ` : '';
          const fvg = res.smc.fvg ? `FVG: ${res.smc.fvg}. ` : '';
          const disp = res.smc.displacement ? `Displacement: ${res.smc.displacement}. ` : '';
          if (ob || fvg || disp) {
            return `${oldPrefix}SMC প্রেক্ষাপট: ${ob}${fvg}${disp}`;
          }
        }
        return `${oldPrefix}SMC-এর নির্দিষ্ট কোনো স্পষ্ট জোন পাওয়া যায়নি।`;

      case 'confirmations':
        const confList = res.signal === 'CALL' ? res.bullishEvidence : res.bearishEvidence;
        if (confList.length > 0) {
          return `${oldPrefix}প্রধান কনফার্মেশনগুলো হলো: ${confList.slice(0, 3).join('; ')}।`;
        }
        return `${oldPrefix}পর্যাপ্ত কনফার্মেশন পাওয়া যায়নি।`;

      case 'invalidation':
        if (res.invalidation || res.structureInvalidation) {
          const inv = res.invalidation || res.structureInvalidation;
          return `${oldPrefix}এই সেটআপের ইনভ্যালিডেশন লেভেল হলো: ${inv}। এর বিপরীত গেলে সেটআপটি বাতিল হবে।`;
        }
        return `${oldPrefix}নির্দিষ্ট কোনো ইনভ্যালিডেশন প্রাইস উল্লেখ করা হয়নি।`;

      case 'reasoning':
      case 'signal':
      case 'general':
      default:
        return this.formatConversationalSummary(res, isOld);
    }
  }

  public getLatestAnalysis(): NormalizedTradingResult | null {
    return this.latestAnalysis;
  }

  public isAnalysisFresh(): boolean {
    if (!this.latestAnalysis) return false;
    return (Date.now() - this.latestAnalysis.timestamp) < SufiaTradingBridge.FRESHNESS_TTL_MS;
  }

  public clearAnalysis() {
    this.latestAnalysis = null;
    this.lastAnalyzedFrameFingerprint = null;
  }
}

export const sufiaTradingBridge = new SufiaTradingBridge();
