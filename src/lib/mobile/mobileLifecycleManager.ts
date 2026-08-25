/**
 * Mobile Lifecycle & Interaction Manager for Sufia AI (Phase 19)
 * Handles Android/Mobile backgrounding, network switching, and touch-interaction safeguards.
 */

import { voiceManager } from '../voice/voiceManager';
import { visionContextManager } from '../vision/visionContextManager';
import { nativeBridge } from './nativeBridge';

export type AppLifecycleState = 'FOREGROUND' | 'BACKGROUND' | 'PAUSED';
export type NetworkStatus = 'ONLINE' | 'OFFLINE';

export interface MobileLifecycleListener {
  onStateChange?: (state: AppLifecycleState) => void;
  onNetworkChange?: (status: NetworkStatus) => void;
}

export class MobileLifecycleManager {
  private static instance: MobileLifecycleManager;
  private appState: AppLifecycleState = 'FOREGROUND';
  private networkStatus: NetworkStatus = 'ONLINE';
  private listeners: Set<MobileLifecycleListener> = new Set();
  private lastTapTimestampMap: Map<string, number> = new Map();
  private reconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public static getInstance(): MobileLifecycleManager {
    if (!MobileLifecycleManager.instance) {
      MobileLifecycleManager.instance = new MobileLifecycleManager();
    }
    return MobileLifecycleManager.instance;
  }

  private init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. App Visibility & Background State
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.setAppState('BACKGROUND');
        this.handleEnterBackground();
      } else {
        this.setAppState('FOREGROUND');
        this.handleEnterForeground();
      }
    });

    window.addEventListener('pagehide', () => {
      this.setAppState('BACKGROUND');
      this.handleEnterBackground();
    });

    window.addEventListener('pageshow', () => {
      this.setAppState('FOREGROUND');
      this.handleEnterForeground();
    });

    // 2. Network Stability & Transition Handling
    window.addEventListener('online', () => {
      this.setNetworkStatus('ONLINE');
      this.handleNetworkRestored();
    });

    window.addEventListener('offline', () => {
      this.setNetworkStatus('OFFLINE');
      this.handleNetworkLost();
    });

    // Initialize current network status
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      this.networkStatus = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    }
  }

  private setAppState(state: AppLifecycleState) {
    if (this.appState === state) return;
    this.appState = state;
    this.listeners.forEach((l) => l.onStateChange && l.onStateChange(state));
  }

  private setNetworkStatus(status: NetworkStatus) {
    if (this.networkStatus === status) return;
    this.networkStatus = status;
    this.listeners.forEach((l) => l.onNetworkChange && l.onNetworkChange(status));
  }

  /**
   * Called when application enters background (e.g. screen lock, call interruption, or tab switch)
   */
  private handleEnterBackground() {
    console.log('[MobileLifecycle] App entered BACKGROUND. Protecting audio focus & resources...');
    
    // Stop speaking playback when backgrounded to prevent unwanted audio leak
    if (voiceManager.state === 'SPEAKING') {
      voiceManager.stopSpeaking();
    }

    // Expire stale visual frame so outdated chart isn't analyzed later
    const ctx = visionContextManager.getContext();
    if (ctx.frameAgeMs > 30000) {
      visionContextManager.reset();
    }
  }

  /**
   * Called when application returns to foreground
   */
  private handleEnterForeground() {
    console.log('[MobileLifecycle] App entered FOREGROUND. Verifying audio & connection...');
    
    // Check if voice connection requires reconnecting
    if (this.networkStatus === 'ONLINE' && voiceManager.connectionState === 'DISCONNECTED') {
      console.log('[MobileLifecycle] Triggering voice check on foreground resume');
    }
  }

  /**
   * Handled when Wi-Fi or cellular network is restored
   */
  private handleNetworkRestored() {
    console.log('[MobileLifecycle] Network connectivity RESTORED.');
    if (this.reconnectDebounceTimer) clearTimeout(this.reconnectDebounceTimer);
    
    this.reconnectDebounceTimer = setTimeout(() => {
      if (voiceManager.connectionState === 'FAILED' || voiceManager.connectionState === 'DISCONNECTED') {
        console.log('[MobileLifecycle] Auto-recovering voice session after network transition');
        voiceManager.initialize(true).catch((e) => console.warn('[MobileLifecycle] Reconnect err:', e));
      }
    }, 1000);
  }

  /**
   * Handled when network is lost
   */
  private handleNetworkLost() {
    console.warn('[MobileLifecycle] Network connectivity LOST.');
  }

  /**
   * Safe Tap Safeguard: Prevents duplicate execution from rapid double-taps on touch devices
   */
  public isTapAllowed(actionKey: string, cooldownMs = 600): boolean {
    const now = Date.now();
    const lastTap = this.lastTapTimestampMap.get(actionKey) || 0;
    if (now - lastTap < cooldownMs) {
      return false; // Action debounced
    }
    this.lastTapTimestampMap.set(actionKey, now);
    return true;
  }

  public subscribe(listener: MobileLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getAppState(): AppLifecycleState {
    return this.appState;
  }

  public getNetworkStatus(): NetworkStatus {
    return this.networkStatus;
  }
}

export const mobileLifecycleManager = MobileLifecycleManager.getInstance();

