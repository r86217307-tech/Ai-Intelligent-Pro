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

  // Single Session & Turn Tracking (Duplicate Session Protection)
  private currentSessionId: string = '';
  private currentTurnId: number = 0;
  
  // Bounded Audio Queue (Maximum 10 chunks to prevent runaway playback latency)
  private static readonly MAX_AUDIO_QUEUE_SIZE = 10;
  private nextStartTime: number = 0;
  private audioQueue: AudioBufferSourceNode[] = [];
  
  // Callbacks
  public onStateChange?: (state: AssistantState) => void;
  public onConnectionChange?: (state: ConnectionState) => void;
  public onTextReceived?: (text: string) => void;
  public onError?: (error: string) => void;

  private continuousMode = false;
  private isProcessingSilence = false;
  private firstChunkReceived = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  // Reconnection backoff parameters
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
          // Page returned to foreground: verify and recover audio contexts
          this.recoverAudioContexts();
        }
      });

      window.addEventListener('pageshow', () => {
        this.recoverAudioContexts();
      });

      window.addEventListener('online', () => {
        if (this._connectionState === 'FAILED' || this._connectionState === 'DISCONNECTED') {
          console.log('[VoiceManager] Network online restored. Attempting safe reconnect.');
          this.initialize(true).catch(e => console.warn('[VoiceManager] Online reconnect failed:', e));
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
      console.warn('[VoiceManager] AudioContext resume failed on visibility change:', e);
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

  /**
   * Initialize or Reconnect Gemini Live WebSocket session
   */
  public async initialize(isReconnecting = false): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (isReconnecting) {
      this.setConnection('RECONNECTING');
      sessionRecoveryManager.incrementReconnect();
    } else {
      this.setConnection('CONNECTING');
      this.reconnectAttempt = 0;
    }
    
    // Invalidate old session ID to ignore late packets
    const newSessionId = `SES-${Date.now().toString(36).toUpperCase()}`;
    this.currentSessionId = newSessionId;
    this.currentTurnId++;

    try {
      this.ws = new WebSocket(getWebSocketUrl('/live'));
      
      const connectTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.warn('[VoiceManager] Connection timeout after 8000ms');
          try { this.ws.close(); } catch (e) {}
          this.handleDisconnect('Connection timed out');
        }
      }, 8000);

      this.ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.setConnection('CONNECTED');
        this.reconnectAttempt = 0;
        this.isExplicitlyStopped = false;
        
        // If recovering from a previous session, optionally send recovery context
        if (isReconnecting) {
          const recoveryPrompt = sessionRecoveryManager.generateRecoveryContextPrompt();
          if (recoveryPrompt && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ text: recoveryPrompt }));
          }
        }

        if (this._state === 'ERROR' || this._state === 'IDLE') {
          this.setState('IDLE');
        }
      };

      this.ws.onmessage = (event) => {
        // Guard against late messages from superseded sessions
        if (this.currentSessionId !== newSessionId) return;

        try {
          const msg = JSON.parse(event.data);
          
          if (msg.audio) {
            if (!this.firstChunkReceived) {
              this.firstChunkReceived = true;
              latencyTelemetry.recordFirstAudioChunk();
            }
            this.playAudioChunk(msg.audio);
          }

          if (msg.text) {
            latencyTelemetry.recordFirstServerResponse();
            if (this.onTextReceived) this.onTextReceived(msg.text);
          }

          if (msg.interrupted) {
            console.log('[VoiceManager] Native Interruption Received from Gemini Live');
            this.currentTurnId++; // Advance turn ID to discard old turn
            this.stopSpeaking();
            this.setState('LISTENING');
          }

          if (msg.turnComplete) {
            latencyTelemetry.recordCompleteResponse();
          }

          if (msg.error) {
            const classified = ErrorRecoveryManager.classify(msg.error, 'GEMINI_SESSION_ERROR');
            if (this.onError) this.onError(classified.userMessageBn);
            this.setState('ERROR');
          }
        } catch (e) {
          console.error('[VoiceManager] Message parsing error:', e);
        }
      };

      this.ws.onclose = () => {
        clearTimeout(connectTimeout);
        this.handleDisconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[VoiceManager] WebSocket error encountered:', err);
      };

    } catch (e) {
      console.error('[VoiceManager] Init failed:', e);
      this.handleDisconnect('Initialization exception');
    }
  }

  private handleDisconnect(reason?: string) {
    if (this.currentSessionId) {
      // Invalidate session
      this.currentSessionId = '';
    }

    if (this.isExplicitlyStopped) {
      this.setConnection('DISCONNECTED');
      this.setState('IDLE');
      return;
    }

    // Auto-reconnect with exponential backoff
    if (this.reconnectAttempt < VoiceManager.RECONNECT_BACKOFFS.length) {
      const delay = VoiceManager.RECONNECT_BACKOFFS[this.reconnectAttempt];
      this.reconnectAttempt++;
      this.setConnection('RECONNECTING');

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        console.log(`[VoiceManager] Executing auto-reconnect attempt ${this.reconnectAttempt} (${delay}ms)...`);
        this.initialize(true).then(() => {
          if (this.continuousMode && this._connectionState === 'CONNECTED') {
            this.startListening().catch(e => console.warn('[VoiceManager] Resume listening failed:', e?.message || e));
          }
        }).catch(err => console.error('[VoiceManager] Reconnect error:', err));
      }, delay);
    } else {
      console.warn('[VoiceManager] Max reconnection attempts reached.');
      this.setConnection('FAILED');
      this.setState('ERROR');
      const classified = ErrorRecoveryManager.classify(reason || 'Max reconnection attempts exceeded', 'WEBSOCKET_ERROR');
      if (this.onError) this.onError(classified.userMessageBn);
    }
  }

  public async startListening(): Promise<void> {
    this.isExplicitlyStopped = false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.initialize();
    }
    
    try {
      if (!this.inputAudioCtx) {
        this.inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      } else if (this.inputAudioCtx.state === 'suspended') {
        await this.inputAudioCtx.resume();
      }

      // Guarantee single active microphone stream with a robust fallback if constraints fail
      if (!this.mediaStream || this.mediaStream.getTracks().some(t => t.readyState === 'ended')) {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('MediaDevices API not supported in this environment');
        }
        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 16000
            }
          });
        } catch (initialErr: any) {
          const errName = initialErr?.name || '';
          const errMsg = initialErr?.message || '';
          // If no physical microphone device exists or permission is outright denied, skip secondary constraint attempts
          if (errName === 'NotFoundError' || errMsg.includes('device not found') || errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            throw initialErr;
          }
          console.warn('[VoiceManager] Preferred microphone constraints failed, trying simple constraints:', errMsg || initialErr);
          try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (fallbackErr) {
            // Re-throw the original error to let the error recovery manager handle it correctly
            throw initialErr;
          }
        }
      }
      
      // Clean previous source/processor if any
      if (this.inputSource) {
        try { this.inputSource.disconnect(); } catch (e) {}
      }
      if (this.inputProcessor) {
        try { this.inputProcessor.disconnect(); } catch (e) {}
      }

      this.inputSource = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);
      
      try {
        await this.inputAudioCtx.audioWorklet.addModule('/pcm-processor.js');
        this.inputProcessor = new AudioWorkletNode(this.inputAudioCtx, 'pcm-processor') as any;
        
        (this.inputProcessor as any).port.onmessage = (e: MessageEvent) => {
          if (this._state === 'IDLE' || this._state === 'ERROR') return;
          
          const { rms, pcmData } = e.data;
          
          if (rms > 0.015) {
            if (this._state === 'LISTENING' || this._state === 'PROCESSING') {
              this.setState('USER_SPEAKING');
              this.firstChunkReceived = false;
              latencyTelemetry.recordSpeechStart();
            }
            this.isProcessingSilence = false;
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
          } else if (this._state === 'USER_SPEAKING' && !this.isProcessingSilence) {
            this.isProcessingSilence = true;
            this.silenceTimer = setTimeout(() => {
              if (this.isProcessingSilence && this._state === 'USER_SPEAKING') {
                this.setState('PROCESSING');
                latencyTelemetry.recordSpeechEnd();
              }
            }, 800);
          }

          if (this.ws && this.ws.readyState === WebSocket.OPEN && pcmData) {
            const base64 = pcmToBase64(pcmData);
            this.ws.send(JSON.stringify({ audio: base64 }));
          }
        };
      } catch(err) {
        console.warn('[VoiceManager] AudioWorklet init failed, falling back to ScriptProcessorNode:', err);
        this.inputProcessor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);
        this.inputProcessor.onaudioprocess = (e) => {
          if (this._state === 'IDLE' || this._state === 'ERROR') return;
          const inputData = e.inputBuffer.getChannelData(0);
          
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          
          if (rms > 0.015) {
            if (this._state === 'LISTENING' || this._state === 'PROCESSING') {
              this.setState('USER_SPEAKING');
              this.firstChunkReceived = false;
              latencyTelemetry.recordSpeechStart();
            }
            this.isProcessingSilence = false;
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
          } else if (this._state === 'USER_SPEAKING' && !this.isProcessingSilence) {
            this.isProcessingSilence = true;
            this.silenceTimer = setTimeout(() => {
              if (this.isProcessingSilence && this._state === 'USER_SPEAKING') {
                this.setState('PROCESSING');
                latencyTelemetry.recordSpeechEnd();
              }
            }, 800);
          }

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const base64 = pcmToBase64(inputData);
            this.ws.send(JSON.stringify({ audio: base64 }));
          }
        };
      }

      this.inputSource.connect(this.inputProcessor);
      if (this.inputProcessor instanceof ScriptProcessorNode) {
        this.inputProcessor.connect(this.inputAudioCtx.destination);
      }
      
      this.setState('LISTENING');
    } catch (e: any) {
      console.warn('[VoiceManager] Microphone access denied or failed:', e?.message || e);
      const classified = ErrorRecoveryManager.classify(e, 'MICROPHONE_ERROR');
      if (this.onError) this.onError(classified.userMessageBn);
      this.setState('IDLE');
      this.continuousMode = false;
    }
  }

  public stopListening(force = false): void {
    this.isExplicitlyStopped = force;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.inputProcessor && this.inputSource) {
      try {
        this.inputSource.disconnect();
        this.inputProcessor.disconnect();
      } catch (e) {}
    }
    
    // Clean up tracks
    if (force && this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      this.mediaStream = null;
    }
    
    if (this._state === 'LISTENING' || this._state === 'USER_SPEAKING') {
      this.setState('IDLE');
    }
  }

  public sendText(text: string) {
    latencyTelemetry.recordRequestStart();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text }));
      this.setState('PROCESSING');
    } else {
      if (this.onError) this.onError('Voice connection is reconnecting...');
      this.initialize().then(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ text }));
          this.setState('PROCESSING');
        }
      });
    }
  }

  public sendMediaFrame(base64: string, mimeType = 'image/jpeg'): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      latencyTelemetry.recordFrameTransmitted();
      this.ws.send(JSON.stringify({ image: base64, mimeType }));
      return true;
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

    // Bounded Audio Queue Protection (discard oldest nodes if backlog grows > 10)
    if (this.audioQueue.length >= VoiceManager.MAX_AUDIO_QUEUE_SIZE) {
      const dropped = this.audioQueue.shift();
      if (dropped) {
        try {
          dropped.stop();
          dropped.disconnect();
        } catch (e) {}
      }
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

    if (!this.audioQueue.length) {
      latencyTelemetry.recordFirstAudioScheduled();
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    
    this.audioQueue.push(source);

    source.onended = () => {
      this.audioQueue = this.audioQueue.filter(s => s !== source);
      if (this.audioQueue.length === 0 && this._state === 'SPEAKING') {
        if (this.continuousMode) {
          this.setState('LISTENING');
        } else {
          this.setState('IDLE');
        }
      }
    };
  }

  public stopSpeaking(): void {
    this.audioQueue.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    });
    this.audioQueue = [];
    this.nextStartTime = 0;
    
    if (this._state === 'SPEAKING') {
      this.setState('INTERRUPTED');
      setTimeout(() => {
        if (this._state === 'INTERRUPTED') {
          this.setState(this.continuousMode ? 'LISTENING' : 'IDLE');
        }
      }, 400);
    }
  }

  public get state(): AssistantState {
    return this._state;
  }

  public get connectionState(): ConnectionState {
    return this._connectionState;
  }

  public getSessionId(): string {
    return this.currentSessionId;
  }

  public getAudioQueueLength(): number {
    return this.audioQueue.length;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempt;
  }
}

export const voiceManager = new VoiceManager();
