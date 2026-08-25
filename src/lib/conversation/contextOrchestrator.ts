/**
 * PHASE 11 — ADVANCED MULTIMODAL INTELLIGENCE & CONTEXT ORCHESTRATION FOR SUFIA AI
 * 
 * Orchestrates natural language understanding across:
 * - General conversation
 * - App development
 * - Authoritative Chart Analysis (sufiaTradingBridge)
 * - Authoritative Forex News Engine (newsManager)
 * - Live Screen Vision (visionContextManager)
 * - Task State Management (taskStateManager)
 * 
 * STRICT ARCHITECTURAL RULES:
 * 1. NEVER create, replace, or duplicate the independent Screenshot Analyzer (/src/pages/Analyzer.tsx).
 * 2. Existing engines (Trading Bridge, Forex News Engine, Vision Manager) remain authoritative.
 * 3. Never silently replace or override their calculations or change NO_TRADE into CALL/PUT.
 * 4. Never invent economic numbers (Actual, Forecast, Previous).
 * 5. Bounded memory: Never store raw PCM audio, base64 images, or large duplicate payloads.
 */

import { sufiaTradingBridge, NormalizedTradingResult, TradingQueryAspect } from '../trading/sufiaTradingBridge';
import { newsManager, NewsQueryType } from '../news/newsManager';
import { visionContextManager, VisualContext } from '../vision/visionContextManager';
import { conversationContextTracker, ConversationTopic, TurnContext } from './conversationContext';
import { taskStateManager } from './taskStateManager';
import { sessionRecoveryManager } from '../recovery/sessionRecoveryManager';
import { adaptiveResponseManager } from '../adaptive/adaptiveResponseManager';
import { conversationStyleManager } from './conversationStyleManager';
import { memoryManager } from '../memory/memoryManager';
import { toolRouter } from '../tools/toolRouter';
import { tradingOrchestrator } from '../trading/tradingOrchestrator';
import { actionPlanner } from '../tools/actionPlanner';
import { ForexNewsAnalysisResult } from '../../types';

export type OrchestratedDomain = 
  | 'general'
  | 'app_development'
  | 'sufia'
  | 'chart_analysis'
  | 'forex_news'
  | 'vision'
  | 'cross_system';

export type FreshnessStatus = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNAVAILABLE';

export interface ContextFreshnessMeta {
  domain: OrchestratedDomain;
  timestamp: number;
  source: string;
  status: FreshnessStatus;
  ageMs: number;
  analysisId?: string;
}

export interface CrossSystemSynthesis {
  chartResult: NormalizedTradingResult | null;
  newsResult: ForexNewsAnalysisResult | null;
  alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'CONFLICTED' | 'NEUTRAL_OR_CAUTION';
  decision: 'CALL' | 'PUT' | 'NO_TRADE';
  reasoning: string;
  hasConflict: boolean;
  explanation: string;
  freshness: ContextFreshnessMeta;
}

export interface OrchestrationResponse {
  domain: OrchestratedDomain;
  spokenResponse: string;
  authoritativeSignal?: 'CALL' | 'PUT' | 'NO_TRADE';
  freshness: ContextFreshnessMeta;
  synthesis?: CrossSystemSynthesis;
  requiresClarification?: boolean;
  clarificationPrompt?: string;
}

export class ContextOrchestrator {
  private static instance: ContextOrchestrator;

  // Freshness threshold limits
  private static readonly TRADING_STALE_MS = 45000;    // 45 seconds (warning)
  private static readonly TRADING_EXPIRED_MS = 120000;  // 2 minutes (expired)
  private static readonly NEWS_STALE_MS = 180000;       // 3 minutes
  private static readonly VISION_STALE_MS = 10000;      // 10 seconds

  private constructor() {}

  public static getInstance(): ContextOrchestrator {
    if (!ContextOrchestrator.instance) {
      ContextOrchestrator.instance = new ContextOrchestrator();
    }
    return ContextOrchestrator.instance;
  }

  /**
   * Main entry point to orchestrate a user utterance using Context Priority Rules (1-7)
   */
  public async orchestrateUserQuery(userQuery: string): Promise<OrchestrationResponse> {
    const rawResult = await this.resolveRawOrchestration(userQuery);

    // Apply Phase 12 Adaptive Response Engine (length mode, robotic filler stripping, tone adaptation)
    const formatted = adaptiveResponseManager.formatResponse({
      userQuery,
      rawResponse: rawResult.spokenResponse,
      domain: rawResult.domain,
      authoritativeSignal: rawResult.authoritativeSignal,
      freshness: rawResult.freshness,
    });

    return {
      ...rawResult,
      spokenResponse: formatted.spokenText,
    };
  }

  private async resolveRawOrchestration(userQuery: string): Promise<OrchestrationResponse> {
    const text = (userQuery || '').trim();
    if (!text) {
      return {
        domain: 'general',
        spokenResponse: 'বলুন, আমি শুনছি। কীভাবে সাহায্য করতে পারি?',
        freshness: this.getFreshnessMeta('general', Date.now(), 'system', 'FRESH'),
      };
    }

    // Rule 8: Priority Resolution
    // 1. Current user utterance intent
    // 2. Active task context
    // 3. Immediately preceding assistant/user exchange
    // 4. Authoritative analysis result
    // 5. Recent vision context
    // 6. Recent news context
    // 7. Older conversation context

    const activeTask = taskStateManager.getActiveTask();
    const snapshot = conversationContextTracker.getSnapshot();
    const visualCtx = visionContextManager.getContext();
    const lower = text.toLowerCase();

    // Phase 13: Memory Processing
    const memoryRes = memoryManager.processUtterance(text);
    if (memoryRes.isInspectionQuery && memoryRes.inspectionResponse) {
      return {
        domain: 'general',
        spokenResponse: memoryRes.inspectionResponse,
        freshness: this.getFreshnessMeta('general', Date.now(), 'memory', 'FRESH'),
      };
    }

    if (memoryRes.commandResult && memoryRes.commandResult.action !== 'NONE') {
      return {
        domain: 'general',
        spokenResponse: memoryRes.commandResult.message,
        freshness: this.getFreshnessMeta('general', Date.now(), 'memory', 'FRESH'),
      };
    }

    // Phase 14: Autonomous Tool & Action Intelligence
    const routeRes = toolRouter.routeIntent(text);
    if (routeRes.tool && routeRes.confidence === 'HIGH') {
      const execResult = await actionPlanner.executeTool(routeRes.tool);
      
      let spokenResponse = '';
      if (!execResult.success) {
         spokenResponse = `দুঃখিত, কাজটা সম্পন্ন হয়নি। কারণ: ${execResult.errorMessage}`;
      } else if (routeRes.tool.toolId === 'TRADING_ANALYZE_CHART') {
         spokenResponse = 'Chart analysis complete. Check the Trading section for details.';
      } else if (routeRes.tool.toolId === 'FOREX_NEWS_CHECK') {
         spokenResponse = 'Forex news check complete.';
      } else if (routeRes.tool.toolId === 'CANCEL_ACTIVE_TASK') {
         spokenResponse = 'ঠিক আছে, থামালাম।';
      } else if (routeRes.tool.toolId === 'OPEN_SETTINGS') {
         spokenResponse = 'Settings ওপেন করা হয়েছে।';
      } else if (routeRes.tool.toolId === 'CLEAR_MEMORY') {
         spokenResponse = 'সব মেমোরি ক্লিয়ার করা হয়েছে।';
      } else {
         spokenResponse = 'কাজটা সফলভাবে সম্পন্ন হয়েছে।';
      }

      return {
        domain: routeRes.tool.category === 'TRADING' ? 'chart_analysis' : (routeRes.tool.category === 'FOREX_NEWS' ? 'forex_news' : 'general'),
        spokenResponse,
        freshness: this.getFreshnessMeta('general', Date.now(), 'system', 'FRESH'),
      };
    }

    // Handle cancellation or stop command
    if (taskStateManager.isCancellationIntent(text)) {
      taskStateManager.cancelTask('User cancellation request');
      return {
        domain: 'general',
        spokenResponse: 'ওকে, থামালাম। অন্য কিছু সাহায্য করতে পারি?',
        freshness: this.getFreshnessMeta('general', Date.now(), 'system', 'FRESH'),
      };
    }

    // Detect Cross-System Synthesis Intent ("Chart আর news দুইটা মিলিয়ে কী অবস্থা?")
    if (this.isCrossSystemIntent(text)) {
      return this.handleCrossSystemQuery(text);
    }

    // Detect Forex News Query Intent
    if (sufiaTradingBridge.isNewsIntent(text) || snapshot.activeTopic === 'forex_news') {
      return this.handleForexNewsQuery(text);
    }

    // Detect Vision Query Intent ("এখানে কী দেখছো?", "ডান পাশের chartটা দেখো")
    if (this.isVisionQueryIntent(text)) {
      return this.handleVisionQuery(text, visualCtx);
    }

    // Detect Chart / Trading Query Intent ("এই chartটা analyze করো", "এটার confirmation আছে?")
    if (sufiaTradingBridge.isTradingIntent(text) || snapshot.activeTopic === 'chart_analysis') {
      return this.handleTradingQuery(text, visualCtx);
    }

    // Default: General or App Development conversation
    return this.handleGeneralConversation(text);
  }

  /**
   * Handle Cross-System Synthesis (Chart Analysis + Forex News)
   */
  public async handleCrossSystemQuery(userQuery: string): Promise<OrchestrationResponse> {
    const pair = this.extractPairFromText(userQuery) || 'EUR/USD';
    const chartResult = sufiaTradingBridge.getLatestAnalysis();
    const newsResult = await newsManager.analyzePairFundamentals(pair);

    const now = Date.now();
    const chartAge = chartResult ? now - chartResult.timestamp : Infinity;
    const isChartFresh = chartResult && chartAge < ContextOrchestrator.TRADING_EXPIRED_MS;

    // Case 1: Chart unavailable or expired
    if (!isChartFresh) {
      if (newsResult) {
        const newsSignalText = newsResult.newsSignal === 'NO_TRADE' ? 'NO_TRADE' : `${newsResult.newsSignal} (${newsResult.fundamentalBias} Bias)`;
        const newsTimestamp = typeof newsResult.timestamp === 'number' ? newsResult.timestamp : (Number(newsResult.timestamp) || now);
        return {
          domain: 'cross_system',
          spokenResponse: `চার্ট অ্যানালাইসিস এখনো করা হয়নি বা রেজাল্ট পুরনো হয়ে গেছে। তবে ফান্ডামেন্টালি ${pair}-এর অবস্থা: ${newsSignalText}। স্ক্রিনে চার্ট দেখালে টেকনিক্যাল ও ফান্ডামেন্টাল দুটি মিলিয়ে পূর্ণাঙ্গ সিদ্ধান্ত দিতে পারব।`,
          authoritativeSignal: 'NO_TRADE',
          freshness: this.getFreshnessMeta('cross_system', newsTimestamp, 'newsManager', 'FRESH'),
        };
      }
      return {
        domain: 'cross_system',
        spokenResponse: 'এই মুহূর্তে চার্ট বা ফান্ডামেন্টাল নিউজ অ্যানালাইসিস সম্পন্ন নেই। চার্টটি স্ক্রিনে দেখিয়ে বলুন "Chart analyze করো"।',
        authoritativeSignal: 'NO_TRADE',
        freshness: this.getFreshnessMeta('cross_system', now, 'system', 'UNAVAILABLE'),
      };
    }

    // Case 2: Chart is available but News is unavailable
    if (!newsResult) {
      const summary = sufiaTradingBridge.formatConversationalSummary(chartResult!, chartAge > ContextOrchestrator.TRADING_STALE_MS);
      return {
        domain: 'cross_system',
        spokenResponse: `${summary} (দ্রষ্টব্য: এই মুহূর্তে লাইভ ফান্ডামেন্টাল নিউজ ডেটা পাওয়া যায়নি, তাই কেবল টেকনিক্যাল চার্টের ওপর সিদ্ধান্ত দেওয়া হয়েছে)।`,
        authoritativeSignal: chartResult!.signal,
        freshness: this.getFreshnessMeta('cross_system', chartResult!.timestamp, 'sufiaTradingBridge', chartAge > ContextOrchestrator.TRADING_STALE_MS ? 'STALE' : 'FRESH'),
      };
    }

    // Case 3: Both Chart and News are available -> Perform Deterministic Synthesis
    const techSignal = chartResult!.signal;
    const fundSignal = newsResult.newsSignal;
    const fundBias = newsResult.fundamentalBias;

    let alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'CONFLICTED' | 'NEUTRAL_OR_CAUTION' = 'NEUTRAL_OR_CAUTION';
    let decision: 'CALL' | 'PUT' | 'NO_TRADE' = 'NO_TRADE';
    let hasConflict = false;
    let explanation = '';

    if (techSignal === 'CALL' && (fundSignal === 'CALL' || fundBias === 'BULLISH')) {
      alignment = 'ALIGNED_BULLISH';
      decision = 'CALL';
      explanation = `টেকনিক্যাল চার্ট অ্যানালাইসিস (CALL) এবং ফান্ডামেন্টাল নিউজ বায়াস (BULLISH) উভয়ই ঊর্ধ্বমুখী। কনফ্লুয়েন্স ভালো।`;
    } else if (techSignal === 'PUT' && (fundSignal === 'PUT' || fundBias === 'BEARISH')) {
      alignment = 'ALIGNED_BEARISH';
      decision = 'PUT';
      explanation = `টেকনিক্যাল চার্ট অ্যানালাইসিস (PUT) এবং ফান্ডামেন্টাল নিউজ বায়াস (BEARISH) উভয়ই নিম্নমুখী। ডিরেকশন সামঞ্জস্যপূর্ণ।`;
    } else if ((techSignal === 'CALL' && (fundSignal === 'PUT' || fundBias === 'BEARISH')) || (techSignal === 'PUT' && (fundSignal === 'CALL' || fundBias === 'BULLISH'))) {
      alignment = 'CONFLICTED';
      decision = 'NO_TRADE';
      hasConflict = true;
      explanation = `টেকনিক্যাল সেটআপ (${techSignal}) এবং ফান্ডামেন্টাল বায়াস (${fundBias}) পরস্পরের বিপরীতমুখী। এই ধরনের মতবিরোধে ঝুঁকি বেশি থাকে। গার্ডরেইল নিয়ম অনুযায়ী সিদ্ধান্ত: NO_TRADE (অপেক্ষা করাই নিরাপদ)।`;
    } else {
      alignment = 'NEUTRAL_OR_CAUTION';
      decision = 'NO_TRADE';
      explanation = `চার্ট বা ফান্ডামেন্টালের যেকোনো একটিতে স্পষ্ট কনফার্মেশন নেই। উভয় সিস্টেমের মিল না থাকা পর্যন্ত নিরাপদ সিদ্ধান্ত: NO_TRADE।`;
    }

    const newsTimestamp = typeof newsResult.timestamp === 'number' ? newsResult.timestamp : (Number(newsResult.timestamp) || now);

    const synthesis: CrossSystemSynthesis = {
      chartResult,
      newsResult,
      alignment,
      decision,
      reasoning: explanation,
      hasConflict,
      explanation,
      freshness: this.getFreshnessMeta('cross_system', Math.min(chartResult!.timestamp, newsTimestamp), 'orchestrator', 'FRESH'),
    };

    const spokenText = `চার্ট ও নিউজ যৌথ বিশ্লেষণ (${pair}):\n` +
      `• টেকনিক্যাল: ${techSignal} (${chartResult!.marketStructure || 'Structure'})\n` +
      `• ফান্ডামেন্টাল: ${fundSignal} (${fundBias} Bias)\n` +
      `• চূড়ান্ত সিদ্ধান্ত: ${decision}। ${explanation}`;

    return {
      domain: 'cross_system',
      spokenResponse: spokenText,
      authoritativeSignal: decision,
      synthesis,
      freshness: synthesis.freshness,
    };
  }

  /**
   * Handle Chart / Trading Queries
   */
  private async handleTradingQuery(userQuery: string, visualCtx: VisualContext): Promise<OrchestrationResponse> {
    const lower = userQuery.toLowerCase();
    const aspect: TradingQueryAspect = sufiaTradingBridge.detectTradingQueryType(userQuery);

    // If user explicitly asks to run new chart analysis ("analyze করো", "chartটা দেখো")
    const isNewAnalysisRequest = 
      lower.includes('analyze') || 
      lower.includes('এ্যানালাইজ') || 
      lower.includes('অ্যানালাইজ') || 
      lower.includes('চার্টটা দেখো') || 
      lower.includes('chartটা দেখো') ||
      lower.includes('signal দাও') ||
      lower.includes('সিগন্যাল দাও');

    if (isNewAnalysisRequest) {
      if (!visualCtx.isSharing || !visualCtx.hasFrame) {
        return {
          domain: 'chart_analysis',
          spokenResponse: 'লাইভ স্ক্রিন শেয়ার সক্রিয় নেই বা চার্টটি পরিষ্কার দেখা যাচ্ছে না। অনুগ্রহ করে স্ক্রিন শেয়ার চালু করে চার্টটি দেখান।',
          authoritativeSignal: 'NO_TRADE',
          freshness: this.getFreshnessMeta('chart_analysis', Date.now(), 'visionContextManager', 'UNAVAILABLE'),
        };
      }

      // Execute authoritative chart analysis via bridge
      // Phase 16: Execute authoritative chart analysis via trading orchestrator
      const p16Res = await tradingOrchestrator.orchestrate1MTrading();
      const bridgeRes = sufiaTradingBridge.getLatestAnalysis();

      if (p16Res.dataValid && bridgeRes) {
        const p12Spoken = sufiaTradingBridge.formatConversationalSummary(bridgeRes, !p16Res.freshnessValid);
        let finalSpoken = p12Spoken;
        
        // Phase 17: Override with structured dual-market explanation if available
        if (p16Res.explanation && p16Res.explanation.includes('Market:')) {
            finalSpoken = p16Res.explanation;
        } else if (p16Res.finalSignal === 'NO_TRADE' && p16Res.explanation) {
            finalSpoken = p16Res.explanation;
        }
        return {
          domain: 'chart_analysis',
          spokenResponse: finalSpoken,
          authoritativeSignal: (p16Res.finalSignal === 'INSUFFICIENT_DATA' ? 'NO_TRADE' : p16Res.finalSignal) as any,
          freshness: this.getFreshnessMeta('chart_analysis', bridgeRes.timestamp, 'tradingOrchestrator', p16Res.freshnessValid ? 'FRESH' : 'STALE'),
        };
      } else {
        return {
          domain: 'chart_analysis',
          spokenResponse: p16Res.explanation || 'চার্ট অ্যানালাইসিস করার সময় একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।',
          authoritativeSignal: 'NO_TRADE',
          freshness: this.getFreshnessMeta('chart_analysis', Date.now(), 'tradingOrchestrator', 'UNAVAILABLE'),
        };
      }
    }
    // Follow-up question about existing analysis ("এটার confirmation?", "কেন signal দিল?")
    const latest = sufiaTradingBridge.getLatestAnalysis();
    if (!latest) {
      return {
        domain: 'chart_analysis',
        spokenResponse: 'এখনো কোনো চার্ট analyze করা হয়নি। চার্টটি স্ক্রিনে দেখালে আমি অ্যানালাইসিস করে উত্তর দিতে পারব।',
        authoritativeSignal: 'NO_TRADE',
        freshness: this.getFreshnessMeta('chart_analysis', Date.now(), 'sufiaTradingBridge', 'UNAVAILABLE'),
      };
    }

    const ageMs = Date.now() - latest.timestamp;
    if (ageMs > ContextOrchestrator.TRADING_EXPIRED_MS) {
      return {
        domain: 'chart_analysis',
        spokenResponse: 'আগের চার্ট অ্যানালাইসিসের সময় পার হয়ে গেছে (>২ মিনিট)। নতুন লাইভ চার্ট স্ক্রিনে দেখালে আমি ফ্রেশ analysis দিতে পারব।',
        authoritativeSignal: 'NO_TRADE',
        freshness: this.getFreshnessMeta('chart_analysis', latest.timestamp, 'sufiaTradingBridge', 'EXPIRED'),
      };
    }

    // Explain requested aspect (structure, SMC, confirmations, invalidation, reasoning)
    const explanation = sufiaTradingBridge.explainAspect(aspect);
    return {
      domain: 'chart_analysis',
      spokenResponse: explanation,
      authoritativeSignal: latest.signal,
      freshness: this.getFreshnessMeta('chart_analysis', latest.timestamp, 'sufiaTradingBridge', ageMs > ContextOrchestrator.TRADING_STALE_MS ? 'STALE' : 'FRESH'),
    };
  }

  /**
   * Handle Forex News Queries
   */
  private async handleForexNewsQuery(userQuery: string): Promise<OrchestrationResponse> {
    const newsResponse = await newsManager.answerNewsQuery(userQuery);
    return {
      domain: 'forex_news',
      spokenResponse: newsResponse,
      freshness: this.getFreshnessMeta('forex_news', Date.now(), 'newsManager', 'FRESH'),
    };
  }

  /**
   * Handle Vision Queries ("এখানে কী দেখছো?", "ডান পাশের chartটা দেখো")
   */
  private async handleVisionQuery(userQuery: string, visualCtx: VisualContext): Promise<OrchestrationResponse> {
    if (!visualCtx.isSharing || !visualCtx.hasFrame) {
      return {
        domain: 'vision',
        spokenResponse: 'লাইভ স্ক্রিন শেয়ার সক্রিয় নেই, তাই আপনার স্ক্রিন আমি দেখতে পাচ্ছি না। স্ক্রিন শেয়ার অন করুন।',
        freshness: this.getFreshnessMeta('vision', Date.now(), 'visionContextManager', 'UNAVAILABLE'),
      };
    }

    const ageMs = visualCtx.frameAgeMs;
    if (ageMs > ContextOrchestrator.VISION_STALE_MS) {
      return {
        domain: 'vision',
        spokenResponse: 'স্ক্রিন শেয়ারের ফ্রেম কিছুটা অস্পষ্ট বা স্টল হয়ে আছে। স্ক্রিনে মার্কেট বা উইন্ডো সরালে আমি পরিষ্কার দেখতে পাব।',
        freshness: this.getFreshnessMeta('vision', visualCtx.latestMetadata?.timestamp || Date.now(), 'visionContextManager', 'STALE'),
      };
    }

    const latestAnalysis = sufiaTradingBridge.getLatestAnalysis();
    if (latestAnalysis && (Date.now() - latestAnalysis.timestamp) < ContextOrchestrator.TRADING_EXPIRED_MS) {
      const signalText = latestAnalysis.signal === 'NO_TRADE' ? 'NO_TRADE' : latestAnalysis.signal;
      return {
        domain: 'vision',
        spokenResponse: `আমি আপনার স্ক্রিনের ট্রেডিং উইন্ডো দেখতে পাচ্ছি। সাম্প্রতিক অ্যানালাইসিস রেজাল্ট: ${signalText} (${latestAnalysis.marketStructure || 'Structure'})। নির্দিষ্ট কোনো প্রশ্ন থাকলে বলুন।`,
        authoritativeSignal: latestAnalysis.signal,
        freshness: this.getFreshnessMeta('vision', visualCtx.latestMetadata?.timestamp || Date.now(), 'visionContextManager', 'FRESH'),
      };
    }

    return {
      domain: 'vision',
      spokenResponse: 'আমি আপনার স্ক্রিন দেখতে পাচ্ছি। কোনো চার্ট analyze করতে চাইলে বলুন "Chart analyze করো"।',
      freshness: this.getFreshnessMeta('vision', visualCtx.latestMetadata?.timestamp || Date.now(), 'visionContextManager', 'FRESH'),
    };
  }

  /**
   * Handle General or App Development Queries
   */
  private handleGeneralConversation(userQuery: string): OrchestrationResponse {
    const lower = userQuery.toLowerCase();

    if (lower.includes('তুমি কে') || lower.includes('who are you') || lower.includes('তোমার নাম কি')) {
      return {
        domain: 'sufia',
        spokenResponse: 'আমি সুফিয়া AI—আপনার ইন্টেলিজেন্ট ভয়েস, ভিশন, ট্রেডিং চার্ট ও ফরেক্স নিউজ অ্যাসিস্ট্যান্ট।',
        freshness: this.getFreshnessMeta('sufia', Date.now(), 'system', 'FRESH'),
      };
    }

    if (lower.includes('কেমন আছো') || lower.includes('how are you')) {
      return {
        domain: 'general',
        spokenResponse: 'আমি ভালো আছি! বলুন, আজ কীভাবে সাহায্য করতে পারি?',
        freshness: this.getFreshnessMeta('general', Date.now(), 'system', 'FRESH'),
      };
    }

    // Return general contextual continuation
    return {
      domain: 'general',
      spokenResponse: `আমি আপনার কথা বুঝতে পেরেছি। বলুন, এ বিষয়ে কী করতে চান?`,
      freshness: this.getFreshnessMeta('general', Date.now(), 'system', 'FRESH'),
    };
  }

  private isCrossSystemIntent(text: string): boolean {
    const lower = text.toLowerCase();
    const mentionsChart = lower.includes('chart') || lower.includes('চার্ট') || lower.includes('technical');
    const mentionsNews = lower.includes('news') || lower.includes('নিউজ') || lower.includes('fundamental') || lower.includes('অর্থনৈতিক');
    const mentionsBoth = mentionsChart && mentionsNews;
    const mentionsCombined = lower.includes('দুইটা মিলিয়ে') || lower.includes('একসাথে') || lower.includes('সমন্বয়') || lower.includes('মিলিয়ে বলুন') || lower.includes('মিলিয়ে বলো');

    return mentionsBoth || (mentionsCombined && (mentionsChart || mentionsNews));
  }

  private isVisionQueryIntent(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('কী দেখছো') || 
      lower.includes('কি দেখছো') || 
      lower.includes('কী দেখতে পাচ্ছো') || 
      lower.includes('স্ক্রিনে কী') || 
      lower.includes('স্ক্রিনে কি') || 
      lower.includes('ডান পাশে') || 
      lower.includes('বাম পাশে') || 
      lower.includes('ওই জায়গাটা') || 
      lower.includes('এখানে কোনো setup')
    );
  }

  private extractPairFromText(text: string): string | null {
    const matches = text.match(/(EUR\/USD|GBP\/USD|USD\/JPY|USD\/CHF|AUD\/USD|NZD\/USD|USD\/CAD|EUR\/GBP|EUR\/JPY|GBP\/JPY)/i);
    if (matches && matches[0]) return matches[0].toUpperCase();

    const clean = text.toLowerCase();
    if (clean.includes('eurusd') || clean.includes('eur/usd')) return 'EUR/USD';
    if (clean.includes('gbpusd') || clean.includes('gbp/usd')) return 'GBP/USD';
    if (clean.includes('usdjpy') || clean.includes('usd/jpy')) return 'USD/JPY';
    if (clean.includes('audusd') || clean.includes('aud/usd')) return 'AUD/USD';
    if (clean.includes('usdcad') || clean.includes('usd/cad')) return 'USD/CAD';
    if (clean.includes('usdchf') || clean.includes('usd/chf')) return 'USD/CHF';
    if (clean.includes('nzdusd') || clean.includes('nzd/usd')) return 'NZD/USD';
    return null;
  }

  private getFreshnessMeta(
    domain: OrchestratedDomain, 
    timestamp: number, 
    source: string, 
    status: FreshnessStatus
  ): ContextFreshnessMeta {
    return {
      domain,
      timestamp,
      source,
      status,
      ageMs: Math.max(0, Date.now() - timestamp),
    };
  }
}

export const contextOrchestrator = ContextOrchestrator.getInstance();
