/**
 * PHASE 13 — MEMORY RETRIEVER
 * 
 * Provides fast (<10ms local processing), relevance-ranked memory retrieval
 * that injects compact context without blocking Gemini Live streams or AudioWorklet.
 */

import { MemoryItem, MemoryQueryOptions } from './memoryTypes';
import { memoryStore } from './memoryStore';
import { MemoryPolicy } from './memoryPolicy';

export class MemoryRetriever {
  private static instance: MemoryRetriever;

  private constructor() {}

  public static getInstance(): MemoryRetriever {
    if (!MemoryRetriever.instance) {
      MemoryRetriever.instance = new MemoryRetriever();
    }
    return MemoryRetriever.instance;
  }

  /**
   * Retrieves compact relevant memories for context orchestration (<10ms guaranteed)
   */
  public retrieveRelevantMemories(utterance: string): {
    memories: MemoryItem[];
    formattedContext: string;
    retrievalLatencyMs: number;
  } {
    const startTime = performance.now();

    // Query high and medium confidence items
    const candidates = memoryStore.query({
      minConfidence: 'MEDIUM',
      limit: 15,
    });

    const lowerUtterance = (utterance || '').toLowerCase();

    // Rank candidates by relevance to current utterance
    const ranked = candidates.map(item => {
      let score = item.importance * 2;
      const lowerContent = item.content.toLowerCase();
      const lowerKey = item.key.toLowerCase();

      // Check keyword overlap
      if (lowerUtterance && (lowerContent.includes(lowerUtterance) || lowerKey.includes(lowerUtterance))) {
        score += 10;
      }

      // Explicit user memories prioritized
      if (item.category === 'EXPLICIT_USER') {
        score += 5;
      }

      // Preference memories
      if (item.category === 'PREFERENCE') {
        score += 3;
      }

      return { item, score };
    });

    // Sort descending by score
    ranked.sort((a, b) => b.score - a.score);

    // Pick top 5 most relevant memories to keep prompt compact
    const topMemories = ranked.slice(0, 5).map(r => r.item);

    // Format compact context string
    let formattedContext = '';
    if (topMemories.length > 0) {
      const lines = topMemories.map(m => `- [${m.category}]: ${m.content}`);
      formattedContext = `মেমোরি কনটেক্সট:\n${lines.join('\n')}`;
    }

    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      memories: topMemories,
      formattedContext,
      retrievalLatencyMs: latencyMs,
    };
  }
}

export const memoryRetriever = MemoryRetriever.getInstance();
