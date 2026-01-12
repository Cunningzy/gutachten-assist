// Tauri API integration service for frontend-backend communication
// Force reload to check Tauri v2 API imports

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Type definitions for Tauri command responses
export interface SystemInfo {
  available_memory: number;
  total_memory: number;
  platform: string;
  architecture: string;
  app_version: string;
}

export interface MemoryStatus {
  available_bytes: number;
  used_by_models: number;
  total_system: number;
  percentage_used: number;
}

export interface ModelInfo {
  name: string;
  version: string;
  size_bytes: number;
  status: string;
  loaded: boolean;
  memory_usage: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  processing_time_ms: number;
  language: string;
  segments: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start_time: number;
  end_time: number;
  text: string;
  confidence: number;
}

export interface ModelLoadingEvent {
  progress: number;
  stage: string;
  message: string;
}

export interface AudioProcessingProgress {
  progress: number;
  stage: string;
  message: string;
}

/**
 * Tauri API service for seamless frontend-backend communication
 */
export class TauriApiService {
  private static instance: TauriApiService;
  private progressListeners: Map<string, ((event: any) => void)[]> = new Map();

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): TauriApiService {
    if (!TauriApiService.instance) {
      TauriApiService.instance = new TauriApiService();
    }
    return TauriApiService.instance;
  }

  // System Information Commands
  async getSystemInfo(): Promise<SystemInfo> {
    try {
      return await invoke<SystemInfo>('system_info');
    } catch (error) {
      throw new Error(`System info request failed: ${error}`);
    }
  }

  async getMemoryStatus(): Promise<MemoryStatus> {
    try {
      return await invoke<MemoryStatus>('get_system_memory');
    } catch (error) {
      throw new Error(`Memory status request failed: ${error}`);
    }
  }

  async checkSystemRequirements(): Promise<boolean> {
    try {
      return await invoke<boolean>('check_system_requirements');
    } catch (error) {
      console.error('System requirements check failed:', error);
      return false;
    }
  }

  // Model Management Commands
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      return await invoke<ModelInfo[]>('model_info');
    } catch (error) {
      throw new Error(`Model info request failed: ${error}`);
    }
  }

  async loadWhisperModel(): Promise<string> {
    try {
      return await invoke<string>('load_whisper_model');
    } catch (error) {
      throw new Error(`Whisper model loading failed: ${error}`);
    }
  }

  async cleanupModels(): Promise<string> {
    try {
      return await invoke<string>('cleanup_models');
    } catch (error) {
      throw new Error(`Model cleanup failed: ${error}`);
    }
  }

  // Audio Processing Commands
  async processAudioFile(filePath: string): Promise<TranscriptionResult> {
    try {
      return await invoke<TranscriptionResult>('process_audio_file', {
        filePath,
      });
    } catch (error) {
      throw new Error(`Audio processing failed: ${error}`);
    }
  }

  async saveAudioFile(audioData: Uint8Array, filePath: string): Promise<string> {
    try {
      return await invoke<string>('save_audio_file', {
        audioData: Array.from(audioData),
        filePath,
      });
    } catch (error) {
      throw new Error(`Audio file saving failed: ${error}`);
    }
  }

  async validateAudioFile(filePath: string): Promise<boolean> {
    try {
      return await invoke<boolean>('validate_audio_file', {
        filePath,
      });
    } catch (error) {
      console.error('Audio validation failed:', error);
      return false;
    }
  }

  // Event Listener Management
  private setupEventListeners(): void {
    // Listen for model loading progress
    listen<ModelLoadingEvent>('model_loading_progress', (event) => {
      this.notifyProgressListeners('model_loading', event.payload);
    });

    // Listen for audio processing progress
    listen<AudioProcessingProgress>('audio_processing_progress', (event) => {
      this.notifyProgressListeners('audio_processing', event.payload);
    });
  }

  public onProgress(eventType: 'model_loading' | 'audio_processing', callback: (event: any) => void): () => void {
    if (!this.progressListeners.has(eventType)) {
      this.progressListeners.set(eventType, []);
    }
    
    this.progressListeners.get(eventType)!.push(callback);

    // Return cleanup function
    return () => {
      const listeners = this.progressListeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private notifyProgressListeners(eventType: string, data: any): void {
    const listeners = this.progressListeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  // Utility Methods
  public isDesktop(): boolean {
    // For Tauri v2, check if the invoke function is available
    try {
      return typeof invoke === 'function';
    } catch (error) {
      return false;
    }
  }

  public async getAppVersion(): Promise<string> {
    try {
      const systemInfo = await this.getSystemInfo();
      return systemInfo.app_version;
    } catch (error) {
      return '2.0.0';
    }
  }

  // German Medical UI Helper Methods
  public formatMemorySize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  public formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }

  public translateModelStage(stage: string): string {
    const translations: Record<string, string> = {
      'initializing': 'Initialisierung...',
      'migrating': 'Migration...',
      'loading': 'Wird geladen...',
      'initializing_gpu': 'GPU-Initialisierung...',
      'finalizing': 'Wird finalisiert...',
      'completed': 'Abgeschlossen',
      'preprocessing': 'Vorverarbeitung...',
      'transcribing': 'Transkription läuft...',
      'postprocessing': 'Nachbearbeitung...',
    };

    return translations[stage] || stage;
  }
}

// Export singleton instance
export const tauriApi = TauriApiService.getInstance();

// Legacy API compatibility (for existing components)
export const systemInfo = () => tauriApi.getSystemInfo();
export const modelInfo = () => tauriApi.getAvailableModels();
export const loadWhisperModel = () => tauriApi.loadWhisperModel();
export const processAudioFile = (filePath: string) => tauriApi.processAudioFile(filePath);
export const validateAudioFile = (filePath: string) => tauriApi.validateAudioFile(filePath);
export const cleanupModels = () => tauriApi.cleanupModels();