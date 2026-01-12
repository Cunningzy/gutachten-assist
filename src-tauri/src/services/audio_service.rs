// Audio processing service layer

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::models::whisper_model::WhisperModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMetadata {
    pub duration_seconds: f32,
    pub sample_rate: u32,
    pub channels: u16,
    pub format: String,
    pub bitrate: Option<u32>,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioProcessingOptions {
    pub language: Option<String>,
    pub enhance_quality: bool,
    pub noise_reduction: bool,
    pub medical_terminology_boost: bool,
}

pub struct AudioService {
    whisper_model: Option<WhisperModel>,
}

impl AudioService {
    /// Create a new AudioService instance
    pub fn new() -> Self {
        Self {
            whisper_model: None,
        }
    }
    
    /// Initialize the service with a Whisper model
    pub async fn initialize_with_model(&mut self, model: WhisperModel) -> Result<(), String> {
        if !model.is_ready() {
            return Err("Whisper model is not ready".to_string());
        }
        
        self.whisper_model = Some(model);
        Ok(())
    }
    
    /// Get metadata from an audio file
    pub async fn get_audio_metadata(&self, file_path: &PathBuf) -> Result<AudioMetadata, String> {
        if !file_path.exists() {
            return Err(format!("Audio file not found: {:?}", file_path));
        }
        
        let metadata = std::fs::metadata(file_path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        
        let extension = file_path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("unknown")
            .to_lowercase();
        
        // Mock metadata - in real implementation, would parse audio file
        Ok(AudioMetadata {
            duration_seconds: 120.5, // 2 minutes
            sample_rate: 16000,      // 16kHz (optimal for Whisper)
            channels: 1,             // Mono
            format: extension,
            bitrate: Some(128),      // 128 kbps
            file_size: metadata.len(),
        })
    }
    
    /// Validate audio file for processing
    pub async fn validate_audio_file(&self, file_path: &PathBuf) -> Result<bool, String> {
        // Check file exists
        if !file_path.exists() {
            return Err(format!("File does not exist: {:?}", file_path));
        }
        
        // Check file extension
        let extension = file_path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        let supported_formats = ["wav", "mp3", "m4a", "flac", "ogg", "webm"];
        if !supported_formats.contains(&extension.as_str()) {
            return Err(format!(
                "Unsupported format: {}. Supported: {:?}",
                extension, supported_formats
            ));
        }
        
        // Check file size
        let metadata = std::fs::metadata(file_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        const MAX_SIZE: u64 = 500 * 1024 * 1024; // 500MB max
        if metadata.len() > MAX_SIZE {
            return Err(format!(
                "File too large: {} MB (max: {} MB)",
                metadata.len() / 1024 / 1024,
                MAX_SIZE / 1024 / 1024
            ));
        }
        
        // Get audio metadata to validate it's a proper audio file
        let audio_meta = self.get_audio_metadata(file_path).await?;
        
        // Validate duration (max 4 hours for medical recordings)
        const MAX_DURATION: f32 = 4.0 * 60.0 * 60.0; // 4 hours in seconds
        if audio_meta.duration_seconds > MAX_DURATION {
            return Err(format!(
                "Audio too long: {:.1} minutes (max: {:.0} minutes)",
                audio_meta.duration_seconds / 60.0,
                MAX_DURATION / 60.0
            ));
        }
        
        Ok(true)
    }
    
    /// Preprocess audio for optimal Whisper processing
    pub async fn preprocess_audio(&self, file_path: &PathBuf, options: &AudioProcessingOptions) -> Result<PathBuf, String> {
        // Validate input
        self.validate_audio_file(file_path).await?;
        
        // For now, return the original file path
        // In real implementation, this would:
        // 1. Convert to optimal format (16kHz mono WAV)
        // 2. Apply noise reduction if requested
        // 3. Normalize audio levels
        // 4. Apply medical-specific audio enhancements
        
        Ok(file_path.clone())
    }
    
    /// Get recommended processing options for medical audio
    pub fn get_medical_processing_options() -> AudioProcessingOptions {
        AudioProcessingOptions {
            language: Some("de".to_string()), // German
            enhance_quality: true,
            noise_reduction: true,
            medical_terminology_boost: true,
        }
    }
    
    /// Check if the service is ready for processing
    pub fn is_ready(&self) -> bool {
        self.whisper_model.as_ref().map_or(false, |m| m.is_ready())
    }
    
    /// Get supported audio formats
    pub fn get_supported_formats() -> Vec<String> {
        vec![
            "wav".to_string(),
            "mp3".to_string(),
            "m4a".to_string(),
            "flac".to_string(),
            "ogg".to_string(),
            "webm".to_string(),
        ]
    }
}

impl Default for AudioService {
    fn default() -> Self {
        Self::new()
    }
}