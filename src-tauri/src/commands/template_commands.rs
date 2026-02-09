// Template extraction and DOCX rendering commands
use tauri::{command, AppHandle};
use tauri_plugin_dialog::DialogExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TemplateSpec {
    pub version: String,
    pub family_id: String,
    pub family_name: String,
    pub anchors: Vec<Value>,
    pub skeleton: Vec<Value>,
    pub style_roles: Value,
    pub quality_metrics: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractionResult {
    pub success: bool,
    pub message: String,
    pub template_spec_path: Option<String>,
    pub anchors_found: usize,
    pub documents_analyzed: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenderResult {
    pub success: bool,
    pub message: String,
    pub output_path: Option<String>,
    pub unclear_count: usize,
    pub missing_sections: Vec<String>,
}

/// Extract template from example Gutachten documents
#[command]
pub async fn extract_template(
    input_folder: String,
    output_folder: Option<String>,
) -> Result<ExtractionResult, String> {
    println!("[RUST] Extracting template from: {}", input_folder);

    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\template_extractor.py";

    let output_dir = output_folder.unwrap_or_else(|| {
        r"C:\Users\kalin\Desktop\gutachten-assistant\template_output".to_string()
    });

    // Run template extractor
    let output = Command::new(python_exe)
        .args(&[script_path, "extract", &input_folder, &output_dir])
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("Failed to run template extractor: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    println!("[RUST] Extractor stderr: {}", stderr);

    if !output.status.success() {
        return Err(format!("Template extraction failed: {}", stderr));
    }

    // Parse the output JSON
    let spec_path = PathBuf::from(&output_dir).join("template_spec.json");

    if spec_path.exists() {
        let spec_content = fs::read_to_string(&spec_path)
            .map_err(|e| format!("Failed to read template spec: {}", e))?;

        let spec: Value = serde_json::from_str(&spec_content)
            .map_err(|e| format!("Failed to parse template spec: {}", e))?;

        let anchors_found = spec.get("anchors")
            .and_then(|a| a.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        let docs_analyzed = spec.get("quality_metrics")
            .and_then(|m| m.get("documents_analyzed"))
            .and_then(|d| d.as_u64())
            .unwrap_or(0) as usize;

        Ok(ExtractionResult {
            success: true,
            message: format!("Template extracted successfully. Found {} anchors from {} documents.", anchors_found, docs_analyzed),
            template_spec_path: Some(spec_path.to_string_lossy().to_string()),
            anchors_found,
            documents_analyzed: docs_analyzed,
        })
    } else {
        Err("Template spec file not created".to_string())
    }
}

/// Get the current template spec
#[command]
pub async fn get_template_spec() -> Result<Value, String> {
    let spec_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\template_output\template_spec.json");

    if !spec_path.exists() {
        return Err("No template spec found. Please extract a template first.".to_string());
    }

    let content = fs::read_to_string(&spec_path)
        .map_err(|e| format!("Failed to read template spec: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse template spec: {}", e))
}

/// Render a DOCX document from structured content with save dialog
#[command]
pub async fn render_gutachten_docx(
    app: AppHandle,
    content_json: Value,
    template_spec_path: Option<String>,
    base_template_path: Option<String>,
) -> Result<RenderResult, String> {
    // Generate default filename with timestamp
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let default_filename = format!("Gutachten_{}.docx", timestamp);

    // Get user's Documents folder as default location
    let default_dir = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."));

    // Show save file dialog
    let file_path = app.dialog()
        .file()
        .set_file_name(&default_filename)
        .set_directory(&default_dir)
        .add_filter("Word-Dokument", &["docx"])
        .set_title("Strukturiertes Gutachten speichern")
        .blocking_save_file();

    let output_path = match file_path {
        Some(path) => path.to_string(),
        None => return Err("Speichern abgebrochen".to_string())
    };
    println!("[RUST] Rendering Gutachten DOCX to: {}", output_path);

    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\docx_renderer.py";

    let spec_path = template_spec_path.unwrap_or_else(|| {
        r"C:\Users\kalin\Desktop\gutachten-assistant\template_output\template_spec.json".to_string()
    });

    // Write content JSON to temp file
    let temp_content_path = r"C:\Users\kalin\Desktop\gutachten-assistant\temp_content.json";
    let content_str = serde_json::to_string_pretty(&content_json)
        .map_err(|e| format!("Failed to serialize content: {}", e))?;
    fs::write(temp_content_path, &content_str)
        .map_err(|e| format!("Failed to write temp content: {}", e))?;

    // Build command args
    let mut args = vec![
        script_path.to_string(),
        "render".to_string(),
        spec_path.clone(),
        temp_content_path.to_string(),
        output_path.clone(),
    ];

    if let Some(base_path) = base_template_path {
        args.push(base_path);
    }

    // Run renderer
    let output = Command::new(python_exe)
        .args(&args)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("Failed to run DOCX renderer: {}", e))?;

    // Clean up temp file
    let _ = fs::remove_file(temp_content_path);

    let stderr = String::from_utf8_lossy(&output.stderr);
    println!("[RUST] Renderer stderr: {}", stderr);

    if !output.status.success() {
        return Err(format!("DOCX rendering failed: {}", stderr));
    }

    // Extract unclear count and missing sections from content
    let unclear_count = content_json.get("unclear_spans")
        .and_then(|u| u.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let missing_sections: Vec<String> = content_json.get("missing_slots")
        .and_then(|m| m.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(RenderResult {
        success: true,
        message: "DOCX rendered successfully".to_string(),
        output_path: Some(output_path),
        unclear_count,
        missing_sections,
    })
}

/// Check if template has been extracted
#[command]
pub async fn is_template_ready() -> Result<bool, String> {
    let spec_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\template_output\template_spec.json");
    Ok(spec_path.exists())
}

/// Get list of available section slots from template
#[command]
pub async fn get_template_slots() -> Result<Vec<Value>, String> {
    let spec_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\template_output\template_spec.json");

    if !spec_path.exists() {
        return Err("No template spec found".to_string());
    }

    let content = fs::read_to_string(&spec_path)
        .map_err(|e| format!("Failed to read template spec: {}", e))?;

    let spec: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse template spec: {}", e))?;

    let slots: Vec<Value> = spec.get("skeleton")
        .and_then(|s| s.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("slot"))
                .cloned()
                .collect()
        })
        .unwrap_or_default();

    Ok(slots)
}

/// Save the edited template spec to disk
#[command]
pub async fn save_template_spec(spec_json: String) -> Result<Value, String> {
    let spec_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\template_output\template_spec.json");

    // Validate JSON
    let _: Value = serde_json::from_str(&spec_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Ensure directory exists
    if let Some(parent) = spec_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Write to file
    fs::write(&spec_path, &spec_json)
        .map_err(|e| format!("Failed to write template spec: {}", e))?;

    println!("[RUST] Template spec saved to: {:?}", spec_path);

    Ok(serde_json::json!({
        "success": true,
        "path": spec_path.to_string_lossy()
    }))
}
