export type VisionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
export type VisualState = 'ACTIVE' | 'INACTIVE' | 'STALE' | 'UNAVAILABLE' | 'UPDATING';
export type VisualChangeLevel = 'NONE' | 'UNCHANGED' | 'SLIGHT' | 'SIGNIFICANT';

export interface VisualFrameMetadata {
  timestamp: number;
  width: number;
  height: number;
  mimeType: string;
  source: 'screen_share';
  changeLevel: VisualChangeLevel;
  confidence: VisionConfidence;
}

export interface VisualContext {
  state: VisualState;
  isSharing: boolean;
  hasFrame: boolean;
  latestMetadata: VisualFrameMetadata | null;
  frameAgeMs: number;
  confidence: VisionConfidence;
  changeLevel: VisualChangeLevel;
}

export class VisionContextManager {
  private isSharing: boolean = false;
  private latestTimestamp: number = 0;
  private latestMetadata: VisualFrameMetadata | null = null;
  private lastSampleFingerprint: number = 0;
  private listeners: Array<(context: VisualContext) => void> = [];
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Stale threshold: 10 seconds without a new frame while sharing
  private static readonly STALE_THRESHOLD_MS = 10000;

  constructor() {
    if (typeof window !== 'undefined') {
      this.staleCheckTimer = setInterval(() => {
        this.checkStaleness();
      }, 2000);
    }
  }

  public subscribe(listener: (context: VisualContext) => void): () => void {
    this.listeners.push(listener);
    listener(this.getContext());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    const ctx = this.getContext();
    for (const listener of this.listeners) {
      try {
        listener(ctx);
      } catch (e) {
        console.error('[VisionContextManager] Listener error:', e);
      }
    }
  }

  /**
   * Called when screen share starts or stops
   */
  public setSharingActive(active: boolean) {
    this.isSharing = active;
    if (!active) {
      this.reset();
    } else {
      this.notify();
    }
  }

  /**
   * Register incoming visual frame with lightweight change detection
   */
  public registerFrame(width: number, height: number, mimeType: string, base64Preview?: string) {
    const now = Date.now();
    this.latestTimestamp = now;

    // Lightweight non-blocking fingerprint calculation (sample characters in base64 string)
    let changeLevel: VisualChangeLevel = 'SIGNIFICANT';
    if (base64Preview && base64Preview.length > 100) {
      const fingerprint = this.computeLightweightFingerprint(base64Preview);
      if (this.lastSampleFingerprint !== 0) {
        const diff = Math.abs(fingerprint - this.lastSampleFingerprint);
        if (diff === 0) {
          changeLevel = 'UNCHANGED';
        } else if (diff < 500) {
          changeLevel = 'SLIGHT';
        } else {
          changeLevel = 'SIGNIFICANT';
        }
      }
      this.lastSampleFingerprint = fingerprint;
    }

    const confidence: VisionConfidence = this.isSharing ? 'HIGH' : 'UNAVAILABLE';

    this.latestMetadata = {
      timestamp: now,
      width,
      height,
      mimeType,
      source: 'screen_share',
      changeLevel,
      confidence,
    };

    this.notify();
  }

  private computeLightweightFingerprint(str: string): number {
    let hash = 0;
    // Step through string at coarse intervals to remain O(1) lightweight
    const step = Math.max(1, Math.floor(str.length / 64));
    for (let i = 0; i < str.length; i += step) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  private checkStaleness() {
    if (!this.isSharing) return;

    if (this.latestTimestamp > 0) {
      const age = Date.now() - this.latestTimestamp;
      if (age > VisionContextManager.STALE_THRESHOLD_MS) {
        if (this.latestMetadata && this.latestMetadata.confidence !== 'LOW') {
          this.latestMetadata.confidence = 'LOW';
          this.notify();
        }
      }
    }
  }

  /**
   * Reset visual context when sharing ends or conversation clears
   */
  public reset() {
    this.isSharing = false;
    this.latestTimestamp = 0;
    this.latestMetadata = null;
    this.lastSampleFingerprint = 0;
    this.notify();
  }

  /**
   * Get current visual context snapshot
   */
  public getContext(): VisualContext {
    const now = Date.now();
    const frameAgeMs = this.latestTimestamp > 0 ? now - this.latestTimestamp : 0;
    const hasFrame = this.isSharing && this.latestTimestamp > 0 && frameAgeMs < 20000;

    let state: VisualState = 'UNAVAILABLE';
    let confidence: VisionConfidence = 'UNAVAILABLE';

    if (!this.isSharing) {
      state = 'UNAVAILABLE';
      confidence = 'UNAVAILABLE';
    } else if (!hasFrame) {
      state = 'ACTIVE';
      confidence = 'MEDIUM';
    } else if (frameAgeMs > VisionContextManager.STALE_THRESHOLD_MS) {
      state = 'STALE';
      confidence = 'LOW';
    } else {
      state = 'ACTIVE';
      confidence = this.latestMetadata?.confidence || 'HIGH';
    }

    return {
      state,
      isSharing: this.isSharing,
      hasFrame,
      latestMetadata: this.latestMetadata,
      frameAgeMs,
      confidence,
      changeLevel: this.latestMetadata?.changeLevel || 'NONE',
    };
  }

  public getDisplayStatus(): string {
    const ctx = this.getContext();
    if (!ctx.isSharing) return 'VISION UNAVAILABLE';
    if (ctx.state === 'ACTIVE') return 'VISION ACTIVE';
    if (ctx.state === 'STALE') return 'VISION UPDATING';
    return 'VISION READY';
  }
}

export const visionContextManager = new VisionContextManager();
