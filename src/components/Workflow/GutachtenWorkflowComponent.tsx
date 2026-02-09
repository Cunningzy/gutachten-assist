/**
 * Unified Gutachten Workflow Component
 * Complete pipeline: Record → Transcribe (hidden) → Format with LLM → Download DOCX
 * No preview - directly saves formatted document
 */

import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getExampleDocuments } from '../Onboarding/FirstLaunchOnboarding';
import { TemplateService, StructuredContent } from '../../services/templateService';

interface WorkflowState {
  step: 'ready' | 'recording' | 'processing' | 'transcribed' | 'formatting' | 'done';
  audioBlob: Blob | null;
  rawTranscript: string;  // Raw Whisper output
  formattedText: string;  // After Llama formatting
  error: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface StyleInfo {
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  hasExamples: boolean;
  headerContent: string;  // Document header (repeated text at top of every page)
}

interface DictationRecord {
  id: string;
  text: string;
  title: string;  // First 50 chars or auto-generated
  createdAt: string;  // ISO date string
  lastModifiedAt: string;
  chatMessages: ChatMessage[];
  formatSpec: FormatSpec | null;
}

const DICTATION_STORAGE_KEY = 'gutachten_dictation_history';
const MAX_DICTATIONS = 3;

// Helper functions for dictation storage
const loadDictationHistory = (): DictationRecord[] => {
  try {
    const stored = localStorage.getItem(DICTATION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load dictation history:', e);
  }
  return [];
};

const saveDictationHistory = (history: DictationRecord[]) => {
  try {
    localStorage.setItem(DICTATION_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save dictation history:', e);
  }
};

const generateDictationTitle = (text: string): string => {
  // Try to extract a meaningful title from the first line or first 50 chars
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 60) {
    return firstLine;
  }
  const preview = text.substring(0, 50).trim();
  return preview.length < text.length ? preview + '...' : preview;
};

interface FormatSpec {
  // Pending formatting changes to apply when saving DOCX
  header?: {
    enabled?: boolean;
    content?: {
      center_text?: string;
      left_text?: string;
      right_text?: string;
      font?: { name?: string; size_pt?: number };
    };
  };
  footer?: {
    enabled?: boolean;
    page_number?: {
      enabled?: boolean;
      format?: string;
      position?: string;
    };
  };
  page?: {
    margins?: { top_mm?: number; bottom_mm?: number; left_mm?: number; right_mm?: number };
    size?: string;
  };
  title_page?: {
    enabled?: boolean;
    title_text?: string;
    subtitle_text?: string;
    title_font?: { name?: string; size_pt?: number; bold?: boolean };
    add_page_break_after?: boolean;
  };
  defaults?: {
    font?: { name?: string; size_pt?: number; bold?: boolean };
    paragraph?: { line_spacing?: number; space_after_pt?: number };
  };
  styles?: Record<string, { font?: { name?: string; size_pt?: number; bold?: boolean } }>;
}

// Build prompt for Llama - SIMPLE, just the text
// The Python script handles:
// - Step 1: Regex cleanup of dictation commands
// - Step 2: Copy-editor correction (minimal grammar/spelling fixes)
// - Step 3: Guardrails to prevent hallucination
//
// NO TEMPLATING IN LLM - template insertion happens in app code (DOCX generation)

const buildFormattingPrompt = (_styleProfilePrompt: string | null): string => {
  // Just mark where the dictated text starts - no extra instructions
  // The LLM is a copy-editor only, not a template filler
  return `DIKTIERTER TEXT:
`;
};

// Test mode interface for debugging Llama
interface TestModeResult {
  input: string;
  output: string;
  guardrailStatus: string;
  violations: string[];
  processingTimeMs: number;
  notes: string[];
  attempts: number;
  removedTokens: string[];
}

const GutachtenWorkflowComponent: React.FC = () => {
  const [state, setState] = useState<WorkflowState>({
    step: 'ready',
    audioBlob: null,
    rawTranscript: '',
    formattedText: '',
    error: null
  });

  const [recordingTime, setRecordingTime] = useState(0);
  const [processingProgress, setProcessingProgress] = useState('');
  const [styleInfo, setStyleInfo] = useState<StyleInfo>({
    fontFamily: 'Times New Roman',
    fontSize: 12,
    lineSpacing: 1.5,
    hasExamples: false,
    headerContent: ''
  });
  const [showStyleUpload, setShowStyleUpload] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [revisionInput, setRevisionInput] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [pendingFormatSpec, setPendingFormatSpec] = useState<FormatSpec | null>(null);
  const [dictationHistory, setDictationHistory] = useState<DictationRecord[]>([]);
  const [currentDictationId, setCurrentDictationId] = useState<string | null>(null);
  const [styleProfilePrompt, setStyleProfilePrompt] = useState<string | null>(null);
  const [styleProfileLoaded, setStyleProfileLoaded] = useState(false);
  const [rawTranscriptDebug, setRawTranscriptDebug] = useState<string>('');
  const [showRawTranscript, setShowRawTranscript] = useState(false);

  // Test mode state
  const [showTestMode, setShowTestMode] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<TestModeResult | null>(null);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testHistory, setTestHistory] = useState<TestModeResult[]>([]);

  // Template-based rendering state
  const [isTemplateReady, setIsTemplateReady] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [structuredContent, setStructuredContent] = useState<StructuredContent | null>(null);
  const [structuringProgress, setStructuringProgress] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  // Load style info from example documents on mount
  useEffect(() => {
    loadStyleFromExamples();
  }, []);

  // Load StyleProfile prompt on mount
  useEffect(() => {
    const loadStyleProfile = async () => {
      try {
        const prompt = await invoke('get_style_profile_prompt') as string;
        if (prompt) {
          setStyleProfilePrompt(prompt);
          console.log('StyleProfile loaded successfully');
        }
      } catch (err) {
        console.log('No StyleProfile found (this is normal for new users):', err);
      }
      setStyleProfileLoaded(true);
    };
    loadStyleProfile();
  }, []);

  // Check if template extraction has been done
  useEffect(() => {
    const checkTemplateReady = async () => {
      try {
        const ready = await TemplateService.isTemplateReady();
        setIsTemplateReady(ready);
        if (ready) {
          console.log('Template spec found - structured DOCX rendering available');
        }
      } catch (err) {
        console.log('Template not ready:', err);
      }
    };
    checkTemplateReady();
  }, []);

  // Reset examples and StyleProfile - triggers onboarding again
  const resetExamplesAndProfile = async () => {
    if (!confirm('Alle Beispiel-Dokumente und das Stil-Profil werden gelöscht. Die App wird Sie erneut nach Beispielen fragen. Fortfahren?')) {
      return;
    }

    try {
      // Clear localStorage
      localStorage.removeItem('gutachten_example_documents');
      localStorage.removeItem('gutachten_style_info');

      // Clear StyleProfile on disk
      try {
        await invoke('clear_style_profile');
      } catch (err) {
        console.log('Could not clear disk profile:', err);
      }

      // Clear state
      setStyleProfilePrompt(null);
      setStyleInfo({
        fontFamily: 'Times New Roman',
        fontSize: 12,
        lineSpacing: 1.5,
        hasExamples: false,
        headerContent: ''
      });

      alert('Beispiele wurden zurückgesetzt. Bitte starten Sie die App neu, um neue Beispiele hochzuladen.');

      // Reload the page to show onboarding
      window.location.reload();
    } catch (err) {
      console.error('Reset failed:', err);
      alert('Fehler beim Zurücksetzen: ' + err);
    }
  };

  // Load dictation history on mount
  useEffect(() => {
    const history = loadDictationHistory();
    setDictationHistory(history);
  }, []);

  // Save current dictation to history
  const saveCurrentDictation = (text: string, isNew: boolean = false) => {
    const now = new Date().toISOString();

    if (isNew || !currentDictationId) {
      // Create new dictation record
      const newId = `dictation_${Date.now()}`;
      const newRecord: DictationRecord = {
        id: newId,
        text: text,
        title: generateDictationTitle(text),
        createdAt: now,
        lastModifiedAt: now,
        chatMessages: chatMessages,
        formatSpec: pendingFormatSpec
      };

      // Add to history, keeping only last MAX_DICTATIONS
      const updatedHistory = [newRecord, ...dictationHistory].slice(0, MAX_DICTATIONS);
      setDictationHistory(updatedHistory);
      saveDictationHistory(updatedHistory);
      setCurrentDictationId(newId);
    } else {
      // Update existing dictation
      const updatedHistory = dictationHistory.map(d =>
        d.id === currentDictationId
          ? {
              ...d,
              text: text,
              title: generateDictationTitle(text),
              lastModifiedAt: now,
              chatMessages: chatMessages,
              formatSpec: pendingFormatSpec
            }
          : d
      );
      setDictationHistory(updatedHistory);
      saveDictationHistory(updatedHistory);
    }
  };

  // Load a dictation from history
  const loadDictation = (dictation: DictationRecord) => {
    setState({
      step: 'done',
      audioBlob: null,
      formattedText: dictation.text,
      error: null
    });
    setChatMessages(dictation.chatMessages || []);
    setPendingFormatSpec(dictation.formatSpec);
    setCurrentDictationId(dictation.id);
  };

  // Delete a dictation from history
  const deleteDictation = (id: string) => {
    const updatedHistory = dictationHistory.filter(d => d.id !== id);
    setDictationHistory(updatedHistory);
    saveDictationHistory(updatedHistory);

    // If we deleted the current dictation, clear it
    if (currentDictationId === id) {
      setCurrentDictationId(null);
    }
  };

  const loadStyleFromExamples = () => {
    const examples = getExampleDocuments();
    const processedExamples = examples.filter(doc => doc.status === 'processed');

    if (processedExamples.length > 0) {
      try {
        const savedStyle = localStorage.getItem('gutachten_style_info');
        if (savedStyle) {
          const parsed = JSON.parse(savedStyle);
          setStyleInfo({
            fontFamily: parsed.fontFamily || 'Times New Roman',
            fontSize: parsed.fontSize || 12,
            lineSpacing: parsed.lineSpacing || 1.5,
            hasExamples: true,
            headerContent: parsed.headerContent || ''
          });
        } else {
          setStyleInfo(prev => ({ ...prev, hasExamples: true }));
        }
      } catch (e) {
        setStyleInfo(prev => ({ ...prev, hasExamples: true }));
      }
    }
  };

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

  // Format raw transcript using Llama with two-step pipeline + guardrails:
  // Step 1: Regex cleanup of dictation commands (Python - deterministic)
  // Step 2: Copy-editor correction only - minimal spelling/grammar fixes (LLM)
  // Step 3: Guardrails check - rejects if LLM hallucinates or rewrites
  // NO TEMPLATING - template insertion happens in DOCX generation (deterministic)
  const formatWithLlama = async (rawText: string): Promise<string> => {
    setProcessingProgress('Text wird bereinigt und korrigiert...');

    try {
      // Build simple prompt with marker - Python script handles the two-step pipeline
      const prompt = buildFormattingPrompt(styleProfilePrompt) + rawText;

      console.log('=== SENDING TO LLAMA (Two-Step Pipeline) ===');
      console.log('Raw text length:', rawText.length);
      console.log('First 200 chars:', rawText.substring(0, 200));

      const result = await invoke('correct_german_grammar', {
        text: prompt,
        convertDictationCommands: false
      }) as { corrected_text: string };

      // DEBUG: Log full result
      console.log('=== FULL LLAMA RESULT ===');
      console.log('Result object:', JSON.stringify(result, null, 2));
      console.log('corrected_text type:', typeof result.corrected_text);
      console.log('corrected_text length:', result.corrected_text?.length);

      // Check if we got a valid response - don't use || which treats "" as falsy
      let cleanedText: string;
      if (result.corrected_text !== undefined && result.corrected_text !== null && result.corrected_text.trim() !== '') {
        cleanedText = result.corrected_text;
        console.log('Using Llama corrected text');
      } else {
        console.warn('WARNING: Llama returned empty/null text, falling back to raw text');
        cleanedText = rawText;
      }

      // Strip any markdown formatting that Llama might have added
      cleanedText = stripMarkdownFormatting(cleanedText);

      console.log('=== FINAL TEXT AFTER PROCESSING ===');
      console.log('Final length:', cleanedText.length);
      console.log('First 200 chars:', cleanedText.substring(0, 200));

      return cleanedText;
    } catch (error) {
      console.error('Llama formatting failed:', error);
      return rawText;
    }
  };

  // Strip markdown and HTML formatting from text
  const stripMarkdownFormatting = (text: string): string => {
    let cleaned = text;

    // Remove markdown bold/italic: **text**, __text__, *text*, _text_
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

    // Remove markdown headers: # ## ### etc.
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // Remove markdown links: [text](url)
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```[^`]*```/g, '');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  };

  // Specialized prompt for editing formatted Gutachten - follows strict copy-edit principles
  const buildRevisionPrompt = (currentText: string, userInstructions: string) => {
    let prompt = `Du bist ein Korrekturleser für deutsche medizinische Gutachten.

STRENGE REGELN:

1. Führe NUR die Änderung aus, die der Benutzer anfordert
2. Der REST des Textes muss UNVERÄNDERT bleiben
3. KEIN Umschreiben, KEIN Paraphrasieren
4. Überschriften NIEMALS ändern (z.B. "FAMILIENANAMNESE" bleibt "FAMILIENANAMNESE")
5. Gib NUR reinen Text aus - KEINE Formatierungszeichen (**, #, etc.)
6. Keine Erklärungen, keine Kommentare

AKTUELLER TEXT:
${currentText}

ÄNDERUNGSANWEISUNG DES BENUTZERS:
${userInstructions}

Gib den vollständigen Text aus mit NUR der angeforderten Änderung:`;

    return prompt;
  };

  // Generate FormatSpec from natural language using LLM
  const generateFormatSpec = async (request: string): Promise<FormatSpec | null> => {
    try {
      // Use a prompt to convert natural language to FormatSpec JSON
      const specPrompt = `Du bist ein Assistent für die Formatierung von Word-Dokumenten.
Konvertiere die folgende Benutzeranfrage in ein JSON-Objekt.

WICHTIG: Gib NUR gültiges JSON aus. Keine Erklärungen, keine Kommentare, nur JSON.

Verfügbare Optionen im JSON:
{
  "header": {
    "enabled": true/false,
    "content": { "center_text": "Text", "left_text": "Text", "font": { "size_pt": 10 } }
  },
  "footer": {
    "enabled": true,
    "page_number": { "enabled": true, "format": "Seite 1 von 3", "position": "center" }
  },
  "page": {
    "margins": { "top_mm": 25, "bottom_mm": 25, "left_mm": 25, "right_mm": 25 }
  },
  "title_page": {
    "enabled": true,
    "title_text": "Titel",
    "title_font": { "size_pt": 24, "bold": true },
    "add_page_break_after": true
  },
  "defaults": {
    "font": { "name": "Arial", "size_pt": 12 }
  },
  "styles": {
    "Heading1": { "font": { "size_pt": 16, "bold": true } }
  }
}

Benutzeranfrage: "${request}"

JSON:`;

      const result = await invoke('correct_german_grammar', {
        text: specPrompt,
        convertDictationCommands: false
      }) as { corrected_text: string };

      // Try to extract JSON from the response
      const jsonMatch = result.corrected_text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FormatSpec;
      }
      return null;
    } catch (error) {
      console.error('Failed to generate FormatSpec:', error);
      return null;
    }
  };

  // Handle revision request from user - detects formatting vs text editing
  const handleRevisionRequest = async () => {
    if (!revisionInput.trim() || isRevising) return;

    const userMessage = revisionInput.trim();
    setRevisionInput('');
    setIsRevising(true);

    // Add user message to chat
    const newUserMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, newUserMessage]);

    try {
      // First, detect if this is a formatting request
      const detection = await invoke('detect_formatting_request', {
        request: userMessage
      }) as { is_formatting_request: boolean };

      if (detection.is_formatting_request) {
        // This is a formatting request - generate FormatSpec
        const newSpec = await generateFormatSpec(userMessage);

        if (newSpec) {
          // Merge with existing pending spec
          setPendingFormatSpec(prev => ({
            ...prev,
            ...newSpec
          }));

          // Build description of what will be applied
          const changes: string[] = [];
          if (newSpec.header) changes.push('Kopfzeile');
          if (newSpec.footer) changes.push('Fußzeile/Seitenzahlen');
          if (newSpec.page?.margins) changes.push('Seitenränder');
          if (newSpec.title_page) changes.push('Titelseite');
          if (newSpec.defaults?.font) changes.push('Schriftart');
          if (newSpec.styles) changes.push('Überschriften-Stil');

          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: `Formatierungsänderungen vorgemerkt: ${changes.join(', ')}. Diese werden beim Speichern als Word-Dokument angewendet. Klicken Sie auf "Als Word speichern" um das formatierte Dokument zu erstellen.`,
            timestamp: new Date()
          };
          setChatMessages(prev => [...prev, assistantMessage]);
        } else {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: 'Die Formatierungsanfrage konnte nicht verarbeitet werden. Bitte formulieren Sie Ihre Anfrage anders, z.B. "Kopfzeile 10pt" oder "Seitenränder 30mm".',
            timestamp: new Date()
          };
          setChatMessages(prev => [...prev, assistantMessage]);
        }

      } else {
        // This is a text editing request - use existing Llama approach
        const revisionPrompt = buildRevisionPrompt(state.formattedText, userMessage);

        const result = await invoke('correct_german_grammar', {
          text: revisionPrompt,
          convertDictationCommands: false
        }) as { corrected_text: string };

        // Post-process to strip any markdown/HTML that slipped through
        let revisedText = result.corrected_text || state.formattedText;
        revisedText = stripMarkdownFormatting(revisedText);

        // Update the formatted text
        setState(prev => ({ ...prev, formattedText: revisedText }));

        // Add assistant response to chat
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: 'Textänderungen wurden übernommen. Sie können das Dokument jetzt speichern oder weitere Änderungen anfordern.',
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        // Save changes to history
        if (currentDictationId) {
          const now = new Date().toISOString();
          const updatedHistory = dictationHistory.map(d =>
            d.id === currentDictationId
              ? {
                  ...d,
                  text: revisedText,
                  title: generateDictationTitle(revisedText),
                  lastModifiedAt: now,
                  chatMessages: [...chatMessages, newUserMessage, assistantMessage],
                  formatSpec: pendingFormatSpec
                }
              : d
          );
          setDictationHistory(updatedHistory);
          saveDictationHistory(updatedHistory);
        }
      }

      // Scroll to bottom of chat
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

    } catch (error) {
      console.error('Revision failed:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Fehler bei der Überarbeitung: ${error}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }

    setIsRevising(false);
  };

  // Start Recording
  const startRecording = async () => {
    try {
      setState(prev => ({ ...prev, step: 'recording', error: null, formattedText: '' }));
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

  // Stop Recording & Process
  const stopRecordingAndProcess = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
    setState(prev => ({ ...prev, step: 'processing', audioBlob }));

    await processAudio(audioBlob);
  };

  // Process audio: Transcribe with Whisper only (step 1)
  const processAudio = async (audioBlob: Blob) => {
    try {
      setProcessingProgress('Whisper: Sprache wird erkannt...');

      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const filePath = await invoke('save_audio_file', {
        audioData: Array.from(uint8Array),
        filename: `gutachten_${Date.now()}`
      }) as string;

      const result = await invoke('process_audio_file', {
        filePath: filePath
      }) as { text: string };

      const rawTranscript = result.text || '';

      // Save raw transcript for debugging
      setRawTranscriptDebug(rawTranscript);
      console.log('=== RAW WHISPER TRANSCRIPT ===');
      console.log(rawTranscript);
      console.log('=== END RAW TRANSCRIPT ===');

      if (!rawTranscript.trim()) {
        setState(prev => ({
          ...prev,
          step: 'ready',
          error: 'Keine Sprache erkannt. Bitte erneut versuchen.'
        }));
        return;
      }

      // Stop at 'transcribed' step - user can review and then proceed to Llama
      setState(prev => ({ ...prev, step: 'transcribed', rawTranscript }));
      setProcessingProgress('');

    } catch (error) {
      console.error('Processing error:', error);
      setState(prev => ({
        ...prev,
        step: 'ready',
        error: `Verarbeitung fehlgeschlagen: ${error}`
      }));
    }
  };

  // Structure with Qwen (step 2) - called when user clicks "Weiter"
  // NEW WORKFLOW: Qwen structures text into slots, then DOCX renderer creates document
  const proceedToFormatting = async () => {
    const rawTranscript = state.rawTranscript;
    if (!rawTranscript.trim()) {
      setState(prev => ({ ...prev, error: 'Kein Transkript zum Formatieren vorhanden.' }));
      return;
    }

    // Check if template is ready
    if (!isTemplateReady) {
      setState(prev => ({ ...prev, error: 'Keine Vorlage gefunden. Bitte zuerst Beispiel-Gutachten hochladen.' }));
      return;
    }

    setState(prev => ({ ...prev, step: 'formatting' }));
    setProcessingProgress('Qwen: Text wird strukturiert...');
    setIsStructuring(true);

    try {
      // Step 1: Structure with Qwen
      setStructuringProgress('Analysiere Gutachten-Struktur mit KI...');
      console.log('=== SENDING TO QWEN STRUCTURER ===');
      console.log('Raw transcript length:', rawTranscript.length);

      const structured = await TemplateService.structureTranscript(rawTranscript);
      setStructuredContent(structured);

      console.log('=== QWEN STRUCTURING RESULT ===');
      console.log('Slots:', Object.keys(structured.slots));
      console.log('Unclear spans:', structured.unclear_spans.length);
      console.log('Missing slots:', structured.missing_slots);

      // Step 2: Convert structured slots to display text
      const displayText = convertSlotsToDisplayText(structured.slots);

      // Step 3: Update state with structured result
      setState(prev => ({ ...prev, step: 'done', formattedText: displayText }));
      setProcessingProgress('');
      setIsStructuring(false);

      // Show info about structuring result
      const slotCount = Object.keys(structured.slots).length;
      const unclearCount = structured.unclear_spans.length;
      const missingCount = structured.missing_slots.length;

      if (unclearCount > 0 || missingCount > 0) {
        let infoMsg = `Strukturierung abgeschlossen: ${slotCount} Abschnitte erkannt.`;
        if (unclearCount > 0) infoMsg += ` ${unclearCount} unklare Stellen.`;
        if (missingCount > 0) infoMsg += ` ${missingCount} fehlende Abschnitte.`;
        console.log(infoMsg);
      }

      // Save as new dictation
      const now = new Date().toISOString();
      const newId = `dictation_${Date.now()}`;
      const newRecord: DictationRecord = {
        id: newId,
        text: displayText,
        title: generateDictationTitle(displayText),
        createdAt: now,
        lastModifiedAt: now,
        chatMessages: [],
        formatSpec: null
      };
      const updatedHistory = [newRecord, ...dictationHistory].slice(0, MAX_DICTATIONS);
      setDictationHistory(updatedHistory);
      saveDictationHistory(updatedHistory);
      setCurrentDictationId(newId);

    } catch (error) {
      console.error('Qwen structuring error:', error);
      setIsStructuring(false);
      setState(prev => ({
        ...prev,
        step: 'transcribed',
        error: `Qwen Strukturierung fehlgeschlagen: ${error}`
      }));
      setProcessingProgress('');
    }
  };

  // Convert structured slots to display text for preview
  // This displays all slots returned by Qwen, using the section_name from template_spec
  const convertSlotsToDisplayText = (slots: Record<string, string[]>): string => {
    const parts: string[] = [];

    // Process all slots in the order they appear
    // The slot order comes from Qwen which respects the template skeleton order
    for (const [slotId, paragraphs] of Object.entries(slots)) {
      if (paragraphs && paragraphs.length > 0) {
        // Use TemplateService to get proper display name, or convert slot_id to readable heading
        const heading = TemplateService.formatSlotName(slotId) ||
                       slotId.replace(/_body$/, '')
                             .replace(/_/g, ' ')
                             .replace(/^\d+\.\s*/, '')
                             .replace(/\b\w/g, c => c.toUpperCase());
        parts.push(`\n${heading}\n`);
        parts.push(paragraphs.join('\n\n'));
      }
    }

    return parts.join('\n').trim();
  };

  // Handle audio file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setState(prev => ({
        ...prev,
        error: 'Datei ist zu groß. Maximale Größe: 100 MB'
      }));
      return;
    }

    setState(prev => ({ ...prev, step: 'processing', error: null, formattedText: '' }));

    try {
      setProcessingProgress(`Whisper: "${file.name}" wird transkribiert...`);

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const filePath = await invoke('save_audio_file', {
        audioData: Array.from(uint8Array),
        filename: `upload_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      }) as string;

      const result = await invoke('process_audio_file', {
        filePath: filePath
      }) as { text: string };

      const rawTranscript = result.text || '';

      // Save raw transcript for debugging
      setRawTranscriptDebug(rawTranscript);
      console.log('=== RAW WHISPER TRANSCRIPT ===');
      console.log(rawTranscript);
      console.log('=== END RAW TRANSCRIPT ===');

      if (!rawTranscript.trim()) {
        setState(prev => ({
          ...prev,
          step: 'ready',
          error: 'Keine Sprache erkannt. Bitte erneut versuchen.'
        }));
        return;
      }

      // Stop at 'transcribed' step - user can review and then proceed to Llama
      setState(prev => ({ ...prev, step: 'transcribed', rawTranscript }));
      setProcessingProgress('');

    } catch (error) {
      console.error('File upload processing error:', error);
      setState(prev => ({
        ...prev,
        step: 'ready',
        error: `Verarbeitung fehlgeschlagen: ${error}`
      }));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle style document upload
  const handleStyleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
        alert('Bitte nur Word-Dokumente (.docx, .doc) hochladen.');
        continue;
      }

      try {
        if ((window as any).__TAURI_INTERNALS__?.invoke) {
          const invokeCmd = (window as any).__TAURI_INTERNALS__.invoke;

          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const documentId = Date.now().toString();

          const filePath = await invokeCmd('save_uploaded_document', {
            fileData: Array.from(uint8Array),
            filename: file.name,
            documentId: documentId
          });

          const styleResult = await invokeCmd('analyze_document_style', {
            filePath: filePath,
            documentId: documentId
          });

          // Extract header content from the document analysis
          const headerContent = styleResult.header_footer_info?.header_content || '';

          const newStyleInfo = {
            fontFamily: styleResult.font_family || 'Times New Roman',
            fontSize: styleResult.font_size || 12,
            lineSpacing: styleResult.line_spacing || 1.5,
            hasExamples: true,
            headerContent: headerContent
          };

          localStorage.setItem('gutachten_style_info', JSON.stringify(newStyleInfo));
          setStyleInfo(newStyleInfo);

          const existingDocs = getExampleDocuments();
          const newDoc = {
            id: documentId,
            name: file.name,
            size: file.size,
            uploadDate: new Date(),
            status: 'processed' as const,
            analysisProgress: 100
          };
          localStorage.setItem('gutachten_example_documents', JSON.stringify([...existingDocs, newDoc]));
        }
      } catch (error) {
        console.error('Style upload failed:', error);
      }
    }

    setShowStyleUpload(false);
    if (styleInputRef.current) {
      styleInputRef.current.value = '';
    }

    alert('Stil-Vorlage wurde aktualisiert!');
  };

  // Save as DOCX file with styling
  // NEW: If we have structured content from Qwen, use template-based rendering
  const saveAsDocx = async () => {
    const text = state.formattedText;
    if (!text.trim()) {
      alert('Kein Text zum Speichern vorhanden.');
      return;
    }

    setIsSaving(true);

    try {
      // NEW WORKFLOW: Use structured content with template renderer if available
      if (structuredContent && isTemplateReady) {
        console.log('=== SAVING WITH TEMPLATE RENDERER ===');
        const result = await TemplateService.renderDocx(structuredContent);

        if (result.success) {
          let message = `Strukturiertes Gutachten gespeichert:\n${result.output_path}`;

          const unclearCount = structuredContent.unclear_spans?.length || 0;
          const missingCount = structuredContent.missing_slots?.length || 0;

          if (unclearCount > 0) {
            message += `\n\n${unclearCount} unklare Stellen wurden gelb markiert.`;
          }
          if (missingCount > 0) {
            message += `\n\nFehlende Abschnitte: ${structuredContent.missing_slots.map(s => TemplateService.formatSlotName(s)).join(', ')}`;
          }

          alert(message);
          setIsSaving(false);
          return;
        } else {
          console.warn('Template rendering failed, falling back to simple save:', result.message);
        }
      }

      // FALLBACK: Old method - simple DOCX with text content
      console.log('=== SAVING WITH SIMPLE DOCX (fallback) ===');
      const result = await invoke('create_styled_docx', {
        text: text,
        fontFamily: styleInfo.fontFamily,
        fontSize: styleInfo.fontSize,
        lineSpacing: styleInfo.lineSpacing,
        headerContent: styleInfo.headerContent || null
      }) as string;

      // If we have pending format changes, apply them to the saved file
      if (pendingFormatSpec && Object.keys(pendingFormatSpec).length > 0) {
        try {
          const specJson = JSON.stringify(pendingFormatSpec);
          const formatResult = await invoke('format_docx_with_spec', {
            inputDocx: result,
            outputDocx: result,  // Overwrite the same file
            specJson: specJson
          }) as {
            success: boolean;
            applied_changes: Record<string, number>;
            warnings: string[];
            errors: string[];
          };

          if (formatResult.success) {
            const changesText = Object.entries(formatResult.applied_changes)
              .filter(([_, count]) => count > 0)
              .map(([key, count]) => `${key}: ${count}`)
              .join(', ');

            alert(`Dokument gespeichert und formatiert:\n${result}\n\nAngewandte Formatierung: ${changesText || 'keine spezifischen Änderungen'}`);

            // Clear the pending spec after successful application
            setPendingFormatSpec(null);
          } else {
            console.warn('Formatting partially failed:', formatResult.errors);
            alert(`Dokument gespeichert:\n${result}\n\nHinweis: Einige Formatierungen konnten nicht angewendet werden: ${formatResult.errors.join(', ')}`);
          }
        } catch (formatError) {
          console.warn('Failed to apply format spec:', formatError);
          alert(`Dokument gespeichert:\n${result}\n\nHinweis: Zusätzliche Formatierung konnte nicht angewendet werden.`);
        }
      } else {
        alert(`Dokument gespeichert:\n${result}`);
      }
    } catch (error: any) {
      if (error && error.toString().includes('abgebrochen')) {
        // User cancelled
      } else {
        console.error('DOCX creation failed:', error);
        alert(`Fehler beim Speichern: ${error}`);
      }
    }

    setIsSaving(false);
  };

  // Reset workflow
  const resetWorkflow = () => {
    setState({
      step: 'ready',
      audioBlob: null,
      rawTranscript: '',
      formattedText: '',
      error: null
    });
    setRecordingTime(0);
    setProcessingProgress('');
    setIsSaving(false);
    setChatMessages([]);
    setRevisionInput('');
    setPendingFormatSpec(null);
    setCurrentDictationId(null);
    setRawTranscriptDebug('');
    setStructuredContent(null);
    setStructuringProgress('');
  };

  // ============================================================
  // TEST MODE: Direct Llama testing without Whisper
  // ============================================================

  const runLlamaTest = async () => {
    if (!testInput.trim() || isTestRunning) return;

    setIsTestRunning(true);
    setTestResult(null);

    const startTime = Date.now();

    try {
      console.log('=== LLAMA TEST MODE ===');
      console.log('Input text:', testInput);
      console.log('Input length:', testInput.length, 'chars');

      // Build the same prompt as the real workflow
      const prompt = buildFormattingPrompt(styleProfilePrompt) + testInput;

      const result = await invoke('correct_german_grammar', {
        text: prompt,
        convertDictationCommands: false
      }) as {
        corrected_text: string;
        guardrail_status: string;
        violations: string[];
        notes: string[];
        attempts: number;
        processing_time_ms: number;
        removed_tokens: string[];
        changes_made: string[];
        confidence: number;
      };

      const endTime = Date.now();

      console.log('=== LLAMA TEST RESULT ===');
      console.log('Output:', result.corrected_text);
      console.log('Output length:', result.corrected_text?.length, 'chars');
      console.log('Guardrail status:', result.guardrail_status);
      console.log('Violations:', result.violations);

      const testResultData: TestModeResult = {
        input: testInput,
        output: result.corrected_text || testInput,
        guardrailStatus: result.guardrail_status || 'unknown',
        violations: result.violations || [],
        processingTimeMs: result.processing_time_ms || (endTime - startTime),
        notes: result.notes || [],
        attempts: result.attempts || 1,
        removedTokens: result.removed_tokens || []
      };

      setTestResult(testResultData);
      setTestHistory(prev => [testResultData, ...prev].slice(0, 10)); // Keep last 10

    } catch (error) {
      console.error('Llama test failed:', error);
      const endTime = Date.now();

      setTestResult({
        input: testInput,
        output: `ERROR: ${error}`,
        guardrailStatus: 'error',
        violations: [`Fehler: ${error}`],
        processingTimeMs: endTime - startTime,
        notes: ['Test fehlgeschlagen'],
        attempts: 0,
        removedTokens: []
      });
    }

    setIsTestRunning(false);
  };

  // Sample test texts for quick testing
  const sampleTestTexts = [
    {
      label: 'Diktierbefehle',
      text: 'Der Patient ist 45 Jahre alt Punkt Er leidet an Rückenschmerzen Komma die seit 5 Jahren bestehen Punkt Neue Zeile Diagnose Doppelpunkt Lumboischialgie'
    },
    {
      label: 'Grammatikfehler',
      text: 'Der Patient hat keine beschwerden und fühlt sich gut. Er ist sehr zufriden mit der behandlung. Die medikamente wirken gut.'
    },
    {
      label: 'Medizinischer Text',
      text: 'Familienanamnese Der Patient berichtet über keine bekannten Erbkrankheiten in der Familie. Eigenanamnese Der Patient ist 45 Jahre alt und leidet seit 5 Jahren an Rückenschmerzen.'
    },
    {
      label: 'Langer Text',
      text: 'Die körperliche Untersuchung ergab einen normalen Befund. Der Blutdruck betrug 120/80 mmHg, Puls 72/min. Die Herzauskultation zeigte reine Herztöne ohne pathologische Geräusche. Die Lunge war seitengleich belüftet. Der Bauch war weich, keine Druckschmerzhaftigkeit.'
    }
  ];

  // Format date for display
  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
            Diktieren Sie Ihr Gutachten - KI transkribiert und formatiert automatisch
          </p>

          {/* Style Upload Button */}
          <button
            onClick={() => setShowStyleUpload(true)}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: styleInfo.hasExamples ? '#f0fdf4' : '#fef3c7',
              border: `1px solid ${styleInfo.hasExamples ? '#22c55e' : '#f59e0b'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: styleInfo.hasExamples ? '#166534' : '#92400e',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {styleInfo.hasExamples ? '📄' : '⚠️'}
            {styleInfo.hasExamples
              ? `Stil-Vorlage: ${styleInfo.fontFamily}, ${styleInfo.fontSize}pt`
              : 'Beispiel-Gutachten hochladen für Formatierung'}
          </button>
        </div>

        {/* Style Upload Modal */}
        {showStyleUpload && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>
                Beispiel-Gutachten hochladen
              </h3>
              <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
                Laden Sie ein Gutachten-Beispiel hoch. Die KI analysiert Schriftart, Schriftgröße und Überschriften-Stil für zukünftige Dokumente.
              </p>

              <div style={{
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: '#f9fafb'
              }}
              onClick={() => styleInputRef.current?.click()}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Word-Dokument hier ablegen oder klicken
                </p>
                <p style={{ color: '#9ca3af', fontSize: '12px', margin: '8px 0 0 0' }}>
                  .docx, .doc Dateien
                </p>
              </div>

              <input
                ref={styleInputRef}
                type="file"
                multiple
                accept=".doc,.docx"
                onChange={handleStyleUpload}
                style={{ display: 'none' }}
              />

              {styleInfo.hasExamples && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #22c55e',
                  borderRadius: '6px'
                }}>
                  <p style={{ margin: 0, color: '#166534', fontSize: '14px' }}>
                    ✅ Aktueller Stil: {styleInfo.fontFamily}, {styleInfo.fontSize}pt
                  </p>
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowStyleUpload(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e2e8f0',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        )}

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
              { key: 'processing', label: '3. Whisper', icon: '🎧' },
              { key: 'transcribed', label: '4. Transkript', icon: '📝' },
              { key: 'formatting', label: '5. Llama', icon: '🦙' },
              { key: 'done', label: '6. Speichern', icon: '💾' }
            ].map((s, index) => {
              const isActive = s.key === state.step;
              const stepOrder = ['ready', 'recording', 'processing', 'transcribed', 'formatting', 'done'];
              const isPast = stepOrder.indexOf(state.step) > index;
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

        {/* Test Mode Toggle Button */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '12px 20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>
            🧪 Llama Debug-Modus
          </span>
          <button
            onClick={() => setShowTestMode(!showTestMode)}
            style={{
              padding: '8px 16px',
              backgroundColor: showTestMode ? '#ef4444' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            {showTestMode ? '✕ Test-Modus schließen' : '🧪 Test-Modus öffnen'}
          </button>
        </div>

        {/* Test Mode Panel */}
        {showTestMode && (
          <div style={{
            backgroundColor: '#faf5ff',
            border: '2px solid #8b5cf6',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              color: '#6b21a8',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              🧪 Llama Test-Modus (ohne Whisper)
            </h3>
            <p style={{ color: '#7c3aed', marginBottom: '16px', fontSize: '14px' }}>
              Geben Sie Text direkt ein, um die Llama-Korrektur zu testen. Dies umgeht Whisper komplett.
            </p>

            {/* Sample Text Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '16px'
            }}>
              <span style={{ color: '#6b21a8', fontSize: '13px', fontWeight: '500' }}>Beispiele:</span>
              {sampleTestTexts.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => setTestInput(sample.text)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#ede9fe',
                    border: '1px solid #c4b5fd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#5b21b6'
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>

            {/* Input Textarea */}
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Text hier eingeben oder einfügen..."
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #c4b5fd',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: '12px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={runLlamaTest}
                disabled={!testInput.trim() || isTestRunning}
                style={{
                  padding: '12px 24px',
                  backgroundColor: (!testInput.trim() || isTestRunning) ? '#94a3b8' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (!testInput.trim() || isTestRunning) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isTestRunning ? '⏳ Verarbeite...' : '🦙 An Llama senden'}
              </button>
              <button
                onClick={() => {
                  setTestInput('');
                  setTestResult(null);
                }}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🗑️ Leeren
              </button>
            </div>

            {/* Test Result Display */}
            {testResult && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '16px',
                border: '1px solid #e2e8f0'
              }}>
                <h4 style={{
                  margin: '0 0 12px 0',
                  color: '#1e293b',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>📊 Test-Ergebnis</span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 'normal',
                    color: '#64748b'
                  }}>
                    {testResult.processingTimeMs}ms | {testResult.attempts} Versuch(e)
                  </span>
                </h4>

                {/* Guardrail Status */}
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  backgroundColor: testResult.guardrailStatus === 'passed' ? '#f0fdf4' :
                                   testResult.guardrailStatus === 'error' ? '#fef2f2' : '#fef3c7',
                  border: `1px solid ${
                    testResult.guardrailStatus === 'passed' ? '#22c55e' :
                    testResult.guardrailStatus === 'error' ? '#ef4444' : '#f59e0b'
                  }`
                }}>
                  <div style={{
                    fontWeight: '600',
                    color: testResult.guardrailStatus === 'passed' ? '#166534' :
                           testResult.guardrailStatus === 'error' ? '#dc2626' : '#92400e',
                    marginBottom: testResult.violations.length > 0 ? '8px' : '0'
                  }}>
                    {testResult.guardrailStatus === 'passed' ? '✅ Guardrails bestanden' :
                     testResult.guardrailStatus === 'error' ? '❌ Fehler' :
                     testResult.guardrailStatus === 'violations_detected' ? '⚠️ Guardrail-Verstöße erkannt' :
                     `Status: ${testResult.guardrailStatus}`}
                  </div>
                  {testResult.violations.length > 0 && (
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      fontSize: '13px',
                      color: '#92400e'
                    }}>
                      {testResult.violations.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Side-by-side comparison */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px'
                }}>
                  {/* Input */}
                  <div>
                    <h5 style={{
                      margin: '0 0 8px 0',
                      color: '#dc2626',
                      fontSize: '14px'
                    }}>
                      📥 INPUT ({testResult.input.length} Zeichen)
                    </h5>
                    <pre style={{
                      backgroundColor: '#fef2f2',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '300px',
                      overflow: 'auto',
                      margin: 0,
                      fontFamily: 'inherit',
                      border: '1px solid #fecaca'
                    }}>
                      {testResult.input}
                    </pre>
                  </div>

                  {/* Output */}
                  <div>
                    <h5 style={{
                      margin: '0 0 8px 0',
                      color: '#16a34a',
                      fontSize: '14px'
                    }}>
                      📤 OUTPUT ({testResult.output.length} Zeichen)
                    </h5>
                    <pre style={{
                      backgroundColor: '#f0fdf4',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '300px',
                      overflow: 'auto',
                      margin: 0,
                      fontFamily: 'inherit',
                      border: '1px solid #bbf7d0'
                    }}>
                      {testResult.output}
                    </pre>
                  </div>
                </div>

                {/* Comparison Analysis */}
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: testResult.input === testResult.output ? '#fef2f2' : '#f0fdf4',
                  borderRadius: '6px',
                  border: `2px solid ${testResult.input === testResult.output ? '#ef4444' : '#22c55e'}`
                }}>
                  <div style={{
                    fontWeight: 'bold',
                    color: testResult.input === testResult.output ? '#dc2626' : '#16a34a',
                    marginBottom: '4px'
                  }}>
                    {testResult.input === testResult.output
                      ? '⚠️ PROBLEM: Input und Output sind IDENTISCH - Llama hat NICHTS geändert!'
                      : '✅ OK: Llama hat Änderungen vorgenommen'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Längenänderung: {testResult.output.length - testResult.input.length} Zeichen
                    ({((testResult.output.length / testResult.input.length) * 100).toFixed(1)}% der Eingabe)
                  </div>
                </div>

                {/* Removed Tokens (dictation commands converted) */}
                {testResult.removedTokens.length > 0 && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#eff6ff',
                    borderRadius: '6px',
                    border: '1px solid #93c5fd'
                  }}>
                    <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: '500', marginBottom: '4px' }}>
                      🔄 Diktierbefehle konvertiert (Regex-Schritt):
                    </div>
                    <div style={{ fontSize: '12px', color: '#3b82f6' }}>
                      {testResult.removedTokens.join(', ')}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {testResult.notes.length > 0 && (
                  <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                    <strong>Notizen:</strong> {testResult.notes.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Test History */}
            {testHistory.length > 1 && (
              <div style={{ marginTop: '16px' }}>
                <h5 style={{
                  margin: '0 0 8px 0',
                  color: '#6b21a8',
                  fontSize: '14px'
                }}>
                  📜 Letzte Tests ({testHistory.length})
                </h5>
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}>
                  {testHistory.slice(1).map((hist, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setTestInput(hist.input);
                        setTestResult(hist);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: hist.guardrailStatus === 'passed' ? '#f0fdf4' :
                                        hist.input === hist.output ? '#fef2f2' : '#fef3c7',
                        border: `1px solid ${
                          hist.guardrailStatus === 'passed' ? '#22c55e' :
                          hist.input === hist.output ? '#ef4444' : '#f59e0b'
                        }`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: '#475569'
                      }}
                      title={hist.input.substring(0, 100)}
                    >
                      {hist.input.substring(0, 30)}... ({hist.processingTimeMs}ms)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
                Diktieren Sie Ihr Gutachten. Die KI formatiert den Text automatisch und speichert ihn als Word-Dokument.
              </p>

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
                  <div style={{ width: '1px', height: '30px', backgroundColor: '#e2e8f0' }} />
                  <span style={{ color: '#94a3b8', fontSize: '14px', padding: '8px 0' }}>oder</span>
                  <div style={{ width: '1px', height: '30px', backgroundColor: '#e2e8f0' }} />
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

              {/* Settings Link */}
              <div style={{
                marginTop: '32px',
                padding: '16px',
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px'
              }}>
                <p style={{ fontSize: '13px', color: '#92400e', marginBottom: '8px' }}>
                  Stil-Profil neu erstellen?
                </p>
                <button
                  onClick={resetExamplesAndProfile}
                  style={{
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: '8px 16px',
                    fontWeight: '500'
                  }}
                >
                  Beispiele zurücksetzen
                </button>
              </div>

              {/* Recent Dictations */}
              {dictationHistory.length > 0 && (
                <div style={{ marginTop: '40px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#475569',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    📋 Letzte Diktate ({dictationHistory.length}/{MAX_DICTATIONS})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {dictationHistory.map((dictation) => (
                      <div
                        key={dictation.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#1e293b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {dictation.title}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                            {formatDate(dictation.lastModifiedAt)}
                            {dictation.chatMessages && dictation.chatMessages.length > 0 && (
                              <span style={{ marginLeft: '8px' }}>
                                • {dictation.chatMessages.length} Nachricht(en)
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                          <button
                            onClick={() => loadDictation(dictation)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            ✏️ Weiterarbeiten
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Dieses Diktat wirklich löschen?')) {
                                deleteDictation(dictation.id);
                              }
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recording State */}
          {state.step === 'recording' && (
            <div>
              <div style={{ fontSize: '64px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>
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
                onClick={stopRecordingAndProcess}
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

          {/* Processing State (Whisper) */}
          {state.step === 'processing' && (
            <div>
              <div style={{ fontSize: '64px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>
                🎧
              </div>
              <h2 style={{ fontSize: '24px', color: '#3b82f6', marginBottom: '16px' }}>
                Whisper Transkription...
              </h2>
              <p style={{ color: '#64748b', fontSize: '16px' }}>{processingProgress}</p>
              <div style={{
                width: '300px',
                height: '6px',
                backgroundColor: '#e2e8f0',
                borderRadius: '3px',
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
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '16px' }}>
                Bitte warten Sie, während Whisper die Sprache erkennt...
              </p>
            </div>
          )}

          {/* Transcribed State - Show raw transcript, user can proceed to Llama */}
          {state.step === 'transcribed' && (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📝</div>
              <h2 style={{ fontSize: '22px', color: '#3b82f6', marginBottom: '8px' }}>
                Whisper Transkription abgeschlossen!
              </h2>
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                Prüfen Sie den Text und klicken Sie "Weiter" für die Llama Formatierung.
              </p>

              {/* Raw Transcript Display */}
              <div style={{
                backgroundColor: '#f1f5f9',
                border: '2px solid #3b82f6',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                textAlign: 'left',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                <h4 style={{ color: '#1e40af', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🎧 Whisper Roh-Transkript ({state.rawTranscript.length} Zeichen):
                </h4>
                <pre style={{
                  backgroundColor: 'white',
                  padding: '16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                  margin: 0,
                  lineHeight: '1.6',
                  color: '#1e293b'
                }}>
                  {state.rawTranscript}
                </pre>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={proceedToFormatting}
                  style={{
                    padding: '14px 28px',
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)'
                  }}
                >
                  🦙 Weiter zu Llama Formatierung
                </button>
                <button
                  onClick={resetWorkflow}
                  style={{
                    padding: '14px 24px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  ❌ Abbrechen
                </button>
              </div>

              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '16px' }}>
                💡 Tipp: Wenn Whisper langsam war, liegt das Problem dort. Wenn die Transkription schnell war, liegt es an Llama.
              </p>
            </div>
          )}

          {/* Formatting State (Llama) */}
          {state.step === 'formatting' && (
            <div>
              <div style={{ fontSize: '64px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>
                🦙
              </div>
              <h2 style={{ fontSize: '24px', color: '#8b5cf6', marginBottom: '16px' }}>
                Llama Formatierung...
              </h2>
              <p style={{ color: '#64748b', fontSize: '16px' }}>{processingProgress}</p>
              <div style={{
                width: '300px',
                height: '6px',
                backgroundColor: '#e2e8f0',
                borderRadius: '3px',
                margin: '24px auto',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: '50%',
                  height: '100%',
                  backgroundColor: '#8b5cf6',
                  animation: 'loading 1.5s infinite'
                }} />
              </div>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '16px' }}>
                Llama korrigiert Grammatik und fügt Überschriften ein...
              </p>
            </div>
          )}

          {/* Done State - With revision chat */}
          {state.step === 'done' && (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <h2 style={{ fontSize: '22px', color: '#22c55e', marginBottom: '8px' }}>
                Gutachten fertig!
              </h2>
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                Speichern Sie das Dokument oder fordern Sie Änderungen an.
              </p>

              {/* DEBUG: Raw Transcript Button */}
              <div style={{ marginBottom: '16px' }}>
                <button
                  onClick={() => setShowRawTranscript(!showRawTranscript)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}
                >
                  🔍 DEBUG: {showRawTranscript ? 'Roh-Transkript ausblenden' : 'Roh-Transkript anzeigen (vor Llama)'}
                </button>
              </div>

              {/* DEBUG: Raw Transcript Display */}
              {showRawTranscript && rawTranscriptDebug && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '2px solid #ef4444',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  textAlign: 'left'
                }}>
                  <h4 style={{ color: '#dc2626', marginBottom: '8px', fontSize: '14px' }}>
                    1. RAW WHISPER OUTPUT (vor Llama):
                  </h4>
                  <pre style={{
                    backgroundColor: '#1f2937',
                    color: '#f9fafb',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '200px',
                    overflow: 'auto',
                    fontFamily: 'monospace'
                  }}>
                    {rawTranscriptDebug}
                  </pre>
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px' }}>
                    Länge: {rawTranscriptDebug.length} Zeichen
                  </p>

                  <h4 style={{ color: '#16a34a', marginBottom: '8px', marginTop: '16px', fontSize: '14px' }}>
                    2. NACH LLAMA (formattedText - wird gespeichert):
                  </h4>
                  <pre style={{
                    backgroundColor: '#1f2937',
                    color: '#86efac',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '200px',
                    overflow: 'auto',
                    fontFamily: 'monospace'
                  }}>
                    {state.formattedText}
                  </pre>
                  <p style={{ color: '#16a34a', fontSize: '12px', marginTop: '8px' }}>
                    Länge: {state.formattedText.length} Zeichen
                  </p>

                  <div style={{
                    marginTop: '16px',
                    padding: '12px',
                    backgroundColor: rawTranscriptDebug === state.formattedText ? '#fef2f2' : '#f0fdf4',
                    borderRadius: '6px',
                    border: rawTranscriptDebug === state.formattedText ? '2px solid #ef4444' : '2px solid #22c55e'
                  }}>
                    <p style={{
                      margin: 0,
                      fontWeight: 'bold',
                      color: rawTranscriptDebug === state.formattedText ? '#dc2626' : '#16a34a'
                    }}>
                      {rawTranscriptDebug === state.formattedText
                        ? '⚠️ PROBLEM: Texte sind IDENTISCH - Llama hat nichts geändert!'
                        : '✅ OK: Texte sind unterschiedlich - Llama hat gearbeitet'}
                    </p>
                  </div>
                </div>
              )}

              {/* Pending Format Indicator */}
              {pendingFormatSpec && Object.keys(pendingFormatSpec).length > 0 && (
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '18px' }}>🎨</span>
                  <span style={{ color: '#92400e', fontSize: '14px' }}>
                    Formatierungsänderungen vorgemerkt - werden beim Speichern angewendet
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginBottom: '24px'
              }}>
                <button
                  onClick={saveAsDocx}
                  disabled={isSaving || isRevising}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: (isSaving || isRevising) ? '#94a3b8' : pendingFormatSpec ? '#8b5cf6' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (isSaving || isRevising) ? 'wait' : 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: pendingFormatSpec ? '0 4px 14px rgba(139, 92, 246, 0.4)' : '0 4px 14px rgba(37, 99, 235, 0.4)'
                  }}
                >
                  {isSaving ? '⏳' : structuredContent ? '📋' : '💾'} {isSaving ? 'Speichern...' : structuredContent ? 'Strukturiert speichern' : 'Als Word speichern'}
                </button>
                <button
                  onClick={resetWorkflow}
                  disabled={isRevising}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: isRevising ? 'not-allowed' : 'pointer',
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

              {/* Chat Interface for Revisions */}
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '16px',
                marginTop: '16px'
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1e293b',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  💬 Änderungen anfordern
                </h3>

                {/* Chat Messages */}
                {chatMessages.length > 0 && (
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginBottom: '12px',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '8px 12px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          backgroundColor: msg.role === 'user' ? '#dbeafe' : '#f0fdf4',
                          marginLeft: msg.role === 'user' ? '20%' : '0',
                          marginRight: msg.role === 'assistant' ? '20%' : '0'
                        }}
                      >
                        <div style={{
                          fontSize: '11px',
                          color: '#64748b',
                          marginBottom: '4px'
                        }}>
                          {msg.role === 'user' ? '👤 Sie' : '🤖 Assistent'}
                        </div>
                        <div style={{ fontSize: '14px', color: '#1e293b' }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input Area */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={revisionInput}
                    onChange={(e) => setRevisionInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRevisionRequest()}
                    placeholder="z.B. 'Ersetze Psychotherapie durch Verhaltenstherapie' oder 'Ergänze unter Diagnose: Lumboischialgie'"
                    disabled={isRevising}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={handleRevisionRequest}
                    disabled={!revisionInput.trim() || isRevising}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: (!revisionInput.trim() || isRevising) ? '#94a3b8' : '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: (!revisionInput.trim() || isRevising) ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {isRevising ? '⏳' : '✏️'} {isRevising ? 'Bearbeite...' : 'Ändern'}
                  </button>
                </div>

                <p style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  marginTop: '8px',
                  marginBottom: 0
                }}>
                  <strong>Textänderungen:</strong> Wörter ersetzen, Abschnitte ergänzen, Informationen hinzufügen.<br/>
                  <strong>Formatierung:</strong> z.B. "Kopfzeile 10pt", "Seitenränder 30mm", "Titelseite mit 'Gutachten' als Titel"
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Style Info */}
        {styleInfo.hasExamples && state.step === 'ready' && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <p style={{ margin: 0, color: '#166534', fontSize: '14px' }}>
              📄 Dokumente werden formatiert mit: <strong>{styleInfo.fontFamily}</strong>, {styleInfo.fontSize}pt
              {styleInfo.headerContent && (
                <span style={{ marginLeft: '12px' }}>
                  | 📋 Kopfzeile: "{styleInfo.headerContent.substring(0, 30)}{styleInfo.headerContent.length > 30 ? '...' : ''}"
                </span>
              )}
            </p>
          </div>
        )}

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
