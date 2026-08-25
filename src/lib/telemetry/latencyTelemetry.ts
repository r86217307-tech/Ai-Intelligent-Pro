/**
 * PHASE 10 — REAL LATENCY TELEMETRY & MONITORING
 * Lightweight, timestamp-based latency tracking for Voice, Vision, and Server interactions.
 * Stores strictly bounded rolling metrics (no raw audio, PCM buffers, or image frames).
 */

export interface LatencySample {
  timestamp: number;
  type: 'VOICE_TTFA' | 'VOICE_TTFR' | 'VISION_FRAME' | 'SERVER_ROUNDTRIP';
  durationMs: number;
}

export interface MetricSummary {
  lastMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  sampleCount: number;
}

export interface LatencyTelemetryReport {
  voiceTTFA: MetricSummary;
  voiceTTFR: MetricSummary;
  speechEndToFirstAudio: MetricSummary;
  visionLatency: MetricSummary;
  serverProcessing: MetricSummary;
  totalSamplesRecorded: number;
  lastUpdated: number;
}

export class LatencyTelemetry {
  private static readonly MAX_SAMPLES = 30; // Bounded window to prevent memory growth

  // Timestamps for the current active turn
  private speechStartTimestamp: number = 0;
  private speechEndTimestamp: number = 0;
  private requestStartTimestamp: number = 0;
  private firstServerResponseTimestamp: number = 0;
  private firstAudioChunkTimestamp: number = 0;
  private firstAudioScheduledTimestamp: number = 0;
  private completeResponseTimestamp: number = 0;

  // Vision timestamps
  private screenFrameCapturedTimestamp: number = 0;
  private screenFrameTransmittedTimestamp: number = 0;
  private screenFrameProcessedTimestamp: number = 0;

  // Bounded sample histories
  private ttfaSamples: number[] = [];
  private ttfrSamples: number[] = [];
  private speechEndToFirstAudioSamples: number[] = [];
  private visionSamples: number[] = [];
  private serverProcessingSamples: number[] = [];

  private totalRecorded = 0;

  // Listeners for telemetry updates
  public onTelemetryUpdated?: (report: LatencyTelemetryReport) => void;

  // ==========================================
  // SPEECH / VOICE TIMESTAMPS
  // ==========================================

  public recordSpeechStart(): void {
    this.speechStartTimestamp = performance.now();
    // Reset turn timestamps
    this.speechEndTimestamp = 0;
    this.firstServerResponseTimestamp = 0;
    this.firstAudioChunkTimestamp = 0;
    this.firstAudioScheduledTimestamp = 0;
    this.completeResponseTimestamp = 0;
  }

  public recordSpeechEnd(): void {
    this.speechEndTimestamp = performance.now();
    this.requestStartTimestamp = this.speechEndTimestamp;
  }

  public recordRequestStart(): void {
    this.requestStartTimestamp = performance.now();
  }

  public recordFirstServerResponse(): void {
    this.firstServerResponseTimestamp = performance.now();
    const baseTime = this.speechEndTimestamp || this.requestStartTimestamp;
    if (baseTime > 0) {
      const ttfr = Math.max(0, this.firstServerResponseTimestamp - baseTime);
      this.addSample(this.ttfrSamples, ttfr);
      this.totalRecorded++;
      this.notify();
    }
  }

  public recordFirstAudioChunk(): void {
    this.firstAudioChunkTimestamp = performance.now();
    const baseTime = this.speechEndTimestamp || this.requestStartTimestamp;
    if (baseTime > 0) {
      const ttfa = Math.max(0, this.firstAudioChunkTimestamp - baseTime);
      this.addSample(this.ttfaSamples, ttfa);
      this.addSample(this.speechEndToFirstAudioSamples, ttfa);
      this.totalRecorded++;
      this.notify();
    }
  }

  public recordFirstAudioScheduled(): void {
    this.firstAudioScheduledTimestamp = performance.now();
  }

  public recordCompleteResponse(): void {
    this.completeResponseTimestamp = performance.now();
    if (this.requestStartTimestamp > 0) {
      const totalDuration = Math.max(0, this.completeResponseTimestamp - this.requestStartTimestamp);
      this.addSample(this.serverProcessingSamples, totalDuration);
      this.notify();
    }
  }

  // ==========================================
  // VISION TIMESTAMPS
  // ==========================================

  public recordFrameCapture(): void {
    this.screenFrameCapturedTimestamp = performance.now();
  }

  public recordFrameTransmitted(): void {
    this.screenFrameTransmittedTimestamp = performance.now();
  }

  public recordFrameProcessed(): void {
    this.screenFrameProcessedTimestamp = performance.now();
    if (this.screenFrameCapturedTimestamp > 0) {
      const visionLatency = Math.max(0, this.screenFrameProcessedTimestamp - this.screenFrameCapturedTimestamp);
      this.addSample(this.visionSamples, visionLatency);
      this.notify();
    }
  }

  // ==========================================
  // HELPERS & METRICS COMPUTATION
  // ==========================================

  private addSample(collection: number[], value: number): void {
    if (isNaN(value) || value < 0) return;
    collection.push(Math.round(value));
    if (collection.length > LatencyTelemetry.MAX_SAMPLES) {
      collection.shift();
    }
  }

  private computeSummary(samples: number[]): MetricSummary {
    if (samples.length === 0) {
      return { lastMs: 0, averageMs: 0, minMs: 0, maxMs: 0, sampleCount: 0 };
    }
    const lastMs = samples[samples.length - 1];
    const sum = samples.reduce((acc, curr) => acc + curr, 0);
    const averageMs = Math.round(sum / samples.length);
    const minMs = Math.min(...samples);
    const maxMs = Math.max(...samples);
    return {
      lastMs,
      averageMs,
      minMs,
      maxMs,
      sampleCount: samples.length,
    };
  }

  public getReport(): LatencyTelemetryReport {
    return {
      voiceTTFA: this.computeSummary(this.ttfaSamples),
      voiceTTFR: this.computeSummary(this.ttfrSamples),
      speechEndToFirstAudio: this.computeSummary(this.speechEndToFirstAudioSamples),
      visionLatency: this.computeSummary(this.visionSamples),
      serverProcessing: this.computeSummary(this.serverProcessingSamples),
      totalSamplesRecorded: this.totalRecorded,
      lastUpdated: Date.now(),
    };
  }

  public reset(): void {
    this.speechStartTimestamp = 0;
    this.speechEndTimestamp = 0;
    this.requestStartTimestamp = 0;
    this.firstServerResponseTimestamp = 0;
    this.firstAudioChunkTimestamp = 0;
    this.firstAudioScheduledTimestamp = 0;
    this.completeResponseTimestamp = 0;
    this.screenFrameCapturedTimestamp = 0;
    this.screenFrameTransmittedTimestamp = 0;
    this.screenFrameProcessedTimestamp = 0;
    this.ttfaSamples = [];
    this.ttfrSamples = [];
    this.speechEndToFirstAudioSamples = [];
    this.visionSamples = [];
    this.serverProcessingSamples = [];
    this.totalRecorded = 0;
    this.notify();
  }

  private notify(): void {
    if (this.onTelemetryUpdated) {
      this.onTelemetryUpdated(this.getReport());
    }
  }
}

export const latencyTelemetry = new LatencyTelemetry();
