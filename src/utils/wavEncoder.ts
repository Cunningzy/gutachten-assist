/**
 * WAV Encoder Utility
 * Converts audio data to WAV format for maximum compatibility
 */

export class WAVEncoder {
  private sampleRate: number;
  private channels: number;

  constructor(sampleRate: number = 44100, channels: number = 1) {
    this.sampleRate = sampleRate;
    this.channels = channels;
  }

  /**
   * Convert AudioBuffer to WAV Blob
   */
  encodeAudioBufferToWAV(audioBuffer: AudioBuffer): Blob {
    const length = audioBuffer.length;
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    // Create interleaved PCM data
    const pcmData = new Float32Array(length * channels);

    if (channels === 1) {
      // Mono
      const channelData = audioBuffer.getChannelData(0);
      pcmData.set(channelData);
    } else {
      // Stereo or multi-channel - interleave
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < channels; ch++) {
          pcmData[i * channels + ch] = audioBuffer.getChannelData(ch)[i];
        }
      }
    }

    return this.encodeWAV(pcmData, sampleRate, channels);
  }

  /**
   * Convert raw audio data to WAV format
   */
  private encodeWAV(samples: Float32Array, sampleRate: number, channels: number): Blob {
    const length = samples.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true); // ChunkSize
    writeString(8, 'WAVE');

    // fmt subchunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, channels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * channels * 2, true); // ByteRate
    view.setUint16(32, channels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data subchunk
    writeString(36, 'data');
    view.setUint32(40, length * 2, true); // Subchunk2Size

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i])); // Clamp to [-1, 1]
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Convert MediaRecorder blob to WAV using AudioContext
   */
  async convertBlobToWAV(blob: Blob): Promise<Blob> {
    try {
      console.log('🔄 Converting to WAV format...');

      // Create AudioContext for decoding
      const audioContext = new AudioContext();
      const arrayBuffer = await blob.arrayBuffer();

      console.log(`📊 Decoding ${arrayBuffer.byteLength} bytes for WAV conversion...`);

      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      console.log(`✅ Audio decoded: ${audioBuffer.length} samples, ${audioBuffer.duration.toFixed(2)}s`);
      console.log(`📊 Channels: ${audioBuffer.numberOfChannels}, Sample rate: ${audioBuffer.sampleRate}Hz`);

      // Convert to WAV
      const wavBlob = this.encodeAudioBufferToWAV(audioBuffer);

      console.log(`✅ WAV conversion complete: ${wavBlob.size} bytes`);

      // Clean up
      await audioContext.close();

      return wavBlob;

    } catch (error) {
      console.error('❌ WAV conversion failed:', error);
      throw new Error(`WAV conversion failed: ${error}`);
    }
  }
}

// Export singleton instance
export const wavEncoder = new WAVEncoder();