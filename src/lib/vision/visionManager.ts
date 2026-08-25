import { screenShareManager, ScreenShareState } from './screenShareManager';
import { voiceManager } from '../voice/voiceManager';
import { visionContextManager, VisualContext } from './visionContextManager';
import { latencyTelemetry } from '../telemetry/latencyTelemetry';
import { ErrorRecoveryManager } from '../recovery/errorRecovery';

export interface VisionState {
  screenShareActive: boolean;
  status: ScreenShareState;
  latestFrameTimestamp: number;
  error: string | null;
  visualContext?: VisualContext;
  pendingFramesCount: number;
}

export class VisionManager {
  private state: VisionState = {
    screenShareActive: false,
    status: 'IDLE',
    latestFrameTimestamp: 0,
    error: null,
    pendingFramesCount: 0,
  };

  // Frame queue protection: allow at most 1 active pending frame
  private isFrameTransmitting = false;
  private pendingFrame: { base64: string; mimeType: string; timestamp: number } | null = null;

  public onStateChange?: (state: VisionState) => void;

  constructor() {
    // Connect screen share manager events
    screenShareManager.onStateChange = (status) => {
      const isSharing = status === 'SHARING';
      visionContextManager.setSharingActive(isSharing);

      if (!isSharing) {
        // Clear pending frame and reset transmission state
        this.pendingFrame = null;
        this.isFrameTransmitting = false;
      }

      this.state = {
        ...this.state,
        status,
        screenShareActive: isSharing,
        error: screenShareManager.getErrorMessage(),
        visualContext: visionContextManager.getContext(),
        pendingFramesCount: this.pendingFrame ? 1 : 0,
      };
      if (this.onStateChange) {
        this.onStateChange(this.state);
      }
    };

    screenShareManager.onFrameCaptured = (base64Image, mimeType) => {
      const now = Date.now();
      this.state.latestFrameTimestamp = now;
      latencyTelemetry.recordFrameCapture();
      
      // Update vision context metadata & lightweight change detection
      visionContextManager.registerFrame(1280, 720, mimeType, base64Image);
      this.state.visualContext = visionContextManager.getContext();

      // Frame Queue Protection: If previous frame is still transmitting, replace pending with NEWEST frame (discard stale)
      if (this.isFrameTransmitting) {
        this.pendingFrame = { base64: base64Image, mimeType, timestamp: now };
        this.state.pendingFramesCount = 1;
        return;
      }

      this.transmitFrame(base64Image, mimeType);
    };

    screenShareManager.onError = (error) => {
      visionContextManager.setSharingActive(false);
      this.pendingFrame = null;
      this.isFrameTransmitting = false;
      
      const classified = ErrorRecoveryManager.classify(error, 'VISION_ERROR');
      this.state = {
        ...this.state,
        error: classified.userMessageBn,
        visualContext: visionContextManager.getContext(),
        pendingFramesCount: 0,
      };
      if (this.onStateChange) {
        this.onStateChange(this.state);
      }
    };
  }

  private transmitFrame(base64Image: string, mimeType: string) {
    this.isFrameTransmitting = true;
    latencyTelemetry.recordFrameTransmitted();

    const sent = voiceManager.sendMediaFrame(base64Image, mimeType);
    if (sent) {
      latencyTelemetry.recordFrameProcessed();
    }

    // Release transmission lock after brief interval
    setTimeout(() => {
      this.isFrameTransmitting = false;
      // If a newer frame arrived while this was transmitting, send the latest one now
      if (this.pendingFrame) {
        const next = this.pendingFrame;
        this.pendingFrame = null;
        this.state.pendingFramesCount = 0;
        this.transmitFrame(next.base64, next.mimeType);
      }
    }, 150);

    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  public isScreenShareSupported(): boolean {
    return screenShareManager.isSupported();
  }

  public getDiagnostics() {
    return screenShareManager.getDiagnostics();
  }

  public getVisualContext(): VisualContext {
    return visionContextManager.getContext();
  }

  public getState(): VisionState {
    return { 
      ...this.state,
      visualContext: visionContextManager.getContext(),
    };
  }

  /**
   * Start screen sharing session
   */
  public async startScreenShare(): Promise<boolean> {
    return screenShareManager.start({
      maxWidth: 1280,
      maxHeight: 720,
      quality: 0.8,
    });
  }

  /**
   * Stop screen sharing session
   */
  public stopScreenShare(): void {
    screenShareManager.stop();
    visionContextManager.reset();
    this.pendingFrame = null;
    this.isFrameTransmitting = false;
  }

  /**
   * Trigger an on-demand frame capture and immediate transmission to Gemini
   */
  public captureAndSendNow(): boolean {
    const frame = screenShareManager.captureFrame({
      maxWidth: 1280,
      maxHeight: 720,
      quality: 0.85,
    });

    if (frame) {
      this.state.latestFrameTimestamp = Date.now();
      latencyTelemetry.recordFrameCapture();
      visionContextManager.registerFrame(1280, 720, 'image/jpeg', frame);
      this.state.visualContext = visionContextManager.getContext();
      this.transmitFrame(frame, 'image/jpeg');
      return true;
    }
    return false;
  }

  /**
   * Capture a fresh frame on demand without sending to Gemini Live
   */
  public captureFrame(): string | null {
    return screenShareManager.captureFrame({
      maxWidth: 1280,
      maxHeight: 720,
      quality: 0.85,
    });
  }

  /**
   * Get the last captured frame from screen share manager
   */
  public getLastFrame(): { data: string; timestamp: number } | null {
    return screenShareManager.getLastCapturedFrame();
  }
}

export const visionManager = new VisionManager();
