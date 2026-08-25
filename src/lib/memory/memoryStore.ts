/**
 * PHASE 13 — MEMORY STORE
 * 
 * Manages local storage persistence, memory compaction, bounds enforcement,
 * and memory item lifecycle operations.
 */

import { MemoryItem, MemoryCategory, MemoryQueryOptions } from './memoryTypes';
import { MemoryPolicy } from './memoryPolicy';

export class MemoryStore {
  private static readonly STORAGE_KEY = 'sufia_memory_store_v1';
  private items: Map<string, MemoryItem> = new Map();
  private lastCompactionTime: number = Date.now();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = localStorage.getItem(MemoryStore.STORAGE_KEY);
      if (!raw) return;

      const parsed: MemoryItem[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        parsed.forEach(item => {
          // Skip expired items on load
          if (!MemoryPolicy.isExpired(item, now)) {
            this.items.set(item.id, item);
          }
        });
      }
    } catch (e) {
      console.warn('[MemoryStore] Failed to load memories from storage:', e);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const array = Array.from(this.items.values());
      localStorage.setItem(MemoryStore.STORAGE_KEY, JSON.stringify(array));
    } catch (e) {
      console.warn('[MemoryStore] Failed to persist memories:', e);
    }
  }

  /**
   * Save or update a memory item with deduplication
   */
  public upsertItem(item: MemoryItem): MemoryItem {
    const sanitizedContent = MemoryPolicy.sanitizeContent(item.content);
    const normalizedKey = MemoryPolicy.normalizeKey(item.key || item.id);
    const now = Date.now();

    // Check for existing matching item by category + key for deduplication
    let existingItem: MemoryItem | undefined;
    for (const existing of this.items.values()) {
      if (existing.category === item.category && MemoryPolicy.normalizeKey(existing.key) === normalizedKey) {
        existingItem = existing;
        break;
      }
    }

    if (existingItem) {
      const updated: MemoryItem = {
        ...existingItem,
        content: sanitizedContent,
        confidence: item.confidence,
        importance: Math.max(existingItem.importance, item.importance),
        updatedAt: now,
        lastUsedAt: now,
        expiresAt: item.expiresAt,
        metadata: { ...existingItem.metadata, ...item.metadata },
      };
      this.items.set(existingItem.id, updated);
      this.enforceCategoryCapacity(item.category);
      this.saveToStorage();
      return updated;
    } else {
      const newItem: MemoryItem = {
        ...item,
        key: normalizedKey,
        content: sanitizedContent,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      };
      this.items.set(newItem.id, newItem);
      this.enforceCategoryCapacity(item.category);
      this.saveToStorage();
      return newItem;
    }
  }

  /**
   * Delete memory item by ID
   */
  public deleteItem(id: string): boolean {
    const deleted = this.items.delete(id);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * Delete memory item by key and category
   */
  public deleteByKey(key: string, category?: MemoryCategory): boolean {
    const norm = MemoryPolicy.normalizeKey(key);
    let deletedCount = 0;

    for (const [id, item] of Array.from(this.items.entries())) {
      if (MemoryPolicy.normalizeKey(item.key) === norm) {
        if (!category || item.category === category) {
          this.items.delete(id);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  /**
   * Clear all memories
   */
  public clearAll(): void {
    this.items.clear();
    this.saveToStorage();
  }

  /**
   * Query memories according to options
   */
  public query(options: MemoryQueryOptions = {}): MemoryItem[] {
    const now = Date.now();
    let result: MemoryItem[] = [];

    for (const item of this.items.values()) {
      // 1. Expiration check
      if (MemoryPolicy.isExpired(item, now)) {
        continue;
      }

      // 2. Category filter
      if (options.category && item.category !== options.category) {
        continue;
      }

      // 3. Scope filter
      if (options.scope && item.scope !== options.scope) {
        continue;
      }

      // 4. Min confidence filter
      if (options.minConfidence && !MemoryPolicy.isConfidenceValid(item.confidence, options.minConfidence)) {
        continue;
      }

      // 5. Query text matching
      if (options.queryText) {
        const q = options.queryText.toLowerCase();
        const matchesContent = item.content.toLowerCase().includes(q);
        const matchesKey = item.key.toLowerCase().includes(q);
        if (!matchesContent && !matchesKey) {
          continue;
        }
      }

      result.push(item);
    }

    // Sort by recency and importance
    result.sort((a, b) => (b.importance * 10 + b.updatedAt) - (a.importance * 10 + a.updatedAt));

    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * Get total item count and breakdown
   */
  public getStats(): { totalItems: number; byCategory: Record<MemoryCategory, number>; lastCompactionTime: number } {
    const byCategory: Record<MemoryCategory, number> = {
      SESSION: 0,
      PREFERENCE: 0,
      TASK: 0,
      PROJECT_CONTEXT: 0,
      EXPLICIT_USER: 0,
    };

    for (const item of this.items.values()) {
      if (!MemoryPolicy.isExpired(item)) {
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      }
    }

    return {
      totalItems: Object.values(byCategory).reduce((a, b) => a + b, 0),
      byCategory,
      lastCompactionTime: this.lastCompactionTime,
    };
  }

  /**
   * Enforces capacity limits per category (removes oldest/least important items)
   */
  private enforceCategoryCapacity(category: MemoryCategory): void {
    const capacity = MemoryPolicy.getMaxCategoryCapacity(category);
    const categoryItems = Array.from(this.items.values()).filter(i => i.category === category);

    if (categoryItems.length > capacity) {
      // Sort oldest / lowest importance first for removal
      categoryItems.sort((a, b) => (a.importance * 10 + a.updatedAt) - (b.importance * 10 + b.updatedAt));
      const toRemove = categoryItems.slice(0, categoryItems.length - capacity);
      toRemove.forEach(i => this.items.delete(i.id));
    }
  }

  /**
   * Run compaction: purge expired items and trim bounded storage
   */
  public compact(): number {
    const now = Date.now();
    let purged = 0;

    for (const [id, item] of Array.from(this.items.entries())) {
      if (MemoryPolicy.isExpired(item, now)) {
        this.items.delete(id);
        purged++;
      }
    }

    const categories: MemoryCategory[] = ['SESSION', 'PREFERENCE', 'TASK', 'PROJECT_CONTEXT', 'EXPLICIT_USER'];
    categories.forEach(cat => this.enforceCategoryCapacity(cat));

    this.lastCompactionTime = now;
    this.saveToStorage();
    return purged;
  }
}

export const memoryStore = new MemoryStore();
