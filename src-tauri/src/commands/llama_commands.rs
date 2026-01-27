// Llama commands using persistent worker process for fast inference
use tauri::command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::process::{Command, Stdio, Child, ChildStdin, ChildStdout};
use std::fs;
use std::io::{BufRead, BufReader, Write, BufWriter};
use std::sync::Mutex;
use once_cell::sync::Lazy;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GrammarCorrectionResponse {
    pub corrected_text: String,
    pub changes_made: Vec<String>,
    pub confidence: f32,
    pub processing_time_ms: u64,
    pub guardrail_status: String,
    pub violations: Vec<String>,
    pub notes: Vec<String>,
    pub attempts: u32,
    pub removed_tokens: Vec<String>,
    pub tokens_per_sec: Option<f32>,
}

// Persistent worker process manager
struct LlamaWorker {
    child: Option<Child>,
    stdin: Option<BufWriter<ChildStdin>>,
    stdout: Option<BufReader<ChildStdout>>,
}

impl LlamaWorker {
    fn new() -> Self {
        LlamaWorker {
            child: None,
            stdin: None,
            stdout: None,
        }
    }

    fn is_running(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process has exited
                    self.child = None;
                    self.stdin = None;
                    self.stdout = None;
                    false
                }
                Ok(None) => true,  // Still running
                Err(_) => false,
            }
        } else {
            false
        }
    }

    fn start(&mut self) -> Result<(), String> {
        if self.is_running() {
            println!("[RUST] Worker already running");
            return Ok(());
        }

        let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
        let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_worker.py";

        println!("[RUST] Starting Llama worker process...");

        let mut child = Command::new(python_exe)
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())  // Show stderr in console
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUNBUFFERED", "1")
            .spawn()
            .map_err(|e| format!("Failed to start worker: {}", e))?;

        let stdin = child.stdin.take()
            .ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take()
            .ok_or("Failed to capture stdout")?;

        self.stdin = Some(BufWriter::new(stdin));
        self.stdout = Some(BufReader::new(stdout));
        self.child = Some(child);

        // Wait a moment for model to load, then ping
        std::thread::sleep(std::time::Duration::from_millis(500));

        println!("[RUST] Worker process started");
        Ok(())
    }

    fn send_request(&mut self, request: &Value) -> Result<Value, String> {
        // Ensure worker is running
        if !self.is_running() {
            self.start()?;
        }

        let stdin = self.stdin.as_mut().ok_or("Worker stdin not available")?;
        let stdout = self.stdout.as_mut().ok_or("Worker stdout not available")?;

        // Send request as JSON line
        let request_str = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        writeln!(stdin, "{}", request_str)
            .map_err(|e| format!("Failed to write to worker: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        // Read response line
        let mut response_line = String::new();
        stdout.read_line(&mut response_line)
            .map_err(|e| format!("Failed to read from worker: {}", e))?;

        // Parse JSON response
        serde_json::from_str(&response_line)
            .map_err(|e| format!("Failed to parse worker response: {} - got: {}", e, response_line))
    }

    fn stop(&mut self) {
        if let Some(ref mut stdin) = self.stdin {
            let _ = writeln!(stdin, r#"{{"command": "shutdown"}}"#);
            let _ = stdin.flush();
        }

        if let Some(ref mut child) = self.child {
            let _ = child.wait();
        }

        self.child = None;
        self.stdin = None;
        self.stdout = None;
        println!("[RUST] Worker stopped");
    }
}

impl Drop for LlamaWorker {
    fn drop(&mut self) {
        self.stop();
    }
}

// Global worker instance
static LLAMA_WORKER: Lazy<Mutex<LlamaWorker>> = Lazy::new(|| {
    Mutex::new(LlamaWorker::new())
});

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

/// Initialize the Llama worker (pre-load model)
#[command]
pub async fn load_llama_model() -> Result<Value, String> {
    println!("[RUST] Initializing Llama worker...");

    let mut worker = LLAMA_WORKER.lock()
        .map_err(|e| format!("Failed to acquire worker lock: {}", e))?;

    worker.start()?;

    // Send ping to verify it's ready
    let response = worker.send_request(&serde_json::json!({"command": "ping"}))?;

    let model_loaded = response.get("model_loaded")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(serde_json::json!({
        "success": true,
        "message": if model_loaded { "Worker ready with model loaded" } else { "Worker ready but model not loaded" },
        "model_loaded": model_loaded
    }))
}

/// Correct German grammar using persistent worker process
#[command]
pub async fn correct_german_grammar(
    text: String,
    preserve_style: Option<bool>,
) -> Result<GrammarCorrectionResponse, String> {
    println!("[RUST] Correcting German grammar (length: {} chars)", text.len());

    let start = std::time::Instant::now();

    let mut worker = LLAMA_WORKER.lock()
        .map_err(|e| format!("Failed to acquire worker lock: {}", e))?;

    // Send text to worker
    let request = serde_json::json!({
        "text": text
    });

    let response = worker.send_request(&request)?;

    let elapsed = start.elapsed().as_millis() as u64;
    println!("[RUST] Total round-trip time: {}ms", elapsed);

    // Check for error
    if let Some(error) = response.get("error").and_then(|e| e.as_str()) {
        return Err(error.to_string());
    }

    // Extract response fields
    let corrected_text = response.get("corrected_text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let processing_time_ms = response.get("processing_time_ms")
        .and_then(|t| t.as_u64())
        .unwrap_or(elapsed);

    let guardrail_status = response.get("guardrail_status")
        .and_then(|s| s.as_str())
        .unwrap_or("unknown")
        .to_string();

    let violations: Vec<String> = response.get("violations")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let notes: Vec<String> = response.get("notes")
        .and_then(|n| n.as_array())
        .map(|arr| arr.iter().filter_map(|n| n.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let removed_tokens: Vec<String> = response.get("removed_tokens")
        .and_then(|r| r.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let tokens_per_sec = response.get("tokens_per_sec")
        .and_then(|t| t.as_f64())
        .map(|t| t as f32);

    println!("[RUST] Guardrail status: {}, tokens/sec: {:?}", guardrail_status, tokens_per_sec);

    Ok(GrammarCorrectionResponse {
        corrected_text,
        changes_made: vec![],
        confidence: 0.0,
        processing_time_ms,
        guardrail_status,
        violations,
        notes,
        attempts: 1,
        removed_tokens,
        tokens_per_sec,
    })
}

/// Shutdown the Llama worker
#[command]
pub async fn shutdown_llama_worker() -> Result<Value, String> {
    let mut worker = LLAMA_WORKER.lock()
        .map_err(|e| format!("Failed to acquire worker lock: {}", e))?;

    worker.stop();

    Ok(serde_json::json!({
        "success": true,
        "message": "Worker stopped"
    }))
}
