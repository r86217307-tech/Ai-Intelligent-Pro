import { AssistantState, ConnectionState } from './types';
import { pcmToBase64, base64ToPcm } from './audioUtils';
import { latencyTelemetry } from '../telemetry/latencyTelemetry';
import { ErrorRecoveryManager } from '../recovery/errorRecovery';
import { sessionRecoveryManager } from '../recovery/sessionRecoveryManager';
import { getWebSocketUrl } from '../api';

export class VoiceManager {
  private _state: AssistantState = 'IDLE';
  private _connectionState: ConnectionState = 'DISCONNECTED';
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private inputProcessor: ScriptProcessorNode | AudioWorkletNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;

  private currentSessionId: string = '';
  private currentTurnId: number = 0;

  private static readonly MAX_AUDIO_QUEUE_SIZE = 10;
  private nextStartTime: number = 0;
  private audioQueue: AudioBufferSourceNode[] = [];

  public onStateChange?: (state: AssistantState) => void;
  public onConnectionChange?: (state: ConnectionState) => void;
  public onTextReceived?: (text: string) => void;
  public onError?: (error: string) => void;

  private continuousMode = false;
  private isProcessingSilence = false;
  private firstChunkReceived = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempt = 0;
  private static readonly RECONNECT_BACKOFFS = [500, 1000, 2000, 4000, 8000];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isExplicitlyStopped = false;
  private visibilityHandlerAttached = false;

  constructor() {
    this.setupVisibilityListener();
  }

  private setupVisibilityListener() {
    if (typeof window !== 'undefined' && !this.visibilityHandlerAttached) {
      this.visibilityHandlerAttached = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.recoverAudioContexts();
        }
      });
    }
  }

  private async recoverAudioContexts() {
    try {
      if (this.inputAudioCtx && this.inputAudioCtx.state === 'suspended') {
        await this.inputAudioCtx.resume();
      }
      if (this.outputAudioCtx && this.outputAudioCtx.state === 'suspended') {
        await this.outputAudioCtx.resume();
      }
    } catch (e) {
      console.warn('[VoiceManager] AudioContext resume failed:', e);
    }
  }

  private setState(newState: AssistantState) {
    this._state = newState;
    if (this.onStateChange) this.onStateChange(newState);
  }

  private setConnection(newState: ConnectionState) {
    this._connectionState = newState;
    if (this.onConnectionChange) this.onConnectionChange(newState);
  }

  public setContinuousMode(enabled: boolean) {
    this.continuousMode = enabled;
  }

  public async initialize(isReconnecting = false): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (isReconnecting) {
      this.setConnection('RECONNECTING');
      sessionRecoveryManager.incrementReconnect();
    } else {
      this.setConnection('CONNECTING');
      this.reconnectAttempt = 0;
    }

    const newSessionId = `SES-${Date.now().toString(36).toUpperCase()}`;
    this.currentSessionId = newSessionId;
    this.currentTurnId++;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(getWebSocketUrl('/live'));

        const connectTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            try { this.ws.close(); } catch (e) {}
            this.handleDisconnect('Connection timed out');
            reject(new Error('Connection timeout'));
          }
        }, 8000);

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.setConnection('CONNECTED');
          this.reconnectAttempt = 0;
          this.isExplicitlyStopped = false;
          resolve();
        };

        this.ws.onmessage = (event) => {
          if (this.currentSessionId !== newSessionId) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.audio) this.playAudioChunk(msg.audio);
            if (msg.text && this.onTextReceived) this.onTextReceived(msg.text);
            if (msg.error && this.onError) this.onError(msg.error);
          } catch (e) {
            console.error('[VoiceManager] Message parsing error:', e);
          }
        };

        this.ws.onclose = () => {
          clearTimeout(connectTimeout);
          this.handleDisconnect();
        };

        this.ws.onerror = (err) => {
          console.warn('[VoiceManager] WebSocket error:', err);
          reject(err);
        };
      } catch (e) {
        console.error('[VoiceManager] Init failed:', e);
        this.handleDisconnect('Initialization exception');
        reject(e);
      }
    });
  }

  private handleDisconnect(reason?: string) {
    if (this.currentSessionId) this.currentSessionId = '';
    if (this.isExplicitlyStopped) {
      this.setConnection('DISCONNECTED');
      this.setState('IDLE');
      return;
    }

    if (this.reconnectAttempt < VoiceManager.RECONNECT_BACKOFFS.length) {
      const delay = VoiceManager.RECONNECT_BACKOFFS[this.reconnectAttempt];
      this.reconnectAttempt++;
      this.setConnection('RECONNECTING');

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.initialize(true).catch(err => console.error('[VoiceManager] Reconnect error:', err));
      }, delay);
    } else {
      this.setConnection('FAILED');
      this.setState('ERROR');
      if (this.onError) this.onError(reason || 'Connection failed');
    }
  }

  // ফিক্সড: এপিআই কল করার আগে কানেকশন চেক করবে এবং না থাকলে অটো-কানেক্ট করবে
  public async sendMediaFrame(base64: string, mimeType = 'image/jpeg'): Promise<boolean> {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        await this.initialize();
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        latencyTelemetry.recordFrameTransmitted();
        this.ws.send(JSON.stringify({ image: base64, mimeType }));
        return true;
      }
    } catch (e) {
      console.error('[VoiceManager] Failed to send media frame:', e);
    }
    return false;
  }

  private async playAudioChunk(base64: string) {
    if (this._state !== 'SPEAKING') {
      this.setState('SPEAKING');
      this.nextStartTime = 0;
    }

    if (!this.outputAudioCtx) {
      this.outputAudioCtx = new AudioContext({ sampleRate: 24000 });
    } else if (this.outputAudioCtx.state === 'suspended') {
      await this.outputAudioCtx.resume();
    }

    const pcmData = base64ToPcm(base64);
    const buffer = this.outputAudioCtx.createBuffer(1, pcmData.length, 24000);
    buffer.copyToChannel(pcmData, 0);

    const source = this.outputAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAudioCtx.destination);

    const currentTime = this.outputAudioCtx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.04;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.audioQueue.push(source);

    source.onended = () => {
      this.audioQueue = this.audioQueue.filter(s => s !== source);
      if (this.audioQueue.length === 0 && this._state === 'SPEAKING') {
        this.setState(this.continuousMode ? 'LISTENING' : 'IDLE');
      }
    };
  }

  public get state(): AssistantState { return this._state; }
  public get connectionState(): ConnectionState { return this._connectionState; }
}

export const voiceManager = new VoiceManager();
