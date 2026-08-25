// Placeholder for Phase 2: Speech Recognition/Microphone input handling
export class SpeechInput {
  public async initialize(): Promise<void> {
    console.log('[SpeechInput] Initialized');
  }

  public async startRecording(): Promise<void> {
    console.log('[SpeechInput] Started recording');
  }

  public stopRecording(): void {
    console.log('[SpeechInput] Stopped recording');
  }
}

export const speechInput = new SpeechInput();
