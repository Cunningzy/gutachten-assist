// Simplified Llama commands that use the Python script directly
use tauri::command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;
use std::fs;
use std::io::Write;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GrammarCorrectionResponse {
    pub corrected_text: String,
    pub changes_made: Vec<String>,
    pub confidence: f32,
    pub processing_time_ms: u64,
}

/// Check if Llama model exists
#[command]
pub async fn get_llama_model_info() -> Result<Value, String> {
    let model_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\llama-3.1-8b-instruct-q4_k_m.gguf");

    let exists = model_path.exists();
    let status = if exists { "downloaded" } else { "not_downloaded" };

    let size_mb = if exists {
        fs::metadata(&model_path)
            .map(|m| (m.len() / (1024 * 1024)) as u32)
            .unwrap_or(0)
    } else {
        0
    };

    Ok(serde_json::json!({
        "status": status,
        "model_path": model_path.to_string_lossy(),
        "size_mb": size_mb,
        "model_name": "Llama 3.1 8B Instruct",
        "quantization": "Q4_K_M"
    }))
}

/// Check if model is ready (file exists)
#[command]
pub async fn is_llama_model_ready() -> Result<bool, String> {
    let model_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\llama-3.1-8b-instruct-q4_k_m.gguf");
    Ok(model_path.exists())
}

/// Download model (not implemented - model should already exist)
#[command]
pub async fn download_llama_model() -> Result<Value, String> {
    Err("Model download not implemented. Please download Llama 3.1 8B manually.".to_string())
}

/// Load model (not needed for Python script approach)
#[command]
pub async fn load_llama_model() -> Result<Value, String> {
    Ok(serde_json::json!({
        "success": true,
        "message": "Model ready (uses Python script)"
    }))
}

/// Correct German grammar using Python script
#[command]
pub async fn correct_german_grammar(
    text: String,
    preserve_style: Option<bool>,
) -> Result<GrammarCorrectionResponse, String> {
    println!("Correcting German grammar (length: {} chars)", text.len());

    // Save text to temporary file
    let temp_dir = std::env::temp_dir();
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let text_file = temp_dir.join(format!("llama_input_{}.txt", timestamp));

    // Write with explicit UTF-8 BOM for Windows compatibility
    let mut file = fs::File::create(&text_file)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(text.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Call Python script - using llama_venv_gpu which has llama-cpp-python installed
    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_grammar_correct.py";

    let output = Command::new(python_exe)
        .arg(script_path)
        .arg(&text_file)
        .arg("json")
        .env("PYTHONIOENCODING", "utf-8")  // Force UTF-8 output on Windows
        .output()
        .map_err(|e| format!("Failed to run Python script: {}", e))?;

    // Clean up temp file
    let _ = fs::remove_file(&text_file);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python script failed: {}", stderr));
    }

    // Parse stdout as UTF-8 (Python outputs UTF-8 encoded JSON)
    let stdout = String::from_utf8(output.stdout.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).into_owned());

    // Parse JSON response
    let json_result: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {} - stdout: {}", e, stdout))?;

    // Extract data
    let corrected_text = json_result.get("corrected_text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let processing_time_ms = json_result.get("processing_time_ms")
        .and_then(|t| t.as_u64())
        .unwrap_or(0);

    let confidence = json_result.get("confidence")
        .and_then(|c| c.as_f64())
        .unwrap_or(0.0) as f32;

    // Extract corrections as changes_made
    let changes_made: Vec<String> = json_result.get("corrections")
        .and_then(|c| c.as_array())
        .map(|corrections| {
            corrections.iter().filter_map(|correction| {
                Some(format!("{} → {}",
                    correction.get("original")?.as_str()?,
                    correction.get("corrected")?.as_str()?
                ))
            }).collect()
        })
        .unwrap_or_default();

    Ok(GrammarCorrectionResponse {
        corrected_text,
        changes_made,
        confidence,
        processing_time_ms,
    })
}
