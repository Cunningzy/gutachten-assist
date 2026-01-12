/**
 * Unified Gutachten Workflow Component
 * Complete pipeline: Record → Transcribe → Correct → Save
 */

import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LlamaService } from '../../services/llamaService';

interface WorkflowState {
  step: 'ready' | 'recording' | 'transcribing' | 'correcting' | 'done';
  audioBlob: Blob | null;
  rawTranscript: string;
  correctedText: string;
  error: string | null;
}

const GutachtenWorkflowComponent: React.FC = () => {
  const [state, setState] = useState<WorkflowState>({
    step: 'ready',
    audioBlob: null,
    rawTranscript: '',
    correctedText: '',
    error: null
  });

  const [recordingTime, setRecordingTime] = useState(0);
  const [processingProgress, setProcessingProgress] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Step 1: Start Recording
  const startRecording = async () => {
    try {
      setState(prev => ({ ...prev, step: 'recording', error: null, rawTranscript: '', correctedText: '' }));
      chunksRef.current = [];
      setRecordingTime(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Recording error:', error);
      setState(prev => ({ ...prev, step: 'ready', error: 'Mikrofon konnte nicht gestartet werden.' }));
    }
  };

  // Step 2: Stop Recording & Start Transcription
  const stopRecordingAndTranscribe = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // Wait a moment for chunks to be collected
    await new Promise(resolve => setTimeout(resolve, 500));

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
    setState(prev => ({ ...prev, step: 'transcribing', audioBlob }));
    setProcessingProgress('Audio wird verarbeitet...');

    try {
      // Step 1: Convert blob to array and save file (same pattern as SimpleWhisperTest)
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      setProcessingProgress('Audio wird gespeichert...');

      const filePath = await invoke('save_audio_file', {
        audioData: Array.from(uint8Array),
        filename: `gutachten_${Date.now()}`
      }) as string;

      setProcessingProgress('Whisper analysiert Sprache...');

      // Step 2: Transcribe with Whisper (same as SimpleWhisperTest)
      const result = await invoke('process_audio_file', {
        filePath: filePath
      }) as { text: string };

      const transcript = result.text || '';
      setState(prev => ({ ...prev, rawTranscript: transcript }));
      setProcessingProgress('Transkription abgeschlossen!');

      // Automatically proceed to correction
      await correctGrammar(transcript);

    } catch (error) {
      console.error('Transcription error:', error);
      setState(prev => ({
        ...prev,
        step: 'ready',
        error: `Transkription fehlgeschlagen: ${error}`
      }));
    }
  };

  // Handle audio file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/flac', 'audio/x-flac'];
    const validExtensions = ['.wav', '.mp3', '.webm', '.ogg', '.m4a', '.mp4', '.flac'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setState(prev => ({
        ...prev,
        error: 'Ungültiges Dateiformat. Unterstützte Formate: WAV, MP3, WebM, OGG, M4A, FLAC'
      }));
      return;
    }

    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setState(prev => ({
        ...prev,
        error: 'Datei ist zu groß. Maximale Größe: 100 MB'
      }));
      return;
    }

    setState(prev => ({ ...prev, step: 'transcribing', error: null, rawTranscript: '', correctedText: '' }));
    setProcessingProgress(`Audio-Datei "${file.name}" wird verarbeitet...`);

    try {
      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      setProcessingProgress('Audio wird gespeichert...');

      // Save file to backend
      const filePath = await invoke('save_audio_file', {
        audioData: Array.from(uint8Array),
        filename: `upload_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      }) as string;

      setProcessingProgress('Whisper analysiert Sprache...');

      // Transcribe with Whisper
      const result = await invoke('process_audio_file', {
        filePath: filePath
      }) as { text: string };

      const transcript = result.text || '';
      setState(prev => ({ ...prev, rawTranscript: transcript }));
      setProcessingProgress('Transkription abgeschlossen!');

      // Automatically proceed to correction
      await correctGrammar(transcript);

    } catch (error) {
      console.error('File upload transcription error:', error);
      setState(prev => ({
        ...prev,
        step: 'ready',
        error: `Transkription fehlgeschlagen: ${error}`
      }));
    }

    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step 3: Grammar Correction
  const correctGrammar = async (text: string) => {
    if (!text.trim()) {
      setState(prev => ({ ...prev, step: 'done', correctedText: text }));
      return;
    }

    setState(prev => ({ ...prev, step: 'correcting' }));
    setProcessingProgress('Llama korrigiert Grammatik und Diktierbefehle...');

    try {
      const result = await LlamaService.correctGrammar(text, true);
      setState(prev => ({
        ...prev,
        step: 'done',
        correctedText: result.corrected_text
      }));
      setProcessingProgress('');
    } catch (error) {
      console.error('Grammar correction error:', error);
      // If correction fails, use raw transcript
      setState(prev => ({
        ...prev,
        step: 'done',
        correctedText: text,
        error: 'Grammatikkorrektur fehlgeschlagen. Originaltext wird verwendet.'
      }));
    }
  };

  // Re-run correction on current text
  const reCorrect = async () => {
    const textToCorrect = state.correctedText || state.rawTranscript;
    if (textToCorrect) {
      await correctGrammar(textToCorrect);
    }
  };

  // Edit mode handlers
  const startEditing = () => {
    setEditText(state.correctedText || state.rawTranscript);
    setIsEditing(true);
  };

  const saveEdit = () => {
    setState(prev => ({ ...prev, correctedText: editText }));
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  // Copy to clipboard
  const copyToClipboard = async () => {
    const text = state.correctedText || state.rawTranscript;
    try {
      await navigator.clipboard.writeText(text);
      alert('Text in Zwischenablage kopiert!');
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Save as file
  const saveAsFile = () => {
    const text = state.correctedText || state.rawTranscript;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gutachten_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Reset workflow
  const resetWorkflow = () => {
    setState({
      step: 'ready',
      audioBlob: null,
      rawTranscript: '',
      correctedText: '',
      error: null
    });
    setRecordingTime(0);
    setProcessingProgress('');
    setIsEditing(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
            Gutachten Diktat
          </h1>
          <p style={{ color: '#64748b', marginTop: '8px', fontSize: '16px' }}>
            Sprechen Sie Ihr Gutachten ein - KI transkribiert und korrigiert automatisch
          </p>
        </div>

        {/* Workflow Steps Indicator */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {[
              { key: 'ready', label: '1. Bereit', icon: '🎤' },
              { key: 'recording', label: '2. Aufnahme', icon: '⏺️' },
              { key: 'transcribing', label: '3. Transkription', icon: '📝' },
              { key: 'correcting', label: '4. Korrektur', icon: '✨' },
              { key: 'done', label: '5. Fertig', icon: '✅' }
            ].map((s, index) => {
              const isActive = s.key === state.step;
              const isPast = ['ready', 'recording', 'transcribing', 'correcting', 'done'].indexOf(state.step) > index;
              return (
                <div key={s.key} style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? '#3b82f6' : isPast ? '#22c55e' : '#e2e8f0',
                    color: isActive || isPast ? 'white' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px',
                    fontSize: '20px',
                    transition: 'all 0.3s'
                  }}>
                    {s.icon}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? '#3b82f6' : isPast ? '#22c55e' : '#64748b'
                  }}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Display */}
        {state.error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            color: '#dc2626'
          }}>
            {state.error}
          </div>
        )}

        {/* Main Action Area */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>

          {/* Ready State */}
          {state.step === 'ready' && (
            <div>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎤</div>
              <h2 style={{ fontSize: '24px', color: '#1e293b', marginBottom: '16px' }}>
                Bereit für Diktat
              </h2>
              <p style={{ color: '#64748b', marginBottom: '24px' }}>
                Sprechen Sie deutlich und verwenden Sie Diktierbefehle wie "Punkt", "Komma", "Klammer auf".
              </p>

              {/* Two options: Record or Upload */}
              <div style={{
                display: 'flex',
                gap: '40px',
                justifyContent: 'center',
                alignItems: 'flex-start',
                flexWrap: 'wrap'
              }}>
                {/* Option 1: Live Recording */}
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={startRecording}
                    style={{
                      backgroundColor: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '100px',
                      height: '100px',
                      fontSize: '40px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                      transition: 'transform 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    🎤
                  </button>
                  <p style={{ marginTop: '12px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>
                    Jetzt aufnehmen
                  </p>
                </div>

                {/* Divider */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '120px'
                }}>
                  <div style={{
                    width: '1px',
                    height: '30px',
                    backgroundColor: '#e2e8f0'
                  }} />
                  <span style={{
                    color: '#94a3b8',
                    fontSize: '14px',
                    padding: '8px 0'
                  }}>oder</span>
                  <div style={{
                    width: '1px',
                    height: '30px',
                    backgroundColor: '#e2e8f0'
                  }} />
                </div>

                {/* Option 2: File Upload */}
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '100px',
                      height: '100px',
                      fontSize: '40px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                      transition: 'transform 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    📁
                  </button>
                  <p style={{ marginTop: '12px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>
                    Audio-Datei hochladen
                  </p>
                  <p style={{ marginTop: '4px', color: '#94a3b8', fontSize: '12px' }}>
                    WAV, MP3, FLAC, WebM, M4A
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a,.mp4,.flac"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Recording State */}
          {state.step === 'recording' && (
            <div>
              <div style={{
                fontSize: '64px',
                marginBottom: '16px',
                animation: 'pulse 1.5s infinite'
              }}>
                ⏺️
              </div>
              <h2 style={{ fontSize: '24px', color: '#dc2626', marginBottom: '8px' }}>
                Aufnahme läuft...
              </h2>
              <div style={{
                fontSize: '48px',
                fontFamily: 'monospace',
                color: '#1e293b',
                marginBottom: '24px'
              }}>
                {formatTime(recordingTime)}
              </div>
              <button
                onClick={stopRecordingAndTranscribe}
                style={{
                  backgroundColor: '#1e293b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '100px',
                  height: '100px',
                  fontSize: '40px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
                }}
              >
                ⏹️
              </button>
              <p style={{ marginTop: '16px', color: '#64748b', fontSize: '14px' }}>
                Aufnahme beenden & verarbeiten
              </p>
            </div>
          )}

          {/* Processing States */}
          {(state.step === 'transcribing' || state.step === 'correcting') && (
            <div>
              <div style={{
                fontSize: '64px',
                marginBottom: '16px',
                animation: 'spin 2s linear infinite'
              }}>
                {state.step === 'transcribing' ? '📝' : '✨'}
              </div>
              <h2 style={{ fontSize: '24px', color: '#3b82f6', marginBottom: '16px' }}>
                {state.step === 'transcribing' ? 'Transkription...' : 'Grammatikkorrektur...'}
              </h2>
              <p style={{ color: '#64748b' }}>
                {processingProgress}
              </p>
              <div style={{
                width: '200px',
                height: '4px',
                backgroundColor: '#e2e8f0',
                borderRadius: '2px',
                margin: '24px auto',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: '50%',
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  animation: 'loading 1.5s infinite'
                }} />
              </div>
            </div>
          )}

          {/* Done State */}
          {state.step === 'done' && (
            <div style={{ textAlign: 'left' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <h2 style={{ fontSize: '20px', color: '#1e293b', margin: 0 }}>
                  ✅ Korrigierter Text
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={startEditing}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ✏️ Bearbeiten
                  </button>
                  <button
                    onClick={reCorrect}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ✨ Nochmal korrigieren
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      padding: '16px',
                      border: '2px solid #3b82f6',
                      borderRadius: '8px',
                      fontSize: '16px',
                      lineHeight: '1.6',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={saveEdit}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#22c55e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      ✅ Speichern
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#e2e8f0',
                        color: '#1e293b',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '20px',
                  fontSize: '16px',
                  lineHeight: '1.8',
                  color: '#1e293b',
                  whiteSpace: 'pre-wrap',
                  minHeight: '150px'
                }}>
                  {state.correctedText || state.rawTranscript || 'Kein Text vorhanden.'}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{
                marginTop: '24px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'center'
              }}>
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  📋 Kopieren
                </button>
                <button
                  onClick={saveAsFile}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  💾 Als Datei speichern
                </button>
                <button
                  onClick={resetWorkflow}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#64748b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  🔄 Neues Diktat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', color: '#1e40af', marginTop: 0, marginBottom: '12px' }}>
            💡 Diktierbefehle
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            fontSize: '14px',
            color: '#1e40af'
          }}>
            <div><strong>"Punkt"</strong> → .</div>
            <div><strong>"Komma"</strong> → ,</div>
            <div><strong>"Doppelpunkt"</strong> → :</div>
            <div><strong>"Fragezeichen"</strong> → ?</div>
            <div><strong>"In Klammern ... Klammern zu"</strong> → (...)</div>
            <div><strong>"Neuer Absatz"</strong> → Zeilenumbruch</div>
          </div>
        </div>

      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};

export default GutachtenWorkflowComponent;
