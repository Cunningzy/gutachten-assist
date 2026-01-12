// Memory management system for large AI models

use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MemoryManagerError {
    #[error("Insufficient memory: need {required} bytes, have {available} bytes")]
    InsufficientMemory { required: u64, available: u64 },
    
    #[error("Model {name} is not allocated")]
    ModelNotAllocated { name: String },
    
    #[error("Memory allocation failed: {message}")]
    AllocationFailed { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryUsage {
    pub total_allocated: u64,
    pub models: HashMap<String, u64>,
    pub available_system: u64,
    pub percentage_used: f32,
}

#[derive(Debug)]
struct ModelMemoryInfo {
    size: u64,
    allocated_at: chrono::DateTime<chrono::Utc>,
}

/// Memory manager for handling large AI model allocations
pub struct MemoryManager {
    allocated_models: Arc<RwLock<HashMap<String, ModelMemoryInfo>>>,
    max_memory_limit: u64,
}

impl MemoryManager {
    /// Create a new memory manager
    pub fn new() -> Self {
        // Set conservative memory limit (6GB for models)
        const MAX_MODEL_MEMORY: u64 = 6 * 1024 * 1024 * 1024; // 6GB
        
        Self {
            allocated_models: Arc::new(RwLock::new(HashMap::new())),
            max_memory_limit: MAX_MODEL_MEMORY,
        }
    }
    
    /// Check available memory for AI models
    pub async fn get_available_memory(&self) -> Result<u64, MemoryManagerError> {
        let allocated = self.get_total_allocated().await;
        
        if allocated > self.max_memory_limit {
            return Ok(0);
        }
        
        Ok(self.max_memory_limit - allocated)
    }
    
    /// Get total memory allocated to models
    pub async fn get_total_allocated(&self) -> u64 {
        let models = self.allocated_models.read();
        models.values().map(|info| info.size).sum()
    }
    
    /// Allocate memory for a model
    pub async fn allocate_model_memory(&self, model_name: &str, size: u64) -> Result<(), MemoryManagerError> {
        let available = self.get_available_memory().await?;
        
        if size > available {
            return Err(MemoryManagerError::InsufficientMemory {
                required: size,
                available,
            });
        }
        
        let mut models = self.allocated_models.write();
        models.insert(
            model_name.to_string(),
            ModelMemoryInfo {
                size,
                allocated_at: chrono::Utc::now(),
            },
        );
        
        println!("Allocated {} bytes for model '{}'", size, model_name);
        Ok(())
    }
    
    /// Deallocate memory for a model
    pub async fn deallocate_model_memory(&self, model_name: &str) -> Result<(), MemoryManagerError> {
        let mut models = self.allocated_models.write();
        
        if let Some(info) = models.remove(model_name) {
            println!("Deallocated {} bytes for model '{}'", info.size, model_name);
            Ok(())
        } else {
            Err(MemoryManagerError::ModelNotAllocated {
                name: model_name.to_string(),
            })
        }
    }
    
    /// Get current memory usage statistics
    pub async fn get_memory_usage(&self) -> MemoryUsage {
        let models = self.allocated_models.read();
        let total_allocated = models.values().map(|info| info.size).sum();
        
        let model_map: HashMap<String, u64> = models
            .iter()
            .map(|(name, info)| (name.clone(), info.size))
            .collect();
        
        let percentage_used = if self.max_memory_limit > 0 {
            (total_allocated as f32 / self.max_memory_limit as f32) * 100.0
        } else {
            0.0
        };
        
        MemoryUsage {
            total_allocated,
            models: model_map,
            available_system: self.max_memory_limit.saturating_sub(total_allocated),
            percentage_used,
        }
    }
    
    /// Check if there's enough memory to load a specific model
    pub async fn can_allocate(&self, size: u64) -> bool {
        match self.get_available_memory().await {
            Ok(available) => size <= available,
            Err(_) => false,
        }
    }
    
    /// Cleanup all allocated models
    pub async fn cleanup_all_models(&self) -> Result<(), MemoryManagerError> {
        let mut models = self.allocated_models.write();
        let total_freed: u64 = models.values().map(|info| info.size).sum();
        
        models.clear();
        
        println!("Cleaned up all models, freed {} bytes", total_freed);
        Ok(())
    }
    
    /// Get list of currently allocated models
    pub async fn get_allocated_models(&self) -> Vec<String> {
        let models = self.allocated_models.read();
        models.keys().cloned().collect()
    }
    
    /// Force garbage collection and optimization
    pub async fn optimize_memory(&self) -> Result<u64, MemoryManagerError> {
        // In a real implementation, this would:
        // 1. Run garbage collection
        // 2. Defragment memory if needed
        // 3. Optimize model loading order
        
        let usage = self.get_memory_usage().await;
        println!("Memory optimization complete. Using {} bytes", usage.total_allocated);
        
        Ok(usage.available_system)
    }
}

impl Default for MemoryManager {
    fn default() -> Self {
        Self::new()
    }
}

// Helper functions for system memory detection
#[cfg(target_os = "windows")]
pub fn get_system_memory_info() -> (u64, u64) {
    // Windows-specific memory detection would go here
    // For now, return reasonable defaults
    (8 * 1024 * 1024 * 1024, 6 * 1024 * 1024 * 1024) // (8GB total, 6GB available)
}

#[cfg(not(target_os = "windows"))]
pub fn get_system_memory_info() -> (u64, u64) {
    // Cross-platform fallback
    (8 * 1024 * 1024 * 1024, 6 * 1024 * 1024 * 1024)
}