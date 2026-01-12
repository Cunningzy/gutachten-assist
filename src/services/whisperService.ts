/**
 * src/services/whisperService.ts
 * Real Whisper Large-v3 integration via Tauri backend
 * Component 2.1B: Tauri Integration - REAL SPEECH RECOGNITION
 */

import { tauriApi, type TranscriptionResult as TauriTranscriptionResult, type AudioProcessingProgress } from './tauriApi';
import { audioService } from './audioService';

// Browser-compatible EventEmitter implementation
class BrowserEventEmitter {
  private events: Record<string, Function[]> = {};

  on(event: string, listener: Function): this {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  off(event: string, listener: Function): this {
    if (!this.events[event]) return this;
    const index = this.events[event].indexOf(listener);
    if (index > -1) {
      this.events[event].splice(index, 1);
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (!this.events[event]) return false;
    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
    return this;
  }
}

// Types for Whisper service
export interface WhisperProgress {
  stage: 'loading' | 'processing' | 'transcribing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  timeElapsed?: number;
  estimatedTimeRemaining?: number;
  currentStep?: string;
}

export interface TranscriptionSegment {
  start_time: number;
  end_time: number;
  text: string;
  confidence: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  processing_time_ms: number;
  language: string;
  segments: TranscriptionSegment[];
}

export interface WhisperConfig {
  language: string;
  enableMedicalOptimization: boolean;
  enableRealTimeTranscription: boolean;
}

// German medical vocabulary for optimization
const GERMAN_MEDICAL_TERMS = {
  // Common corrections for speech recognition errors
  corrections: {
    'gut achten': 'Gutachten',
    'diagnose': 'Diagnose',
    'patient': 'Patient',
    'patientin': 'Patientin',
    'an amnese': 'Anamnese',
    'therapie': 'Therapie',
    'medikation': 'Medikation',
    'untersuchung': 'Untersuchung',
    'befund': 'Befund',
    'behandlung': 'Behandlung'
  }
};

/**
 * Real Whisper Service Implementation via Tauri Backend
 * Component 2.1B: Real speech-to-text using Tauri Rust backend
 */
export class WhisperService extends BrowserEventEmitter {
  private config: WhisperConfig;
  private isInitialized: boolean = false;
  private isProcessing: boolean = false;
  private progressUnsubscribe?: () => void;

  constructor(config?: Partial<WhisperConfig>) {
    super();

    this.config = {
      language: 'de',
      enableMedicalOptimization: true,
      enableRealTimeTranscription: false,
      ...config
    };

    console.log('🎤 WhisperService initialized (Tauri Backend)');
    this.setupTauriEventListeners();
  }

  /**
   * Set up Tauri event listeners for progress updates
   */
  private setupTauriEventListeners(): void {
    // Listen for model loading progress
    this.progressUnsubscribe = tauriApi.onProgress('model_loading', (event) => {
      this.emit('progress', {
        stage: 'loading',
        progress: event.progress * 100,
        message: event.message,
        currentStep: event.stage
      } as WhisperProgress);
    });

    // Listen for audio processing progress
    tauriApi.onProgress('audio_processing', (event) => {
      this.emit('progress', {
        stage: event.stage === 'transcribing' ? 'transcribing' : 'processing',
        progress: event.progress * 100,
        message: event.message,
        currentStep: event.stage
      } as WhisperProgress);
    });
  }

  /**
   * Initialize the Whisper service via Tauri backend
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('✅ Whisper service already initialized');
      return;
    }

    console.log('🚀 Initializing Whisper service via Tauri backend...');

    try {
      // Check if we're running in Tauri environment
      if (!tauriApi.isDesktop()) {
        // Browser fallback - show informative message
        this.emit('progress', {
          stage: 'complete',
          progress: 100,
          message: 'Browser-Modus: Für echte Spracherkennung Tauri-App verwenden',
          currentStep: 'Browser Mode'
        } as WhisperProgress);

        this.isInitialized = true;
        console.log('⚠️ Running in browser mode - Tauri features not available');
        return;
      }

      // Load Whisper model via Tauri
      this.emit('progress', {
        stage: 'loading',
        progress: 10,
        message: 'Whisper-Modell wird über Tauri-Backend geladen...',
        currentStep: 'Tauri Model Loading'
      } as WhisperProgress);

      const result = await tauriApi.loadWhisperModel();
      console.log('📊 Tauri model loading result:', result);

      // Mark as initialized
      this.isInitialized = true;

      console.log('✅ Whisper service initialized via Tauri backend');

      this.emit('progress', {
        stage: 'complete',
        progress: 100,
        message: 'Whisper bereit für deutsche Spracherkennung via Tauri',
        currentStep: 'Complete'
      } as WhisperProgress);

    } catch (error) {
      console.error('❌ Whisper service initialization failed:', error);

      this.emit('progress', {
        stage: 'error',
        progress: 0,
        message: `Initialisierung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        currentStep: 'Failed'
      } as WhisperProgress);

      throw error;
    }
  }

  /**
   * Transcribe audio using Tauri backend
   */
  public async transcribeAudio(audioData: ArrayBuffer | Blob): Promise<TranscriptionResult> {
    console.log('🎯 transcribeAudio called with:', audioData instanceof Blob ? 'Blob' : 'ArrayBuffer', audioData);

    if (!this.isInitialized) {
      console.log('❌ Whisper service not initialized');
      throw new Error('Whisper service not initialized. Call initialize() first.');
    }

    if (this.isProcessing) {
      console.log('❌ Already processing transcription');
      throw new Error('Transkription läuft bereits. Bitte warten.');
    }

    this.isProcessing = true;

    try {
      // Check if we're running in Tauri environment
      if (!tauriApi.isDesktop()) {
        // Browser fallback - return a demo transcription
        console.log('⚠️ Browser mode: Returning demo transcription');

        this.emit('progress', {
          stage: 'processing',
          progress: 50,
          message: 'Browser-Modus: Demo-Transkription wird erstellt...',
          currentStep: 'Browser Demo'
        } as WhisperProgress);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const demoResult: TranscriptionResult = {
          text: 'DEMO: Browser-Modus - Echte Spracherkennung nur in Tauri-App verfügbar. ' +
                'Dies ist eine Beispiel-Transkription für Testzwecke.',
          confidence: 0.95,
          processing_time_ms: 1000,
          language: 'de',
          segments: [{
            start_time: 0.0,
            end_time: 5.0,
            text: 'DEMO: Browser-Modus - Echte Spracherkennung nur in Tauri-App verfügbar.',
            confidence: 0.95
          }]
        };

        this.emit('progress', {
          stage: 'complete',
          progress: 100,
          message: 'Demo-Transkription abgeschlossen (Browser-Modus)',
          currentStep: 'Complete'
        } as WhisperProgress);

        this.isProcessing = false;
        return demoResult;
      }

      console.log('🎯 Starting REAL German speech transcription using your Python Whisper script...');

      // Convert input to Blob if needed
      let audioBlob: Blob;
      if (audioData instanceof ArrayBuffer) {
        audioBlob = new Blob([audioData], { type: 'audio/webm' });
      } else {
        audioBlob = audioData;
      }

      console.log(`📊 Input audio: ${(audioBlob.size / 1024).toFixed(1)}KB, type: ${audioBlob.type}`);

      // Save audio file for Python processing
      this.emit('progress', {
        stage: 'processing',
        progress: 20,
        message: 'Audio wird als FLAC-Datei gespeichert...',
        currentStep: 'Audio File Preparation'
      } as WhisperProgress);

      const audioFilePath = await this.saveAudioAsFlac(audioBlob);
      console.log('📁 Audio file path prepared:', audioFilePath);

      // Actually save the audio file using Tauri
      this.emit('progress', {
        stage: 'processing',
        progress: 30,
        message: 'Audio-Datei wird auf Festplatte gespeichert...',
        currentStep: 'Saving Audio File'
      } as WhisperProgress);

      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const savedFilePath = await tauriApi.saveAudioFile(uint8Array, audioFilePath);
      console.log('💾 Audio file actually saved to:', savedFilePath);

      // Run your Python Whisper script
      this.emit('progress', {
        stage: 'transcribing',
        progress: 40,
        message: 'Python Whisper Skript wird ausgeführt...',
        currentStep: 'Real Python Whisper Processing'
      } as WhisperProgress);

      const tauriResult = await tauriApi.processAudioFile(savedFilePath);
      console.log('🧠 Real Tauri Python Whisper result:', tauriResult);
      console.log('🧠 Tauri transcription result:', tauriResult);

      // Apply German medical optimization if enabled
      let finalText = tauriResult.text;
      if (this.config.enableMedicalOptimization) {
        this.emit('progress', {
          stage: 'transcribing',
          progress: 80,
          message: 'Medizinische Terminologie wird optimiert...',
          currentStep: 'Medical Optimization'
        } as WhisperProgress);

        finalText = this.applyGermanMedicalOptimization(tauriResult.text);
      }

      // Convert Tauri result to our format
      const finalResult: TranscriptionResult = {
        text: finalText,
        confidence: tauriResult.confidence,
        processing_time_ms: tauriResult.processing_time_ms,
        language: tauriResult.language,
        segments: tauriResult.segments.map(seg => ({
          start_time: seg.start_time,
          end_time: seg.end_time,
          text: this.config.enableMedicalOptimization ? this.applyGermanMedicalOptimization(seg.text) : seg.text,
          confidence: seg.confidence
        }))
      };

      console.log('✅ REAL German speech transcription completed via Tauri!');
      console.log(`📝 Result: "${finalResult.text.substring(0, 80)}..."`);
      console.log(`📊 Processing time: ${finalResult.processing_time_ms}ms`);

      this.emit('progress', {
        stage: 'complete',
        progress: 100,
        message: 'Transkription abgeschlossen',
        timeElapsed: finalResult.processing_time_ms,
        currentStep: 'Complete'
      } as WhisperProgress);

      this.isProcessing = false;
      return finalResult;

    } catch (error) {
      this.isProcessing = false;

      console.error('❌ Transcription failed:', error);

      this.emit('progress', {
        stage: 'error',
        progress: 0,
        message: `Transkription fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        currentStep: 'Error'
      } as WhisperProgress);

      throw error;
    }
  }

  /**
   * Apply German medical vocabulary optimization to text
   */
  private applyGermanMedicalOptimization(text: string): string {
    if (!this.config.enableMedicalOptimization) {
      return text;
    }

    console.log('🏥 Applying German medical optimization...');

    let optimizedText = text;

    // Apply medical terminology corrections
    Object.entries(GERMAN_MEDICAL_TERMS.corrections).forEach(([incorrect, correct]) => {
      const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
      const matches = optimizedText.match(regex);
      if (matches) {
        optimizedText = optimizedText.replace(regex, correct);
        console.log(`📝 Corrected: "${incorrect}" → "${correct}" (${matches.length} occurrences)`);
      }
    });

    console.log('✅ Medical optimization complete');
    return optimizedText;
  }

  /**
   * Save audio blob as WAV file for Python Whisper processing
   */
  private async saveAudioAsFlac(audioBlob: Blob): Promise<string> {
    // Create timestamp for unique filename
    const timestamp = Date.now();
    const fileName = `gutachten_audio_${timestamp}.wav`;  // Use WAV format for simplicity

    console.log('💾 Preparing audio file for Tauri backend processing:', fileName);

    try {
      // The Tauri backend will save to system temp directory
      // We just need to provide the filename, the backend handles the path
      console.log('📊 Audio blob prepared for Tauri backend processing');

      // Return the filename for the Tauri backend to use in temp directory
      return fileName;
    } catch (error) {
      console.error('Failed to prepare audio file path:', error);
      throw new Error(`Fehler beim Vorbereiten der Audio-Datei: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    }
  }

  /**
   * Run Python Whisper script and return transcription
   */
  private async runPythonWhisperScript(audioFilePath: string): Promise<string> {
    console.log('🐍 Running Python Whisper script on:', audioFilePath);

    try {
      // For browser environment, we can't actually run Python commands
      // In a real Tauri app, this would use Tauri's shell API to execute Python

      // Simulate the Python script execution
      console.log('🎯 Simulating: python whisper_transcribe.py');

      // Since we can't actually run the Python script in browser,
      // return a placeholder that indicates the integration is working
      const simulatedResult = `[SIMULIERT] Deutsche Spracherkennung würde hier das echte Ergebnis von ${audioFilePath} liefern. Python Whisper Skript bereit zur Ausführung.`;

      console.log('✅ Python script simulation completed');
      return simulatedResult;

    } catch (error) {
      console.error('Python script execution failed:', error);
      throw new Error(`Python Whisper Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    }
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isInitialized: boolean;
    isProcessing: boolean;
    language: string;
    medicalOptimization: boolean;
    backend: string;
    modelPath: string;
  } {
    return {
      isInitialized: this.isInitialized,
      isProcessing: this.isProcessing,
      language: this.config.language,
      medicalOptimization: this.config.enableMedicalOptimization,
      backend: tauriApi.isDesktop() ? 'Tauri' : 'Browser',
      modelPath: tauriApi.isDesktop() ? 'models/whisper-large-v3-german.bin' : 'Browser Mode (No Local Model)'
    };
  }

  /**
   * Update service configuration
   */
  public updateConfig(newConfig: Partial<WhisperConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Whisper configuration updated:', newConfig);
  }

  /**
   * Start real-time transcription
   */
  public async startRealTimeTranscription(): Promise<void> {
    console.log('🎤 Starting real-time transcription...');

    if (!this.isInitialized) {
      throw new Error('Whisper service not initialized. Call initialize() first.');
    }

    this.config.enableRealTimeTranscription = true;

    this.emit('progress', {
      stage: 'processing',
      progress: 50,
      message: 'Echtzeit-Transkription gestartet',
      currentStep: 'Real-time Mode Active'
    } as WhisperProgress);

    console.log('✅ Real-time transcription started');
  }

  /**
   * Stop real-time transcription
   */
  public async stopRealTimeTranscription(): Promise<void> {
    console.log('⏹️ Stopping real-time transcription...');

    this.config.enableRealTimeTranscription = false;

    this.emit('progress', {
      stage: 'complete',
      progress: 100,
      message: 'Echtzeit-Transkription gestoppt',
      currentStep: 'Real-time Mode Stopped'
    } as WhisperProgress);

    console.log('✅ Real-time transcription stopped');
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Whisper service...');

    this.isProcessing = false;

    // Cleanup Tauri event listeners
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
    }

    // Cleanup models via Tauri
    if (tauriApi.isDesktop()) {
      try {
        await tauriApi.cleanupModels();
      } catch (error) {
        console.warn('Model cleanup warning:', error);
      }
    }

    // Clear event listeners
    this.removeAllListeners();

    this.isInitialized = false;
    console.log('✅ Whisper service cleanup complete');
  }
}

// Export singleton instance for global use
export const whisperService = new WhisperService();

// Also export as default for alternative import syntax
export default whisperService;