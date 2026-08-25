// Placeholder for Phase 2: Audio Context and State management
export type AudioContextState = 'SUSPENDED' | 'RUNNING' | 'CLOSED';

export class AudioState {
  private _state: AudioContextState = 'SUSPENDED';

  public get state(): AudioContextState {
    return this._state;
  }

  public set state(newState: AudioContextState) {
    this._state = newState;
  }
}

export const audioState = new AudioState();
