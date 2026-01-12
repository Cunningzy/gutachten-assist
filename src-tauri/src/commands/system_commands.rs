// System information and health check commands

use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub available_memory: u64,
    pub total_memory: u64,
    pub platform: String,
    pub architecture: String,
    pub app_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryStatus {
    pub available_bytes: u64,
    pub used_by_models: u64,
    pub total_system: u64,
    pub percentage_used: f32,
}

/// Get comprehensive system information
#[command]
pub async fn system_info() -> Result<SystemInfo, String> {
    let available_memory = get_available_system_memory().await
        .map_err(|e| format!("Failed to get memory info: {}", e))?;
    
    let total_memory = get_total_system_memory().await
        .map_err(|e| format!("Failed to get total memory: {}", e))?;

    Ok(SystemInfo {
        available_memory,
        total_memory,
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        app_version: "2.0.0".to_string(),
    })
}

/// Get current memory usage status
#[command]
pub async fn get_system_memory() -> Result<MemoryStatus, String> {
    let available = get_available_system_memory().await
        .map_err(|e| format!("Memory check failed: {}", e))?;
    
    let total = get_total_system_memory().await
        .map_err(|e| format!("Total memory check failed: {}", e))?;
    
    let used_by_models = 0; // Will be updated when models are loaded
    let percentage_used = if total > 0 {
        ((total - available) as f32 / total as f32) * 100.0
    } else {
        0.0
    };

    Ok(MemoryStatus {
        available_bytes: available,
        used_by_models,
        total_system: total,
        percentage_used,
    })
}

/// Check if system meets minimum requirements for AI models
#[command]
pub async fn check_system_requirements() -> Result<bool, String> {
    let memory_info = get_system_memory().await?;
    
    // Minimum requirements: 4GB available memory
    const MIN_MEMORY_GB: u64 = 4 * 1024 * 1024 * 1024; // 4GB in bytes
    
    if memory_info.available_bytes < MIN_MEMORY_GB {
        return Ok(false);
    }
    
    Ok(true)
}

// Helper functions for platform-specific memory detection
async fn get_available_system_memory() -> Result<u64, anyhow::Error> {
    // Platform-specific implementation would go here
    // For now, return a conservative estimate for development
    #[cfg(target_os = "windows")]
    {
        // Windows-specific memory detection
        Ok(6_000_000_000) // 6GB available
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // Cross-platform fallback
        Ok(6_000_000_000)
    }
}

async fn get_total_system_memory() -> Result<u64, anyhow::Error> {
    // Platform-specific implementation
    #[cfg(target_os = "windows")]
    {
        // Windows-specific total memory detection
        Ok(8_000_000_000) // 8GB total
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // Cross-platform fallback
        Ok(8_000_000_000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_system_info_returns_valid_data() {
        let result = system_info().await;
        assert!(result.is_ok());
        
        let info = result.unwrap();
        assert!(!info.platform.is_empty());
        assert!(!info.architecture.is_empty());
        assert_eq!(info.app_version, "2.0.0");
        assert!(info.total_memory > 0);
        assert!(info.available_memory > 0);
    }

    #[tokio::test]
    async fn test_memory_status_calculations() {
        let result = get_system_memory().await;
        assert!(result.is_ok());
        
        let memory = result.unwrap();
        assert!(memory.total_system > 0);
        assert!(memory.available_bytes <= memory.total_system);
        assert!(memory.percentage_used >= 0.0 && memory.percentage_used <= 100.0);
    }

    #[tokio::test]
    async fn test_system_requirements_check() {
        let result = check_system_requirements().await;
        assert!(result.is_ok());
        
        // Should return true for systems with sufficient memory
        let meets_requirements = result.unwrap();
        assert!(meets_requirements); // Assuming test system has enough memory
    }
}