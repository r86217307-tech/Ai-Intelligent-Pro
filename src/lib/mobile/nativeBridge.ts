/**
 * Native Bridge Architecture for Sufia AI (Phase 21)
 * Provides a secure, lightweight native-to-web bridge for Android packaging.
 * Features safe web fallbacks, permission handling, hardware back navigation,
 * image picking, network monitoring, and safe storage auditing.
 */

export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime: boolean;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
    allowNavigation?: string[];
  };
  android?: {
    minSdkVersion?: number;
    targetSdkVersion?: number;
    compileSdkVersion?: number;
    versionCode?: number;
    versionName?: string;
    allowMixedContent?: boolean;
    captureInput?: boolean;
    backgroundColor?: string;
    webContentsDebuggingEnabled?: boolean;
  };
  plugins?: Record<string, any>;
}

export type PermissionStatus = 'GRANTED' | 'DENIED' | 'PROMPT' | 'PERMANENTLY_DENIED' | 'UNSUPPORTED';

export interface BackHandlerCallback {
  priority: number; // Higher number executed first
  handler: () => boolean; // Return true to prevent default back navigation
}

export interface NativeImagePickerResult {
  success: boolean;
  file?: File;
  base64?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface AndroidPackagingManifest {
  packageName: string;
  appName: string;
  versionName: string;
  versionCode: number;
  minSdkVersion: number;
  targetSdkVersion: number;
  compileSdkVersion: number;
  permissions: string[];
  features: string[];
  buildType: 'debug' | 'release';
}

export type RuntimeEnvironment =
  | 'AI_STUDIO_PREVIEW'
  | 'ANDROID_WEBVIEW'
  | 'ANDROID_BROWSER'
  | 'IOS_BROWSER'
  | 'DESKTOP_BROWSER'
  | 'WEB';

export class NativeBridge {
  private static instance: NativeBridge;
  private backHandlers: BackHandlerCallback[] = [];
  private isAndroidNative = false;
  private isInitialized = false;

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.init();
      } catch (e) {
        console.warn('[NativeBridge] Safe init fallback:', e);
      }
    }
  }

  public static getInstance(): NativeBridge {
    if (!NativeBridge.instance) {
      NativeBridge.instance = new NativeBridge();
    }
    return NativeBridge.instance;
  }

  private init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    try {
      // Check if running inside Android native WebView with injected bridge object
      const win = window as any;
      this.isAndroidNative = !!(win.AndroidBridge || (win.Capacitor && typeof win.Capacitor.isNativePlatform === 'function' && win.Capacitor.isNativePlatform()));

      // Listen to hardware back button if available or browser popstate
      if (this.isAndroidNative && win.AndroidBridge?.onBackPressed) {
        win.onAndroidBackPressed = () => {
          return this.triggerBack();
        };
      }

      window.addEventListener('popstate', (e) => {
        // If a high-priority modal handler handled it, prevent unexpected exit
        const handled = this.triggerBack();
        if (handled) {
          e.preventDefault();
        }
      });
    } catch (err) {
      console.warn('[NativeBridge] Non-blocking init exception:', err);
    }
  }

  /**
   * Safe Environment Classifier
   */
  public detectEnvironment(): RuntimeEnvironment {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'WEB';
    }

    try {
      const win = window as any;
      const ua = navigator.userAgent || '';

      // 1. Android Native WebView
      if (win.AndroidBridge || (win.Capacitor && typeof win.Capacitor.isNativePlatform === 'function' && win.Capacitor.isNativePlatform())) {
        return 'ANDROID_WEBVIEW';
      }

      // 2. AI Studio Preview (Iframe or Cloud Run container URL)
      const isInIframe = win.self !== win.top;
      const isAIStudioHost = typeof location !== 'undefined' && (
        location.hostname.includes('.run.app') ||
        location.hostname.includes('aistudio') ||
        location.hostname.includes('localhost')
      );
      if (isInIframe || isAIStudioHost) {
        return 'AI_STUDIO_PREVIEW';
      }

      // 3. Android Browser
      if (/Android/i.test(ua)) {
        if (/wv/.test(ua) || /Version\/[\d.]+.*Chrome/.test(ua)) {
          return 'ANDROID_WEBVIEW';
        }
        return 'ANDROID_BROWSER';
      }

      // 4. iOS Browser
      if (/iPhone|iPad|iPod/i.test(ua)) {
        return 'IOS_BROWSER';
      }

      // 5. Desktop Browser
      return 'DESKTOP_BROWSER';
    } catch {
      return 'WEB';
    }
  }

  /**
   * Returns current Android packaging manifest metadata
   */
  public getPackagingManifest(): AndroidPackagingManifest {
    const isProd = Boolean(import.meta.env?.PROD) || (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production');
    return {
      packageName: 'ai.sufia.trader',
      appName: 'Sufia AI',
      versionName: '1.0.0',
      versionCode: 1,
      minSdkVersion: 24,
      targetSdkVersion: 34,
      compileSdkVersion: 34,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_EXTERNAL_STORAGE'
      ],
      features: [
        'android.hardware.microphone',
        'android.hardware.screen.portrait'
      ],
      buildType: isProd ? 'release' : 'debug'
    };
  }

  /**
   * Checks if running inside native Android wrapper
   */
  public isNative(): boolean {
    return this.isAndroidNative;
  }

  // =========================================================================
  // 1. MICROPHONE PERMISSION BRIDGE
  // =========================================================================

  /**
   * Checks current microphone permission status safely
   */
  public async checkMicrophonePermission(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return 'UNSUPPORTED';
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') return 'GRANTED';
        if (status.state === 'denied') return 'DENIED';
        return 'PROMPT';
      }
    } catch {
      // Fallback for browsers / WebViews where permissions.query is restricted
    }

    return 'PROMPT';
  }

  /**
   * Requests microphone permission on-demand when voice mode is activated
   */
  public async requestMicrophonePermission(): Promise<{ granted: boolean; status: PermissionStatus; error?: string }> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return {
        granted: false,
        status: 'UNSUPPORTED',
        error: 'Microphone media devices API is not supported on this device.'
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Stop test stream tracks immediately after permission verification
      stream.getTracks().forEach((track) => track.stop());

      return {
        granted: true,
        status: 'GRANTED'
      };
    } catch (err: any) {
      const isPermanentlyDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      return {
        granted: false,
        status: isPermanentlyDenied ? 'DENIED' : 'PROMPT',
        error: isPermanentlyDenied
          ? 'Microphone permission was denied. Please allow microphone access in Android App Settings.'
          : (err?.message || 'Could not initialize microphone.')
      };
    }
  }

  // =========================================================================
  // 2. HARDWARE BACK BUTTON NAVIGATION
  // =========================================================================

  /**
   * Registers a back navigation handler with priority
   * e.g., Modal (Priority 100) -> Drawer (Priority 50) -> View (Priority 10)
   */
  public registerBackHandler(handler: () => boolean, priority = 10): () => void {
    const callbackItem: BackHandlerCallback = { priority, handler };
    this.backHandlers.push(callbackItem);
    // Sort descending by priority
    this.backHandlers.sort((a, b) => b.priority - a.priority);

    return () => {
      this.backHandlers = this.backHandlers.filter((h) => h !== callbackItem);
    };
  }

  /**
   * Triggers the highest priority back handler
   */
  public triggerBack(): boolean {
    for (const item of this.backHandlers) {
      try {
        const handled = item.handler();
        if (handled) {
          return true; // Successfully handled by UI component (e.g. modal closed)
        }
      } catch (err) {
        console.warn('[NativeBridge] Back handler exception:', err);
      }
    }
    return false;
  }

  // =========================================================================
  // 3. FILE / SCREENSHOT IMAGE PICKER
  // =========================================================================

  /**
   * Native/Web file selector for uploaded chart screenshots
   */
  public async pickImageScreenshot(): Promise<NativeImagePickerResult> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        return resolve({ success: false, error: 'Document is not available' });
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.style.display = 'none';

      let isResolved = false;

      const cleanup = () => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      };

      input.onchange = async () => {
        if (isResolved) return;
        isResolved = true;
        const file = input.files?.[0];
        cleanup();

        if (!file) {
          return resolve({ success: false, error: 'No image selected' });
        }

        // Validate MIME type
        const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validMimes.includes(file.type)) {
          return resolve({
            success: false,
            error: `Unsupported image format: ${file.type}. Please use JPEG, PNG, or WEBP.`
          });
        }

        // Validate File Size (< 10MB limit)
        const maxSizeBytes = 10 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
          return resolve({
            success: false,
            error: `Image file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max allowed is 10MB.`
          });
        }

        // Convert to base64 for processing
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const resultStr = (reader.result as string) || '';
            const base64Data = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
            resolve({
              success: true,
              file,
              base64: base64Data,
              mimeType: file.type,
              sizeBytes: file.size
            });
          };
          reader.onerror = () => {
            resolve({ success: false, error: 'Failed to read image file.' });
          };
          reader.readAsDataURL(file);
        } catch (e: any) {
          resolve({ success: false, error: e?.message || 'Error processing image.' });
        }
      };

      input.oncancel = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({ success: false, error: 'User cancelled file selection' });
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  // =========================================================================
  // 4. SAFE EXTERNAL URL HANDLER
  // =========================================================================

  /**
   * Safely opens an external link ensuring no dangerous native schemes are invoked
   */
  public openSafeExternalUrl(rawUrl: string): { success: boolean; error?: string } {
    try {
      const parsed = new URL(rawUrl);
      const allowedProtocols = ['http:', 'https:', 'mailto:'];

      if (!allowedProtocols.includes(parsed.protocol)) {
        return {
          success: false,
          error: `Blocked unsafe URI scheme: ${parsed.protocol}. Only HTTPS and HTTP are permitted.`
        };
      }

      // Safe navigation in new window / native browser tab
      window.open(parsed.href, '_blank', 'noopener,noreferrer');
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Invalid or malformed URL format.'
      };
    }
  }

  // =========================================================================
  // 5. SECURE STORAGE AUDITOR
  // =========================================================================

  /**
   * Audits browser / WebView storage to verify zero secret leaks
   */
  public auditStorageSecurity(): { secure: boolean; issues: string[] } {
    const issues: string[] = [];

    if (typeof localStorage === 'undefined') {
      return { secure: true, issues: [] };
    }

    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        const val = localStorage.getItem(key) || '';
        const lowerKey = key.toLowerCase();
        const lowerVal = val.toLowerCase();

        // Audit for API keys or secrets in storage
        if (lowerKey.includes('gemini_api_key') || lowerKey.includes('secret') || lowerKey.includes('private_key')) {
          issues.push(`Sensitive key name detected in localStorage: ${key}`);
        }
        if (val.startsWith('AIzaSy') || lowerVal.includes('gemini-key')) {
          issues.push(`Possible Gemini API key detected in localStorage key: ${key}`);
        }
      }
    } catch (e: any) {
      issues.push(`Storage inspection failed: ${e?.message}`);
    }

    return {
      secure: issues.length === 0,
      issues
    };
  }

  // =========================================================================
  // 6. SAFE AREA & SCREEN ADAPTATION
  // =========================================================================

  /**
   * Computes Safe Area Insets for Android gesture navigation and camera cutouts
   */
  public getSafeAreaInsets(): SafeAreaInsets {
    if (typeof window === 'undefined') {
      return { top: 0, bottom: 0, left: 0, right: 0 };
    }

    // Default fallback insets
    return {
      top: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0', 10),
      bottom: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0', 10),
      left: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sal') || '0', 10),
      right: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sar') || '0', 10)
    };
  }
}

export const nativeBridge = NativeBridge.getInstance();
