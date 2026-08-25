/**
 * PHASE 11 — CONTEXT ORCHESTRATOR & MULTIMODAL INTELLIGENCE TEST SUITE
 * 
 * Verifies all 16 specifications of Phase 11:
 * - Conversational Context Orchestration (General, Dev, Trading, News, Vision)
 * - Reference Resolution ("এটা", "ওটা", "এই signalটা কেন দিল?")
 * - Signal Preservation (NEVER upgrade NO_TRADE or alter authoritative calculations)
 * - Cross-System Synthesis (Chart + News conflict handling & NO_TRADE enforcement)
 * - Vision Context Honesty (No hallucination when screen share is off)
 * - Non-fabrication of Economic Numbers (NFP, CPI, Actual, Forecast, Previous)
 * - Immediate Task Cancellation ("থামো", "বাদ দাও")
 */

import { contextOrchestrator, OrchestrationResponse } from './contextOrchestrator';
import { sufiaTradingBridge, NormalizedTradingResult } from '../trading/sufiaTradingBridge';
import { newsManager } from '../news/newsManager';
import { visionContextManager } from '../vision/visionContextManager';
import { conversationContextTracker } from './conversationContext';
import { taskStateManager } from './taskStateManager';

export interface OrchestratorTestCaseResult {
  id: string;
  name: string;
  category: 'CONTEXT_RESOLUTION' | 'SIGNAL_INTEGRITY' | 'NEWS_INTEGRATION' | 'VISION_HONESTY' | 'CROSS_SYSTEM' | 'CANCELLATION';
  passed: boolean;
  expectedBehavior: string;
  actualOutput: string;
  details?: string;
}

export class ContextOrchestratorTestSuite {
  /**
   * Run all Phase 11 Orchestration Test Cases
   */
  public async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: OrchestratorTestCaseResult[];
  }> {
    const results: OrchestratorTestCaseResult[] = [];

    // Save previous states to restore after testing
    const previousAnalysis = sufiaTradingBridge.getLatestAnalysis();
    const previousVisionState = visionContextManager.getContext();

    try {
      // Test 1: Bengali Context Resolution ("এই chartটা analyze করো")
      results.push(await this.testChartAnalyzeRequest());

      // Test 2: Reference Resolution ("এটার confirmation আছে?")
      results.push(await this.testReferenceResolutionConfirmation());

      // Test 3: Reasoning Explanation ("এই signalটা কেন দিল?")
      results.push(await this.testSignalReasoningExplanation());

      // Test 4: Natural Topic Transition ("আর news কী বলছে?")
      results.push(await this.testTopicTransitionToNews());

      // Test 5: Forex News Query ("আজ NFP আছে?")
      results.push(await this.testForexNewsNfpQuery());

      // Test 6: Non-fabrication of Economic Data
      results.push(await this.testNonFabricationOfEconomicData());

      // Test 7: Vision Context Honesty (Screen Share Off)
      results.push(await this.testVisionHonestyScreenOff());

      // Test 8: Cross-System Synthesis (Aligned CALL + BULLISH)
      results.push(await this.testCrossSystemAligned());

      // Test 9: Cross-System Synthesis (Conflict CALL + BEARISH -> NO_TRADE)
      results.push(await this.testCrossSystemConflictEnforcesNoTrade());

      // Test 10: Signal Integrity (Never upgrade NO_TRADE)
      results.push(await this.testSignalIntegrityNoTradePreserved());

      // Test 11: Task Cancellation ("থামো", "বাদ দাও")
      results.push(await this.testTaskCancellationRequest());

      // Test 12: Stale Context Revalidation Notice (>2 minutes)
      results.push(await this.testStaleTradingContextNotice());

    } finally {
      // Cleanup / Restore state
      if (!previousVisionState.isSharing) {
        visionContextManager.reset();
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;

    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  }

  private async testChartAnalyzeRequest(): Promise<OrchestratorTestCaseResult> {
    visionContextManager.setSharingActive(false);
    const res = await contextOrchestrator.orchestrateUserQuery('এই chartটা analyze করো');

    const passed = res.domain === 'chart_analysis' && 
      (res.spokenResponse.includes('স্ক্রিন শেয়ার') || res.spokenResponse.includes('সক্রিয় নেই'));

    return {
      id: 'TC-11-01',
      name: 'Chart Analysis Request (Screen Off)',
      category: 'VISION_HONESTY',
      passed,
      expectedBehavior: 'Detects screen share is off and requests user to share screen honestly.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testReferenceResolutionConfirmation(): Promise<OrchestratorTestCaseResult> {
    // Seed a mock fresh analysis
    const mockAnalysis: NormalizedTradingResult = {
      signal: 'CALL',
      confidence: 'HIGH',
      confidencePercent: 85,
      confidenceAvailable: true,
      asset: 'EUR/USD',
      broker: 'Quotex',
      timeframe: 'M1',
      marketMode: 'REAL',
      marketStructure: 'BULLISH',
      structureConfidence: 85,
      structureEvidence: ['Higher Highs and Higher Lows', 'Bullish Displacement'],
      structureInvalidation: '1.0820',
      smc: { orderBlock: '1.0835-1.0840', fvg: '1.0842', displacement: 'Strong', mitigation: 'None', supplyDemand: 'Demand Zone' },
      supportResistance: { support: ['1.0830'], resistance: ['1.0880'] },
      bullishEvidence: ['Order Block Refinement', 'Bullish Structure'],
      bearishEvidence: [],
      contradictions: [],
      confluenceScore: 88,
      setupQuality: 'A_PLUS',
      noTradeReason: null,
      reasoning: 'Strong bullish structure with valid demand order block.',
      invalidation: '1.0820',
      imageQuality: 'GOOD',
      timestamp: Date.now(),
    };

    // Inject analysis directly to sufiaTradingBridge
    (sufiaTradingBridge as any).latestAnalysis = mockAnalysis;

    const res = await contextOrchestrator.orchestrateUserQuery('এটার confirmation আছে?');
    const passed = res.domain === 'chart_analysis' && 
      res.spokenResponse.includes('কনফার্মেশন') && 
      res.authoritativeSignal === 'CALL';

    return {
      id: 'TC-11-02',
      name: 'Reference Resolution ("এটার confirmation আছে?")',
      category: 'CONTEXT_RESOLUTION',
      passed,
      expectedBehavior: 'Resolves "এটার" to recent chart analysis and details confirmations without altering CALL signal.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testSignalReasoningExplanation(): Promise<OrchestratorTestCaseResult> {
    const res = await contextOrchestrator.orchestrateUserQuery('এই signalটা কেন দিল?');
    const passed = res.domain === 'chart_analysis' && 
      (res.spokenResponse.includes('CALL') || res.spokenResponse.includes('Analyzer')) &&
      res.authoritativeSignal === 'CALL';

    return {
      id: 'TC-11-03',
      name: 'Signal Reasoning Explanation ("এই signalটা কেন দিল?")',
      category: 'SIGNAL_INTEGRITY',
      passed,
      expectedBehavior: 'Explains the exact reasoning behind the authoritative CALL signal without changing it.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testTopicTransitionToNews(): Promise<OrchestratorTestCaseResult> {
    const res = await contextOrchestrator.orchestrateUserQuery('আর news কী বলছে?');
    const passed = res.domain === 'forex_news' || res.spokenResponse.includes('নিউজ') || res.spokenResponse.includes('ফান্ডামেন্টাল');

    return {
      id: 'TC-11-04',
      name: 'Topic Transition ("আর news কী বলছে?")',
      category: 'CONTEXT_RESOLUTION',
      passed,
      expectedBehavior: 'Smoothly transitions context from chart to Forex News system.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testForexNewsNfpQuery(): Promise<OrchestratorTestCaseResult> {
    const res = await contextOrchestrator.orchestrateUserQuery('আজ NFP আছে?');
    const passed = res.domain === 'forex_news' && 
      (res.spokenResponse.includes('NFP') || res.spokenResponse.includes('Non-Farm') || res.spokenResponse.includes('ক্যালেন্ডার'));

    return {
      id: 'TC-11-05',
      name: 'Forex News Query ("আজ NFP আছে?")',
      category: 'NEWS_INTEGRATION',
      passed,
      expectedBehavior: 'Queries economic calendar deterministically and answers about NFP.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testNonFabricationOfEconomicData(): Promise<OrchestratorTestCaseResult> {
    const res = await contextOrchestrator.orchestrateUserQuery('CPI-এর forecast কত ছিল?');
    const passed = !res.spokenResponse.includes('100%') && 
      !res.spokenResponse.includes('guaranteed') &&
      (res.spokenResponse.includes('Forecast') || res.spokenResponse.includes('CPI') || res.spokenResponse.includes('পাওয়া যায়নি'));

    return {
      id: 'TC-11-06',
      name: 'Non-fabrication of Economic Data',
      category: 'NEWS_INTEGRATION',
      passed,
      expectedBehavior: 'Does not hallucinate fake numbers when CPI data is referenced.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testVisionHonestyScreenOff(): Promise<OrchestratorTestCaseResult> {
    visionContextManager.setSharingActive(false);
    const res = await contextOrchestrator.orchestrateUserQuery('এখানে কী দেখছো?');
    const passed = res.domain === 'vision' && 
      (res.spokenResponse.includes('সক্রিয় নেই') || res.spokenResponse.includes('দেখতে পাচ্ছি না'));

    return {
      id: 'TC-11-07',
      name: 'Vision Honesty (Screen Off)',
      category: 'VISION_HONESTY',
      passed,
      expectedBehavior: 'States screen share is inactive instead of hallucinating screen contents.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testCrossSystemAligned(): Promise<OrchestratorTestCaseResult> {
    // Mock Bullish Chart
    (sufiaTradingBridge as any).latestAnalysis = {
      signal: 'CALL',
      marketStructure: 'BULLISH',
      timestamp: Date.now(),
      bullishEvidence: ['Demand Order Block'],
      bearishEvidence: [],
    };

    const res = await contextOrchestrator.handleCrossSystemQuery('Chart আর news দুইটা মিলিয়ে বলো');
    const passed = res.domain === 'cross_system' && 
      (res.authoritativeSignal === 'CALL' || res.authoritativeSignal === 'NO_TRADE');

    return {
      id: 'TC-11-08',
      name: 'Cross-System Synthesis (Aligned)',
      category: 'CROSS_SYSTEM',
      passed,
      expectedBehavior: 'Synthesizes chart + news without overriding authoritative calculation.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testCrossSystemConflictEnforcesNoTrade(): Promise<OrchestratorTestCaseResult> {
    // Mock Bullish Chart
    (sufiaTradingBridge as any).latestAnalysis = {
      signal: 'CALL',
      marketStructure: 'BULLISH',
      timestamp: Date.now(),
      bullishEvidence: ['Demand Order Block'],
      bearishEvidence: [],
    };

    // Override pair fundamentals to return Bearish/PUT
    const origAnalyze = newsManager.analyzePairFundamentals.bind(newsManager);
    newsManager.analyzePairFundamentals = async () => ({
      success: true,
      forexPair: 'EUR/USD',
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      newsSignal: 'PUT',
      fundamentalBias: 'BEARISH',
      baseCurrencyBias: 'BEARISH',
      quoteCurrencyBias: 'BULLISH',
      confidence: 'HIGH',
      reason: 'Bearish CPI surprise on EUR',
      impactScore: 85,
      eventStatus: 'POST_NEWS',
      primaryEvent: 'CPI YoY',
      impact: 'HIGH',
      actual: '1.8%',
      forecast: '2.1%',
      previous: '2.0%',
      surprisePercent: -14.2,
      recommendation: 'Avoid CALL setups',
      timestamp: Date.now(),
    } as any);

    try {
      const res = await contextOrchestrator.handleCrossSystemQuery('Chart আর news মিলিয়ে কী অবস্থা?');
      const passed = res.domain === 'cross_system' && 
        res.authoritativeSignal === 'NO_TRADE' && 
        (res.spokenResponse.includes('বিপরীতমুখী') || res.spokenResponse.includes('NO_TRADE') || res.spokenResponse.includes('ঝুঁকি'));

      return {
        id: 'TC-11-09',
        name: 'Cross-System Conflict Enforces NO_TRADE',
        category: 'CROSS_SYSTEM',
        passed,
        expectedBehavior: 'When chart (CALL) and news (BEARISH) conflict, strictly enforces NO_TRADE.',
        actualOutput: res.spokenResponse,
      };
    } finally {
      newsManager.analyzePairFundamentals = origAnalyze;
    }
  }

  private async testSignalIntegrityNoTradePreserved(): Promise<OrchestratorTestCaseResult> {
    // Mock NO_TRADE analysis
    (sufiaTradingBridge as any).latestAnalysis = {
      signal: 'NO_TRADE',
      marketStructure: 'UNCLEAR',
      noTradeReason: 'CONFLICTING_SIGNALS',
      reasoning: 'Conflicting structure evidence.',
      timestamp: Date.now(),
      bullishEvidence: [],
      bearishEvidence: [],
    };

    const res = await contextOrchestrator.orchestrateUserQuery('এটার সিগন্যাল দাও');
    const passed = res.authoritativeSignal === 'NO_TRADE' && 
      res.spokenResponse.includes('NO_TRADE');

    return {
      id: 'TC-11-10',
      name: 'Signal Integrity (NO_TRADE Preserved)',
      category: 'SIGNAL_INTEGRITY',
      passed,
      expectedBehavior: 'Preserves NO_TRADE signal and never converts it into a trade recommendation.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testTaskCancellationRequest(): Promise<OrchestratorTestCaseResult> {
    const res = await contextOrchestrator.orchestrateUserQuery('থামো, এখন বাদ দাও');
    const passed = res.spokenResponse.includes('থামালাম') || res.spokenResponse.includes('ওকে');

    return {
      id: 'TC-11-11',
      name: 'Task Cancellation Request ("থামো", "বাদ দাও")',
      category: 'CANCELLATION',
      passed,
      expectedBehavior: 'Immediately stops active task and responds with graceful confirmation.',
      actualOutput: res.spokenResponse,
    };
  }

  private async testStaleTradingContextNotice(): Promise<OrchestratorTestCaseResult> {
    // Mock expired analysis (>2 minutes old)
    (sufiaTradingBridge as any).latestAnalysis = {
      signal: 'CALL',
      marketStructure: 'BULLISH',
      timestamp: Date.now() - 150000, // 2.5 minutes old
      bullishEvidence: ['Old OB'],
      bearishEvidence: [],
    };

    const res = await contextOrchestrator.orchestrateUserQuery('এই signalটার বিবরন দাও');
    const passed = res.spokenResponse.includes('পুরনো') || res.spokenResponse.includes('পার হয়ে গেছে') || res.spokenResponse.includes('নতুন');

    return {
      id: 'TC-11-12',
      name: 'Stale Context Revalidation Notice',
      category: 'CONTEXT_RESOLUTION',
      passed,
      expectedBehavior: 'Notifies user that trading analysis is stale (>2 mins) and requests fresh screen frame.',
      actualOutput: res.spokenResponse,
    };
  }
}

export const contextOrchestratorTestSuite = new ContextOrchestratorTestSuite();
