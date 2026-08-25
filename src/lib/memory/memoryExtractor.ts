/**
 * PHASE 13 — MEMORY EXTRACTOR
 * 
 * Parses explicit user memory commands and infers durable non-sensitive preferences
 * in Bengali, English, and Banglish without hallucination.
 */

import { MemoryItem, MemoryCategory, MemoryConfidence, MemoryScope } from './memoryTypes';
import { conversationStyleManager } from '../conversation/conversationStyleManager';

export interface ExtractedMemoryCommand {
  type: 'SAVE' | 'DELETE' | 'INSPECT' | 'CLEAR' | 'NONE';
  key?: string;
  content?: string;
  category: MemoryCategory;
  confidence: MemoryConfidence;
  explicitUserIntent: boolean;
}

export class MemoryExtractor {
  private static instance: MemoryExtractor;

  private constructor() {}

  public static getInstance(): MemoryExtractor {
    if (!MemoryExtractor.instance) {
      MemoryExtractor.instance = new MemoryExtractor();
    }
    return MemoryExtractor.instance;
  }

  /**
   * Parses user utterance for explicit memory commands
   */
  public parseUtterance(text: string): ExtractedMemoryCommand {
    if (!text || !text.trim()) {
      return { type: 'NONE', category: 'SESSION', confidence: 'LOW', explicitUserIntent: false };
    }

    const lower = text.toLowerCase().trim();

    // 1. Explicit Memory Inspection ("তুমি আমার সম্পর্কে কী কী মনে রেখেছ?", "What do you remember?")
    if (
      lower.includes('কী কী মনে রেখেছ') || 
      lower.includes('কি মনে রেখেছ') || 
      lower.includes('কি কি মনে রেখেছ') || 
      lower.includes('what do you remember') || 
      lower.includes('show memory') || 
      lower.includes('আমার মেমোরি')
    ) {
      return {
        type: 'INSPECT',
        category: 'EXPLICIT_USER',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    // 2. Explicit Clear Command ("সব মনে রাখা মুছে ফেলো", "clear memory")
    if (
      lower.includes('সব মুছে ফেলো') || 
      lower.includes('মেমোরি ক্লিয়ার করো') || 
      lower.includes('clear memory') || 
      lower.includes('forget everything')
    ) {
      return {
        type: 'CLEAR',
        category: 'EXPLICIT_USER',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    // 3. Explicit Delete / Forget Commands ("এটা ভুলে যাও", "Forget this")
    const deleteMatch = text.match(/(?:এটা\s*|সব\s*)?(?:ভুলে\s*যাও|মনে\s*রেখো\s*না|forget\s*this|don't\s*remember\s*this|delete\s*memory)\s*(.*)/i);
    if (deleteMatch) {
      const target = deleteMatch[1]?.trim() || 'last_preference';
      return {
        type: 'DELETE',
        key: target,
        category: 'EXPLICIT_USER',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    // 4. Explicit Remember Commands ("এটা মনে রাখো", "Remember this")
    const saveMatch = text.match(/(?:এটা|আমার|এই)\s*(?:মনে\s*রাখো|মনে\s*রেখো|remember\s*this|remember\s*that)\s*:?\s*(.*)/i);
    if (saveMatch && saveMatch[1] && saveMatch[1].trim().length > 0) {
      const content = saveMatch[1].trim();
      return {
        type: 'SAVE',
        key: `explicit_${Date.now()}`,
        content,
        category: 'EXPLICIT_USER',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    // 5. Explicit Preference Commands ("আমার পছন্দ বাংলা", "I prefer English")
    if (lower.includes('বাংলা পছন্দ') || lower.includes('বাংলায় কথা বলো') || lower.includes('prefer bengali')) {
      return {
        type: 'SAVE',
        key: 'language_preference',
        content: 'বাংলা ব্যাকরণ ও প্রমিত ভাষা পছন্দ করেন',
        category: 'PREFERENCE',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    if (lower.includes('সংক্ষেপে বলবে') || lower.includes('ছোট করে উত্তর দেবে') || lower.includes('prefer concise')) {
      return {
        type: 'SAVE',
        key: 'response_style_preference',
        content: 'সংক্ষিপ্ত উত্তর পছন্দ করেন',
        category: 'PREFERENCE',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    if (lower.includes('বিস্তারিত বলবে') || lower.includes('ডিটেইলে বলবে') || lower.includes('prefer detailed')) {
      return {
        type: 'SAVE',
        key: 'response_style_preference',
        content: 'বিস্তারিত ব্যাখ্যা পছন্দ করেন',
        category: 'PREFERENCE',
        confidence: 'HIGH',
        explicitUserIntent: true,
      };
    }

    return { type: 'NONE', category: 'SESSION', confidence: 'LOW', explicitUserIntent: false };
  }

  /**
   * Creates a structured MemoryItem from command
   */
  public createMemoryItemFromCommand(cmd: ExtractedMemoryCommand): MemoryItem | null {
    if (cmd.type !== 'SAVE' || !cmd.content) return null;

    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = Date.now();

    return {
      id,
      category: cmd.category,
      key: cmd.key || id,
      content: cmd.content,
      confidence: cmd.confidence,
      scope: cmd.category === 'SESSION' ? 'SESSION' : 'GLOBAL',
      importance: cmd.explicitUserIntent ? 5 : 3,
      source: cmd.explicitUserIntent ? 'EXPLICIT_COMMAND' : 'INFERRED_PREFERENCE',
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    };
  }
}

export const memoryExtractor = MemoryExtractor.getInstance();
