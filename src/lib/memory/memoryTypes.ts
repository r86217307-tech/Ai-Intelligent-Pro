/**
 * PHASE 13 — MEMORY TYPES & INTERFACES
 */

export type MemoryCategory = 
  | 'SESSION'
  | 'PREFERENCE'
  | 'TASK'
  | 'PROJECT_CONTEXT'
  | 'EXPLICIT_USER';

export type MemoryConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type MemoryScope = 'GLOBAL' | 'SESSION' | 'TASK';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  key: string;
  content: string;
  confidence: MemoryConfidence;
  scope: MemoryScope;
  importance: number; // 1 to 5
  source: 'EXPLICIT_COMMAND' | 'INFERRED_PREFERENCE' | 'TASK_LIFECYCLE' | 'SYSTEM';
  createdAt: number;
  updatedAt: number;
  expiresAt?: number; // Optional TTL timestamp
  lastUsedAt: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface MemoryQueryOptions {
  category?: MemoryCategory;
  scope?: MemoryScope;
  minConfidence?: MemoryConfidence;
  queryText?: string;
  limit?: number;
}

export interface MemoryCommandResult {
  action: 'SAVE' | 'UPDATE' | 'DELETE' | 'CLEAR' | 'NONE';
  success: boolean;
  item?: MemoryItem;
  message: string;
}

export interface MemoryStats {
  totalItems: number;
  byCategory: Record<MemoryCategory, number>;
  lastCompactionTime?: number;
  retrievalLatencyMs: number;
}
