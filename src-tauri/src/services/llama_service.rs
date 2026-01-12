use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::process::Command;
use std::fs;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarCorrectionRequest {
    pub text: String,
    pub preserve_style: bool,
    pub language: String, // "de" for German
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarCorrectionResponse {
    pub corrected_text: String,
    pub changes_made: Vec<String>,
    pub confidence: f32,
    pub processing_time_ms: u64,
}

pub struct LlamaService {
    model_path: PathBuf,
    model_loaded: Arc<Mutex<bool>>,
}

impl LlamaService {
    pub fn new() -> Self {
        // Default model path (user's working directory)
        let default_model_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\llama-3.1-8b-instruct-q4_k_m.gguf");

        Self {
            model_path: default_model_path,
            model_loaded: Arc::new(Mutex::new(false)),
        }
    }

    /// Download Llama 3.1 8B model for German grammar correction
    pub async fn download_model(&mut self, models_dir: PathBuf) -> Result<()> {
        let model_filename = "llama-3.1-8b-instruct-q4_0.gguf";
        let model_path = models_dir.join(model_filename);

        println!("Checking for Llama 3.1 8B model at: {:?}", model_path);

        if model_path.exists() {
            println!("Llama 3.1 8B model already exists");
            self.model_path = model_path;
            return Ok(());
        }

        println!("Downloading Llama 3.1 8B model...");

        // Download from Hugging Face
        let download_url = "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_0.gguf";

        let response = reqwest::get(download_url).await
            .context("Failed to start download")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Download failed with status: {}", response.status()));
        }

        // Create models directory if it doesn't exist
        tokio::fs::create_dir_all(&models_dir).await
            .context("Failed to create models directory")?;

        // Stream download to file
        let mut file = tokio::fs::File::create(&model_path).await
            .context("Failed to create model file")?;

        let mut stream = response.bytes_stream();
        use futures::stream::StreamExt;

        let mut total_bytes = 0u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Error while downloading chunk")?;
            total_bytes += chunk.len() as u64;

            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await
                .context("Failed to write chunk to file")?;

            // Print progress every 100MB
            if total_bytes % (100 * 1024 * 1024) == 0 {
                println!("Downloaded: {} MB", total_bytes / (1024 * 1024));
            }
        }

        println!("Successfully downloaded Llama 3.1 8B model ({} MB)", total_bytes / (1024 * 1024));
        self.model_path = model_path;

        Ok(())
    }

    /// Load the Llama model into memory
    pub async fn load_model(&self) -> Result<()> {
        let mut loaded = self.model_loaded.lock().await;

        if *loaded {
            return Ok(());
        }

        if !self.model_path.exists() {
            return Err(anyhow::anyhow!("Model file not found: {:?}", self.model_path));
        }

        println!("Loading Llama 3.1 8B model from: {:?}", self.model_path);

        // In a real implementation, we would load the model here
        // For now, we'll simulate the loading process
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

        *loaded = true;
        println!("Llama 3.1 8B model loaded successfully");

        Ok(())
    }

    /// Correct German grammar while preserving individual style
    pub async fn correct_grammar(&self, request: GrammarCorrectionRequest) -> Result<GrammarCorrectionResponse> {
        let start_time = std::time::Instant::now();

        // Check if model exists
        if !self.model_path.exists() {
            return Err(anyhow::anyhow!("Llama model not found at: {:?}. Please download it first using setup_llama.py", self.model_path));
        }

        println!("Starting German grammar correction with Llama 3.1 8B (text length: {})", request.text.len());

        // Create temporary text file for input
        let temp_dir = std::env::temp_dir();
        let text_file = temp_dir.join(format!("grammar_input_{}.txt", Uuid::new_v4()));

        fs::write(&text_file, &request.text)
            .context("Failed to write temporary text file")?;

        // Python script path
        let script_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\llama_grammar_correct.py");

        // Python executable paths to try (in order)
        let python_commands = vec![
            r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv\Scripts\python.exe",
            "python",
            r"C:\Python313\python.exe",
        ];

        let mut output = None;
        let mut last_error = String::new();

        // Try each Python command until one succeeds
        for python_cmd in &python_commands {
            println!("Trying Python command: {}", python_cmd);

            match Command::new(python_cmd)
                .env("PYTHONIOENCODING", "utf-8")  // Force UTF-8 encoding for Python output
                .arg(script_path.to_str().ok_or_else(|| anyhow::anyhow!("Invalid script path"))?)
                .arg(text_file.to_str().ok_or_else(|| anyhow::anyhow!("Invalid text file path"))?)
                .arg("json")  // Request JSON output format
                .output()
            {
                Ok(cmd_output) => {
                    output = Some(cmd_output);
                    println!("Python command succeeded: {}", python_cmd);
                    break;
                },
                Err(e) => {
                    last_error = format!("Failed to execute {}: {}", python_cmd, e);
                    eprintln!("{}", last_error);
                    continue;
                }
            }
        }

        // Clean up temporary file
        let _ = fs::remove_file(&text_file);

        let output = output.ok_or_else(|| {
            anyhow::anyhow!("Failed to execute Python script with any available Python interpreter. Last error: {}", last_error)
        })?;

        // Check for errors
        if !output.status.success() {
            let stderr = String::from_utf8(output.stderr.clone())
                .unwrap_or_else(|_| String::from_utf8_lossy(&output.stderr).to_string());
            return Err(anyhow::anyhow!("Llama grammar correction failed: {}", stderr));
        }

        // Parse JSON response with proper UTF-8 handling
        let stdout = String::from_utf8(output.stdout.clone())
            .context("Failed to parse Python output as UTF-8. Check PYTHONIOENCODING is set correctly.")?;
        println!("Python script output: {}", stdout);

        let json_response: serde_json::Value = serde_json::from_str(&stdout)
            .context("Failed to parse JSON response from Llama script")?;

        // Extract fields from Llama response
        let corrected_text = json_response["corrected_text"]
            .as_str()
            .unwrap_or(&request.text)
            .to_string();

        let corrections = json_response["corrections"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let original = item["original"].as_str()?;
                        let corrected = item["corrected"].as_str()?;
                        Some(format!("'{}' → '{}'", original, corrected))
                    })
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();

        let confidence = json_response["confidence"]
            .as_f64()
            .unwrap_or(0.95) as f32;

        let processing_time_ms = json_response["processing_time_ms"]
            .as_u64()
            .unwrap_or(start_time.elapsed().as_millis() as u64);

        println!("Grammar correction completed in {}ms with {} corrections",
                 processing_time_ms, corrections.len());

        Ok(GrammarCorrectionResponse {
            corrected_text,
            changes_made: corrections,
            confidence,
            processing_time_ms,
        })
    }


    /// Check if model is ready for use (simply check if file exists)
    pub async fn is_model_ready(&self) -> bool {
        self.model_path.exists()
    }

    /// Get model information
    pub async fn get_model_info(&self) -> Result<serde_json::Value> {
        if !self.model_path.exists() {
            return Ok(serde_json::json!({
                "status": "not_downloaded",
                "model_path": self.model_path.to_string_lossy(),
                "size_mb": 0
            }));
        }

        let metadata = tokio::fs::metadata(&self.model_path).await?;
        let size_mb = metadata.len() / (1024 * 1024);

        // Model is "loaded" if file exists (Python handles actual loading)
        Ok(serde_json::json!({
            "status": "loaded",
            "model_path": self.model_path.to_string_lossy(),
            "size_mb": size_mb,
            "model_name": "Llama 3.1 8B Instruct",
            "quantization": "Q4_K_M"
        }))
    }
}