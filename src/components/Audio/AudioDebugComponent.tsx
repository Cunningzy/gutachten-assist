/**
 * Audio Debug Component
 * Simple component to test basic audio recording and playback
 * Bypasses complex enhanced audio service
 */

import React, { useState, useRef } from 'react';
import { wavEncoder } from '../../utils/wavEncoder';

interface SimpleRecording {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
  url: string;
  originalBlob?: Blob; // Keep original for debugging
}

const AudioDebugComponent: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<SimpleRecording[]>([]);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  const addDebugInfo = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const debugMsg = `[${timestamp}] ${message}`;
    setDebugInfo(prev => [...prev, debugMsg]);
    console.log(debugMsg);
  };

  const startRecording = async () => {
    try {
      addDebugInfo('🎤 Requesting microphone access...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      addDebugInfo('✅ Microphone access granted');
      addDebugInfo(`🎛️ Audio tracks: ${stream.getAudioTracks().length}`);

      // Tauri-compatible MediaRecorder setup - prioritize formats that work in Tauri
      const mimeTypes = [
        'audio/wav',           // Most compatible
        'audio/mp4',           // H.264 audio, good compatibility
        'audio/webm;codecs=pcm', // PCM in WebM container
        'audio/webm',          // Basic WebM
        'audio/ogg;codecs=opus', // OGG container with Opus
        'audio/webm;codecs=opus' // Last resort - known to fail in Tauri
      ];

      let selectedMimeType = '';
      addDebugInfo('🔍 Testing MIME type compatibility...');

      for (const mimeType of mimeTypes) {
        const isSupported = MediaRecorder.isTypeSupported(mimeType);
        addDebugInfo(`${isSupported ? '✅' : '❌'} ${mimeType}: ${isSupported ? 'Supported' : 'Not supported'}`);

        if (isSupported && !selectedMimeType) {
          selectedMimeType = mimeType;
        }
      }

      addDebugInfo(`🎵 Using MIME type: ${selectedMimeType}`);

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: selectedMimeType
      });

      audioChunksRef.current = [];
      startTimeRef.current = Date.now();

      // Collect audio data
      mediaRecorderRef.current.ondataavailable = (event) => {
        addDebugInfo(`📊 Data available: ${event.data.size} bytes`);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording completion
      mediaRecorderRef.current.onstop = async () => {
        const duration = Date.now() - startTimeRef.current;
        addDebugInfo(`⏹️ Recording stopped. Duration: ${duration}ms`);
        addDebugInfo(`📦 Total chunks: ${audioChunksRef.current.length}`);

        const totalSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        addDebugInfo(`📊 Total audio data: ${totalSize} bytes`);

        if (audioChunksRef.current.length === 0) {
          addDebugInfo('❌ ERROR: No audio chunks collected!');
          return;
        }

        const originalBlob = new Blob(audioChunksRef.current, {
          type: selectedMimeType
        });

        addDebugInfo(`💾 Created original blob: ${originalBlob.size} bytes, type: ${originalBlob.type}`);

        try {
          // Convert to WAV format
          addDebugInfo('🔄 Converting to WAV format...');
          const wavBlob = await wavEncoder.convertBlobToWAV(originalBlob);

          addDebugInfo(`✅ WAV conversion complete: ${wavBlob.size} bytes, type: ${wavBlob.type}`);

          const url = URL.createObjectURL(wavBlob);
          addDebugInfo(`🔗 Created WAV URL: ${url.substring(0, 50)}...`);

          const newRecording: SimpleRecording = {
            id: `recording_${Date.now()}`,
            name: `WAV Recording ${recordings.length + 1}`,
            blob: wavBlob,
            duration: duration / 1000,
            url: url,
            originalBlob: originalBlob
          };

          setRecordings(prev => [...prev, newRecording]);
          addDebugInfo(`✅ WAV recording saved: ${newRecording.name}`);

        } catch (error) {
          addDebugInfo(`❌ WAV conversion failed: ${error}`);

          // Fallback to original format
          const url = URL.createObjectURL(originalBlob);
          const newRecording: SimpleRecording = {
            id: `recording_${Date.now()}`,
            name: `Fallback Recording ${recordings.length + 1}`,
            blob: originalBlob,
            duration: duration / 1000,
            url: url
          };

          setRecordings(prev => [...prev, newRecording]);
          addDebugInfo(`⚠️ Using original format as fallback: ${newRecording.name}`);
        }

        // Stop all tracks
        stream.getTracks().forEach(track => {
          track.stop();
          addDebugInfo(`🛑 Stopped audio track: ${track.kind}`);
        });
      };

      // Start recording
      mediaRecorderRef.current.start(1000); // Get data every 1 second
      setIsRecording(true);
      addDebugInfo('🚀 Recording started with 1-second intervals');

    } catch (error) {
      addDebugInfo(`❌ Recording start failed: ${error}`);
      alert(`Mikrofon-Fehler: ${error}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      addDebugInfo('⏸️ Stopping recording...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const testPlayback = async (recording: SimpleRecording) => {
    addDebugInfo(`🔊 Testing WAV playback for: ${recording.name}`);
    addDebugInfo(`📊 WAV blob size: ${recording.blob.size} bytes, type: ${recording.blob.type}`);

    // WAV format should work directly with HTML5 audio in Tauri
    try {
      addDebugInfo('🎵 Trying direct WAV playback (should work in Tauri)...');

      const audio = new Audio();

      audio.onloadstart = () => addDebugInfo('📡 WAV audio loading started');
      audio.oncanplay = () => addDebugInfo('✅ WAV audio can play - SUCCESS!');
      audio.onplay = () => addDebugInfo('▶️ WAV audio playback started - PERFECT!');
      audio.onended = () => addDebugInfo('🏁 WAV audio playback ended - COMPLETE!');

      audio.onerror = (e) => {
        addDebugInfo(`❌ WAV Audio error: ${e}`);
        addDebugInfo(`❌ Audio error code: ${audio.error?.code}`);
        addDebugInfo(`❌ Audio error message: ${audio.error?.message}`);

        // If WAV still fails, try data URL
        addDebugInfo('🔄 WAV direct playback failed, trying data URL...');
        tryDataUrlPlayback(recording);
      };

      // Try direct blob URL first (should work for WAV)
      const url = URL.createObjectURL(recording.blob);
      audio.src = url;

      audio.play().then(() => {
        addDebugInfo('✅ WAV direct playback promise resolved - EXCELLENT!');
      }).catch(error => {
        addDebugInfo(`❌ WAV direct playback promise rejected: ${error}`);
        addDebugInfo('🔄 Trying data URL fallback...');
        tryDataUrlPlayback(recording);
      });

    } catch (error) {
      addDebugInfo(`❌ WAV playback setup failed: ${error}`);
      tryDataUrlPlayback(recording);
    }
  };

  // Fallback to data URL conversion if needed
  const tryDataUrlPlayback = async (recording: SimpleRecording) => {
    try {
      addDebugInfo('🔄 Converting WAV blob to data URL...');

      const arrayBuffer = await recording.blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Convert to base64 in chunks to avoid call stack overflow
      let base64 = '';
      const chunkSize = 8192;

      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        base64 += btoa(String.fromCharCode(...chunk));
      }

      const dataUrl = `data:${recording.blob.type};base64,${base64}`;
      addDebugInfo(`✅ WAV data URL created: ${dataUrl.length} chars`);

      const audio = new Audio();
      audio.src = dataUrl;

      audio.play().then(() => {
        addDebugInfo('✅ WAV data URL playback working!');
      }).catch(error => {
        addDebugInfo(`❌ WAV data URL also failed: ${error}`);
        // Final fallback to AudioContext
        tryAlternativePlayback(recording);
      });

    } catch (error) {
      addDebugInfo(`❌ Data URL conversion failed: ${error}`);
      tryAlternativePlayback(recording);
    }
  };

  // Alternative playback method using AudioContext for Tauri compatibility
  const tryAlternativePlayback = async (recording: SimpleRecording) => {
    try {
      addDebugInfo('🔄 Trying AudioContext playback method...');

      const audioContext = new AudioContext();
      const arrayBuffer = await recording.blob.arrayBuffer();

      addDebugInfo(`📊 Decoding ${arrayBuffer.byteLength} bytes with AudioContext...`);

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      addDebugInfo(`✅ Audio decoded: ${audioBuffer.length} samples, ${audioBuffer.duration.toFixed(2)}s`);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        addDebugInfo('🏁 AudioContext playback ended');
        audioContext.close();
      };

      source.start();
      addDebugInfo('▶️ AudioContext playback started');

    } catch (error) {
      addDebugInfo(`❌ AudioContext playback failed: ${error}`);
    }
  };

  const clearDebug = () => {
    setDebugInfo([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔧 Audio Debug Interface
          </h1>
          <p className="text-gray-600">
            Simple audio recording test to debug playback issues
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-bold text-gray-800 mb-4">🎮 Debug Controls</h2>

          <div className="flex gap-4 mb-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                🎤 Start Simple Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                ⏹️ Stop Recording
              </button>
            )}

            <button
              onClick={clearDebug}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              🧹 Clear Debug Log
            </button>
          </div>

          {isRecording && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-700 font-medium">Debug Recording Active...</span>
              </div>
            </div>
          )}
        </div>

        {/* Recordings */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📁 Test Recordings ({recordings.length})</h2>

          {recordings.length === 0 ? (
            <p className="text-gray-500">No recordings yet. Start a test recording.</p>
          ) : (
            <div className="space-y-3">
              {recordings.map((recording) => (
                <div key={recording.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <span className="font-medium">{recording.name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {recording.duration.toFixed(1)}s • {recording.blob.size} bytes
                    </span>
                  </div>
                  <button
                    onClick={() => testPlayback(recording)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    🔊 Test Playback
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Debug Log */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📝 Debug Log</h2>

          <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
            {debugInfo.length === 0 ? (
              <p className="text-gray-500">No debug info yet. Start recording to see details.</p>
            ) : (
              debugInfo.map((info, index) => (
                <div key={index} className="mb-1">
                  {info}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AudioDebugComponent;