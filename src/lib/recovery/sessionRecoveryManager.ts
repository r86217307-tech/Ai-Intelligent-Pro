/**
 * PHASE 10 — SESSION RECOVERY & CONTEXT PERSISTENCE MANAGER
 * Preserves lightweight context across WebSocket reconnections:
 * - Active topic, active task, latest user intent, recent turn summaries
 * - Latest validated trading reference (flagged for revalidation if >45s old)
 * - Relevant news context
 * 
 * STRICT PROHIBITIONS:
 * - Never persist raw microphone audio, PCM buffers, or raw screen frames
 * - Never store API secrets or sensitive tokens
 */

import { ConversationTopic, ConversationLanguage } from '../conversation/conversationContext';
import { ActiveTask } from '../conversation/taskStateManager';

export interface PreservedTradingContext {
  asset: string;
  timeframe: string;
  lastSignal: 'CALL' | 'PUT' | 'NO_TRADE';
  reasonCode?: string;
  analysisTimestamp: number;
  isStale: boolean;
}

export interface PreservedNewsContext {
  eventName: string;
  currency: string;
  bias: string;
  timestamp: number;
}

export interface PreservedSessionSnapshot {
  sessionId: string;
  savedAt: number;
  activeTopic: ConversationTopic;
  detectedLanguage: ConversationLanguage;
  lastUserIntent: string;
  activeTask: ActiveTask | null;
  tradingContext: PreservedTradingContext | null;
  newsContext: PreservedNewsContext | null;
  recentSummary: string[];
}

export class SessionRecoveryManager {
  private lastSnapshot: PreservedSessionSnapshot | null = null;
  private reconnectCount: number = 0;

  /**
   * Save lightweight session snapshot before reconnecting or during turns
   */
  public saveSnapshot(snapshot: Partial<PreservedSessionSnapshot>): void {
    this.lastSnapshot = {
      sessionId: snapshot.sessionId || `SES-${Date.now().toString(36).toUpperCase()}`,
      savedAt: Date.now(),
      activeTopic: snapshot.activeTopic || 'general',
      detectedLanguage: snapshot.detectedLanguage || 'banglish',
      lastUserIntent: snapshot.lastUserIntent || '',
      activeTask: snapshot.activeTask || null,
      tradingContext: snapshot.tradingContext || null,
      newsContext: snapshot.newsContext || null,
      recentSummary: snapshot.recentSummary || [],
    };
  }

  /**
   * Get preserved snapshot to hydrate a freshly reconnected session
   */
  public getSnapshot(): PreservedSessionSnapshot | null {
    if (!this.lastSnapshot) return null;

    // Check if trading context is stale (>45 seconds old)
    if (this.lastSnapshot.tradingContext) {
      const age = Date.now() - this.lastSnapshot.tradingContext.analysisTimestamp;
      if (age > 45000) {
        this.lastSnapshot.tradingContext.isStale = true;
      }
    }

    return this.lastSnapshot;
  }

  /**
   * Generate a concise context re-injection prompt for the reconnected Gemini session
   */
  public generateRecoveryContextPrompt(): string | null {
    const s = this.getSnapshot();
    if (!s) return null;

    const parts: string[] = [];
    parts.push(`[SYSTEM NOTE: Live connection was seamlessly recovered]`);
    if (s.activeTopic && s.activeTopic !== 'general') {
      parts.push(`Active Topic: ${s.activeTopic}`);
    }
    if (s.activeTask) {
      parts.push(`Active Task: ${s.activeTask.name} (Status: ${s.activeTask.state})`);
    }
    if (s.tradingContext) {
      if (s.tradingContext.isStale) {
        parts.push(`Trading Reference: ${s.tradingContext.asset} ${s.tradingContext.timeframe} (PREVIOUS: ${s.tradingContext.lastSignal} - WARNING: Context is >45s old, revalidation needed before any live signal).`);
      } else {
        parts.push(`Trading Reference: ${s.tradingContext.asset} ${s.tradingContext.timeframe} (${s.tradingContext.lastSignal})`);
      }
    }
    if (s.newsContext) {
      parts.push(`Forex News Context: ${s.newsContext.eventName} (${s.newsContext.currency}) - Bias: ${s.newsContext.bias}`);
    }
    if (s.lastUserIntent) {
      parts.push(`Last user statement before brief disconnect: "${s.lastUserIntent}"`);
    }

    return parts.join('\n');
  }

  public incrementReconnect(): number {
    this.reconnectCount += 1;
    return this.reconnectCount;
  }

  public getReconnectCount(): number {
    return this.reconnectCount;
  }

  public reset(): void {
    this.lastSnapshot = null;
    this.reconnectCount = 0;
  }
}

export const sessionRecoveryManager = new SessionRecoveryManager();
