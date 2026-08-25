export type ScreenShareState = 'IDLE' | 'SHARING' | 'PROCESSING' | 'STOPPED' | 'ERROR';

export interface ScreenShareOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 for JPEG compression
}

export interface ScreenShareDiagnostics {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasGetDisplayMedia: boolean;
  isIframe: boolean;
  browser: string;
  platform: string;
  userAgent: string;
  lastExceptionName: string | null;
  lastExceptionMessage: string | null;
  apiStatus: 'SUPPORTED' | 'UNSUPPORTED' | 'RESTRICTED_IFRAME' | 'INSECURE_CONTEXT';
  userGestureStatus: 'VALID' | 'UNKNOWN';
}

function detectBrowserAndPlatform(): { browser: string; platform: string } {
  if (typeof navigator === 'undefined') {
    return { browser: 'Unknown', platform: 'Unknown' };
  }

  const ua = navigator.userAgent;
  let browser = 'Unknown Browser';
  let platform = 'Unknown Platform';

  // Platform Detection
  if (/Android/i.test(ua)) {
    platform = 'Android Mobile';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platform = 'iOS';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platform = 'macOS';
  } else if (/Windows NT/i.test(ua)) {
    platform = 'Windows';
  } else if (/Linux/i.test(ua)) {
    platform = 'Linux';
  }

  // Browser Detection
  if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browser = 'Google Chrome';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Mozilla Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = 'Apple Safari';
  }

  return { browser, platform };
}

export class ScreenShareManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private state: ScreenShareState = 'IDLE';
  private errorMessage: string | null = null;
  private sampleIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private lastCapturedFrame: string | null = null;
  private lastCapturedTimestamp: number = 0;

  // Diagnostics tracking
  private lastExceptionName: string | null = null;
  private lastExceptionMessage: string | null = null;
  private lastGestureTimestamp: number = 0;

  public onStateChange?: (state: ScreenShareState) => void;
  public onFrameCaptured?: (base64Image: string, mimeType: string) => void;
  public onError?: (error: string) => void;

  constructor() {
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.videoElement = document.createElement('video');
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
    }
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.isSecureContext === false) return false;
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function'
    );
  }

  public getLastCapturedFrame(): { data: string; timestamp: number } | null {
    if (!this.lastCapturedFrame) return null;
    return {
      data: this.lastCapturedFrame,
      timestamp: this.lastCapturedTimestamp,
    };
  }

  public getDiagnostics(): ScreenShareDiagnostics {
    const isSecureContext = typeof window !== 'undefined' ? !!window.isSecureContext : false;
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
    const hasGetDisplayMedia = hasMediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    const { browser, platform } = detectBrowserAndPlatform();

    let apiStatus: 'SUPPORTED' | 'UNSUPPORTED' | 'RESTRICTED_IFRAME' | 'INSECURE_CONTEXT' = 'SUPPORTED';
    if (!isSecureContext) {
      apiStatus = 'INSECURE_CONTEXT';
    } else if (!hasGetDisplayMedia) {
      apiStatus = 'UNSUPPORTED';
    } else if (
      isIframe && 
      (
        (this.lastExceptionName === 'NotAllowedError' && this.lastExceptionMessage?.toLowerCase().includes('permissions policy')) ||
        (this.lastExceptionName === 'SecurityError' && this.lastExceptionMessage?.toLowerCase().includes('permissions policy')) ||
        this.lastExceptionMessage?.toLowerCase().includes('display-capture') ||
        this.lastExceptionMessage?.toLowerCase().includes('disallowed')
      )
    ) {
      apiStatus = 'RESTRICTED_IFRAME';
    }

    const timeSinceGesture = Date.now() - this.lastGestureTimestamp;
    const userGestureStatus: 'VALID' | 'UNKNOWN' = timeSinceGesture < 5000 && this.lastGestureTimestamp > 0 ? 'VALID' : 'UNKNOWN';

    return {
      isSecureContext,
      hasMediaDevices,
      hasGetDisplayMedia,
      isIframe,
      browser,
      platform,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      lastExceptionName: this.lastExceptionName,
      lastExceptionMessage: this.lastExceptionMessage,
      apiStatus,
      userGestureStatus,
    };
  }

  public getState(): ScreenShareState {
    return this.state;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public getLatestFrame(): { frame: string | null; timestamp: number } {
    return {
      frame: this.lastCapturedFrame,
      timestamp: this.lastCapturedTimestamp,
    };
  }

  private setState(newState: ScreenShareState) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  /**
   * Request display media permission and start screen sharing.
   * MUST be invoked directly from a user click event to preserve transient user activation.
   */
  public async start(options: ScreenShareOptions = {}): Promise<boolean> {
    this.lastGestureTimestamp = Date.now();

    // Prevent multiple simultaneous screen-capture requests
    if (this.state === 'PROCESSING' || this.state === 'SHARING') {
      console.warn('[ScreenShareManager] Screen capture is already in progress or active.');
      return false;
    }

    // HARDENED SECURE CONTEXT CHECK: Standard isSecureContext with fallback host checks
    const isSecure = typeof window !== 'undefined' && (
      window.isSecureContext === true || 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.protocol === 'https:'
    );

    if (!isSecure) {
      const err = 'Screen sharing requires a secure HTTPS connection (or localhost).';
      this.errorMessage = err;
      this.lastExceptionName = 'SecurityError';
      this.lastExceptionMessage = 'Insecure context detected';
      this.setState('ERROR');
      if (this.onError) this.onError(err);
      return false;
    }

    // Check mediaDevices & getDisplayMedia
    if (!this.isSupported()) {
      const { platform } = detectBrowserAndPlatform();
      let err = 'Screen sharing is not supported in this browser.';
      if (platform.includes('Android')) {
        err = 'Screen sharing is not supported by standard Android mobile browsers.';
      } else if (platform.includes('iOS')) {
        err = 'Screen sharing is not supported on this iOS browser.';
      }
      this.errorMessage = err;
      this.lastExceptionName = 'NotSupportedError';
      this.lastExceptionMessage = 'navigator.mediaDevices.getDisplayMedia is not a function';
      this.setState('ERROR');
      if (this.onError) this.onError(err);
      return false;
    }

    // Stop existing stream if active
    if (this.stream) {
      this.stop();
    }

    try {
      this.errorMessage = null;
      this.lastExceptionName = null;
      this.lastExceptionMessage = null;
      this.setState('PROCESSING');

      // Minimal & universally compatible constraint signature
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 10 }
        },
        audio: false,
      });

      const videoTrack = this.stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track available in screen stream.');
      }

      // Handle user stopping screen share from browser native UI
      videoTrack.onended = () => {
        console.log('[ScreenShareManager] Screen sharing stopped by user via browser control.');
        this.stop();
      };

      // Set video preview element correctly
      let activeVideoElement = this.videoElement;
      if (typeof document !== 'undefined') {
        const domVideo = document.getElementById('sufia-screen-preview') as HTMLVideoElement | null;
        if (domVideo) {
          activeVideoElement = domVideo;
          console.log('[ScreenShareManager] Binding screen capture stream to #sufia-screen-preview element.');
        }
      }

      if (activeVideoElement) {
        activeVideoElement.srcObject = this.stream;
        try {
          await activeVideoElement.play();
        } catch (playErr) {
          console.warn('[ScreenShareManager] Video play failed:', playErr);
        }
      }

      this.setState('SHARING');

      // Immediately capture first frame upon starting
      setTimeout(() => {
        this.captureAndEmitFrame(options);
      }, 300);

      // Start periodic sampling (every 3 seconds - preserved from Phase 3)
      this.startSampling(options, 3000);

      return true;
    } catch (err: any) {
      console.warn('[ScreenShareManager] Screen share start error:', err);
      
      const exceptionName = err.name || 'UnknownError';
      const exceptionMsg = err.message || String(err);
      this.lastExceptionName = exceptionName;
      this.lastExceptionMessage = exceptionMsg;

      let userMsg = 'Screen sharing could not be started.';
      
      const isPermissionPolicyRestriction = 
        exceptionMsg.toLowerCase().includes('permissions policy') || 
        exceptionMsg.toLowerCase().includes('display-capture') || 
        exceptionMsg.toLowerCase().includes('disallowed');

      if (isPermissionPolicyRestriction) {
        userMsg = 'Screen sharing is restricted by the embedding iframe permissions policy. Try opening the app in a new browser tab.';
      } else if (exceptionName === 'NotAllowedError' || exceptionName === 'PermissionDeniedError') {
        const lowerMsg = exceptionMsg.toLowerCase();
        if (lowerMsg.includes('user gesture') || lowerMsg.includes('activation')) {
          userMsg = 'Screen sharing requires a direct click gesture.';
        } else {
          userMsg = 'Screen sharing permission was denied.';
        }
      } else if (exceptionName === 'NotFoundError') {
        userMsg = 'No display sources or screen-capture devices were found.';
      } else if (exceptionName === 'AbortError') {
        userMsg = 'Screen sharing request was cancelled.';
      } else if (exceptionName === 'NotReadableError') {
        userMsg = 'The screen source is not readable. The system or browser may be blocking access.';
      } else if (exceptionName === 'SecurityError') {
        userMsg = 'Screen sharing requires a secure connection (HTTPS) or top-level window.';
      } else if (exceptionName === 'TypeError') {
        userMsg = 'Invalid configuration or constraints passed for screen sharing.';
      } else if (exceptionName === 'NotSupportedError') {
        userMsg = 'Screen sharing is not supported in this browser.';
      } else if (exceptionName === 'InvalidStateError') {
        userMsg = 'Screen sharing is already in an active state.';
      }

      this.errorMessage = userMsg;
      this.setState('ERROR');
      if (this.onError) this.onError(userMsg);
      this.cleanup();
      return false;
    }
  }

  /**
   * Stop screen capture and release all tracks.
   */
  public stop(): void {
    this.cleanup();
    this.setState('STOPPED');
  }

  /**
   * Capture a single frame immediately
   */
  public captureFrame(options: ScreenShareOptions = {}): string | null {
    if (!this.stream || !this.videoElement || this.state !== 'SHARING') {
      return null;
    }

    try {
      const video = this.videoElement;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return null;
      }

      const maxWidth = options.maxWidth || 1280;
      const maxHeight = options.maxHeight || 720;
      const quality = options.quality || 0.8;

      let width = video.videoWidth;
      let height = video.videoHeight;

      // Scale down proportionally if larger than maximums
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      if (!this.canvas || !this.ctx) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
      }

      this.canvas.width = width;
      this.canvas.height = height;

      this.ctx?.drawImage(video, 0, 0, width, height);

      // Convert to JPEG data URL
      const dataUrl = this.canvas.toDataURL('image/jpeg', quality);
      // Strip 'data:image/jpeg;base64,' prefix for clean raw base64 payload
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

      this.lastCapturedFrame = base64Data;
      this.lastCapturedTimestamp = Date.now();

      return base64Data;
    } catch (e) {
      console.error('[ScreenShareManager] Frame capture error:', e);
      return null;
    }
  }

  private captureAndEmitFrame(options: ScreenShareOptions = {}): void {
    const frame = this.captureFrame(options);
    if (frame && this.onFrameCaptured) {
      this.onFrameCaptured(frame, 'image/jpeg');
    }
  }

  private startSampling(options: ScreenShareOptions, intervalMs: number): void {
    this.stopSampling();
    this.sampleIntervalTimer = setInterval(() => {
      if (this.state === 'SHARING') {
        this.captureAndEmitFrame(options);
      } else {
        this.stopSampling();
      }
    }, intervalMs);
  }

  private stopSampling(): void {
    if (this.sampleIntervalTimer) {
      clearInterval(this.sampleIntervalTimer);
      this.sampleIntervalTimer = null;
    }
  }

  private cleanup(): void {
    this.stopSampling();

    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        try {
          track.stop();
          console.log('[ScreenShareManager] Stopped screen media track:', track.label);
        } catch (e) {}
      });
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    if (typeof document !== 'undefined') {
      const domVideo = document.getElementById('sufia-screen-preview') as HTMLVideoElement | null;
      if (domVideo) {
        domVideo.srcObject = null;
      }
    }

    this.lastCapturedFrame = null;
  }
}

export const screenShareManager = new ScreenShareManager();
