import { visionContextManager } from '../vision/visionContextManager';
import { sufiaTradingBridge } from '../trading/sufiaTradingBridge';
import { taskStateManager, ActiveTask } from './taskStateManager';
import { sessionRecoveryManager } from '../recovery/sessionRecoveryManager';

export type ConversationTopic = 
  | 'general' 
  | 'app_development' 
  | 'sufia' 
  | 'trading' 
  | 'chart_analysis' 
  | 'forex_news' 
  | 'vision' 
  | 'cross_system' 
  | 'settings' 
  | 'troubleshooting';

export type ConversationLanguage = 'bengali' | 'english' | 'banglish';

export interface TurnContext {
  turnId: number;
  userQuery: string;
  assistantReply?: string;
  topic: ConversationTopic;
  language: ConversationLanguage;
  referencedObject?: string | null;
  hasVisualContext: boolean;
  hasTradingContext: boolean;
  isCorrection?: boolean;
  isCancellation?: boolean;
  isConfusion?: boolean;
  confusionDepth: number;
  lengthPreference: 'default' | 'concise' | 'detailed';
  timestamp: number;
}

export interface ConversationStateSnapshot {
  currentTurnId: number;
  activeTopic: ConversationTopic;
  detectedLanguage: ConversationLanguage;
  lastReferencedObject: string | null;
  lastUserIntent: string;
  lastAssistantResponse: string;
  activeQuestion: string | null;
  isAwaitingClarification: boolean;
  confusionDepth: number;
  lengthPreference: 'default' | 'concise' | 'detailed';
  compactedSummary: string[];
  recentTurns: TurnContext[];
}

export class ConversationContextTracker {
  private currentTurnId = 0;
  private activeTopic: ConversationTopic = 'general';
  private detectedLanguage: ConversationLanguage = 'banglish';
  private lastReferencedObject: string | null = null;
  private lastUserIntent: string = '';
  private lastAssistantResponse: string = '';
  private activeQuestion: string | null = null;
  private isAwaitingClarification: boolean = false;
  private confusionDepth: number = 0;
  private lengthPreference: 'default' | 'concise' | 'detailed' = 'default';
  private recentTurns: TurnContext[] = [];
  private compactedSummary: string[] = [];

  private static readonly MAX_RECENT_TURNS = 20;
  private static readonly MAX_COMPACTED_ITEMS = 5;

  /**
   * Start a new conversational turn
   */
  public startNewTurn(userText: string): TurnContext {
    this.currentTurnId += 1;
    const lang = this.detectLanguage(userText);
    const topic = this.classifyTopic(userText);
    const refObj = this.extractReferencedObject(userText);
    const isCorrection = this.detectCorrection(userText);
    const isCancellation = taskStateManager.isCancellationIntent(userText);
    const isConfusion = taskStateManager.isConfusionIntent(userText);

    // Track response length preference in current session
    const detectedPref = taskStateManager.detectLengthPreference(userText);
    if (detectedPref) {
      this.lengthPreference = detectedPref;
    }

    // Handle topic transitions
    if (topic !== 'general' || this.recentTurns.length === 0) {
      if (topic !== this.activeTopic) {
        this.activeTopic = topic;
        this.confusionDepth = 0; // Reset confusion depth on topic switch
      }
    }

    // Track progressive confusion depth
    if (isConfusion) {
      this.confusionDepth += 1;
    } else if (userText.length > 10 && !isConfusion) {
      // If user moved forward with a distinct statement, reduce confusion depth
      this.confusionDepth = Math.max(0, this.confusionDepth - 1);
    }

    // Handle task cancellation if active task exists
    if (isCancellation) {
      taskStateManager.cancelTask('User requested stop/cancellation');
    }

    if (refObj) {
      this.lastReferencedObject = refObj;
    }

    this.detectedLanguage = lang;
    this.lastUserIntent = userText;

    const visualCtx = visionContextManager.getContext();
    const hasTrading = sufiaTradingBridge.isTradingIntent(userText) || this.activeTopic === 'trading' || this.activeTopic === 'chart_analysis';

    const turn: TurnContext = {
      turnId: this.currentTurnId,
      userQuery: userText,
      topic: this.activeTopic,
      language: this.detectedLanguage,
      referencedObject: this.lastReferencedObject,
      hasVisualContext: visualCtx.hasFrame && visualCtx.isSharing,
      hasTradingContext: hasTrading,
      isCorrection,
      isCancellation,
      isConfusion,
      confusionDepth: this.confusionDepth,
      lengthPreference: this.lengthPreference,
      timestamp: Date.now(),
    };

    this.recentTurns.push(turn);
    
    // Context Compaction for long conversations (50+ / 100+ turns)
    if (this.recentTurns.length > ConversationContextTracker.MAX_RECENT_TURNS) {
      const oldest = this.recentTurns.shift();
      if (oldest && oldest.userQuery) {
        this.compactTurn(oldest);
      }
    }

    // Persist snapshot in session recovery manager
    this.syncSessionRecovery();

    return turn;
  }

  /**
   * Compacts an older turn into a high-level summary statement to preserve memory
   */
  private compactTurn(turn: TurnContext): void {
    let summary = `Turn #${turn.turnId} (${turn.topic}): User asked "${turn.userQuery.substring(0, 40)}${turn.userQuery.length > 40 ? '...' : ''}"`;
    if (turn.isCorrection) {
      summary += ` [User Correction]`;
    }
    this.compactedSummary.push(summary);
    if (this.compactedSummary.length > ConversationContextTracker.MAX_COMPACTED_ITEMS) {
      this.compactedSummary.shift();
    }
  }

  private syncSessionRecovery(): void {
    const activeTask = taskStateManager.getActiveTask();
    const tradingAnalysis = sufiaTradingBridge.getLatestAnalysis();
    
    sessionRecoveryManager.saveSnapshot({
      activeTopic: this.activeTopic,
      detectedLanguage: this.detectedLanguage,
      lastUserIntent: this.lastUserIntent,
      activeTask: activeTask,
      tradingContext: tradingAnalysis ? {
        asset: tradingAnalysis.asset,
        timeframe: tradingAnalysis.timeframe,
        lastSignal: tradingAnalysis.signal,
        reasonCode: tradingAnalysis.reasonCode,
        analysisTimestamp: tradingAnalysis.timestamp,
        isStale: (Date.now() - tradingAnalysis.timestamp) > 45000,
      } : null,
      recentSummary: [...this.compactedSummary],
    });
  }

  /**
   * Record assistant's response for a specific turn ID (protects against stale/interrupted responses)
   */
  public recordAssistantResponse(turnId: number, responseText: string): boolean {
    // If response is for an older/interrupted turn, ignore to avoid race condition
    if (turnId < this.currentTurnId && this.recentTurns.length > 0) {
      const isLatest = this.recentTurns[this.recentTurns.length - 1]?.turnId === turnId;
      if (!isLatest) {
        console.log(`[ConversationContext] Discarding stale response from turn ${turnId} (current: ${this.currentTurnId})`);
        return false;
      }
    }

    this.lastAssistantResponse = responseText;
    const matchingTurn = this.recentTurns.find(t => t.turnId === turnId);
    if (matchingTurn) {
      matchingTurn.assistantReply = responseText;
    }

    // Detect if assistant asked a question or clarification
    if (responseText.includes('?') || responseText.includes('বলছো?') || responseText.includes('কী?')) {
      this.activeQuestion = responseText;
      this.isAwaitingClarification = true;
    } else {
      this.activeQuestion = null;
      this.isAwaitingClarification = false;
    }

    this.syncSessionRecovery();
    return true;
  }

  /**
   * Handle user interruption
   */
  public handleInterruption(): void {
    console.log(`[ConversationContext] Interruption registered at turn ${this.currentTurnId}`);
    // Clear pending clarification if interrupted
    this.isAwaitingClarification = false;
  }

  /**
   * Get current state snapshot
   */
  public getSnapshot(): ConversationStateSnapshot {
    return {
      currentTurnId: this.currentTurnId,
      activeTopic: this.activeTopic,
      detectedLanguage: this.detectedLanguage,
      lastReferencedObject: this.lastReferencedObject,
      lastUserIntent: this.lastUserIntent,
      lastAssistantResponse: this.lastAssistantResponse,
      activeQuestion: this.activeQuestion,
      isAwaitingClarification: this.isAwaitingClarification,
      confusionDepth: this.confusionDepth,
      lengthPreference: this.lengthPreference,
      compactedSummary: [...this.compactedSummary],
      recentTurns: [...this.recentTurns],
    };
  }

  public getCurrentTurnId(): number {
    return this.currentTurnId;
  }

  public getActiveTopic(): ConversationTopic {
    return this.activeTopic;
  }

  public getLastReferencedObject(): string | null {
    return this.lastReferencedObject;
  }

  public reset(): void {
    this.currentTurnId = 0;
    this.activeTopic = 'general';
    this.detectedLanguage = 'banglish';
    this.lastReferencedObject = null;
    this.lastUserIntent = '';
    this.lastAssistantResponse = '';
    this.activeQuestion = null;
    this.isAwaitingClarification = false;
    this.confusionDepth = 0;
    this.lengthPreference = 'default';
    this.recentTurns = [];
    this.compactedSummary = [];
    sessionRecoveryManager.reset();
  }

  private detectLanguage(text: string): ConversationLanguage {
    if (!text) return 'banglish';
    const bengaliRegex = /[\u0980-\u09FF]/;
    const hasBengali = bengaliRegex.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);

    if (hasBengali && hasEnglish) return 'banglish';
    if (hasBengali) return 'bengali';
    return 'english';
  }

  private classifyTopic(text: string): ConversationTopic {
    const lower = text.toLowerCase();

    // Cross-System (Chart + News combined)
    if (
      (lower.includes('chart') || lower.includes('চার্ট')) && 
      (lower.includes('news') || lower.includes('নিউজ') || lower.includes('fundamental'))
    ) {
      return 'cross_system';
    }

    if (
      lower.includes('nfp') || 
      lower.includes('cpi') || 
      lower.includes('fomc') || 
      lower.includes('forex news') || 
      lower.includes('অর্থনৈতিক খবর')
    ) {
      return 'forex_news';
    }

    if (
      lower.includes('chart') || 
      lower.includes('চার্ট') || 
      lower.includes('signal') || 
      lower.includes('সিগন্যাল') || 
      lower.includes('call') || 
      lower.includes('put') || 
      lower.includes('market structure') || 
      lower.includes('স্ট্রাকচার') ||
      lower.includes('smc') ||
      lower.includes('order block') ||
      lower.includes('fvg')
    ) {
      return 'chart_analysis';
    }

    if (lower.includes('screen') || lower.includes('স্ক্রিন') || lower.includes('দেখছো') || lower.includes('vision')) {
      return 'vision';
    }

    if (lower.includes('sufia') || lower.includes('voice') || lower.includes('কথা')) {
      return 'sufia';
    }

    if (lower.includes('setting') || lower.includes('theme') || lower.includes('sound')) {
      return 'settings';
    }

    if (lower.includes('app') || lower.includes('code') || lower.includes('feature') || lower.includes('build')) {
      return 'app_development';
    }

    return this.activeTopic || 'general';
  }

  private extractReferencedObject(text: string): string | null {
    const lower = text.toLowerCase();
    if (lower.includes('চার্ট') || lower.includes('chart')) return 'chart';
    if (lower.includes('সিগন্যাল') || lower.includes('signal')) return 'signal';
    if (lower.includes('স্ট্রাকচার') || lower.includes('structure')) return 'market_structure';
    if (lower.includes('screen') || lower.includes('স্ক্রিন')) return 'screen';
    if (lower.includes('app') || lower.includes('অ্যাপ')) return 'app';
    if (lower.includes('voice') || lower.includes('ভয়েস')) return 'voice';
    return null;
  }

  private detectCorrection(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.startsWith('না,') || 
      lower.startsWith('না ') || 
      lower.includes('মানে ') || 
      lower.includes('না এটা না') || 
      lower.includes('actually') ||
      lower.includes('i mean')
    );
  }
}

export const conversationContextTracker = new ConversationContextTracker();
