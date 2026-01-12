/**
 * Enhanced Audio Service for Professional Dictation
 * Supports real-time recording preview, correction, and professional workflow
 */

export interface AudioSettings {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: 'wav' | 'webm';
}

export interface RecordingSegment {
  id: string;
  blob: Blob;
  startTime: number;
  endTime: number;
  duration: number;
  url?: string;
}

export interface RecordingSession {
  id: string;
  segments: RecordingSegment[];
  totalDuration: number;
  isActive: boolean;
  currentPosition: number;
  name: string;
  timestamp: Date;
}

export interface AudioRecordingResult {
  session: RecordingSession;
  finalBlob: Blob;
  duration: number;
  size: number;
  format: string;
}

export class EnhancedAudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private currentSession: RecordingSession | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private isPaused = false;
  private recordingStartTime = 0;
  private segmentStartTime = 0;
  private recordingPosition = 0; // Current position in the recording (ms)

  // Real-time audio monitoring
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrame: number | null = null;
  private currentAudioLevel = 0;

  // Audio tape playback functionality
  private previewAudio: HTMLAudioElement | null = null;
  private isPreviewPlaying = false;
  private previewPosition = 0;

  // Enhanced settings for professional dictation
  private settings: AudioSettings = {
    sampleRate: 16000,  // Whisper optimal
    channels: 1,        // Mono for speech
    bitsPerSample: 16,  // 16-bit depth
    format: 'webm'      // Browser-compatible format
  };

  /**
   * Initialize enhanced audio service with professional dictation support
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('🎤 Initializing enhanced audio service for professional dictation...');

      // Request microphone access with optimal settings for dictation
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.settings.sampleRate,
          channelCount: this.settings.channels,
          autoGainControl: true,  // Automatic gain control for consistent volume
          noiseSuppression: true, // Reduce background noise
          echoCancellation: true  // Cancel echo for better quality
        }
      });

      // Initialize real-time audio monitoring
      await this.initializeAudioMonitoring();

      console.log('✅ Enhanced audio service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize enhanced audio service:', error);
      throw error;
    }
  }

  /**
   * Initialize real-time audio level monitoring
   */
  private async initializeAudioMonitoring(): Promise<void> {
    if (!this.stream) return;

    try {
      // Create audio context for real-time analysis
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();

      // Configure analyser for real-time level detection
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone stream to analyser
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      // Initialize data array for level calculation
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      console.log('🎵 Real-time audio monitoring initialized');
    } catch (error) {
      console.error('❌ Failed to initialize audio monitoring:', error);
    }
  }

  /**
   * Start a new recording session
   */
  async startRecording(): Promise<string> {
    if (!this.stream) {
      throw new Error('Audio service not initialized. Call initialize() first.');
    }

    try {
      // Create new recording session
      this.currentSession = {
        id: Date.now().toString(),
        segments: [],
        totalDuration: 0,
        isActive: true,
        currentPosition: 0,
        name: `Diktation ${Date.now()}`,
        timestamp: new Date()
      };

      // Setup media recorder with segment-based recording
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: this.settings.sampleRate * this.settings.bitsPerSample
      });

      this.audioChunks = [];
      this.recordingStartTime = Date.now();
      this.segmentStartTime = Date.now();
      this.recordingPosition = 0;

      // Handle data available events for real-time segments
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          // Create segment immediately when we get data (every 1000ms)
          this.createCurrentSegment();
        }
      };

      // Handle recording stop for final segment creation
      this.mediaRecorder.onstop = () => {
        // Create any remaining segment if there are leftover chunks
        if (this.audioChunks.length > 0) {
          this.createCurrentSegment();
        }
      };

      // Start recording with timeslice for real-time segments
      this.mediaRecorder.start(1000); // Create segments every 1 second
      this.isRecording = true;
      this.isPaused = false;

      console.log('🎤 Enhanced recording started with session:', this.currentSession.id);
      return this.currentSession.id;

    } catch (error) {
      console.error('❌ Failed to start enhanced recording:', error);
      throw error;
    }
  }

  /**
   * Pause recording (preserves current session for review)
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.recordingPosition += Date.now() - this.segmentStartTime;
      console.log('⏸️ Recording paused at position:', this.recordingPosition + 'ms');
    }
  }

  /**
   * Resume recording from current position
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.segmentStartTime = Date.now();
      this.isPaused = false;
      console.log('▶️ Recording resumed from position:', this.recordingPosition + 'ms');
    }
  }

  /**
   * Create a segment from current audio chunks
   */
  private createCurrentSegment(): void {
    if (this.audioChunks.length > 0 && this.currentSession) {
      const segmentBlob = new Blob(this.audioChunks, {
        type: this.getSupportedMimeType()
      });

      const segment: RecordingSegment = {
        id: `segment_${Date.now()}`,
        blob: segmentBlob,
        startTime: this.currentSession.totalDuration,
        endTime: this.currentSession.totalDuration + (Date.now() - this.segmentStartTime),
        duration: Date.now() - this.segmentStartTime,
        url: URL.createObjectURL(segmentBlob)
      };

      this.currentSession.segments.push(segment);
      this.currentSession.totalDuration = segment.endTime;
      this.audioChunks = [];

      // Reset segment start time for next segment
      this.segmentStartTime = Date.now();

      console.log('📼 Created recording segment:', segment.id, 'Duration:', segment.duration + 'ms');
    }
  }

  /**
   * Preview the current recording session without stopping
   * Returns a combined blob of all segments recorded so far
   */
  async previewCurrentRecording(): Promise<Blob | null> {
    if (!this.currentSession || this.currentSession.segments.length === 0) {
      return null;
    }

    try {
      // Temporarily pause if recording
      const wasRecording = this.isRecording && !this.isPaused;
      if (wasRecording) {
        this.pauseRecording();
      }

      // Combine all segments into a single blob for preview
      const segmentBlobs = this.currentSession.segments.map(segment => segment.blob);
      const combinedBlob = new Blob(segmentBlobs, {
        type: this.getSupportedMimeType()
      });

      console.log('👁️ Created preview blob:', combinedBlob.size + ' bytes');
      return combinedBlob;

    } catch (error) {
      console.error('❌ Failed to create preview:', error);
      return null;
    }
  }

  /**
   * Get a URL for previewing the current recording
   */
  async getPreviewUrl(): Promise<string | null> {
    const previewBlob = await this.previewCurrentRecording();
    if (previewBlob) {
      return URL.createObjectURL(previewBlob);
    }
    return null;
  }

  /**
   * Rewind to a specific position and start audio tape playback
   * This allows hearing what was recorded and then re-recording over it
   */
  async rewindAndPlay(secondsBack: number): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active recording session');
    }

    // Calculate new position
    const currentPos = this.recordingPosition;
    const newPosition = Math.max(0, currentPos - (secondsBack * 1000));

    // Pause current recording if active
    if (this.isRecording && !this.isPaused) {
      this.pauseRecording();
    }

    // Update position
    this.recordingPosition = newPosition;
    this.previewPosition = newPosition;

    // Create preview from current position and start playing
    await this.playFromPosition(newPosition);

    console.log(`⏪ Rewound ${secondsBack}s to position: ${newPosition}ms and started playback`);
  }

  /**
   * Play audio from a specific position (audio tape behavior)
   */
  async playFromPosition(positionMs: number): Promise<void> {
    try {
      // Create combined blob up to this position
      const previewBlob = await this.createPreviewUpToPosition(positionMs);
      if (!previewBlob) return;

      // Create audio element for playback
      if (this.previewAudio) {
        this.previewAudio.pause();
        URL.revokeObjectURL(this.previewAudio.src);
      }

      this.previewAudio = new Audio();
      this.previewAudio.src = URL.createObjectURL(previewBlob);

      // Calculate start time within the audio
      const playStartTime = Math.max(0, (positionMs / 1000) - 0.1); // Small offset for context
      this.previewAudio.currentTime = playStartTime;

      // Start playback
      await this.previewAudio.play();
      this.isPreviewPlaying = true;

      // Update preview position during playback
      this.previewAudio.addEventListener('timeupdate', () => {
        if (this.previewAudio) {
          this.previewPosition = (this.previewAudio.currentTime * 1000);
        }
      });

      this.previewAudio.addEventListener('ended', () => {
        this.isPreviewPlaying = false;
      });

      console.log(`▶️ Playing from position: ${positionMs}ms`);
    } catch (error) {
      console.error('❌ Failed to play from position:', error);
    }
  }

  /**
   * Pause preview playback
   */
  pausePreview(): void {
    if (this.previewAudio && this.isPreviewPlaying) {
      this.previewAudio.pause();
      this.isPreviewPlaying = false;
      console.log('⏸️ Preview playback paused');
    }
  }

  /**
   * Resume preview playback
   */
  resumePreview(): void {
    if (this.previewAudio && !this.isPreviewPlaying) {
      this.previewAudio.play();
      this.isPreviewPlaying = true;
      console.log('▶️ Preview playback resumed');
    }
  }

  /**
   * Start recording from current position (overlay recording)
   */
  async startOverlayRecording(): Promise<void> {
    if (!this.currentSession) return;

    // Stop any preview playback
    this.pausePreview();

    // Remove segments after current position (they will be overwritten)
    const keepSegments = this.currentSession.segments.filter(
      segment => segment.startTime < this.recordingPosition
    );

    const removedSegments = this.currentSession.segments.filter(
      segment => segment.startTime >= this.recordingPosition
    );

    // Clean up URLs for removed segments
    removedSegments.forEach(segment => {
      if (segment.url) {
        URL.revokeObjectURL(segment.url);
      }
    });

    // Update session
    this.currentSession.segments = keepSegments;
    this.currentSession.totalDuration = this.recordingPosition;

    // Resume recording from current position
    this.resumeRecording();

    console.log(`🎤 Started overlay recording from position: ${this.recordingPosition}ms`);
  }

  /**
   * Create preview blob up to a specific position
   */
  private async createPreviewUpToPosition(positionMs: number): Promise<Blob | null> {
    if (!this.currentSession || this.currentSession.segments.length === 0) {
      return null;
    }

    // Get segments up to the position
    const relevantSegments = this.currentSession.segments.filter(
      segment => segment.startTime < positionMs
    );

    if (relevantSegments.length === 0) return null;

    // Combine relevant segments
    const segmentBlobs = relevantSegments.map(segment => segment.blob);
    return new Blob(segmentBlobs, {
      type: this.getSupportedMimeType()
    });
  }

  /**
   * Stop recording and finalize the session
   */
  async stopRecording(): Promise<AudioRecordingResult | null> {
    if (!this.isRecording || !this.currentSession) {
      return null;
    }

    try {
      // Stop the media recorder
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }

      // Wait a moment for the final segment to be created
      await new Promise(resolve => setTimeout(resolve, 100));

      // Combine all segments into final recording
      const allSegmentBlobs = this.currentSession.segments.map(segment => segment.blob);
      const finalBlob = new Blob(allSegmentBlobs, {
        type: this.getSupportedMimeType()
      });

      // Mark session as complete
      this.currentSession.isActive = false;

      const result: AudioRecordingResult = {
        session: this.currentSession,
        finalBlob,
        duration: this.currentSession.totalDuration,
        size: finalBlob.size,
        format: this.settings.format
      };

      // Reset recording state
      this.isRecording = false;
      this.isPaused = false;
      this.currentSession = null;

      console.log('✅ Enhanced recording completed:', result.duration + 'ms');
      return result;

    } catch (error) {
      console.error('❌ Failed to stop enhanced recording:', error);
      throw error;
    }
  }

  /**
   * Get current recording status with enhanced information
   */
  getStatus(): {
    isRecording: boolean;
    isPaused: boolean;
    duration: number;
    position: number;
    segmentCount: number;
    sessionId: string | null;
    canPreview: boolean;
    audioLevel: number;
    isPreviewPlaying: boolean;
    previewPosition: number;
    settings: AudioSettings;
  } {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      duration: this.currentSession?.totalDuration || 0,
      position: this.recordingPosition,
      segmentCount: this.currentSession?.segments.length || 0,
      sessionId: this.currentSession?.id || null,
      canPreview: (this.currentSession?.segments.length || 0) > 0,
      audioLevel: this.currentAudioLevel,
      isPreviewPlaying: this.isPreviewPlaying,
      previewPosition: this.previewPosition,
      settings: this.settings
    };
  }

  /**
   * Get real-time audio level (0.0 to 1.0)
   */
  getAudioLevel(): number {
    if (!this.analyser || !this.dataArray) {
      return 0;
    }

    // Get frequency data
    this.analyser.getByteFrequencyData(this.dataArray! as any);

    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i];
    }

    const rms = Math.sqrt(sum / this.dataArray.length);
    this.currentAudioLevel = Math.min(1.0, rms / 128); // Normalize to 0-1

    return this.currentAudioLevel;
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    // Prioritize Tauri-compatible formats
    const types = [
      'audio/wav',           // Most compatible with Tauri
      'audio/mp4',           // H.264 audio, good compatibility
      'audio/webm;codecs=pcm', // PCM in WebM container
      'audio/webm',          // Basic WebM
      'audio/ogg;codecs=opus', // OGG container with Opus
      'audio/webm;codecs=opus' // Last resort - known to fail in Tauri playback
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`🎵 Enhanced audio service using MIME type: ${type}`);
        return type;
      }
    }

    console.warn('⚠️ No preferred MIME types supported, using fallback');
    return 'audio/webm'; // Fallback
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Stop any active recording
    if (this.isRecording) {
      await this.stopRecording();
    }

    // Stop preview playback
    if (this.previewAudio) {
      this.previewAudio.pause();
      URL.revokeObjectURL(this.previewAudio.src);
      this.previewAudio = null;
    }

    // Stop audio monitoring
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Clean up audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    // Clean up URLs in current session
    if (this.currentSession) {
      this.currentSession.segments.forEach(segment => {
        if (segment.url) {
          URL.revokeObjectURL(segment.url);
        }
      });
    }

    // Stop media tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.currentSession = null;

    console.log('🧹 Enhanced audio service cleaned up');
  }
}

// Export singleton instance
export const enhancedAudioService = new EnhancedAudioService();
export default enhancedAudioService;