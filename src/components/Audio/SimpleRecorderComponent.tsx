import React, { useState, useRef } from 'react';

const SimpleRecorderComponent: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Function to convert audio blob to WAV format with improved encoding
  const convertToWav = async (audioBlob: Blob): Promise<Blob> => {
    try {
      const audioContext = new AudioContext();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const length = audioBuffer.length;
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels;

      console.log(`WAV conversion: ${channels} channels, ${sampleRate}Hz, ${length} samples`);

      // Create WAV file with proper alignment
      const bytesPerSample = 2;
      const blockAlign = channels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = length * blockAlign;
      const fileSize = 36 + dataSize;

      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // Helper function to write strings
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      // RIFF header
      writeString(0, 'RIFF');
      view.setUint32(4, fileSize, true);  // File size - 8
      writeString(8, 'WAVE');

      // fmt chunk
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);       // PCM chunk size
      view.setUint16(20, 1, true);        // Audio format (PCM = 1)
      view.setUint16(22, channels, true); // Number of channels
      view.setUint32(24, sampleRate, true); // Sample rate
      view.setUint32(28, byteRate, true);   // Byte rate
      view.setUint16(32, blockAlign, true); // Block align
      view.setUint16(34, 16, true);         // Bits per sample

      // data chunk
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);  // Data size

      // Write PCM data
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < channels; channel++) {
          let sample = audioBuffer.getChannelData(channel)[i];
          // Clamp and convert to 16-bit PCM
          sample = Math.max(-1, Math.min(1, sample));
          const pcm = Math.round(sample * 32767);
          view.setInt16(offset, pcm, true);
          offset += 2;
        }
      }

      await audioContext.close();
      console.log(`WAV created: ${buffer.byteLength} bytes`);
      return new Blob([buffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('WAV conversion failed:', error);
      throw error;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Try to use WAV format if supported, otherwise fall back to default
      let options: MediaRecorderOptions = {};

      if (MediaRecorder.isTypeSupported('audio/wav')) {
        options.mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        options.mimeType = 'audio/webm;codecs=pcm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        options.mimeType = 'audio/ogg;codecs=opus';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          // Create blob from recorded chunks
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const originalBlob = new Blob(audioChunksRef.current, { type: mimeType });

          // Convert to WAV format for Tauri compatibility
          console.log('Converting audio to WAV format...');
          const wavBlob = await convertToWav(originalBlob);
          console.log('Audio converted successfully to WAV');

          setAudioBlob(wavBlob);
          setAudioUrl(URL.createObjectURL(wavBlob));
        } catch (error) {
          console.error('Audio conversion failed:', error);
          // Fallback to original blob
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const fallbackBlob = new Blob(audioChunksRef.current, { type: mimeType });
          setAudioBlob(fallbackBlob);
          setAudioUrl(URL.createObjectURL(fallbackBlob));
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playRecording = async () => {
    if (audioBlob) {
      try {
        console.log('Playing audio from blob, size:', audioBlob.size, 'type:', audioBlob.type);

        // Try multiple approaches for Tauri compatibility
        let audio: HTMLAudioElement;

        // Approach 1: Try data URL (more compatible with Tauri)
        try {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          console.log('Created data URL, length:', dataUrl.length);
          audio = new Audio(dataUrl);
        } catch (dataUrlError) {
          console.warn('Data URL approach failed:', dataUrlError);
          // Fallback to blob URL
          audio = new Audio(audioUrl);
        }

        audio.onloadstart = () => console.log('Audio load started');
        audio.onloadedmetadata = () => console.log('Audio metadata loaded, duration:', audio.duration);
        audio.onloadeddata = () => console.log('Audio data loaded successfully');
        audio.oncanplay = () => console.log('Audio can start playing');
        audio.oncanplaythrough = () => console.log('Audio can play through');

        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          console.error('Audio error details:', audio.error);
          alert(`Audio error: ${audio.error?.message || 'Unknown error'}`);
        };

        // Wait for the audio to be ready
        await new Promise<void>((resolve, reject) => {
          audio.oncanplay = () => resolve();
          audio.onerror = reject;
          audio.load();
        });

        await audio.play();
        console.log('Audio playback started successfully');
      } catch (error) {
        console.error('Playback failed:', error);
        alert(`Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.error('No audio blob available');
      alert('No audio recording available to play');
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f9fafb' }}>
      <h1 style={{ fontSize: '2rem', color: '#1f2937', marginBottom: '1rem' }}>
        🎤 Simple Recorder
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Audio Recording Component - Working Version
      </p>

      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2 style={{ fontSize: '1.5rem', color: '#1e40af', marginBottom: '1rem' }}>
          🎮 Recording Controls
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={startRecording}
            disabled={isRecording}
            style={{
              backgroundColor: isRecording ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              cursor: isRecording ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              marginRight: '10px'
            }}>
            🎤 {isRecording ? 'Recording...' : 'Start Recording'}
          </button>

          <button
            onClick={stopRecording}
            disabled={!isRecording}
            style={{
              backgroundColor: !isRecording ? '#9ca3af' : '#4b5563',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              cursor: !isRecording ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              marginRight: '10px'
            }}>
            ⏹️ Stop Recording
          </button>

          {audioBlob && (
            <button
              onClick={playRecording}
              style={{
                backgroundColor: '#059669',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}>
              ▶️ Play Recording
            </button>
          )}
        </div>

        {isRecording && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '15px'
          }}>
            <p style={{ color: '#92400e', margin: 0, fontSize: '14px' }}>
              🔴 Recording in progress... Speak now!
            </p>
          </div>
        )}

        {audioBlob && (
          <div style={{
            backgroundColor: '#dcfce7',
            border: '1px solid #22c55e',
            borderRadius: '6px',
            padding: '12px'
          }}>
            <p style={{ color: '#166534', margin: 0, fontSize: '14px' }}>
              ✅ Recording saved! Audio size: {(audioBlob.size / 1024).toFixed(1)} KB
            </p>
            <p style={{ color: '#166534', margin: '5px 0 0 0', fontSize: '12px' }}>
              Debug: audioUrl exists: {audioUrl ? 'YES' : 'NO'} | Blob type: {audioBlob.type}
              {audioBlob.type === 'audio/wav' && ' ✅ WAV format - Tauri compatible'}
              {audioBlob.type.includes('webm') && ' ⚠️ WebM format - conversion may have failed'}
            </p>
          </div>
        )}
      </div>

      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px'
      }}>
        <h3 style={{ fontSize: '1.25rem', color: '#1e40af', marginBottom: '1rem' }}>
          ✅ Component Status
        </h3>
        <p style={{ color: '#059669', fontWeight: '600' }}>
          Simple Recorder Component Loaded Successfully!
        </p>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px' }}>
          Basic version without Tauri imports
        </p>
      </div>
    </div>
  );
};

export default SimpleRecorderComponent;