/**
 * audioService.ts - Audio Capture Service
 * Component 2.1A: Basic Audio Capture System
 * Following PROJECT_STANDARDS.md - Service Layer Implementation
 */

export interface AudioSettings {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: 'wav' | 'webm';
}

export interface AudioChunk {
  data: Blob;
  timestamp: number;
  duration: number;
}

export interface AudioRecordingResult {
  audioBlob: Blob;
  duration: number;
  size: number;
  format: string;
}

export class AudioCaptureService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private recordingStartTime = 0;

  // Default settings optimized for speech recognition (Whisper-ready)
  private settings: AudioSettings = {
    sampleRate: 16000,  // Whisper optimal: 16kHz
    channels: 1,        // Mono for speech
    bitsPerSample: 16,  // 16-bit depth
    format: 'webm'      // Browser-compatible format
  };

  /**
   * Initialize audio capture with microphone permissions
   * Component 2.1A: Basic microphone access
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('🎤 Initializing audio capture service...');
      
      // Request microphone access with optimal settings for speech
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.settings.sampleRate,
          channelCount: this.settings.channels,
          echoCancellation: true,    // Important for speech recognition
          noiseSuppression: true,    // Reduce background noise
          autoGainControl: true      // Normalize audio levels
        },
        video: false
      });

      console.log('✅ Microphone access granted');
      return true;

    } catch (error) {
      console.error('❌ Failed to access microphone:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Start recording audio
   * Component 2.1A: Basic recording functionality
   */
  async startRecording(): Promise<void> {
    if (!this.stream) {
      throw new Error('Audio service not initialized. Call initialize() first.');
    }

    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    try {
      // Clear previous recording data
      this.audioChunks = [];

      // Create MediaRecorder with optimal settings
      const options = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      // Set up event handlers
      this.setupRecorderEvents();

      // Start recording with 100ms chunks for real-time processing
      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      console.log('🔴 Audio recording started');

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      throw new Error('Failed to start audio recording');
    }
  }

  /**
   * Stop recording and return the audio data
   * Component 2.1A: Recording completion and file generation
   */
  async stopRecording(): Promise<AudioRecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('No active recording to stop'));
        return;
      }

      // Set up final data handler
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/webm' 
        });

        const result: AudioRecordingResult = {
          audioBlob,
          duration: Date.now() - this.recordingStartTime,
          size: audioBlob.size,
          format: this.mediaRecorder?.mimeType || 'audio/webm'
        };

        console.log('⏹️ Recording stopped:', {
          duration: `${(result.duration / 1000).toFixed(2)}s`,
          size: `${(result.size / 1024).toFixed(2)}KB`,
          format: result.format
        });

        this.isRecording = false;
        resolve(result);
      };

      // Stop recording
      this.mediaRecorder.stop();
    });
  }

  /**
   * Get current recording status and metadata
   * Component 2.1A: Real-time status for UI
   */
  getStatus(): {
    isRecording: boolean;
    duration: number;
    state: string;
    settings: AudioSettings;
    isSupported: boolean;
  } {
    return {
      isRecording: this.isRecording,
      duration: this.isRecording ? Date.now() - this.recordingStartTime : 0,
      state: this.mediaRecorder?.state || 'inactive',
      settings: this.settings,
      isSupported: typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia !== 'undefined'
    };
  }

  /**
   * Pause recording (if supported by browser)
   * Component 2.1A: Recording control functionality
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      console.log('⏸️ Recording paused');
    }
  }

  /**
   * Resume recording (if supported by browser)
   * Component 2.1A: Recording control functionality
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      console.log('▶️ Recording resumed');
    }
  }

  /**
   * Clean up resources and stop all audio streams
   * Component 2.1A: Proper resource management
   */
  cleanup(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log('🔇 Audio track stopped');
      });
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;

    console.log('🧹 Audio service cleaned up');
  }

  /**
   * Test audio system capabilities
   * Component 2.1A: System compatibility checking
   */
  static async testAudioSupport(): Promise<{
    microphoneSupported: boolean;
    mediaRecorderSupported: boolean;
    supportedFormats: string[];
    devices: MediaDeviceInfo[];
  }> {
    const result = {
      microphoneSupported: false,
      mediaRecorderSupported: false,
      supportedFormats: [] as string[],
      devices: [] as MediaDeviceInfo[]
    };

    try {
      // Test microphone access
      const devices = await navigator.mediaDevices.enumerateDevices();
      result.devices = devices.filter(device => device.kind === 'audioinput');
      result.microphoneSupported = result.devices.length > 0;
    } catch {
      result.microphoneSupported = false;
    }

    // Test MediaRecorder support
    result.mediaRecorderSupported = typeof MediaRecorder !== 'undefined';

    // Test supported audio formats
    const formats = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    
    result.supportedFormats = formats.filter(format => 
      MediaRecorder?.isTypeSupported?.(format)
    );

    return result;
  }

  /**
   * Convert audio blob for future processing (Whisper-ready)
   * Component 2.1A: Audio format preparation
   */
  async convertToWhisperFormat(audioBlob: Blob): Promise<Blob> {
    // For Component 2.1A, just return the blob
    // Component 2.1B will implement actual conversion to Whisper format
    console.log('🔄 Audio format conversion (placeholder for Whisper integration)');
    return audioBlob;
  }

  // Private helper methods

  private setupRecorderEvents(): void {
    if (!this.mediaRecorder) return;

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
        
        // Emit real-time chunk for future streaming processing (Component 2.1B)
        this.onAudioChunk?.(event.data);
      }
    };

    this.mediaRecorder.onerror = (error) => {
      console.error('❌ MediaRecorder error:', error);
      this.isRecording = false;
    };
  }

  private getSupportedMimeType(): MediaRecorderOptions {
    const preferredTypes = [
      'audio/webm;codecs=opus',  // Best for speech
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];

    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return { mimeType: type };
      }
    }

    return {}; // Use browser default
  }

  private getErrorMessage(error: any): string {
    if (error.name === 'NotAllowedError') {
      return 'Mikrofonzugriff verweigert. Bitte erlauben Sie den Mikrofonzugriff und versuchen Sie es erneut.';
    } else if (error.name === 'NotFoundError') {
      return 'Kein Mikrofon gefunden. Bitte schließen Sie ein Mikrofon an und versuchen Sie es erneut.';
    } else if (error.name === 'NotSupportedError') {
      return 'Audio-Aufnahme wird in diesem Browser nicht unterstützt.';
    } else {
      return `Audio-Zugriffsfehler: ${error.message || 'Unbekannter Fehler'}`;
    }
  }

  // Optional callback for real-time audio processing (Component 2.1B will use this)
  onAudioChunk?: (chunk: Blob) => void;
}

// Singleton instance for global use following PROJECT_STANDARDS.md
export const audioService = new AudioCaptureService();