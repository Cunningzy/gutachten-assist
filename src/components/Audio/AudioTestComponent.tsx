/**
 * Component 2.1A Test Interface
 * Test the basic audio capture functionality
 */

import React, { useState, useEffect, useRef } from 'react';
import { audioService, AudioRecordingResult, AudioCaptureService } from '../../services/audioService';

const AudioTestComponent: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [lastRecording, setLastRecording] = useState<AudioRecordingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioSupport, setAudioSupport] = useState<any>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Test audio support on component mount
    testAudioSupport();

    // Cleanup on unmount
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      audioService.cleanup();
    };
  }, []);

  const testAudioSupport = async () => {
    try {
      const support = await AudioCaptureService.testAudioSupport();
      setAudioSupport(support);
      console.log('🧪 Audio support test:', support);
    } catch (err) {
      setError(`Support test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleInitialize = async () => {
    try {
      setError(null);
      const success = await audioService.initialize();
      setIsInitialized(success);
      console.log('✅ Audio service initialized');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize audio');
      console.error('❌ Audio initialization failed:', err);
    }
  };

  const handleStartRecording = async () => {
    try {
      setError(null);
      await audioService.startRecording();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      durationInterval.current = setInterval(() => {
        const status = audioService.getStatus();
        setRecordingDuration(Math.floor(status.duration / 1000));
      }, 100);

      console.log('🔴 Recording started');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      console.error('❌ Recording start failed:', err);
    }
  };

  const handleStopRecording = async () => {
    try {
      setError(null);
      const result = await audioService.stopRecording();
      setIsRecording(false);
      setLastRecording(result);

      // Clear duration counter
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      // Create playback URL
      const url = URL.createObjectURL(result.audioBlob);
      setPlaybackUrl(url);

      console.log('⏹️ Recording stopped:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      console.error('❌ Recording stop failed:', err);
    }
  };

  const handleDownloadRecording = () => {
    if (!lastRecording) return;

    const url = URL.createObjectURL(lastRecording.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="medical-card mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          🎤 Component 2.1A: Audio Capture Test
        </h1>
        <p className="text-gray-600">
          Teste die grundlegende Audioaufnahme-Funktionalität
        </p>
      </div>

      {/* Audio Support Status */}
      <div className="medical-card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System-Unterstützung</h2>
        {audioSupport ? (
          <div className="grid gap-3">
            <div className="flex items-center">
              <span className={`status-dot ${audioSupport.microphoneSupported ? 'status-active' : 'status-error'} mr-3`}></span>
              <span>Mikrofonzugriff: {audioSupport.microphoneSupported ? '✅ Unterstützt' : '❌ Nicht verfügbar'}</span>
            </div>
            <div className="flex items-center">
              <span className={`status-dot ${audioSupport.mediaRecorderSupported ? 'status-active' : 'status-error'} mr-3`}></span>
              <span>MediaRecorder API: {audioSupport.mediaRecorderSupported ? '✅ Unterstützt' : '❌ Nicht verfügbar'}</span>
            </div>
            <div className="mt-2">
              <strong>Unterstützte Formate:</strong>
              <div className="flex flex-wrap gap-2 mt-1">
                {audioSupport.supportedFormats.map((format: string) => (
                  <span key={format} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    {format}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center">
            <div className="spinner w-4 h-4 mr-3"></div>
            <span>Teste System-Unterstützung...</span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="medical-card border-red-200 bg-red-50 mb-6">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-red-800 font-medium">Fehler</h3>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Controls */}
      <div className="medical-card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Audio-Steuerung</h2>
        
        <div className="flex flex-wrap gap-4">
          {!isInitialized ? (
            <button
              onClick={handleInitialize}
              className="medical-button"
              disabled={!audioSupport?.microphoneSupported}
            >
              🎤 Mikrofonzugriff anfordern
            </button>
          ) : (
            <>
              {!isRecording ? (
                <button
                  onClick={handleStartRecording}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  🔴 Aufnahme starten
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStopRecording}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    ⏹️ Aufnahme stoppen
                  </button>
                  <div className="flex items-center px-4 py-3 bg-red-100 text-red-800 rounded-lg">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-3"></div>
                    <span className="font-medium">
                      Aufnahme läuft: {formatDuration(recordingDuration)}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recording Results */}
      {lastRecording && (
        <div className="medical-card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Letzte Aufnahme</h2>
          
          <div className="grid gap-4">
            {/* Recording Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Dauer:</span>
                  <div className="font-mono text-lg">{formatDuration(Math.floor(lastRecording.duration / 1000))}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Dateigröße:</span>
                  <div className="font-mono text-lg">{formatFileSize(lastRecording.size)}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Format:</span>
                  <div className="text-sm">{lastRecording.format}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Status:</span>
                  <div className="text-green-600 font-medium">✅ Erfolgreich</div>
                </div>
              </div>
            </div>

            {/* Audio Player */}
            {playbackUrl && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Wiedergabe:</h3>
                <audio controls className="w-full">
                  <source src={playbackUrl} type={lastRecording.format} />
                  Ihr Browser unterstützt keine Audiowiedergabe.
                </audio>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDownloadRecording}
                className="medical-button-outline"
              >
                📥 Herunterladen
              </button>
              <button
                onClick={() => {
                  setLastRecording(null);
                  setPlaybackUrl(null);
                }}
                className="text-gray-600 hover:text-gray-800 px-4 py-2 border border-gray-300 rounded-lg transition-colors"
              >
                🗑️ Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
      <div className="medical-card success">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">✅ Component 2.1A Test-Ziele</h2>
        <div className="space-y-2">
          <div className="flex items-center">
            <span className={`status-dot ${audioSupport?.microphoneSupported ? 'status-active' : 'status-error'} mr-3`}></span>
            <span>Mikrofonzugriff erfolgreich anfordern</span>
          </div>
          <div className="flex items-center">
            <span className={`status-dot ${isInitialized ? 'status-active' : 'status-processing'} mr-3`}></span>
            <span>Audio-Service initialisieren</span>
          </div>
          <div className="flex items-center">
            <span className={`status-dot ${lastRecording ? 'status-active' : 'status-processing'} mr-3`}></span>
            <span>Audioaufnahme aufnehmen und wiedergeben</span>
          </div>
          <div className="flex items-center">
            <span className={`status-dot ${lastRecording ? 'status-active' : 'status-processing'} mr-3`}></span>
            <span>Aufnahme-Metadaten korrekt anzeigen</span>
          </div>
        </div>
        <div className="mt-4 p-3 bg-green-50 rounded-lg">
          <p className="text-green-800 text-sm">
            <strong>Nächster Schritt:</strong> Wenn alle Tests erfolgreich sind, können wir zu Component 2.1B (Whisper Integration) übergehen.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AudioTestComponent;