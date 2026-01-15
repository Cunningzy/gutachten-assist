// DOCX Formatting commands - Uses Python docx_format_tauri.py for formatting
use tauri::command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatDocxResponse {
    pub success: bool,
    pub output_file: String,
    pub applied_changes: Value,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectFormattingResponse {
    pub is_formatting_request: bool,
    pub request: String,
}

/// Detect if a user request is about formatting (vs. text editing)
#[command]
pub async fn detect_formatting_request(request: String) -> Result<DetectFormattingResponse, String> {
    // Use the Python script's detection functionality
    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\docx_format_tauri.py";

    let output = Command::new(python_exe)
        .arg(script_path)
        .arg("--detect-only")
        .arg("--request")
        .arg(&request)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("Failed to run detection script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Detection script failed: {}", stderr));
    }

    let stdout = String::from_utf8(output.stdout.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).into_owned());

    let json_result: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {} - stdout: {}", e, stdout))?;

    Ok(DetectFormattingResponse {
        is_formatting_request: json_result.get("is_formatting_request")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        request: request,
    })
}

/// Apply formatting to a DOCX file using natural language request
#[command]
pub async fn format_docx_with_request(
    input_docx: String,
    output_docx: String,
    request: String,
) -> Result<FormatDocxResponse, String> {
    println!("Formatting DOCX with request: {}", request);

    // Verify input file exists
    if !PathBuf::from(&input_docx).exists() {
        return Err(format!("Input file not found: {}", input_docx));
    }

    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\docx_format_tauri.py";

    let output = Command::new(python_exe)
        .arg(script_path)
        .arg(&input_docx)
        .arg(&output_docx)
        .arg("--request")
        .arg(&request)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("Failed to run formatting script: {}", e))?;

    let stdout = String::from_utf8(output.stdout.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).into_owned());
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Log stderr for debugging
    if !stderr.is_empty() {
        println!("Format script stderr: {}", stderr);
    }

    // Parse JSON response even if exit code was non-zero (script outputs JSON in both cases)
    let json_result: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {} - stdout: {}", e, stdout))?;

    let success = json_result.get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let applied_changes = json_result.get("applied_changes")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let warnings: Vec<String> = json_result.get("warnings")
        .and_then(|w| w.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let errors: Vec<String> = json_result.get("errors")
        .and_then(|e| e.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(|| {
            // If no errors array but there's an error field
            json_result.get("error")
                .and_then(|e| e.as_str())
                .map(|s| vec![s.to_string()])
                .unwrap_or_default()
        });

    if !success && errors.is_empty() {
        return Err(format!("Formatting failed without specific error. Output: {}", stdout));
    }

    Ok(FormatDocxResponse {
        success,
        output_file: output_docx,
        applied_changes,
        warnings,
        errors,
    })
}

/// Apply formatting to a DOCX file using a FormatSpec JSON
#[command]
pub async fn format_docx_with_spec(
    input_docx: String,
    output_docx: String,
    spec_json: String,
) -> Result<FormatDocxResponse, String> {
    println!("Formatting DOCX with spec JSON");

    // Verify input file exists
    if !PathBuf::from(&input_docx).exists() {
        return Err(format!("Input file not found: {}", input_docx));
    }

    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\docx_format_tauri.py";

    let output = Command::new(python_exe)
        .arg(script_path)
        .arg(&input_docx)
        .arg(&output_docx)
        .arg("--spec-json")
        .arg(&spec_json)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("Failed to run formatting script: {}", e))?;

    let stdout = String::from_utf8(output.stdout.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).into_owned());
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        println!("Format script stderr: {}", stderr);
    }

    let json_result: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {} - stdout: {}", e, stdout))?;

    let success = json_result.get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let applied_changes = json_result.get("applied_changes")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let warnings: Vec<String> = json_result.get("warnings")
        .and_then(|w| w.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let errors: Vec<String> = json_result.get("errors")
        .and_then(|e| e.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(|| {
            json_result.get("error")
                .and_then(|e| e.as_str())
                .map(|s| vec![s.to_string()])
                .unwrap_or_default()
        });

    Ok(FormatDocxResponse {
        success,
        output_file: output_docx,
        applied_changes,
        warnings,
        errors,
    })
}
