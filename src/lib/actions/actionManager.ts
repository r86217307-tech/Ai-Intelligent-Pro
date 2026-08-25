import { 
  ActionType, 
  ActionDefinition, 
  ActionRequest, 
  ActionResult, 
  ActionIntentConfidence,
  ActionStatus 
} from './types';
import { conversationManager } from '../conversation/conversationManager';
import { visionManager } from '../vision/visionManager';
import { sufiaTradingBridge } from '../trading/sufiaTradingBridge';
import { newsManager } from '../news/newsManager';

export class ActionManager {
  private static instance: ActionManager;
  private navigationHandler: ((path: string) => void) | null = null;
  private pendingConfirmation: ActionRequest | null = null;
  private recentActions: Map<string, { result: ActionResult; timestamp: number }> = new Map();
  private activeTurnId: number = 0;

  // Registered Action Definitions
  private readonly actionRegistry: Record<ActionType, ActionDefinition> = {
    OPEN_DASHBOARD: {
      type: 'OPEN_DASHBOARD',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to main Dashboard page',
      routeTarget: '/',
    },
    OPEN_SUFIA: {
      type: 'OPEN_SUFIA',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to Sufia Voice & Vision Hub',
      routeTarget: '/sufia',
    },
    OPEN_ANALYZER: {
      type: 'OPEN_ANALYZER',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to AI Chart Analyzer',
      routeTarget: '/analyzer',
    },
    OPEN_TRADING: {
      type: 'OPEN_TRADING',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to Trading & Chart Analysis Hub',
      routeTarget: '/analyzer',
    },
    OPEN_NEWS: {
      type: 'OPEN_NEWS',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to Forex News Signal page',
      routeTarget: '/news',
    },
    OPEN_TEST_MODE: {
      type: 'OPEN_TEST_MODE',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to Test Mode / Lab page',
      routeTarget: '/test-mode',
    },
    OPEN_HISTORY: {
      type: 'OPEN_HISTORY',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to History page',
      routeTarget: '/history',
    },
    OPEN_SETTINGS: {
      type: 'OPEN_SETTINGS',
      category: 'NAVIGATION',
      confirmationLevel: 'SAFE',
      description: 'Navigate to Settings page',
      routeTarget: '/settings',
    },
    CLEAR_HISTORY_REQUEST: {
      type: 'CLEAR_HISTORY_REQUEST',
      category: 'HISTORY',
      confirmationLevel: 'CONFIRM_REQUIRED',
      description: 'Request confirmation to clear analysis history',
    },
    CLEAR_HISTORY_CONFIRMED: {
      type: 'CLEAR_HISTORY_CONFIRMED',
      category: 'HISTORY',
      confirmationLevel: 'SAFE',
      description: 'Execute history clear after user confirmed',
    },
    TRIGGER_CHART_ANALYSIS: {
      type: 'TRIGGER_CHART_ANALYSIS',
      category: 'ANALYZER',
      confirmationLevel: 'SAFE',
      description: 'Trigger authoritative chart analysis on active frame or screen',
    },
    QUERY_NEWS_SIGNAL: {
      type: 'QUERY_NEWS_SIGNAL',
      category: 'FOREX_NEWS',
      confirmationLevel: 'SAFE',
      description: 'Query macroeconomic news signal status',
    },
    START_VISION: {
      type: 'START_VISION',
      category: 'SUFIA',
      confirmationLevel: 'SAFE',
      description: 'Start screen share session for visual context',
    },
    STOP_VISION: {
      type: 'STOP_VISION',
      category: 'SUFIA',
      confirmationLevel: 'SAFE',
      description: 'Stop active screen share session',
    },
    TOGGLE_VOICE_LISTENING: {
      type: 'TOGGLE_VOICE_LISTENING',
      category: 'SUFIA',
      confirmationLevel: 'SAFE',
      description: 'Toggle microphone voice listening mode',
    },
    CANCEL_ACTIVE_TASK: {
      type: 'CANCEL_ACTIVE_TASK',
      category: 'UI_CONTROL',
      confirmationLevel: 'SAFE',
      description: 'Cancel currently pending action or task',
    },
    GO_BACK: {
      type: 'GO_BACK',
      category: 'UI_CONTROL',
      confirmationLevel: 'SAFE',
      description: 'Navigate back to previous page',
    },
    SCROLL_TO_TOP: {
      type: 'SCROLL_TO_TOP',
      category: 'UI_CONTROL',
      confirmationLevel: 'SAFE',
      description: 'Scroll view to top',
    },
    UNSUPPORTED_TRADE_EXECUTION: {
      type: 'UNSUPPORTED_TRADE_EXECUTION',
      category: 'TRADING',
      confirmationLevel: 'UNSUPPORTED',
      description: 'Safety block on direct real-trade execution',
    },
    UNKNOWN_ACTION: {
      type: 'UNKNOWN_ACTION',
      category: 'UI_CONTROL',
      confirmationLevel: 'UNSUPPORTED',
      description: 'Unknown or ambiguous action',
    },
  };

  private constructor() {}

  public static getInstance(): ActionManager {
    if (!ActionManager.instance) {
      ActionManager.instance = new ActionManager();
    }
    return ActionManager.instance;
  }

  /**
   * Register React Router navigation callback (avoids DOM hacks)
   */
  public registerNavigationHandler(handler: (path: string) => void): () => void {
    this.navigationHandler = handler;
    return () => {
      if (this.navigationHandler === handler) {
        this.navigationHandler = null;
      }
    };
  }

  /**
   * Parse user utterance to detect candidate action request
   */
  public parseIntent(utterance: string, turnId: number = 0): ActionRequest | null {
    if (!utterance || typeof utterance !== 'string') return null;
    const text = utterance.toLowerCase().trim();

    // 1. Handle confirmation reply if pending
    if (this.pendingConfirmation) {
      if (this.isAffirmative(text)) {
        const confirmedReq: ActionRequest = {
          actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
          type: this.pendingConfirmation.type === 'CLEAR_HISTORY_REQUEST' ? 'CLEAR_HISTORY_CONFIRMED' : this.pendingConfirmation.type,
          confidence: 'HIGH',
          originalUtterance: utterance,
          turnId,
          timestamp: Date.now(),
        };
        this.pendingConfirmation = null;
        return confirmedReq;
      }
      if (this.isNegative(text) || this.isCancellation(text)) {
        this.pendingConfirmation = null;
        return {
          actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
          type: 'CANCEL_ACTIVE_TASK',
          confidence: 'HIGH',
          originalUtterance: utterance,
          turnId,
          timestamp: Date.now(),
        };
      }
    }

    // 2. Cancellation Intent
    if (this.isCancellation(text)) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'CANCEL_ACTIVE_TASK',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // 3. Financial Trade Interception (Safety Block)
    if (
      text.includes('trade নাও') || 
      text.includes('trade নিয়ে নাও') || 
      text.includes('trade লাগাও') || 
      text.includes('call দিয়ে দাও') || 
      text.includes('put দিয়ে দাও') || 
      text.includes('execute trade') || 
      text.includes('place trade') || 
      text.includes('order দাও') ||
      text.includes('ট্রেড নাও')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'UNSUPPORTED_TRADE_EXECUTION',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // 4. Clear History Intent (Confirmation Required)
    if (
      text.includes('history মুছে ফেল') || 
      text.includes('clear history') || 
      text.includes('হিস্ট্রি মুছে দাও') || 
      text.includes('হিস্ট্রি ডিলিট')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'CLEAR_HISTORY_REQUEST',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // 4.5. High-Impact Forex News & Fundamental Inquiries (Direct Query Processing)
    const isNewsQuestion = 
      text.includes('nfp') || 
      text.includes('cpi') || 
      text.includes('fomc') || 
      text.includes('hawkish') || 
      text.includes('dovish') || 
      text.includes('হাই ইমপ্যাক্ট') || 
      text.includes('high impact news') || 
      text.includes('আজকে কি নিউজ') || 
      text.includes('আজকের নিউজ') || 
      text.includes('আজ কি news') || 
      text.includes('affect করবে') || 
      text.includes('usd-তে কী effect') ||
      (text.includes('chart') && text.includes('news')) ||
      (text.includes('চার্ট') && text.includes('নিউজ'));

    const isNewsNavCommand = 
      text.includes('news খোলো') || 
      text.includes('news page') || 
      text.includes('open news') || 
      text.includes('news-এ যাও') || 
      text.includes('নিউজ পেজে যাও');

    if (isNewsQuestion && !isNewsNavCommand) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'QUERY_NEWS_SIGNAL',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // 4.6. Explicit Chart Analysis Trigger Intent (Signal requests, chart analysis)
    const isChartSignalRequest = 
      (text.includes('analyze') || text.includes('অ্যানালাইজ') || text.includes('চার্ট দেখে সিগন্যাল') || 
       text.includes('analyze chart') || text.includes('signal দাও') || text.includes('সিগন্যাল দাও') || 
       text.includes('ট্রেড নেওয়া যাবে') || text.includes('ট্রেড নেব') || text.includes('call নাকি put') ||
       text.includes('বাই নাকি সেল') || text.includes('chart টা দেখো') || text.includes('চার্ট দেখো') ||
       text.includes('check chart') || text.includes('give me signal')) &&
      !text.includes('খোলো') && !text.includes('open') && !text.includes('যাও') && !text.includes('পেজে');

    if (isChartSignalRequest) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'TRIGGER_CHART_ANALYSIS',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // 5. Navigation Intents
    // Analyzer / Chart
    if (
      text.includes('analyzer খোলো') || 
      text.includes('analyzer এ যাও') || 
      text.includes('analyzer খুলে দাও') || 
      text.includes('open analyzer') || 
      text.includes('go to analyzer') || 
      text.includes('chart analyzer') ||
      text.includes('অ্যানালাইজার')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_ANALYZER',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // News Signal
    if (
      text.includes('news signal') || 
      text.includes('forex news') || 
      text.includes('news page') || 
      text.includes('news খোলো') || 
      text.includes('নিউজ সিগন্যাল') || 
      text.includes('অর্থনৈতিক খবর') || 
      text.includes('nfp news section') ||
      text.includes('cpi news দেখাও') ||
      text.includes('open news')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_NEWS',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // Settings
    if (
      text.includes('settings খোলো') || 
      text.includes('settings এ যাও') || 
      text.includes('settings দেখাও') || 
      text.includes('open settings') || 
      text.includes('go to settings') ||
      text.includes('সেটিংস')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_SETTINGS',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // History
    if (
      text.includes('history খোলো') || 
      text.includes('history দেখাও') || 
      text.includes('history তে যাও') || 
      text.includes('open history') || 
      text.includes('go to history') ||
      text.includes('হিস্ট্রি')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_HISTORY',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // Sufia Hub
    if (
      text.includes('sufia page') || 
      text.includes('sufia তে যাও') || 
      text.includes('sufia খোলো') || 
      text.includes('go to sufia') ||
      text.includes('voice hub')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_SUFIA',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // Test Mode / Lab
    if (
      text.includes('test mode') || 
      text.includes('lab এ যাও') || 
      text.includes('lab খোলো') || 
      text.includes('test lab')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_TEST_MODE',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // Dashboard
    if (
      text.includes('dashboard এ যাও') || 
      text.includes('home page') || 
      text.includes('home এ যাও') || 
      text.includes('হোমে যাও') ||
      text.includes('go to dashboard')
    ) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'OPEN_DASHBOARD',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // UI Controls: Go back, Scroll
    if (text.includes('back এ যাও') || text.includes('পেছনে যাও') || text.includes('go back')) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'GO_BACK',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    if (text.includes('উপরে যাও') || text.includes('scroll to top') || text.includes('scroll up')) {
      return {
        actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
        type: 'SCROLL_TO_TOP',
        confidence: 'HIGH',
        originalUtterance: utterance,
        turnId,
        timestamp: Date.now(),
      };
    }

    // 6. Context-Aware Relative References (e.g. "ওটা খোলো", "সেখানে নিয়ে যাও")
    if (text.includes('ওটা খোলো') || text.includes('এটা খোলো') || text.includes('ওখানে যাও') || text.includes('সেখানে যাও')) {
      const snapshot = conversationManager.getConversationSnapshot();
      if (snapshot.activeTopic === 'chart_analysis' || snapshot.activeTopic === 'trading') {
        return {
          actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
          type: 'OPEN_ANALYZER',
          confidence: 'MEDIUM',
          originalUtterance: utterance,
          turnId,
          timestamp: Date.now(),
        };
      }
      if (snapshot.activeTopic === 'forex_news') {
        return {
          actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
          type: 'OPEN_NEWS',
          confidence: 'MEDIUM',
          originalUtterance: utterance,
          turnId,
          timestamp: Date.now(),
        };
      }
      if (snapshot.activeTopic === 'settings') {
        return {
          actionId: `ACT-${Date.now().toString(36).toUpperCase()}`,
          type: 'OPEN_SETTINGS',
          confidence: 'MEDIUM',
          originalUtterance: utterance,
          turnId,
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Execute validated action request with duplicate and race condition protection
   */
  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    const def = this.actionRegistry[request.type] || this.actionRegistry.UNKNOWN_ACTION;
    const actionKey = `${request.type}_${request.originalUtterance}`;
    const now = Date.now();

    // Deduplication Protection: Prevent rapid duplicate executions within 1500ms
    const recent = this.recentActions.get(actionKey);
    if (recent && now - recent.timestamp < 1500) {
      console.log(`[ActionManager] Deduplicating rapid action request: ${request.type}`);
      return recent.result;
    }

    // Update active turnId tracking
    if (request.turnId) {
      this.activeTurnId = request.turnId;
    }

    // Handle Confirmation Required Actions
    if (def.confirmationLevel === 'CONFIRM_REQUIRED' && request.type === 'CLEAR_HISTORY_REQUEST') {
      this.pendingConfirmation = request;
      const result: ActionResult = {
        success: true,
        actionId: request.actionId,
        type: request.type,
        status: 'CONFIRMATION_REQUIRED',
        message: 'Confirmation requested before clearing history',
        spokenResponse: 'তুমি কি নিশ্চিত যে অ্যানালাইসিস হিস্ট্রি মুছে ফেলবে?',
        requiresConfirmation: true,
        confirmationPrompt: 'তুমি কি নিশ্চিত যে অ্যানালাইসিস হিস্ট্রি মুছে ফেলবে?',
        timestamp: now,
      };
      this.recentActions.set(actionKey, { result, timestamp: now });
      return result;
    }

    // Handle Financial Safety Block
    if (def.confirmationLevel === 'UNSUPPORTED' && request.type === 'UNSUPPORTED_TRADE_EXECUTION') {
      const result: ActionResult = {
        success: false,
        actionId: request.actionId,
        type: request.type,
        status: 'UNSUPPORTED',
        message: 'Direct automated real trade execution is disabled for financial safety.',
        spokenResponse: 'আমি চার্ট এবং নিউজ অ্যানালাইসিস করতে পারি, কিন্তু সরাসরি রিয়েল ট্রেড এক্সিকিউট করি না। সিদ্ধান্তটি তোমার ম্যানুয়ালি নেওয়া নিরাপদ।',
        timestamp: now,
      };
      this.recentActions.set(actionKey, { result, timestamp: now });
      return result;
    }

    // Handle Cancellation Action
    if (request.type === 'CANCEL_ACTIVE_TASK') {
      this.pendingConfirmation = null;
      const result: ActionResult = {
        success: true,
        actionId: request.actionId,
        type: request.type,
        status: 'CANCELLED',
        message: 'Action cancelled by user',
        spokenResponse: 'ঠিক আছে, বাদ দিলাম।',
        timestamp: now,
      };
      this.recentActions.set(actionKey, { result, timestamp: now });
      return result;
    }

    // Handle Confirmed History Clear
    if (request.type === 'CLEAR_HISTORY_CONFIRMED') {
      try {
        localStorage.removeItem('signal_history');
        const result: ActionResult = {
          success: true,
          actionId: request.actionId,
          type: request.type,
          status: 'COMPLETED',
          message: 'Analysis history cleared successfully',
          spokenResponse: 'ঠিক আছে, হিস্ট্রি মুছে ফেলেছি।',
          timestamp: now,
        };
        this.recentActions.set(actionKey, { result, timestamp: now });
        return result;
      } catch (err: any) {
        return {
          success: false,
          actionId: request.actionId,
          type: request.type,
          status: 'FAILED',
          message: 'Failed to clear history',
          spokenResponse: 'হিস্ট্রি মুছতে গিয়ে একটি সমস্যা হয়েছে।',
          errorCode: 'STORAGE_ERROR',
          timestamp: now,
        };
      }
    }

    // Handle Navigation Actions
    if (def.category === 'NAVIGATION' && def.routeTarget) {
      if (this.navigationHandler) {
        this.navigationHandler(def.routeTarget);
      } else {
        // Fallback standard navigation
        window.location.hash = '';
        if (window.location.pathname !== def.routeTarget) {
          window.history.pushState({}, '', def.routeTarget);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }

      const spokenResponse = this.getNavigationSpokenResponse(def.type);
      const result: ActionResult = {
        success: true,
        actionId: request.actionId,
        type: request.type,
        status: 'COMPLETED',
        message: `Navigated to ${def.routeTarget}`,
        spokenResponse,
        timestamp: now,
      };
      this.recentActions.set(actionKey, { result, timestamp: now });
      return result;
    }

    // Handle UI Controls
    if (request.type === 'GO_BACK') {
      window.history.back();
      const result: ActionResult = {
        success: true,
        actionId: request.actionId,
        type: request.type,
        status: 'COMPLETED',
        message: 'Navigated back',
        spokenResponse: 'পেছনের পেজে নিয়ে আসলাম।',
        timestamp: now,
      };
      this.recentActions.set(actionKey, { result, timestamp: now });
      return result;
    }

    if (request.type === 'SCROLL_TO_TOP') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const result: ActionResult = {
        success: true,
        actionId: request.actionId,
        type: request.type,
        status: 'COMPLETED',
        message: 'Scrolled to top',
        spokenResponse: 'উপরে স্ক্রোল করেছি।',
        timestamp: now,
      };
      this.recentActions.set(actionKey, { result, timestamp: now });
      return result;
    }

    // News Query / Fundamental Intelligence Action
    if (request.type === 'QUERY_NEWS_SIGNAL') {
      try {
        const answer = await newsManager.answerNewsQuery(request.originalUtterance);
        const result: ActionResult = {
          success: true,
          actionId: request.actionId,
          type: request.type,
          status: 'COMPLETED',
          message: 'News analysis query completed',
          spokenResponse: answer,
          timestamp: now,
        };
        this.recentActions.set(actionKey, { result, timestamp: now });
        return result;
      } catch (err: any) {
        return {
          success: false,
          actionId: request.actionId,
          type: request.type,
          status: 'FAILED',
          message: 'Failed to retrieve news data',
          spokenResponse: 'এই মুহূর্তে নিউজ ডেটা পেতে সমস্যা হচ্ছে। একটু পরে চেষ্টা করুন।',
          timestamp: now,
        };
      }
    }

    // Chart Analysis Trigger Action
    if (request.type === 'TRIGGER_CHART_ANALYSIS') {
      try {
        const analysis = await sufiaTradingBridge.analyzeCurrentChart();
        const result: ActionResult = {
          success: analysis.success,
          actionId: request.actionId,
          type: request.type,
          status: analysis.success ? 'COMPLETED' : 'FAILED',
          message: analysis.error || 'Chart analysis executed',
          spokenResponse: analysis.conversationalSummary || 'চার্ট অ্যানালাইসিস সম্পন্ন হয়েছে।',
          timestamp: now,
        };
        this.recentActions.set(actionKey, { result, timestamp: now });
        return result;
      } catch (err: any) {
        return {
          success: false,
          actionId: request.actionId,
          type: request.type,
          status: 'FAILED',
          message: 'Chart analysis failed',
          spokenResponse: 'চার্ট অ্যানালাইসিসে সমস্যা হয়েছে।',
          timestamp: now,
        };
      }
    }

    // Fallback for unknown actions
    const result: ActionResult = {
      success: false,
      actionId: request.actionId,
      type: 'UNKNOWN_ACTION',
      status: 'UNSUPPORTED',
      message: 'Unsupported action',
      spokenResponse: 'এই কমান্ডটি এই মুহূর্তে সম্পন্ন করা সম্ভব নয়।',
      timestamp: now,
    };
    return result;
  }

  private getNavigationSpokenResponse(type: ActionType): string {
    switch (type) {
      case 'OPEN_ANALYZER':
      case 'OPEN_TRADING':
        return 'ঠিক আছে, Chart Analyzer খুলে দিয়েছি।';
      case 'OPEN_NEWS':
        return 'ঠিক আছে, Forex News Signal সেকশন খুলে দিয়েছি।';
      case 'OPEN_SETTINGS':
        return 'Settings খুলে দিয়েছি।';
      case 'OPEN_HISTORY':
        return 'History খুলে দিয়েছি।';
      case 'OPEN_SUFIA':
        return 'Sufia Voice & Vision Hub-এ নিয়ে এসেছি।';
      case 'OPEN_TEST_MODE':
        return 'Test Mode Lab খুলে দিয়েছি।';
      case 'OPEN_DASHBOARD':
        return 'Dashboard-এ নিয়ে এসেছি।';
      default:
        return 'কাজটি সম্পন্ন হয়েছে।';
    }
  }

  private isAffirmative(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return (
      lower === 'হ্যাঁ' ||
      lower === 'হ্যা' ||
      lower === 'yes' ||
      lower === 'confirm' ||
      lower === 'ok' ||
      lower === 'ঠিক আছে' ||
      lower === 'মুছে ফেল' ||
      lower === 'do it'
    );
  }

  private isNegative(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return (
      lower === 'না' ||
      lower === 'no' ||
      lower === 'cancel' ||
      lower === 'দরকার নেই' ||
      lower === 'না থাক' ||
      lower === 'থাক'
    );
  }

  private isCancellation(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return (
      lower.includes('থামো') ||
      lower.includes('বাদ দাও') ||
      lower.includes('cancel') ||
      lower.includes('দরকার নেই') ||
      lower.includes('বন্ধ করো') ||
      lower.includes('থাক')
    );
  }
}

export const actionManager = ActionManager.getInstance();
