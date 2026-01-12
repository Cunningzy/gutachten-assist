import { invoke } from '@tauri-apps/api/core';

export interface GrammarCorrectionRequest {
  text: string;
  preserve_style?: boolean;
  language?: string;
}

export interface GrammarCorrectionResponse {
  corrected_text: string;
  changes_made: string[];
  confidence: number;
  processing_time_ms: number;
}

export interface LlamaModelInfo {
  status: 'not_downloaded' | 'downloaded' | 'loaded';
  model_path: string;
  size_mb: number;
  model_name?: string;
  quantization?: string;
}

export class LlamaService {
  /**
   * Download Llama 3.1 8B model for German grammar correction
   */
  static async downloadModel(): Promise<{ success: boolean; message: string }> {
    try {
      const result = await invoke('download_llama_model');
      return result as { success: boolean; message: string };
    } catch (error) {
      console.error('Failed to download Llama model:', error);
      throw new Error(`Download failed: ${error}`);
    }
  }

  /**
   * Load Llama model into memory
   */
  static async loadModel(): Promise<{ success: boolean; message: string }> {
    try {
      const result = await invoke('load_llama_model');
      return result as { success: boolean; message: string };
    } catch (error) {
      console.error('Failed to load Llama model:', error);
      throw new Error(`Load failed: ${error}`);
    }
  }

  /**
   * Correct German grammar while preserving style
   */
  static async correctGrammar(
    text: string,
    preserveStyle: boolean = true
  ): Promise<GrammarCorrectionResponse> {
    try {
      const result = await invoke('correct_german_grammar', {
        text,
        preserve_style: preserveStyle
      });
      return result as GrammarCorrectionResponse;
    } catch (error) {
      console.error('Grammar correction failed:', error);
      throw new Error(`Grammar correction failed: ${error}`);
    }
  }

  /**
   * Get Llama model information and status
   */
  static async getModelInfo(): Promise<LlamaModelInfo> {
    try {
      const result = await invoke('get_llama_model_info');
      return result as LlamaModelInfo;
    } catch (error) {
      console.error('Failed to get model info:', error);
      throw new Error(`Failed to get model info: ${error}`);
    }
  }

  /**
   * Check if Llama model is ready for use
   */
  static async isModelReady(): Promise<boolean> {
    try {
      const result = await invoke('is_llama_model_ready');
      return result as boolean;
    } catch (error) {
      console.error('Failed to check model readiness:', error);
      return false;
    }
  }

  /**
   * Initialize Llama model (download + load)
   */
  static async initializeModel(
    onProgress?: (step: string, progress: number) => void
  ): Promise<void> {
    try {
      // Check if model is already ready
      const isReady = await this.isModelReady();
      if (isReady) {
        onProgress?.('Model bereits geladen', 100);
        return;
      }

      // Get current model info
      const modelInfo = await this.getModelInfo();

      // Download if needed
      if (modelInfo.status === 'not_downloaded') {
        onProgress?.('Lade Llama 3.1 8B Modell herunter...', 10);
        await this.downloadModel();
        onProgress?.('Download abgeschlossen', 50);
      }

      // Load model into memory
      if (modelInfo.status !== 'loaded') {
        onProgress?.('Lade Modell in Arbeitsspeicher...', 75);
        await this.loadModel();
        onProgress?.('Modell bereit für Grammatikkorrektur', 100);
      }
    } catch (error) {
      console.error('Failed to initialize Llama model:', error);
      throw error;
    }
  }

  /**
   * Format model size for display
   */
  static formatModelSize(sizeInMB: number): string {
    if (sizeInMB < 1024) {
      return `${sizeInMB} MB`;
    } else {
      return `${(sizeInMB / 1024).toFixed(1)} GB`;
    }
  }

  /**
   * Estimate processing time based on text length
   */
  static estimateProcessingTime(textLength: number): number {
    // Rough estimate: ~100 characters per second
    return Math.max(1, Math.ceil(textLength / 100));
  }
}