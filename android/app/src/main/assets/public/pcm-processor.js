class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      if (!channelData) return true;
      
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sum / channelData.length);
      
      // We send the Float32Array to the main thread
      // We slice it to ensure we send a copy across the worker boundary
      this.port.postMessage({ rms, pcmData: channelData.slice() });
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
