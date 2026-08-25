/**
 * PHASE 13 — MEMORY POLICY LAYER
 * 
 * Enforces:
 * - Sanitization (strips API keys, passwords, raw audio, raw image/screen frames, tokens)
 * - Expiration (TTL checks for temporary/session data)
 * - Deduplication & update merging
 * - Bounded storage limits (max 50 total preference/explicit items, max 10 active tasks, max 20 session items)
 * - Confidence filtering (LOW confidence items ignored for factual assertions)
 */

import { MemoryItem, MemoryCategory, MemoryConfidence } from './memoryTypes';

export class MemoryPolicy {
  // Max item limits
  public static readonly MAX_EXPLICIT_ITEMS = 30;
  public static readonly MAX_PREFERENCE_ITEMS = 20;
  public static readonly MAX_TASK_ITEMS = 10;
  public static readonly MAX_SESSION_ITEMS = 20;
  public static readonly MAX_PROJECT_CONTEXT_ITEMS = 10;

  // Sensitive patterns to scrub
  private static readonly SENSITIVE_PATTERNS = [
    /api[-_]?key\s*[:=]\s*\S+/gi,
    /bearer\s+[a-zA-Z0-9._-]+/gi,
    /password\s*[:=]\s*\S+/gi,
    /secret\s*[:=]\s*\S+/gi,
    /data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+/gi,
    /data:audio\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+/gi,
  ];

  /**
   * Sanitizes memory content to guarantee no sensitive data or heavy blobs are persisted
   */
  public static sanitizeContent(content: string): string {
    if (!content) return '';
    let clean = content;
    for (const pattern of MemoryPolicy.SENSITIVE_PATTERNS) {
      clean = clean.replace(pattern, '[REDACTED_SENSITIVE_DATA]');
    }
    // Truncate overly long content to protect storage
    if (clean.length > 500) {
      clean = clean.substring(0, 500) + '...';
    }
    return clean.trim();
  }

  /**
   * Checks if an item is expired based on current timestamp
   */
  public static isExpired(item: MemoryItem, now: number = Date.now()): boolean {
    if (item.expiresAt && item.expiresAt <= now) {
      return true;
    }
    return false;
  }

  /**
   * Checks if memory confidence is sufficient for factual assertion
   */
  public static isConfidenceValid(confidence: MemoryConfidence, requiredMin: MemoryConfidence = 'MEDIUM'): boolean {
    const levels: Record<MemoryConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return levels[confidence] >= levels[requiredMin];
  }

  /**
   * Get maximum allowed capacity for a category
   */
  public static getMaxCategoryCapacity(category: MemoryCategory): number {
    switch (category) {
      case 'EXPLICIT_USER': return MemoryPolicy.MAX_EXPLICIT_ITEMS;
      case 'PREFERENCE': return MemoryPolicy.MAX_PREFERENCE_ITEMS;
      case 'TASK': return MemoryPolicy.MAX_TASK_ITEMS;
      case 'SESSION': return MemoryPolicy.MAX_SESSION_ITEMS;
      case 'PROJECT_CONTEXT': return MemoryPolicy.MAX_PROJECT_CONTEXT_ITEMS;
      default: return 20;
    }
  }

  /**
   * Normalizes key for deduplication
   */
  public static normalizeKey(key: string): string {
    return key.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  }
}
