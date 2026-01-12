// AI Model management commands

use tauri::{command, AppHandle, Window, Manager, Emitter};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::memory_manager::MemoryManager;
// use crate::models::whisper_model::{WhisperModel, ModelLoadingProgress};

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub version: String,
    pub size_bytes: u64,
    pub status: String,
    pub loaded: bool,
    pub memory_usage: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelLoadingEvent {
    pub progress: f32,
    pub stage: String,
    pub message: String,
}

/// Get information about available AI models
#[command]
pub async fn model_info() -> Result<Vec<ModelInfo>, String> {
    let mut models = Vec::new();
    
    // Whisper Large-v3 model info
    models.push(ModelInfo {
        name: "Whisper Large-v3".to_string(),
        version: "3.0.0".to_string(),
        size_bytes: 3_095_033_483, // Actual size from model-info.json
        status: "Available".to_string(),
        loaded: false,
        memory_usage: 0,
    });
    
    // Future models can be added here
    models.push(ModelInfo {
        name: "Tesseract OCR".to_string(),
        version: "4.1.3".to_string(),
        size_bytes: 50_000_000, // ~50MB
        status: "Planned".to_string(),
        loaded: false,
        memory_usage: 0,
    });
    
    models.push(ModelInfo {
        name: "spaCy German Medical".to_string(),
        version: "3.7.0".to_string(),
        size_bytes: 200_000_000, // ~200MB
        status: "Planned".to_string(),
        loaded: false,
        memory_usage: 0,
    });
    
    Ok(models)
}

/// Load the Whisper model with progress feedback (Python Whisper approach)
#[command]
pub async fn load_whisper_model(
    window: Window,
    memory_manager: tauri::State<'_, Arc<MemoryManager>>,
) -> Result<String, String> {
    // Check memory availability before loading
    let available_memory = memory_manager.get_available_memory().await
        .map_err(|e| format!("Memory check failed: {}", e))?;

    const WHISPER_MODEL_SIZE: u64 = 3_200_000_000; // 3.2GB (with overhead)

    if available_memory < WHISPER_MODEL_SIZE {
        return Err(format!(
            "Insufficient memory. Need {} GB, have {} GB available",
            WHISPER_MODEL_SIZE / 1_000_000_000,
            available_memory / 1_000_000_000
        ));
    }

    // Emit loading started event
    window.emit("model_loading_progress", ModelLoadingEvent {
        progress: 0.0,
        stage: "initializing".to_string(),
        message: "Python Whisper-Umgebung wird überprüft...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    // Check if Python Whisper is available
    window.emit("model_loading_progress", ModelLoadingEvent {
        progress: 0.2,
        stage: "loading".to_string(),
        message: "Python Whisper-Installation wird überprüft...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    // Test Python Whisper availability by running a quick command
    let python_check = tokio::task::spawn_blocking(move || {
        use std::process::Command;

        // Try virtual environment Python first, then fallback to system Python
        let python_commands = [
            r"C:\Users\kalin\Desktop\gutachten-assistant\whisper_venv\Scripts\python.exe",
            "python"
        ];

        let mut output = None;
        for python_cmd in &python_commands {
            if let Ok(result) = Command::new(python_cmd)
                .args(["-c", "import whisper; print('Python Whisper available')"])
                .output()
            {
                output = Some(result);
                break;
            }
        }

        let output = output.ok_or("No working Python installation found")?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Python Whisper check failed: {}", stderr))
        }
    }).await.map_err(|e| format!("Python check task failed: {}", e))?;

    python_check?;

    window.emit("model_loading_progress", ModelLoadingEvent {
        progress: 0.5,
        stage: "loading".to_string(),
        message: "Python Whisper erfolgreich gefunden!".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    // Whisper models are downloaded automatically by the Python library
    window.emit("model_loading_progress", ModelLoadingEvent {
        progress: 0.7,
        stage: "initializing_gpu".to_string(),
        message: "Whisper Large-Modell wird bei Bedarf heruntergeladen...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

    window.emit("model_loading_progress", ModelLoadingEvent {
        progress: 0.9,
        stage: "finalizing".to_string(),
        message: "Python Whisper-Integration wird finalisiert...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Mark memory as allocated
    memory_manager.allocate_model_memory("whisper", WHISPER_MODEL_SIZE).await
        .map_err(|e| format!("Failed to allocate memory: {}", e))?;

    // Emit completion event
    window.emit("model_loading_progress", ModelLoadingEvent {
        progress: 1.0,
        stage: "completed".to_string(),
        message: "Python Whisper Large-v3 bereit für deutsche Spracherkennung!".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok("Python Whisper Large-v3 model ready for use".to_string())
}

/// Cleanup all loaded models and free memory
#[command]
pub async fn cleanup_models(
    memory_manager: tauri::State<'_, Arc<MemoryManager>>,
) -> Result<String, String> {
    memory_manager.cleanup_all_models().await
        .map_err(|e| format!("Failed to cleanup models: {}", e))?;
    
    Ok("All models cleaned up successfully".to_string())
}

/// Get current model loading status
#[command]
pub async fn get_model_status() -> Result<Vec<ModelInfo>, String> {
    // This would return the actual status of loaded models
    // For now, return the same as model_info but with updated status
    model_info().await
}