import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Save, Edit3, Sparkles, Check, Loader2 } from 'lucide-react';
import { audioService, AudioRecordingResult } from '../../services/audioService';
import { whisperService } from '../../services/whisperService';
import { LlamaService } from '../../services/llamaService';

interface TranscriptionSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  isEdited: boolean;
}

const RealTimeTranscriptionComponent: React.FC = () => {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Transcription state
  const [transcriptionSegments, setTranscriptionSegments] = useState<TranscriptionSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Whisper initialization state
  const [isWhisperInitialized, setIsWhisperInitialized] = useState(false);
  const [isInitializingWhisper, setIsInitializingWhisper] = useState(false);

  // Editing state
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Grammar correction state
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [correctionTime, setCorrectionTime] = useState<number | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRecording]);

  const handleInitializeWhisper = async () => {
    try {
      console.log('🔄 Starting Whisper and audio service initialization...');
      setIsInitializingWhisper(true);

      // Initialize both Whisper and audio service
      await Promise.all([
        whisperService.initialize(),
        audioService.initialize()
      ]);

      console.log('✅ Whisper and audio service initialized successfully');
      setIsWhisperInitialized(true);
      setIsInitializingWhisper(false);
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      setIsInitializingWhisper(false);
      // Show error to user
      alert(`Initialisierung fehlgeschlagen: ${error}`);
    }
  };

  const handleStartRecording = async () => {
    try {
      await audioService.startRecording();
      setIsRecording(true);
      setRecordingDuration(0);
      setTranscriptionSegments([]);
    } catch (error) {
      console.error('Fehler beim Starten der Aufnahme:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      const result: AudioRecordingResult = await audioService.stopRecording();
      setIsRecording(false);

      // Process transcription
      await processTranscription(result);
    } catch (error) {
      console.error('Fehler beim Stoppen der Aufnahme:', error);
    }
  };

  const processTranscription = async (audioResult: AudioRecordingResult) => {
    try {
      setIsTranscribing(true);

      // Use the audio blob from the recording result
      const audioBlob = audioResult.audioBlob;

      // Process with real Whisper
      const transcriptionResult = await whisperService.transcribeAudio(audioBlob);

      // Convert to our segment format
      const segments: TranscriptionSegment[] = transcriptionResult.segments.map((seg, index) => ({
        id: (index + 1).toString(),
        startTime: seg.start_time,
        endTime: seg.end_time,
        text: seg.text,
        confidence: seg.confidence,
        isEdited: false
      }));

      setTranscriptionSegments(segments);
      setIsTranscribing(false);
    } catch (error) {
      console.error('Transcription error:', error);
      setIsTranscribing(false);
    }
  };


  const handleEditSegment = (segment: TranscriptionSegment) => {
    setEditingSegmentId(segment.id);
    setEditingText(segment.text);
  };

  const handleSaveEdit = (segmentId: string) => {
    setTranscriptionSegments(prev =>
      prev.map(segment =>
        segment.id === segmentId
          ? { ...segment, text: editingText, isEdited: true }
          : segment
      )
    );
    setEditingSegmentId(null);
    setEditingText('');
  };

  const handleCancelEdit = () => {
    setEditingSegmentId(null);
    setEditingText('');
  };

  // Grammar correction handler
  const handleCorrectGrammar = async () => {
    try {
      // Combine all segments into one text
      const fullText = transcriptionSegments
        .map(segment => segment.text)
        .join(' ');

      if (!fullText.trim()) {
        alert('Kein Text zum Korrigieren vorhanden.');
        return;
      }

      setIsCorrecting(true);
      setCorrectedText(null);
      setCorrectionTime(null);

      console.log('🔄 Starting grammar correction...');
      const startTime = Date.now();

      const result = await LlamaService.correctGrammar(fullText, true);

      const elapsed = Date.now() - startTime;
      setCorrectionTime(elapsed);
      setCorrectedText(result.corrected_text);

      console.log('✅ Grammar correction completed in', elapsed, 'ms');
      console.log('Corrected text:', result.corrected_text);

      setIsCorrecting(false);
    } catch (error) {
      console.error('❌ Grammar correction failed:', error);
      setIsCorrecting(false);
      alert(`Grammatikkorrektur fehlgeschlagen: ${error}`);
    }
  };

  // Apply corrected text to segments
  const handleApplyCorrection = () => {
    if (correctedText) {
      // Replace all segments with one corrected segment
      setTranscriptionSegments([{
        id: '1',
        startTime: transcriptionSegments[0]?.startTime || 0,
        endTime: transcriptionSegments[transcriptionSegments.length - 1]?.endTime || 0,
        text: correctedText,
        confidence: 0.95,
        isEdited: true
      }]);
      setCorrectedText(null);
      setCorrectionTime(null);
    }
  };

  const handleSaveTranscription = () => {
    // Combine all segments into final text
    const finalText = transcriptionSegments
      .map(segment => segment.text)
      .join(' ');

    // Create downloadable file
    const blob = new Blob([finalText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transkription_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };


  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Sprachtranskription
        </h2>
        <p className="text-gray-600">
          Nehmen Sie Audio auf und erhalten Sie eine bearbeitbare Transkription
        </p>
      </div>

      {/* Recording Controls */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Aufnahme-Steuerung</h3>
          <div className="text-2xl font-mono text-blue-600">
            {formatTime(recordingDuration)}
          </div>
        </div>

        {/* Whisper Initialization */}
        {!isWhisperInitialized && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-yellow-800">Whisper-Modell initialisieren</h4>
                <p className="text-sm text-yellow-600">Das Whisper-Modell muss vor der ersten Aufnahme geladen werden.</p>
              </div>
              <button
                onClick={handleInitializeWhisper}
                disabled={isInitializingWhisper}
                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {isInitializingWhisper ? 'Lädt...' : 'Whisper initialisieren'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-4 mb-4">
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              disabled={!isWhisperInitialized}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Mic className="w-5 h-5" />
              <span>Aufnahme starten</span>
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <MicOff className="w-5 h-5" />
              <span>Aufnahme stoppen</span>
            </button>
          )}
        </div>

        {isTranscribing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-blue-700 font-medium">Transkription läuft...</span>
            </div>
          </div>
        )}
      </div>

      {/* Transcription Results */}
      {transcriptionSegments.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Transkription</h3>
            <div className="flex items-center space-x-2">
              {/* Grammar Correction Button */}
              <button
                onClick={handleCorrectGrammar}
                disabled={isCorrecting || transcriptionSegments.length === 0}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {isCorrecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Korrigiere...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Grammatik korrigieren</span>
                  </>
                )}
              </button>
              <button
                onClick={handleSaveTranscription}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Speichern</span>
              </button>
            </div>
          </div>

          {/* Grammar Correction Result */}
          {correctedText && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-green-800">Korrigierter Text</h4>
                </div>
                {correctionTime && (
                  <span className="text-sm text-green-600">
                    Verarbeitet in {(correctionTime / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <p className="text-gray-800 leading-relaxed mb-4 whitespace-pre-wrap">
                {correctedText}
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={handleApplyCorrection}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Korrektur übernehmen</span>
                </button>
                <button
                  onClick={() => setCorrectedText(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Verwerfen
                </button>
              </div>
            </div>
          )}

          {/* Correction in progress indicator */}
          {isCorrecting && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                <div>
                  <p className="font-medium text-purple-800">Grammatikkorrektur läuft...</p>
                  <p className="text-sm text-purple-600">
                    Llama 3.2 analysiert und korrigiert den Text. Dies kann bis zu 30 Sekunden dauern.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {transcriptionSegments.map((segment) => (
              <div key={segment.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">
                    {formatTime(Math.floor(segment.startTime))} - {formatTime(Math.floor(segment.endTime))}
                    {segment.isEdited && (
                      <span className="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        Bearbeitet
                      </span>
                    )}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">
                      Konfidenz: {Math.round(segment.confidence * 100)}%
                    </span>
                    <button
                      onClick={() => handleEditSegment(segment)}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {editingSegmentId === segment.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSaveEdit(segment.id)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
                      >
                        Speichern
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-900 leading-relaxed">{segment.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default RealTimeTranscriptionComponent;