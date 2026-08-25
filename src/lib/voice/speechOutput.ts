// Placeholder for Phase 2: Text-to-Speech / Audio playback handling
export class SpeechOutput {
  public async initialize(): Promise<void> {
    console.log('[SpeechOutput] Initialized');
  }

  public async play(text: string): Promise<void> {
    console.log('[SpeechOutput] Playing:', text);
  }

  public stop(): void {
    console.log('[SpeechOutput] Stopped playback');
  }
}

export const speechOutput = new SpeechOutput();
