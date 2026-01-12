/**
 * Professional Diktiergerät (Dictation Device) Component
 * Clean implementation with Audacity-style integrated transport controls
 */

import React, { useState, useEffect, useRef } from 'react';
import { enhancedAudioService } from '../../services/enhancedAudioService';

interface AudioRecording {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
  timestamp: Date;
  url?: string;
}

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

const DiktiergeraetComponent: React.FC = () => {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<AudioRecording | null>(null);

  // Enhanced recording state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [recordingPosition, setRecordingPosition] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [canPreview, setCanPreview] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Audio tape functionality state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(0);
  const [maxRecordingDuration, setMaxRecordingDuration] = useState(600000); // 10 minutes max for timeline

  // Playback state
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0
  });

  // Audio refs
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize enhanced audio service
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        await enhancedAudioService.initialize();
        console.log('✅ Enhanced audio service initialized for professional dictation');
      } catch (error) {
        console.error('❌ Failed to initialize enhanced audio service:', error);
      }
    };

    initializeAudio();
  }, []);

  // Update recording status periodically with real-time monitoring
  useEffect(() => {
    const updateStatus = () => {
      if (isRecording || isPreviewPlaying) {
        const status = enhancedAudioService.getStatus();
        setRecordingPosition(status.position);
        setRecordingDuration(status.duration);
        setSegmentCount(status.segmentCount);
        setCanPreview(status.canPreview);
        setIsPreviewPlaying(status.isPreviewPlaying);
        setPreviewPosition(status.previewPosition);

        // Get real-time audio level from service
        const realAudioLevel = enhancedAudioService.getAudioLevel();
        setAudioLevel(realAudioLevel);
      } else {
        setAudioLevel(0);
      }
    };

    const interval = setInterval(updateStatus, 100); // Update every 100ms for smooth real-time monitoring
    return () => clearInterval(interval);
  }, [isRecording, isPreviewPlaying]);

  // Audio element event handlers
  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio || !selectedRecording) return;

    const updateTime = () => {
      setPlaybackState(prev => ({
        ...prev,
        currentTime: audio.currentTime,
        duration: audio.duration || 0
      }));
    };

    const handlePlay = () => {
      setPlaybackState(prev => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setPlaybackState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleEnded = () => {
      setPlaybackState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [selectedRecording]);

  // Enhanced recording functions
  const startRecording = async () => {
    try {
      const sessionId = await enhancedAudioService.startRecording();
      setCurrentSessionId(sessionId);
      setIsRecording(true);
      setIsPaused(false);
      setIsPreviewMode(false);
      console.log('🎤 Enhanced recording started with session:', sessionId);
    } catch (error) {
      console.error('❌ Recording start failed:', error);
      alert('Fehler beim Starten der Aufnahme. Bitte Mikrofonzugriff erlauben.');
    }
  };

  const pauseRecording = async () => {
    if (isRecording && !isPaused) {
      try {
        enhancedAudioService.pauseRecording();
        setIsPaused(true);
        console.log('⏸️ Recording paused for review');
      } catch (error) {
        console.error('❌ Failed to pause recording:', error);
        alert('Fehler beim Pausieren der Aufnahme');
      }
    }
  };

  const resumeRecording = async () => {
    if (isRecording && isPaused) {
      try {
        enhancedAudioService.resumeRecording();
        setIsPaused(false);
        setIsPreviewMode(false);
        console.log('▶️ Recording resumed');
      } catch (error) {
        console.error('❌ Failed to resume recording:', error);
        alert('Fehler beim Fortsetzen der Aufnahme');
      }
    }
  };

  const stopRecording = async () => {
    try {
      const result = await enhancedAudioService.stopRecording();
      if (result && result.finalBlob) {
        const newRecording: AudioRecording = {
          id: result.session.id,
          name: `Diktation ${recordings.length + 1}`,
          blob: result.finalBlob,
          duration: result.duration / 1000,
          timestamp: new Date(),
          url: URL.createObjectURL(result.finalBlob)
        };

        setRecordings(prev => [...prev, newRecording]);
        setSelectedRecording(newRecording); // Automatically select the new recording
        setIsRecording(false);
        setIsPaused(false);
        setCurrentSessionId(null);
        setCanPreview(false);
        setIsPreviewMode(false);
        console.log('✅ Enhanced recording completed:', newRecording.name);
      }
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      alert('Fehler beim Stoppen der Aufnahme');
    }
  };

  // New enhanced functions
  const previewCurrentRecording = async () => {
    try {
      const url = await enhancedAudioService.getPreviewUrl();
      if (url) {
        setPreviewUrl(url);
        setIsPreviewMode(true);

        // Play preview in audio element
        const audio = audioElementRef.current;
        if (audio) {
          audio.src = url;
          audio.play();
        }
        console.log('👁️ Previewing current recording');
      }
    } catch (error) {
      console.error('❌ Failed to preview recording:', error);
      alert('Fehler beim Abspielen der Vorschau');
    }
  };

  // Audio tape functionality - rewind and play
  const rewindAndPlay = async (seconds: number = 10) => {
    try {
      if (isRecording || canPreview) {
        await enhancedAudioService.rewindAndPlay(seconds);
        console.log(`⏪ Rewound ${seconds}s and started playback`);
      }
    } catch (error) {
      console.error('❌ Failed to rewind and play:', error);
      alert('Fehler beim Zurückspulen und Abspielen');
    }
  };

  // Pause/resume preview playback
  const togglePreviewPlayback = () => {
    try {
      if (isPreviewPlaying) {
        enhancedAudioService.pausePreview();
      } else {
        enhancedAudioService.resumePreview();
      }
    } catch (error) {
      console.error('❌ Failed to toggle preview playback:', error);
    }
  };

  // Start overlay recording (audio tape behavior)
  const startOverlayRecording = async () => {
    try {
      await enhancedAudioService.startOverlayRecording();
      setIsPaused(false);
      console.log('🎤 Started overlay recording');
    } catch (error) {
      console.error('❌ Failed to start overlay recording:', error);
      alert('Fehler beim Starten der Überschreibung');
    }
  };

  // Playback functions
  const playRecording = async () => {
    const audio = audioElementRef.current;
    if (audio && selectedRecording?.blob) {
      try {
        console.log('🔄 Converting blob to data URL for Tauri playback...');

        // Convert blob to data URL for Tauri compatibility
        const arrayBuffer = await selectedRecording.blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Convert to base64 in chunks to avoid call stack overflow
        let base64 = '';
        const chunkSize = 8192; // Process 8KB chunks

        console.log(`🔄 Converting ${uint8Array.length} bytes in ${Math.ceil(uint8Array.length / chunkSize)} chunks...`);

        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          base64 += btoa(String.fromCharCode(...chunk));
        }

        const dataUrl = `data:${selectedRecording.blob.type};base64,${base64}`;

        console.log('✅ Data URL created, starting playback...');
        audio.src = dataUrl;

        // Add error handling for format issues
        audio.onerror = () => {
          console.log('❌ HTML5 audio format error, trying AudioContext...');
          tryAudioContextPlayback(selectedRecording);
        };

        await audio.play();
        console.log('✅ Playback started successfully');
      } catch (error) {
        console.error('❌ HTML5 audio playback failed, trying AudioContext fallback:', error);
        tryAudioContextPlayback(selectedRecording);
      }
    } else if (selectedRecording?.url) {
      // Fallback to URL if blob not available
      try {
        audio.src = selectedRecording.url;
        await audio.play();
      } catch (error) {
        console.error('❌ URL Playback failed:', error);
        alert('Wiedergabe fehlgeschlagen');
      }
    }
  };

  const pausePlayback = () => {
    const audio = audioElementRef.current;
    if (audio) audio.pause();
  };

  const stopPlayback = () => {
    const audio = audioElementRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  };

  // AudioContext fallback playback for Tauri compatibility
  const tryAudioContextPlayback = async (recording: AudioRecording) => {
    try {
      console.log('🔄 Trying AudioContext playback method...');

      const audioContext = new AudioContext();
      const arrayBuffer = await recording.blob.arrayBuffer();

      console.log(`📊 Decoding ${arrayBuffer.byteLength} bytes with AudioContext...`);

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      console.log(`✅ Audio decoded: ${audioBuffer.length} samples, ${audioBuffer.duration.toFixed(2)}s`);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        console.log('🏁 AudioContext playback ended');
        audioContext.close();
      };

      source.start();
      console.log('▶️ AudioContext playback started successfully');

    } catch (error) {
      console.error('❌ AudioContext playback also failed:', error);
      alert('Wiedergabe fehlgeschlagen: Alle Wiedergabemethoden gescheitert');
    }
  };

  const rewind = (seconds: number = 10) => {
    const audio = audioElementRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - seconds);
  };

  const fastForward = (seconds: number = 10) => {
    const audio = audioElementRef.current;
    if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + seconds);
  };

  const seekTo = (time: number) => {
    const audio = audioElementRef.current;
    if (audio) audio.currentTime = time;
  };

  const setPlaybackSpeed = (speed: number) => {
    const audio = audioElementRef.current;
    if (audio) {
      audio.playbackRate = speed;
      setPlaybackState(prev => ({ ...prev, playbackRate: speed }));
    }
  };

  // Utility functions
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectRecording = (recording: AudioRecording) => {
    stopPlayback();
    setSelectedRecording(recording);
    console.log('Selected recording:', recording.name);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center bg-white p-6 rounded-lg shadow-sm border">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Professionelles Diktiergerät
          </h1>
          <p className="text-lg text-gray-600">
            Medizinische Dokumentation mit Audacity-ähnlicher Transport-Steuerung
          </p>
        </div>

        {/* Hidden Audio Element */}
        <audio ref={audioElementRef} className="hidden" />

        {/* Main Control Panel */}
        <div className="bg-white rounded-lg shadow-lg border overflow-hidden">

          {/* Status Bar */}
          <div className="bg-gray-100 px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    isRecording ? (isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse') : 'bg-gray-400'
                  }`}></div>
                  <span className={`font-medium ${
                    isRecording ? (isPaused ? 'text-yellow-600' : 'text-red-600') : 'text-green-600'
                  }`}>
                    {isRecording ? (isPaused ? 'Aufnahme pausiert' : 'Aufnahme läuft') : 'Bereit für Aufnahme'}
                  </span>
                </div>
                {selectedRecording && (
                  <div className="text-blue-600 font-medium">
                    Ausgewählt: {selectedRecording.name}
                  </div>
                )}
              </div>
              <div className="text-gray-600">
                Gespeicherte Diktationen: {recordings.length}
              </div>
            </div>
          </div>

          {/* AUDACITY-STYLE INTEGRATED TRANSPORT CONTROLS */}
          <div className="p-8">
            <div className="space-y-8">

              {/* Main Transport Toolbar */}
              <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-6 rounded-lg border-2 border-gray-300 shadow-lg">
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">🎛️ TRANSPORT STEUERUNG</h2>
                  <p className="text-gray-600">Professionelle Audio-Bedienelemente nach Audacity-Standard</p>
                </div>

                {/* Integrated Control Bar */}
                <div className="flex justify-center items-center space-x-3 bg-white p-4 rounded-lg shadow-inner">

                  {/* Skip to Start */}
                  <button
                    onClick={() => {
                      if (selectedRecording) {
                        seekTo(0);
                      } else {
                        console.log('No recording selected for playback');
                        alert('Bitte wählen Sie eine Aufnahme aus der Liste unten aus');
                      }
                    }}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md"
                    title="Zum Anfang springen"
                  >
                    ⏮️
                  </button>

                  {/* Rewind / Audio Tape Playback */}
                  <button
                    onClick={() => {
                      if (isRecording) {
                        rewindAndPlay(10);
                      } else {
                        rewind(10);
                      }
                    }}
                    disabled={!selectedRecording && !isRecording}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-all shadow-md"
                    title={isRecording ? "10s zurück und abspielen" : "10 Sekunden zurück"}
                  >
                    ⏪
                  </button>

                  {/* Universal Pause (works for both recording and playback) */}
                  <button
                    onClick={() => {
                      if (isRecording && !isPaused) {
                        pauseRecording();
                      } else if (isRecording && isPaused) {
                        resumeRecording();
                      } else if (playbackState.isPlaying) {
                        pausePlayback();
                      }
                    }}
                    disabled={!isRecording && !playbackState.isPlaying}
                    className={`p-4 rounded-lg font-bold text-xl transition-all shadow-lg ${
                      isRecording && isPaused
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-yellow-500 text-white hover:bg-yellow-600 disabled:bg-gray-300 disabled:text-gray-500'
                    }`}
                    title={isRecording && isPaused ? "Aufnahme fortsetzen" : "Pausieren"}
                  >
                    {isRecording && isPaused ? '▶️' : '⏸️'}
                  </button>

                  {/* Play / Preview */}
                  <button
                    onClick={() => {
                      if (isRecording && canPreview) {
                        previewCurrentRecording();
                      } else {
                        playRecording();
                      }
                    }}
                    disabled={!selectedRecording && !(isRecording && canPreview)}
                    className="p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 transition-all shadow-lg font-bold text-xl"
                    title={isRecording && canPreview ? "Aktuelle Aufnahme anhören" : "Wiedergabe starten"}
                  >
                    ▶️
                  </button>

                  {/* Universal Stop (works for both recording and playback) */}
                  <button
                    onClick={() => {
                      if (isRecording) {
                        stopRecording();
                      } else {
                        stopPlayback();
                      }
                    }}
                    disabled={!isRecording && !playbackState.isPlaying}
                    className="p-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-500 transition-all shadow-lg font-bold text-xl"
                    title="Stoppen"
                  >
                    ⏹️
                  </button>

                  {/* Fast Forward */}
                  <button
                    onClick={() => {
                      if (selectedRecording) {
                        fastForward(10);
                      } else {
                        console.log('No recording selected for playback');
                        alert('Bitte wählen Sie eine Aufnahme aus der Liste unten aus');
                      }
                    }}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md"
                    title="10 Sekunden vorwärts"
                  >
                    ⏩
                  </button>

                  {/* Skip to End */}
                  <button
                    onClick={() => {
                      if (selectedRecording) {
                        const audio = audioElementRef.current;
                        if (audio && audio.duration) seekTo(audio.duration);
                      } else {
                        console.log('No recording selected for playback');
                        alert('Bitte wählen Sie eine Aufnahme aus der Liste unten aus');
                      }
                    }}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md"
                    title="Zum Ende springen"
                  >
                    ⏭️
                  </button>

                  {/* Record */}
                  <button
                    onClick={startRecording}
                    disabled={isRecording}
                    className={`p-4 rounded-lg font-bold text-xl transition-all shadow-lg ${
                      isRecording
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                    title="Aufnahme starten"
                  >
                    🎤
                  </button>

                  {/* Loop Toggle */}
                  <button
                    onClick={() => {
                      const audio = audioElementRef.current;
                      if (audio) {
                        audio.loop = !audio.loop;
                      }
                    }}
                    disabled={!selectedRecording}
                    className="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-500 transition-all shadow-md"
                    title="Wiederholung ein-/ausschalten"
                  >
                    🔄
                  </button>
                </div>

                {/* Status Display */}
                <div className="mt-4 text-center">
                  <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${
                    isRecording
                      ? 'bg-red-100 text-red-800'
                      : playbackState.isPlaying
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    <div className={`w-3 h-3 rounded-full ${
                      isRecording ? (isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse')
                      : playbackState.isPlaying ? 'bg-green-500 animate-pulse'
                      : 'bg-gray-400'
                    }`}></div>
                    <span className="font-medium">
                      {isRecording
                        ? (isPaused
                            ? (canPreview ? 'Pausiert - Vorschau verfügbar' : 'Aufnahme pausiert')
                            : 'Aufnahme läuft')
                        : playbackState.isPlaying
                          ? (isPreviewMode ? 'Vorschau läuft' : 'Wiedergabe läuft')
                          : 'Bereit'
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time Recording Monitoring */}
              {isRecording && (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-lg">
                  <div className="text-center mb-4">
                    <h3 className="text-xl font-bold text-red-800 mb-2">
                      🎤 AUFNAHME AKTIV - Echtzeit-Monitoring
                    </h3>
                    <div className="text-3xl font-mono font-bold text-red-800">
                      {formatTime(recordingDuration / 1000)}
                    </div>
                  </div>

                  {/* Visual Timeline Stripe with Position Marker */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-red-700">Aufnahme-Timeline</span>
                      <span className="text-sm text-red-600">Position: {formatTime(recordingPosition / 1000)}</span>
                    </div>
                    <div className="relative w-full bg-gray-300 rounded-lg h-8 shadow-inner cursor-pointer"
                         onClick={(e) => {
                           const rect = e.currentTarget.getBoundingClientRect();
                           const x = e.clientX - rect.left;
                           const percentage = x / rect.width;
                           const newPosition = percentage * maxRecordingDuration;
                           rewindAndPlay((recordingPosition - newPosition) / 1000);
                         }}>
                      {/* Recording progress */}
                      <div
                        className="bg-gradient-to-r from-red-400 to-red-500 h-8 rounded-lg transition-all duration-200 shadow-sm"
                        style={{ width: `${Math.min(100, (recordingDuration / maxRecordingDuration) * 100)}%` }}
                      />
                      {/* Current position marker */}
                      <div
                        className="absolute top-0 w-1 h-8 bg-blue-600 rounded-full shadow-lg transform -translate-x-0.5 z-10"
                        style={{ left: `${Math.min(100, (recordingPosition / maxRecordingDuration) * 100)}%` }}
                      />
                      {/* Preview position marker (when playing back) */}
                      {isPreviewPlaying && (
                        <div
                          className="absolute top-0 w-1 h-8 bg-green-500 rounded-full shadow-lg transform -translate-x-0.5 z-10 animate-pulse"
                          style={{ left: `${Math.min(100, (previewPosition / maxRecordingDuration) * 100)}%` }}
                        />
                      )}
                      {/* Segment markers */}
                      {Array.from({ length: segmentCount }, (_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 w-0.5 h-8 bg-white opacity-50"
                          style={{ left: `${((i + 1) * 1000 / maxRecordingDuration) * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Audio Level Meter */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-red-700">Audio-Pegel (Echtzeit)</span>
                      <span className="text-sm text-red-600">{(audioLevel * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-300 rounded-full h-4 shadow-inner">
                      <div
                        className={`h-4 rounded-full transition-all duration-75 ${
                          audioLevel > 0.8 ? 'bg-red-500 animate-pulse' :
                          audioLevel > 0.6 ? 'bg-yellow-500' :
                          audioLevel > 0.3 ? 'bg-green-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${Math.max(2, audioLevel * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Audio Tape Controls */}
                  <div className="space-y-4">
                    {/* Rewind and Play Controls */}
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={() => rewindAndPlay(1)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md text-sm"
                      >
                        ⏪ 1s abspielen
                      </button>
                      <button
                        onClick={() => rewindAndPlay(10)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md"
                      >
                        ⏪ 10s abspielen
                      </button>
                      <button
                        onClick={() => rewindAndPlay(30)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md"
                      >
                        ⏪ 30s abspielen
                      </button>
                    </div>

                    {/* Preview Playback Controls */}
                    {isPreviewPlaying && (
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={togglePreviewPlayback}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all shadow-md"
                        >
                          ⏸️ Vorschau pausieren
                        </button>
                        <button
                          onClick={startOverlayRecording}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-md font-bold"
                        >
                          🎤 ÜBERSCHREIBEN
                        </button>
                      </div>
                    )}

                    {/* Status Display */}
                    <div className="text-center">
                      <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full text-sm ${
                        isPreviewPlaying
                          ? 'bg-yellow-100 text-yellow-800'
                          : isPaused
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          isPreviewPlaying ? 'bg-yellow-500 animate-pulse'
                          : isPaused ? 'bg-orange-500'
                          : 'bg-red-500 animate-pulse'
                        }`}></div>
                        <span className="font-medium">
                          {isPreviewPlaying
                            ? 'Vorschau läuft - Zum Überschreiben bereit'
                            : isPaused
                              ? 'Aufnahme pausiert - Bereit für Vorschau'
                              : 'Aufnahme läuft'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline and Monitoring Section */}
              <div className="bg-white p-6 rounded-lg border shadow-md">
                <div className="space-y-6">

                  {/* Time Display and Progress Bar */}
                  {selectedRecording ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          📻 {selectedRecording.name}
                        </h3>
                        <div className="text-3xl font-mono font-bold text-gray-800">
                          {formatTime(playbackState.currentTime)} / {formatTime(playbackState.duration)}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div
                        className="w-full bg-gray-300 rounded-full h-6 cursor-pointer shadow-inner"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const percentage = x / rect.width;
                          seekTo(percentage * playbackState.duration);
                        }}
                      >
                        <div
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-6 rounded-full transition-all duration-100 shadow-sm"
                          style={{
                            width: `${playbackState.duration > 0 ? (playbackState.currentTime / playbackState.duration) * 100 : 0}%`
                          }}
                        />
                      </div>

                      {/* Speed Control */}
                      <div className="text-center">
                        <label className="block text-sm font-medium text-gray-700 mb-3">⚡ Wiedergabegeschwindigkeit</label>
                        <div className="flex justify-center space-x-2">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                            <button
                              key={speed}
                              onClick={() => setPlaybackSpeed(speed)}
                              disabled={!selectedRecording}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
                                Math.abs(playbackState.playbackRate - speed) < 0.01
                                  ? 'bg-blue-600 text-white shadow-md'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed'
                              }`}
                            >
                              {speed}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-12">
                      <div className="text-6xl mb-4">🎵</div>
                      <div className="text-xl font-medium">Keine Diktation ausgewählt</div>
                      <div className="text-sm mt-2">Wählen Sie eine Aufnahme aus der Liste unten aus</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recording List */}
        {recordings.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              📁 Gespeicherte Diktationen ({recordings.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                    selectedRecording?.id === recording.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => selectRecording(recording)}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900 truncate">{recording.name}</h4>
                      {selectedRecording?.id === recording.id && (
                        <span className="text-blue-600 text-lg">✓</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      ⏱️ {formatTime(recording.duration)}
                    </p>
                    <p className="text-xs text-gray-500">
                      📅 {recording.timestamp.toLocaleDateString('de-DE')} um {recording.timestamp.toLocaleTimeString('de-DE')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced Instructions */}
        <div className="bg-blue-50 border-2 border-blue-200 p-6 rounded-lg">
          <h3 className="font-bold text-blue-800 mb-4 text-lg">📖 Professionelle Diktiergerät-Bedienung</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold text-red-700 mb-2">🎤 Aufnahme:</h4>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• <strong>🎤</strong> - Neue Diktation starten</li>
                <li>• <strong>⏸️</strong> - Aufnahme pausieren für Überprüfung</li>
                <li>• <strong>▶️</strong> - Vorschau der aktuellen Aufnahme</li>
                <li>• <strong>⏪</strong> - Zurückspulen und neu aufnehmen</li>
                <li>• <strong>⏹️</strong> - Aufnahme stoppen und speichern</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">🔊 Wiedergabe:</h4>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• Diktation aus der Liste auswählen</li>
                <li>• <strong>▶️</strong> - Wiedergabe starten</li>
                <li>• <strong>⏪ ⏩</strong> - Vor- und zurückspulen</li>
                <li>• <strong>⏮️ ⏭️</strong> - Zum Anfang/Ende springen</li>
                <li>• <strong>🔄</strong> - Wiederholung ein-/ausschalten</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-green-700 mb-2">⚡ Profi-Features:</h4>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• <strong>Echtzeit-Monitoring:</strong> Audio-Pegel & Zeit</li>
                <li>• <strong>Segment-Aufnahme:</strong> Automatische Unterteilung</li>
                <li>• <strong>Sofort-Vorschau:</strong> Während der Aufnahme anhören</li>
                <li>• <strong>Präzise Korrektur:</strong> Beliebige Stellen überschreiben</li>
                <li>• <strong>Audacity-Workflow:</strong> Professionelle Bedienung</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DiktiergeraetComponent;