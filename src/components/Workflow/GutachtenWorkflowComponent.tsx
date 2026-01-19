/**
 * Unified Gutachten Workflow Component
 * Complete pipeline: Record → Transcribe (hidden) → Format with LLM → Download DOCX
 * No preview - directly saves formatted document
 */

import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getExampleDocuments } from '../Onboarding/FirstLaunchOnboarding';

interface WorkflowState {
  step: 'ready' | 'recording' | 'processing' | 'done';
  audioBlob: Blob | null;
  formattedText: string;
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

// Base medical typist prompt for Llama formatting
const BASE_FORMATTING_PROMPT = `Du bist ein medizinischer Schreibassistent.

KRITISCH WICHTIG - LIES DAS GENAU:
Du darfst NUR den diktierten Text des Benutzers verwenden!
Erfinde KEINE neuen Informationen!
Füge KEINE Texte hinzu, die nicht diktiert wurden!

DEINE AUFGABE:
1. Nimm den diktierten Rohtext
2. Korrigiere Grammatik und Rechtschreibung
3. Entferne Diktier-Befehle ("Punkt", "Komma", "Absatz", "neue Zeile")
4. Strukturiere den Text mit passenden Überschriften

REGELN:
- Verwende NUR Informationen aus dem Eingabetext
- Erfinde NICHTS dazu
- Behalte ALLE diktierten Informationen
- Überschriften als reiner Text (KEINE ** oder # Zeichen)
- Keine Markdown-Formatierung
- Keine Erklärungen oder Kommentare

`;

// Function to build the full formatting prompt with StyleProfile
const buildFormattingPrompt = (styleProfilePrompt: string | null): string => {
  let prompt = BASE_FORMATTING_PROMPT;

  if (styleProfilePrompt) {
    prompt += `
${styleProfilePrompt}

WICHTIG: Verwende diese Abschnitts-Namen als Überschriften, wenn der Inhalt dazu passt.
Aber füge NUR Abschnitte hinzu, für die der Benutzer auch Text diktiert hat!

`;
  }

  prompt += `EINGABE (diktierter Text - verwende NUR diesen Inhalt):
`;

  return prompt;
};

const GutachtenWorkflowComponent: React.FC = () => {
  const [state, setState] = useState<WorkflowState>({
    step: 'ready',
    audioBlob: null,
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

  // Format raw transcript using Llama with StyleProfile
  const formatWithLlama = async (rawText: string): Promise<string> => {
    if (styleProfilePrompt) {
      setProcessingProgress('Text wird nach Ihrem Stil formatiert...');
    } else {
      setProcessingProgress('Text wird formatiert und korrigiert...');
    }

    try {
      // Build prompt with StyleProfile if available
      const prompt = buildFormattingPrompt(styleProfilePrompt) + rawText;

      console.log('Formatting with StyleProfile:', styleProfilePrompt ? 'YES' : 'NO');

      const result = await invoke('correct_german_grammar', {
        text: prompt,
        convertDictationCommands: false
      }) as { corrected_text: string };

      // Strip any markdown formatting that Llama might have added
      let cleanedText = result.corrected_text || rawText;
      cleanedText = stripMarkdownFormatting(cleanedText);

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

  // Specialized prompt for editing formatted Gutachten
  const buildRevisionPrompt = (currentText: string, userInstructions: string) => {
    // Check if user mentions examples/Beispiel - if so, include StyleProfile
    const mentionsExample = /beispiel|vorlage|muster|stil|struktur|wie\s+in/i.test(userInstructions);
    const includeStyleProfile = mentionsExample && styleProfilePrompt;

    let prompt = `Bearbeite dieses deutsche medizinische Gutachten nach den Anweisungen des Benutzers.

STRENGE REGELN - UNBEDINGT BEFOLGEN:

1. Gib NUR reinen Text aus - KEINE Formatierungszeichen!
2. VERBOTEN: ** # __ <b> <font> <big> oder andere Markup-Zeichen
3. Überschriften sind normaler Text, z.B.: "IX. Sozialversicherungspflichtige Tätigkeit"
4. NICHT so: "**IX. Sozialversicherungspflichtige Tätigkeit**"
5. Keine Erklärungen, keine Kommentare - nur der bearbeitete Text

WAS DU ÄNDERN KANNST:
- Wörter ersetzen, Text hinzufügen oder entfernen
- Absätze umformulieren
- Abschnitte umstrukturieren
- Informationen ergänzen oder korrigieren

WAS DU NICHT ÄNDERN KANNST (wird beim Word-Export gemacht):
- Schriftgröße, Fettdruck, Kursiv
- Seitenkopf (Header) - das ist Word-Formatierung
- Titelseite mit Seitenumbruch

Wenn der Benutzer "Titelseite" oder "Titel" sagt: Setze den relevanten Text an den Anfang des Dokuments auf eigenen Zeilen.
`;

    if (includeStyleProfile) {
      prompt += `
DEIN GELERNTER STIL (aus den Beispiel-Gutachten):
${styleProfilePrompt}

WICHTIG: Strukturiere den Text EXAKT nach diesem Stil-Profil!
`;
    }

    prompt += `
AKTUELLER TEXT:
${currentText}

ANWEISUNGEN:
${userInstructions}

Gib jetzt den vollständigen, bearbeiteten Text aus (ohne Formatierungszeichen):`;

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

  // Process audio: Transcribe with Whisper, then format with Llama
  const processAudio = async (audioBlob: Blob) => {
    try {
      setProcessingProgress('Schritt 1/2: Sprache wird erkannt...');

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

      if (!rawTranscript.trim()) {
        setState(prev => ({
          ...prev,
          step: 'ready',
          error: 'Keine Sprache erkannt. Bitte erneut versuchen.'
        }));
        return;
      }

      setProcessingProgress('Schritt 2/2: Text wird formatiert...');
      const formattedText = await formatWithLlama(rawTranscript);

      setState(prev => ({ ...prev, step: 'done', formattedText }));
      setProcessingProgress('');

      // Save as new dictation
      const now = new Date().toISOString();
      const newId = `dictation_${Date.now()}`;
      const newRecord: DictationRecord = {
        id: newId,
        text: formattedText,
        title: generateDictationTitle(formattedText),
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
      console.error('Processing error:', error);
      setState(prev => ({
        ...prev,
        step: 'ready',
        error: `Verarbeitung fehlgeschlagen: ${error}`
      }));
    }
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
      setProcessingProgress(`Schritt 1/2: "${file.name}" wird transkribiert...`);

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

      if (!rawTranscript.trim()) {
        setState(prev => ({
          ...prev,
          step: 'ready',
          error: 'Keine Sprache erkannt. Bitte erneut versuchen.'
        }));
        return;
      }

      setProcessingProgress('Schritt 2/2: Text wird formatiert...');
      const formattedText = await formatWithLlama(rawTranscript);

      setState(prev => ({ ...prev, step: 'done', formattedText }));
      setProcessingProgress('');

      // Save as new dictation
      const now = new Date().toISOString();
      const newId = `dictation_${Date.now()}`;
      const newRecord: DictationRecord = {
        id: newId,
        text: formattedText,
        title: generateDictationTitle(formattedText),
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

  // Save as DOCX file with styling - applies pending format spec if any
  const saveAsDocx = async () => {
    const text = state.formattedText;
    if (!text.trim()) {
      alert('Kein Text zum Speichern vorhanden.');
      return;
    }

    setIsSaving(true);

    try {
      // First create the basic DOCX with text content
      const result = await invoke('create_styled_docx', {
        text: text,
        fontFamily: styleInfo.fontFamily,
        fontSize: styleInfo.fontSize,
        lineSpacing: styleInfo.lineSpacing,
        headerContent: styleInfo.headerContent || null  // Document header (top of every page)
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
  };

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
              { key: 'processing', label: '3. Verarbeitung', icon: '⚙️' },
              { key: 'done', label: '4. Speichern', icon: '💾' }
            ].map((s, index) => {
              const isActive = s.key === state.step;
              const isPast = ['ready', 'recording', 'processing', 'done'].indexOf(state.step) > index;
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

          {/* Processing State */}
          {state.step === 'processing' && (
            <div>
              <div style={{ fontSize: '64px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>
                ⚙️
              </div>
              <h2 style={{ fontSize: '24px', color: '#3b82f6', marginBottom: '16px' }}>
                Verarbeitung...
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
                Bitte warten Sie, während die KI Ihr Diktat verarbeitet...
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
                  {isSaving ? '⏳' : pendingFormatSpec ? '🎨' : '💾'} {isSaving ? 'Speichern...' : pendingFormatSpec ? 'Mit Formatierung speichern' : 'Als Word speichern'}
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
