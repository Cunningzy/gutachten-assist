// Model management service layer

use std::sync::Arc;
use std::collections::HashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::models::{WhisperModel, OcrModel, NlpModel};
use crate::memory_manager::MemoryManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelStatus {
    pub name: String,
    pub version: String,
    pub loaded: bool,
    pub memory_usage: u64,
    pub loading_progress: f32,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelServiceStats {
    pub total_models: usize,
    pub loaded_models: usize,
    pub total_memory_usage: u64,
    pub available_memory: u64,
    pub models: Vec<ModelStatus>,
}

pub struct ModelService {
    whisper_model: Arc<RwLock<Option<WhisperModel>>>,
    ocr_model: Arc<RwLock<Option<OcrModel>>>,
    nlp_model: Arc<RwLock<Option<NlpModel>>>,
    memory_manager: Arc<MemoryManager>,
    model_stats: Arc<RwLock<HashMap<String, ModelStatus>>>,
}

impl ModelService {
    /// Create a new ModelService instance
    pub fn new(memory_manager: Arc<MemoryManager>) -> Self {
        Self {
            whisper_model: Arc::new(RwLock::new(None)),
            ocr_model: Arc::new(RwLock::new(None)),
            nlp_model: Arc::new(RwLock::new(None)),
            memory_manager,
            model_stats: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Initialize all available models (without loading them)
    pub async fn initialize_models(&self) -> Result<(), String> {
        let mut stats = self.model_stats.write();
        
        // Initialize Whisper model
        let whisper = WhisperModel::default();
        stats.insert("whisper".to_string(), ModelStatus {
            name: "Whisper Large-v3".to_string(),
            version: whisper.version.clone(),
            loaded: false,
            memory_usage: 0,
            loading_progress: 0.0,
            last_used: None,
        });
        
        // Initialize OCR model
        let ocr = OcrModel::default();
        stats.insert("ocr".to_string(), ModelStatus {
            name: "Tesseract OCR".to_string(),
            version: ocr.version.clone(),
            loaded: false,
            memory_usage: 0,
            loading_progress: 0.0,
            last_used: None,
        });
        
        // Initialize NLP model
        let nlp = NlpModel::default();
        stats.insert("nlp".to_string(), ModelStatus {
            name: "spaCy German Medical".to_string(),
            version: nlp.version.clone(),
            loaded: false,
            memory_usage: 0,
            loading_progress: 0.0,
            last_used: None,
        });
        
        Ok(())
    }
    
    /// Load the Whisper model
    pub async fn load_whisper_model(&self) -> Result<(), String> {
        // Check if already loaded
        {
            let model_lock = self.whisper_model.read();
            if let Some(model) = model_lock.as_ref() {
                if model.is_ready() {
                    return Ok(());
                }
            }
        }
        
        // Check memory availability
        let available_memory = self.memory_manager.get_available_memory().await
            .map_err(|e| format!("Memory check failed: {}", e))?;
        
        let mut whisper = WhisperModel::default();
        const WHISPER_MEMORY_REQUIREMENT: u64 = 3_300_000_000; // 3.3GB with overhead
        
        if available_memory < WHISPER_MEMORY_REQUIREMENT {
            return Err(format!(
                "Insufficient memory for Whisper model. Need {} GB, have {} GB available",
                WHISPER_MEMORY_REQUIREMENT / 1_000_000_000,
                available_memory / 1_000_000_000
            ));
        }
        
        // Load the model
        whisper.load(available_memory).await
            .map_err(|e| format!("Failed to load Whisper model: {}", e))?;
        
        // Allocate memory in manager
        self.memory_manager.allocate_model_memory("whisper", WHISPER_MEMORY_REQUIREMENT).await
            .map_err(|e| format!("Failed to allocate memory: {}", e))?;
        
        // Update model storage
        {
            let mut model_lock = self.whisper_model.write();
            *model_lock = Some(whisper);
        }
        
        // Update stats
        self.update_model_status("whisper", true, WHISPER_MEMORY_REQUIREMENT, 1.0).await;
        
        Ok(())
    }
    
    /// Unload the Whisper model
    pub async fn unload_whisper_model(&self) -> Result<(), String> {
        {
            let mut model_lock = self.whisper_model.write();
            if let Some(mut model) = model_lock.take() {
                model.unload().await
                    .map_err(|e| format!("Failed to unload Whisper model: {}", e))?;
            }
        }
        
        // Deallocate memory
        self.memory_manager.deallocate_model_memory("whisper").await
            .map_err(|e| format!("Failed to deallocate memory: {}", e))?;
        
        // Update stats
        self.update_model_status("whisper", false, 0, 0.0).await;
        
        Ok(())
    }
    
    /// Get the current status of all models
    pub async fn get_model_service_stats(&self) -> ModelServiceStats {
        let stats = self.model_stats.read();
        let models: Vec<ModelStatus> = stats.values().cloned().collect();
        
        let loaded_models = models.iter().filter(|m| m.loaded).count();
        let total_memory_usage = models.iter().map(|m| m.memory_usage).sum();
        let available_memory = self.memory_manager.get_available_memory().await.unwrap_or(0);
        
        ModelServiceStats {
            total_models: models.len(),
            loaded_models,
            total_memory_usage,
            available_memory,
            models,
        }
    }
    
    /// Check if a specific model is loaded and ready
    pub async fn is_model_ready(&self, model_name: &str) -> bool {
        match model_name.to_lowercase().as_str() {
            "whisper" => {
                let model_lock = self.whisper_model.read();
                model_lock.as_ref().map_or(false, |m| m.is_ready())
            }
            "ocr" => {
                let model_lock = self.ocr_model.read();
                model_lock.as_ref().map_or(false, |m| m.is_ready())
            }
            "nlp" => {
                let model_lock = self.nlp_model.read();
                model_lock.as_ref().map_or(false, |m| m.is_ready())
            }
            _ => false,
        }
    }
    
    /// Get a list of available models
    pub async fn get_available_models(&self) -> Vec<String> {
        vec![
            "whisper".to_string(),
            "ocr".to_string(),
            "nlp".to_string(),
        ]
    }
    
    /// Cleanup all loaded models
    pub async fn cleanup_all_models(&self) -> Result<(), String> {
        // Unload all models
        let _ = self.unload_whisper_model().await;
        
        // Clear model storage
        {
            let mut whisper_lock = self.whisper_model.write();
            *whisper_lock = None;
            
            let mut ocr_lock = self.ocr_model.write();
            *ocr_lock = None;
            
            let mut nlp_lock = self.nlp_model.write();
            *nlp_lock = None;
        }
        
        // Cleanup memory manager
        self.memory_manager.cleanup_all_models().await
            .map_err(|e| format!("Failed to cleanup memory: {}", e))?;
        
        // Reset stats
        {
            let mut stats = self.model_stats.write();
            for status in stats.values_mut() {
                status.loaded = false;
                status.memory_usage = 0;
                status.loading_progress = 0.0;
            }
        }
        
        Ok(())
    }
    
    /// Update model status in stats
    async fn update_model_status(&self, model_name: &str, loaded: bool, memory_usage: u64, progress: f32) {
        let mut stats = self.model_stats.write();
        if let Some(status) = stats.get_mut(model_name) {
            status.loaded = loaded;
            status.memory_usage = memory_usage;
            status.loading_progress = progress;
            if loaded {
                status.last_used = Some(chrono::Utc::now().to_rfc3339());
            }
        }
    }
    
    /// Get memory usage recommendations
    pub async fn get_memory_recommendations(&self) -> Vec<String> {
        let available = self.memory_manager.get_available_memory().await.unwrap_or(0);
        let mut recommendations = Vec::new();
        
        if available < 1_000_000_000 {  // Less than 1GB
            recommendations.push("Consider closing other applications to free memory".to_string());
            recommendations.push("Only load essential models".to_string());
        } else if available < 3_000_000_000 {  // Less than 3GB
            recommendations.push("Memory is limited. Consider loading models one at a time".to_string());
        } else {
            recommendations.push("Memory is sufficient for all AI models".to_string());
        }
        
        recommendations
    }
}

impl Default for ModelService {
    fn default() -> Self {
        Self::new(Arc::new(MemoryManager::new()))
    }
}