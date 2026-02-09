// Llama/Qwen commands using persistent worker process for fast inference
// Now uses Qwen2.5-7B-Instruct for Gutachten structuring
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StructuredContent {
    pub slots: Value,
    pub unclear_spans: Vec<Value>,
    pub missing_slots: Vec<String>,
    pub processing_time_ms: u64,
    pub tokens_per_sec: Option<f32>,
}

// Persistent worker process manager
struct LlamaWorker {
    child: Option<Child>,
    stdin: Option<BufWriter<ChildStdin>>,
    stdout: Option<BufReader<ChildStdout>>,
    model_type: String,
}

impl LlamaWorker {
    fn new() -> Self {
        LlamaWorker {
            child: None,
            stdin: None,
            stdout: None,
            model_type: "none".to_string(),
        }
    }

    fn is_running(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    self.child = None;
                    self.stdin = None;
                    self.stdout = None;
                    self.model_type = "none".to_string();
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    }

    fn start(&mut self, use_qwen: bool) -> Result<(), String> {
        let model_name = if use_qwen { "qwen" } else { "llama" };

        // If already running with correct model, return
        if self.is_running() && self.model_type == model_name {
            println!("[RUST] Worker already running with {}", model_name);
            return Ok(());
        }

        // Stop existing worker if running different model
        if self.is_running() {
            println!("[RUST] Stopping existing worker to switch models");
            self.stop();
        }

        let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
        let script_path = if use_qwen {
            r"C:\Users\kalin\Desktop\gutachten-assistant\qwen_structurer.py"
        } else {
            r"C:\Users\kalin\Desktop\gutachten-assistant\llama_worker.py"
        };

        println!("[RUST] Starting {} worker process...", model_name);

        let mut child = Command::new(python_exe)
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
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
        self.model_type = model_name.to_string();

        // Wait for worker to load model and be ready
        // Qwen server (llama-server.exe) can take 30-90 seconds to start
        // Llama python binding takes ~3 seconds
        let max_wait = if use_qwen { 180 } else { 30 };  // 90s for Qwen, 15s for Llama
        println!("[RUST] Waiting for {} model to load (max {}s)...", model_name, max_wait / 2);

        // Send ping and wait for ready response
        for attempt in 1..=max_wait {
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Try to ping the worker
            if let (Some(stdin), Some(stdout)) = (self.stdin.as_mut(), self.stdout.as_mut()) {
                let ping = r#"{"command": "ping"}"#;
                if writeln!(stdin, "{}", ping).is_ok() && stdin.flush().is_ok() {
                    let mut response = String::new();
                    if stdout.read_line(&mut response).is_ok() {
                        if response.contains("\"model_loaded\":true") || response.contains("\"server_ready\":true") {
                            println!("[RUST] {} worker ready after {:.1}s", model_name, attempt as f32 * 0.5);
                            return Ok(());
                        }
                    }
                }
            }

            if attempt % 20 == 0 {
                println!("[RUST] Still waiting for {} model... ({}s)", model_name, attempt / 2);
            }
        }

        println!("[RUST] WARNING: {} worker may not be fully ready", model_name);
        Ok(())
    }

    fn send_request(&mut self, request: &Value, use_qwen: bool) -> Result<Value, String> {
        if !self.is_running() || (use_qwen && self.model_type != "qwen") || (!use_qwen && self.model_type != "llama") {
            self.start(use_qwen)?;
        }

        let stdin = self.stdin.as_mut().ok_or("Worker stdin not available")?;
        let stdout = self.stdout.as_mut().ok_or("Worker stdout not available")?;

        let request_str = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        writeln!(stdin, "{}", request_str)
            .map_err(|e| format!("Failed to write to worker: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        let mut response_line = String::new();
        stdout.read_line(&mut response_line)
            .map_err(|e| format!("Failed to read from worker: {}", e))?;

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
        self.model_type = "none".to_string();
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

/// Check if Qwen model exists
#[command]
pub async fn get_llama_model_info() -> Result<Value, String> {
    let qwen_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\qwen2.5-7b-instruct-q4_k_m.gguf");
    let llama_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\llama-3.1-8b-instruct-q4_k_m.gguf");

    let qwen_exists = qwen_path.exists();
    let llama_exists = llama_path.exists();

    let qwen_size = if qwen_exists {
        fs::metadata(&qwen_path).map(|m| (m.len() / (1024 * 1024)) as u32).unwrap_or(0)
    } else { 0 };

    let llama_size = if llama_exists {
        fs::metadata(&llama_path).map(|m| (m.len() / (1024 * 1024)) as u32).unwrap_or(0)
    } else { 0 };

    Ok(serde_json::json!({
        "qwen": {
            "status": if qwen_exists { "downloaded" } else { "not_downloaded" },
            "model_path": qwen_path.to_string_lossy(),
            "size_mb": qwen_size,
            "model_name": "Qwen2.5-7B Instruct",
            "quantization": "Q4_K_M"
        },
        "llama": {
            "status": if llama_exists { "downloaded" } else { "not_downloaded" },
            "model_path": llama_path.to_string_lossy(),
            "size_mb": llama_size,
            "model_name": "Llama 3.1 8B Instruct",
            "quantization": "Q4_K_M"
        },
        "primary_model": if qwen_exists { "qwen" } else if llama_exists { "llama" } else { "none" }
    }))
}

/// Check if model is ready
#[command]
pub async fn is_llama_model_ready() -> Result<bool, String> {
    let qwen_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\qwen2.5-7b-instruct-q4_k_m.gguf");
    let llama_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\llama-3.1-8b-instruct-q4_k_m.gguf");
    Ok(qwen_path.exists() || llama_path.exists())
}

/// Download model (not implemented)
#[command]
pub async fn download_llama_model() -> Result<Value, String> {
    Err("Model download not implemented. Please download Qwen2.5-7B or Llama 3.1 8B manually.".to_string())
}

/// Initialize the worker (pre-load model)
#[command]
pub async fn load_llama_model() -> Result<Value, String> {
    println!("[RUST] Initializing Qwen worker...");

    // Use Qwen by default
    let qwen_exists = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\models\qwen2.5-7b-instruct-q4_k_m.gguf").exists();

    let mut worker = LLAMA_WORKER.lock()
        .map_err(|e| format!("Failed to acquire worker lock: {}", e))?;

    worker.start(qwen_exists)?;

    let response = worker.send_request(&serde_json::json!({"command": "ping"}), qwen_exists)?;

    let server_ready = response.get("server_ready")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(serde_json::json!({
        "success": true,
        "message": if server_ready { "Worker ready with model loaded" } else { "Worker started, model loading..." },
        "model_loaded": server_ready,
        "model_type": if qwen_exists { "qwen" } else { "llama" }
    }))
}

/// Correct German grammar using Llama worker (legacy - kept for compatibility)
#[command]
pub async fn correct_german_grammar(
    text: String,
    preserve_style: Option<bool>,
) -> Result<GrammarCorrectionResponse, String> {
    println!("[RUST] Correcting German grammar (length: {} chars)", text.len());

    let start = std::time::Instant::now();

    let mut worker = LLAMA_WORKER.lock()
        .map_err(|e| format!("Failed to acquire worker lock: {}", e))?;

    // Use Llama for simple grammar correction
    let request = serde_json::json!({
        "text": text
    });

    let response = worker.send_request(&request, false)?;

    let elapsed = start.elapsed().as_millis() as u64;

    if let Some(error) = response.get("error").and_then(|e| e.as_str()) {
        return Err(error.to_string());
    }

    let corrected_text = response.get("clean_text")
        .or_else(|| response.get("corrected_text"))
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

/// Structure transcript into Gutachten sections using Qwen
#[command]
pub async fn structure_gutachten_transcript(
    transcript: String,
) -> Result<StructuredContent, String> {
    println!("[RUST] Structuring Gutachten transcript (length: {} chars)", transcript.len());

    let start = std::time::Instant::now();

    let mut worker = LLAMA_WORKER.lock()
        .map_err(|e| format!("Failed to acquire worker lock: {}", e))?;

    // Use Qwen for structuring
    let request = serde_json::json!({
        "text": transcript
    });

    let response = worker.send_request(&request, true)?;

    let elapsed = start.elapsed().as_millis() as u64;

    if let Some(error) = response.get("error").and_then(|e| e.as_str()) {
        return Err(error.to_string());
    }

    let slots = response.get("slots")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let unclear_spans: Vec<Value> = response.get("unclear_spans")
        .and_then(|u| u.as_array())
        .cloned()
        .unwrap_or_default();

    let missing_slots: Vec<String> = response.get("missing_slots")
        .and_then(|m| m.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let tokens_per_sec = response.get("metrics")
        .and_then(|m| m.get("tokens_per_sec"))
        .and_then(|t| t.as_f64())
        .map(|t| t as f32);

    Ok(StructuredContent {
        slots,
        unclear_spans,
        missing_slots,
        processing_time_ms: elapsed,
        tokens_per_sec,
    })
}

/// Shutdown the worker
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
