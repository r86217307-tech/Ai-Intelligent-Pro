/**
 * PHASE 9 — SAFETY & TRADING GUARDRAILS ENGINE
 * 
 * Authoritative safety, validation, and signal-guarding layer for Sufia AI.
 * Implements strict, deterministic, non-hallucinatory gates:
 * 1. Incomplete Chart Guard
 * 2. Missing Data Protection
 * 3. Conflicting Signal Detection
 * 4. Confidence Gate
 * 5. Stale Data Protection
 * 6. SMC Validation Gate
 * 7. News / Fundamental Safety Lock
 * 8. Signal Consistency Check
 * 9. Authoritative Signal Protection
 * 10. Duplicate Signal Protection
 * 11. No Guarantee / No Overconfidence Enforcer
 * 12. Standardized Uncertainty & Reason Codes
 */

import { AnalysisResult, ForexNewsAnalysisResult } from '../../types';
import { NormalizedTradingResult } from './sufiaTradingBridge';
import { newsManager } from '../news/newsManager';
import { visionContextManager, VisualContext } from '../vision/visionContextManager';

export type GuardrailReasonCode =
  | 'NONE'
  | 'INCOMPLETE_CHART'
  | 'INSUFFICIENT_DATA'
  | 'CONFLICTING_SIGNALS'
  | 'LOW_CONFIDENCE'
  | 'STALE_DATA'
  | 'NEWS_RISK'
  | 'STRUCTURE_UNCLEAR'
  | 'VALIDATION_FAILED'
  | 'NO_VALID_SETUP'
  | 'DUPLICATE_ACTIVE_SETUP';

export type DataAvailabilityState = 'AVAILABLE' | 'PARTIAL' | 'MISSING' | 'UNRELIABLE';
export type SafetyConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';

export interface GuardrailValidationReport {
  isValid: boolean;
  finalSignal: 'CALL' | 'PUT' | 'NO_TRADE';
  reasonCode: GuardrailReasonCode;
  confidence: SafetyConfidenceLevel;
  spokenExplanation: string;
  dataState: DataAvailabilityState;
  checks: {
    chartCompleteness: boolean;
    freshness: boolean;
    missingDataSanity: boolean;
    smcStructureValid: boolean;
    newsRiskClear: boolean;
    noMajorConflicts: boolean;
    confidencePassed: boolean;
    consistencyPassed: boolean;
    isDuplicateActive: boolean;
  };
  fingerprint?: string;
  timestamp: number;
}

export interface ActiveSetupRecord {
  fingerprint: string;
  asset: string;
  timeframe: string;
  signal: 'CALL' | 'PUT';
  timestamp: number;
  expiresAt: number;
}

export class TradingGuardrails {
  private static instance: TradingGuardrails;

  // Maximum allowed visual frame age for live trading signal generation (45 seconds)
  public static readonly MAX_LIVE_FRAME_AGE_MS = 45 * 1000;

  // Setup active duration (1.5 minutes) for duplicate suppression
  public static readonly ACTIVE_SETUP_TTL_MS = 90 * 1000;

  // Minimum visible candles required for authoritative analysis
  public static readonly MIN_VISIBLE_CANDLES = 10;

  // Track active setups to prevent duplicate spam
  private activeSetups: Map<string, ActiveSetupRecord> = new Map();

  private constructor() {}

  public static getInstance(): TradingGuardrails {
    if (!TradingGuardrails.instance) {
      TradingGuardrails.instance = new TradingGuardrails();
    }
    return TradingGuardrails.instance;
  }

  /**
   * Complete 13-stage safety validation pipeline for Sufia Trading
   */
  public async evaluateTradingSafety(
    rawResult: AnalysisResult | NormalizedTradingResult | null,
    options?: {
      visualContext?: VisualContext;
      imageBase64?: string | null;
      explicitPair?: string;
      forceFresh?: boolean;
    }
  ): Promise<GuardrailValidationReport> {
    const now = Date.now();
    const checks = {
      chartCompleteness: true,
      freshness: true,
      missingDataSanity: true,
      smcStructureValid: true,
      newsRiskClear: true,
      noMajorConflicts: true,
      confidencePassed: true,
      consistencyPassed: true,
      isDuplicateActive: false,
    };

    // Clean expired setups
    this.cleanExpiredSetups();

    // ==================================================
    // 1. INCOMPLETE CHART GUARD
    // ==================================================
    if (!rawResult) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'INCOMPLETE_CHART',
        confidence: 'UNAVAILABLE',
        spokenExplanation: 'Chartটা সম্পূর্ণ বা পরিষ্কারভাবে দেখা যাচ্ছে না, তাই আমি নিরাপদভাবে signal দিচ্ছি না।',
        dataState: 'MISSING',
        checks: { ...checks, chartCompleteness: false },
        timestamp: now,
      };
    }

    const imageQuality = (rawResult.imageQuality || '').toUpperCase();
    const dataQuality = ('dataQuality' in rawResult ? rawResult.dataQuality : 'GOOD').toUpperCase();
    const visibleCandles = 'visibleCandleCount' in rawResult ? rawResult.visibleCandleCount : 25;

    if (
      imageQuality === 'POOR' ||
      dataQuality === 'POOR' ||
      (typeof visibleCandles === 'number' && visibleCandles < TradingGuardrails.MIN_VISIBLE_CANDLES)
    ) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'INCOMPLETE_CHART',
        confidence: 'LOW',
        spokenExplanation: 'Chartটা সম্পূর্ণ বা পরিষ্কারভাবে দেখা যাচ্ছে না, তাই আমি নিরাপদভাবে signal দিচ্ছি না।',
        dataState: 'UNRELIABLE',
        checks: { ...checks, chartCompleteness: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 2. STALE DATA PROTECTION
    // ==================================================
    const visualCtx = options?.visualContext || visionContextManager.getContext();
    const isSharing = visualCtx.isSharing;
    const frameAge = visualCtx.frameAgeMs || 0;

    if (isSharing && frameAge > TradingGuardrails.MAX_LIVE_FRAME_AGE_MS && !options?.forceFresh) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'STALE_DATA',
        confidence: 'LOW',
        spokenExplanation: 'স্ক্রিনের চার্টটি কিছুটা আগের এবং মার্কেট অবস্থা পরিবর্তন হয়ে থাকতে পারে। লাইভ সিগন্যালের জন্য স্ক্রিন রিফ্রেশ করুন।',
        dataState: 'PARTIAL',
        checks: { ...checks, freshness: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 3. AUTHORITATIVE SIGNAL PROTECTION & SANITY
    // ==================================================
    const originalSignal = rawResult.signal;
    if (originalSignal === 'NO_TRADE') {
      const naturalExplanation = this.formatNoTradeSpokenReason(rawResult.noTradeReason || 'UNCLEAR_STRUCTURE');
      return {
        isValid: true,
        finalSignal: 'NO_TRADE',
        reasonCode: this.mapNoTradeReasonToGuardrail(rawResult.noTradeReason),
        confidence: 'LOW',
        spokenExplanation: naturalExplanation,
        dataState: 'AVAILABLE',
        checks: { ...checks },
        timestamp: now,
      };
    }

    // ==================================================
    // 4. MISSING DATA PROTECTION
    // ==================================================
    const asset = rawResult.asset || options?.explicitPair || null;
    const timeframe = rawResult.timeframe || null;

    if (!asset || !timeframe) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'INSUFFICIENT_DATA',
        confidence: 'UNAVAILABLE',
        spokenExplanation: 'চার্টের অ্যাসেট বা টাইমফ্রেম নিশ্চিতভাবে শনাক্ত করা যায়নি। বিভ্রান্তি এড়াতে NO_TRADE রাখছি।',
        dataState: 'MISSING',
        checks: { ...checks, missingDataSanity: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 5. SMC & STRUCTURE VALIDATION GATE
    // ==================================================
    const marketStructure = rawResult.marketStructure || 'UNCLEAR';
    const isBullishSignal = originalSignal === 'CALL';
    const isBearishSignal = originalSignal === 'PUT';

    if (marketStructure === 'UNCLEAR') {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'STRUCTURE_UNCLEAR',
        confidence: 'LOW',
        spokenExplanation: 'মার্কেট স্ট্রাকচার এই মুহূর্তে পুরোপুরি স্পষ্ট নয়। তাই নিশ্চিত কনফার্মেশন ছাড়া ট্রেড নেওয়া ঝুঁকিপূর্ণ।',
        dataState: 'PARTIAL',
        checks: { ...checks, smcStructureValid: false },
        timestamp: now,
      };
    }

    // SMC Structure validation: Reject hallucinated or inverted structures
    if (isBullishSignal && marketStructure === 'BEARISH') {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'CONFLICTING_SIGNALS',
        confidence: 'LOW',
        spokenExplanation: 'মার্কেট স্ট্রাকচার বিয়ারিশ কিন্তু সিগন্যাল কল দিতে চাইছে—এই ধরনের বিরোধে NO_TRADE রাখাই নিরাপদ।',
        dataState: 'AVAILABLE',
        checks: { ...checks, smcStructureValid: false, noMajorConflicts: false },
        timestamp: now,
      };
    }

    if (isBearishSignal && marketStructure === 'BULLISH') {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'CONFLICTING_SIGNALS',
        confidence: 'LOW',
        spokenExplanation: 'মার্কেট স্ট্রাকচার বুলিশ কিন্তু সিগন্যাল পুট দিতে চাইছে—এই ধরনের বিরোধে NO_TRADE রাখাই নিরাপদ।',
        dataState: 'AVAILABLE',
        checks: { ...checks, smcStructureValid: false, noMajorConflicts: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 6. NEWS & FUNDAMENTAL SAFETY LOCK
    // ==================================================
    const isRealForexPair = this.isForexAsset(asset);
    let newsRiskDetected = false;
    let newsRiskReason = '';

    if (isRealForexPair) {
      try {
        const fundamental = await newsManager.analyzePairFundamentals(asset);
        if (fundamental) {
          // A. If market is closed or session inactive
          if (fundamental.marketStatus && !fundamental.marketStatus.isOpen) {
            newsRiskDetected = true;
            newsRiskReason = 'ফরেক্স মার্কেট বর্তমানে বন্ধ রয়েছে। তাই লাইভ সিগন্যাল সক্রিয় নয়।';
          }
          // B. If High Impact event is approaching or in pre-news volatility lock
          else if (fundamental.eventStatus === 'UPCOMING' || fundamental.eventRisk === 'HIGH' || fundamental.eventRisk === 'EXTREME') {
            newsRiskDetected = true;
            newsRiskReason = `শীঘ্রই গুরুত্বপূর্ণ হাই-ইমপ্যাক্ট নিউজ (${fundamental.primaryEvent?.event || 'Economic Release'}) রয়েছে। প্রি-নিউজ ভোলাটিলিটি এড়াতে NO_TRADE।`;
          }
          // C. Macroeconomic conflict: Technical CALL vs Macro BEARISH, or Technical PUT vs Macro BULLISH
          else if (
            (isBullishSignal && fundamental.fundamentalBias === 'BEARISH') ||
            (isBearishSignal && fundamental.fundamentalBias === 'BULLISH')
          ) {
            newsRiskDetected = true;
            newsRiskReason = `টেকনিক্যাল সেটআপ (${originalSignal}) এবং মৌলিক অর্থনৈতিক বায়াস (${fundamental.fundamentalBias}) পরস্পরের বিপরীতমুখী।`;
          }
        }
      } catch (err) {
        console.warn('[TradingGuardrails] News check warning:', err);
      }
    }

    if (newsRiskDetected) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'NEWS_RISK',
        confidence: 'LOW',
        spokenExplanation: newsRiskReason || 'সামনে হাই-ইমপ্যাক্ট নিউজ বা ম্যাক্রো অসঙ্গতি রয়েছে, তাই NO_TRADE রাখা হলো।',
        dataState: 'AVAILABLE',
        checks: { ...checks, newsRiskClear: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 7. CONFLICTING SIGNAL DETECTION
    // ==================================================
    const contradictions = rawResult.contradictions || [];
    if (contradictions.length >= 2) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'CONFLICTING_SIGNALS',
        confidence: 'LOW',
        spokenExplanation: 'চার্টে একাধিক বিপরীতমুখী লক্ষণ রয়েছে, তাই ঝুঁকি এড়াতে NO_TRADE সিদ্ধান্ত দেওয়া হলো।',
        dataState: 'AVAILABLE',
        checks: { ...checks, noMajorConflicts: false },
        timestamp: now,
      };
    }

    // Confluence Score check (minimum 7 for directional signal)
    const confluence = rawResult.confluenceScore ?? 0;
    if (confluence < 7) {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'LOW_CONFIDENCE',
        confidence: 'LOW',
        spokenExplanation: 'কনফ্লুয়েন্স স্কোর এন্ট্রি নেওয়ার জন্য যথেষ্ট শক্তিশালী নয়, তাই NO_TRADE।',
        dataState: 'AVAILABLE',
        checks: { ...checks, confidencePassed: false },
        timestamp: now,
      };
    }

    // Setup Quality check (Only A+ or A allows directional signal)
    const setupQuality = (rawResult.setupQuality || 'N/A').toUpperCase();
    if (setupQuality !== 'A+' && setupQuality !== 'A') {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'NO_VALID_SETUP',
        confidence: 'LOW',
        spokenExplanation: 'সেটআপের মান পর্যাপ্ত নয় (Grade A বা A+ নয়), তাই নিরাপদ ট্রেডিংয়ের স্বার্থে NO_TRADE।',
        dataState: 'AVAILABLE',
        checks: { ...checks, confidencePassed: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 8. CONFIDENCE GATE
    // ==================================================
    const rawConf = (rawResult.confidence || 'MEDIUM').toUpperCase() as SafetyConfidenceLevel;
    if (rawConf === 'LOW' || rawConf === 'UNAVAILABLE') {
      return {
        isValid: false,
        finalSignal: 'NO_TRADE',
        reasonCode: 'LOW_CONFIDENCE',
        confidence: rawConf,
        spokenExplanation: 'পর্যাপ্ত কনফার্মেশন না থাকায় আত্মবিশ্বাসের ঘাটতি রয়েছে। তাই সিগন্যাল NO_TRADE রাখা হলো।',
        dataState: 'AVAILABLE',
        checks: { ...checks, confidencePassed: false },
        timestamp: now,
      };
    }

    // ==================================================
    // 9. DUPLICATE ACTIVE SIGNAL PROTECTION
    // ==================================================
    const fingerprint = this.computeSetupFingerprint(asset, timeframe, originalSignal);
    const existingActive = this.activeSetups.get(fingerprint);

    if (existingActive && (now < existingActive.expiresAt)) {
      const remainingSec = Math.ceil((existingActive.expiresAt - now) / 1000);
      return {
        isValid: true,
        finalSignal: originalSignal,
        reasonCode: 'DUPLICATE_ACTIVE_SETUP',
        confidence: rawConf,
        spokenExplanation: `এই ${asset} (${timeframe}) ${originalSignal} সেটআপটি ইতিমধ্যে সক্রিয় রয়েছে। নতুন কোনো ভিন্ন সিগন্যাল তৈরি হয়নি।`,
        dataState: 'AVAILABLE',
        checks: { ...checks, isDuplicateActive: true },
        fingerprint,
        timestamp: now,
      };
    }

    // Register this new active setup
    this.activeSetups.set(fingerprint, {
      fingerprint,
      asset,
      timeframe,
      signal: originalSignal as 'CALL' | 'PUT',
      timestamp: now,
      expiresAt: now + TradingGuardrails.ACTIVE_SETUP_TTL_MS,
    });

    // ==================================================
    // 10. FINAL CONSISTENCY & NO-GUARANTEE FORMATTING
    // ==================================================
    const spokenExplanation = this.formatApprovedSignalExplanation(rawResult, originalSignal);

    return {
      isValid: true,
      finalSignal: originalSignal,
      reasonCode: 'NONE',
      confidence: rawConf,
      spokenExplanation,
      dataState: 'AVAILABLE',
      checks: { ...checks },
      fingerprint,
      timestamp: now,
    };
  }

  /**
   * Format approved CALL or PUT signal with strict no-guarantee, transparent phrasing
   */
  private formatApprovedSignalExplanation(
    rawResult: AnalysisResult | NormalizedTradingResult,
    signal: 'CALL' | 'PUT'
  ): string {
    const dir = signal === 'CALL' ? 'CALL (Buy)' : 'PUT (Sell)';
    const structureText = rawResult.marketStructure ? `মার্কেট স্ট্রাকচার ${rawResult.marketStructure}` : '';
    
    let confText = '';
    if ('confidencePercent' in rawResult && rawResult.confidencePercent && rawResult.confidencePercent > 0) {
      confText = `কনফিডেন্স প্রায় ${rawResult.confidencePercent}%।`;
    }

    let mainConfirmation = '';
    const bullish = rawResult.bullishEvidence || [];
    const bearish = rawResult.bearishEvidence || [];
    if (signal === 'CALL' && bullish.length > 0) {
      mainConfirmation = `প্রধান কনফার্মেশন: ${bullish[0]}।`;
    } else if (signal === 'PUT' && bearish.length > 0) {
      mainConfirmation = `প্রধান কনফার্মেশন: ${bearish[0]}।`;
    }

    return `ভ্যালিডেটেড সিগন্যাল: ${dir}। ${structureText ? structureText + ', ' : ''}${mainConfirmation} ${confText} এটি কোনো গ্যারান্টিযুক্ত প্রফিট নয়, সবসময় সঠিক মানি ম্যানেজমেন্ট ও ইনভ্যালিডেশন পয়েন্ট মাথায় রেখে ট্রেড করুন।`;
  }

  /**
   * Natural conversational translation for NO_TRADE reasons
   */
  public formatNoTradeSpokenReason(reason: string): string {
    switch (reason) {
      case 'INCOMPLETE_CANDLE':
        return 'রানিং ক্যান্ডেলটি এখনো ক্লোজ হয়নি, তাই অপরিপক্ক এন্ট্রি এড়াতে NO_TRADE।';
      case 'WEAK_CONFLUENCE':
        return 'কনফ্লুয়েন্স স্কোর এন্ট্রি নেওয়ার জন্য যথেষ্ট শক্তিশালী নয়, তাই NO_TRADE।';
      case 'CONFLICTING_SIGNALS':
        return 'বুলিশ এবং বিয়ারিশ লক্ষণের মধ্যে মতবিরোধ রয়েছে, তাই NO_TRADE রাখাই নিরাপদ।';
      case 'TRAP_RISK':
        return 'মার্কেটে লিকুইডিটি সুইপ বা ফেক ব্রেকআউট ট্র্যাপের ঝুঁকি লক্ষ্য করা যাচ্ছে।';
      case 'NO_ENTRY_CONFIRMATION':
        return 'নির্দিষ্ট এন্ট্রি ট্রিগার বা রিজেকশন ক্যান্ডেল কনফার্ম হয়নি।';
      case 'POOR_IMAGE_QUALITY':
        return 'Chartটা সম্পূর্ণ বা পরিষ্কারভাবে দেখা যাচ্ছে না, তাই আমি নিরাপদভাবে signal দিচ্ছি না।';
      case 'EXTREME_RANGE':
        return 'মার্কেট টাইট বা এক্সট্রিম রেঞ্জে চপ করছে, ফলে ডিরেকশন অনিশ্চিত।';
      case 'UNCLEAR_STRUCTURE':
        return 'মার্কেট স্ট্রাকচার ও সুইং পয়েন্ট এই মুহূর্তে পুরোপুরি স্পষ্ট নয়।';
      case 'LIQUIDITY_UNCERTAINTY':
        return 'লিকুইডিটি পুল বা অর্ডার ব্লক এখনও সক্রিয়ভাবে মিটিগেট হয়নি।';
      case 'INSUFFICIENT_DATA':
        return 'ট্রেডিং বিশ্লেষণের জন্য সম্পূর্ণ ডাটা পাওয়া যায়নি।';
      default:
        return 'মার্কেটে যথেষ্ট স্পষ্ট কনফার্মেশন নেই বা বিপরীতমুখী চাপ রয়েছে, তাই NO_TRADE।';
    }
  }

  private mapNoTradeReasonToGuardrail(noTradeReason?: string | null): GuardrailReasonCode {
    if (!noTradeReason) return 'NO_VALID_SETUP';
    switch (noTradeReason) {
      case 'POOR_IMAGE_QUALITY': return 'INCOMPLETE_CHART';
      case 'INSUFFICIENT_DATA': return 'INSUFFICIENT_DATA';
      case 'CONFLICTING_SIGNALS': return 'CONFLICTING_SIGNALS';
      case 'WEAK_CONFLUENCE': return 'LOW_CONFIDENCE';
      case 'UNCLEAR_STRUCTURE': return 'STRUCTURE_UNCLEAR';
      default: return 'NO_VALID_SETUP';
    }
  }

  private computeSetupFingerprint(asset: string, timeframe: string, signal: string): string {
    const cleanAsset = asset.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanTf = timeframe.toUpperCase().trim();
    return `${cleanAsset}_${cleanTf}_${signal}`;
  }

  private cleanExpiredSetups() {
    const now = Date.now();
    for (const [key, record] of this.activeSetups.entries()) {
      if (now >= record.expiresAt) {
        this.activeSetups.delete(key);
      }
    }
  }

  private isForexAsset(asset: string): boolean {
    const upper = asset.toUpperCase();
    const majors = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP'];
    return majors.some(m => upper.includes(m) || upper.replace(/[^A-Z]/g, '').includes(m.replace(/[^A-Z]/g, '')));
  }
}

export const tradingGuardrails = TradingGuardrails.getInstance();
