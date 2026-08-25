import { ChatMessage, MultimodalInput } from '../voice/types';
import { visionContextManager } from '../vision/visionContextManager';
import { conversationContextTracker, TurnContext, ConversationStateSnapshot } from './conversationContext';
import { taskStateManager, ActiveTask } from './taskStateManager';

export interface ConversationTurnVisualMeta {
  hasVisualContext: boolean;
  visualFrameTimestamp?: number;
  frameAgeMs?: number;
  confidence?: string;
  changeLevel?: string;
}

export class ConversationManager {
  private messages: ChatMessage[] = [];
  private currentActiveTurnId: number = 0;

  public addMessage(message: ChatMessage): void {
    let turnMeta: TurnContext | null = null;

    if (message.role === 'user') {
      turnMeta = conversationContextTracker.startNewTurn(message.content);
      this.currentActiveTurnId = turnMeta.turnId;
    } else if (message.role === 'assistant') {
      const recorded = conversationContextTracker.recordAssistantResponse(this.currentActiveTurnId, message.content);
      if (!recorded && this.currentActiveTurnId > 0) {
        // Late response from an interrupted turn was rejected by tracker
        console.log(`[ConversationManager] Discarding late assistant message for turn ${this.currentActiveTurnId}`);
      }
    }

    // Annotate with current visual state snapshot without storing raw pixels
    const visualCtx = visionContextManager.getContext();
    const enrichedMessage = {
      ...message,
      turnId: this.currentActiveTurnId,
      visualMeta: visualCtx.hasFrame ? {
        hasVisualContext: true,
        visualFrameTimestamp: visualCtx.latestMetadata?.timestamp,
        frameAgeMs: visualCtx.frameAgeMs,
        confidence: visualCtx.confidence,
        changeLevel: visualCtx.changeLevel,
      } : {
        hasVisualContext: false,
      }
    };

    this.messages.push(enrichedMessage);
    
    // Bounded context window management (keep last 30 turns max to ensure zero memory bloat)
    if (this.messages.length > 30) {
      this.messages.shift();
    }
  }

  public getContext(): ChatMessage[] {
    return [...this.messages];
  }

  public getConversationSnapshot(): ConversationStateSnapshot {
    return conversationContextTracker.getSnapshot();
  }

  public getCurrentTurnId(): number {
    return this.currentActiveTurnId;
  }

  public getActiveTask(): ActiveTask | null {
    return taskStateManager.getActiveTask();
  }

  public clear(): void {
    this.messages = [];
    this.currentActiveTurnId = 0;
    conversationContextTracker.reset();
    taskStateManager.clear();
    visionContextManager.reset();
  }

  public handleInterrupt(): void {
    console.log('[ConversationManager] User interrupted assistant');
    conversationContextTracker.handleInterruption();
  }

  public processMultimodalInput(input: MultimodalInput): void {
    console.log('[ConversationManager] Received input type:', input.type);
  }
}

export const conversationManager = new ConversationManager();
export { taskStateManager };
export { actionManager } from '../actions/actionManager';

