// Style Profile Commands - Manages example document analysis and style learning
use tauri::command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SectionInfo {
    pub normalized_name: String,
    pub display_name: String,
    pub is_required: bool,
    pub occurrence_count: i32,
    pub occurrence_percentage: f32,
    pub order: i32,
    // Note: common_phrases removed - we only store section structure, not content
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormattingInfo {
    pub font_family: String,
    pub font_size_pt: f32,
    pub line_spacing: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StyleProfile {
    pub version: String,
    pub created_at: String,
    pub analyzed_documents: i32,
    pub source_files: Vec<String>,
    pub sections: Vec<SectionInfo>,
    pub formatting: FormattingInfo,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StyleProfileStatus {
    pub exists: bool,
    pub document_count: i32,
    pub section_count: i32,
    pub created_at: Option<String>,
    pub source_files: Vec<String>,
}

/// Get the path to the style profile directory
fn get_style_profile_dir() -> Result<PathBuf, String> {
    let app_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    Ok(app_dir.join("user-data").join("style-profile"))
}

/// Get the path to the style profile JSON file
fn get_style_profile_path() -> Result<PathBuf, String> {
    Ok(get_style_profile_dir()?.join("profile.json"))
}

/// Get the path to store example documents
fn get_examples_dir() -> Result<PathBuf, String> {
    Ok(get_style_profile_dir()?.join("examples"))
}

/// Analyze example documents and build a StyleProfile
#[command]
pub async fn analyze_example_documents(
    document_paths: Vec<String>,
) -> Result<StyleProfile, String> {
    println!("Analyzing {} example documents for StyleProfile...", document_paths.len());

    if document_paths.is_empty() {
        return Err("No documents provided for analysis".to_string());
    }

    // Ensure directories exist
    let profile_dir = get_style_profile_dir()?;
    let examples_dir = get_examples_dir()?;
    fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Failed to create profile directory: {}", e))?;
    fs::create_dir_all(&examples_dir)
        .map_err(|e| format!("Failed to create examples directory: {}", e))?;

    // Copy documents to examples directory and collect paths
    let mut copied_paths: Vec<String> = Vec::new();
    for (i, doc_path) in document_paths.iter().enumerate() {
        let source = PathBuf::from(doc_path);
        if !source.exists() {
            println!("Warning: Document not found: {}", doc_path);
            continue;
        }

        let default_name = format!("example_{}.docx", i);
        let filename = source.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&default_name);

        let dest = examples_dir.join(format!("{}_{}", i + 1, filename));

        fs::copy(&source, &dest)
            .map_err(|e| format!("Failed to copy document {}: {}", doc_path, e))?;

        copied_paths.push(dest.to_string_lossy().to_string());
        println!("Copied example document: {}", dest.display());
    }

    if copied_paths.is_empty() {
        return Err("No valid documents found to analyze".to_string());
    }

    // Create JSON file with document paths
    let docs_json_path = profile_dir.join("docs_to_analyze.json");
    let docs_json = serde_json::to_string(&copied_paths)
        .map_err(|e| format!("Failed to serialize document paths: {}", e))?;
    fs::write(&docs_json_path, &docs_json)
        .map_err(|e| format!("Failed to write docs JSON: {}", e))?;

    // Run the Python analyzer
    let python_exe = r"C:\Users\kalin\Desktop\gutachten-assistant\llama_venv_gpu\Scripts\python.exe";
    let script_path = r"C:\Users\kalin\Desktop\gutachten-assistant\style_profile_analyzer.py";
    let output_path = get_style_profile_path()?;

    println!("Running StyleProfile analyzer...");

    let output = Command::new(python_exe)
        .arg(script_path)
        .arg(&docs_json_path)
        .arg(&output_path)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("Failed to run analyzer script: {}", e))?;

    // Clean up temp file
    let _ = fs::remove_file(&docs_json_path);

    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        println!("Analyzer output: {}", stderr);
    }

    if !output.status.success() {
        return Err(format!("Analyzer script failed: {}", stderr));
    }

    // Parse and return the profile
    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Failed to parse output: {}", e))?;

    let profile: StyleProfile = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse StyleProfile JSON: {} - output: {}", e, stdout))?;

    println!("StyleProfile created successfully with {} sections", profile.sections.len());

    Ok(profile)
}

/// Load the existing StyleProfile
#[command]
pub async fn load_style_profile() -> Result<StyleProfile, String> {
    let profile_path = get_style_profile_path()?;

    if !profile_path.exists() {
        return Err("StyleProfile not found. Please upload example documents first.".to_string());
    }

    let content = fs::read_to_string(&profile_path)
        .map_err(|e| format!("Failed to read StyleProfile: {}", e))?;

    let profile: StyleProfile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse StyleProfile: {}", e))?;

    Ok(profile)
}

/// Get StyleProfile status (exists, document count, etc.)
#[command]
pub async fn get_style_profile_status() -> Result<StyleProfileStatus, String> {
    let profile_path = get_style_profile_path()?;

    if !profile_path.exists() {
        return Ok(StyleProfileStatus {
            exists: false,
            document_count: 0,
            section_count: 0,
            created_at: None,
            source_files: Vec::new(),
        });
    }

    let content = fs::read_to_string(&profile_path)
        .map_err(|e| format!("Failed to read StyleProfile: {}", e))?;

    let profile: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse StyleProfile: {}", e))?;

    let source_files: Vec<String> = profile.get("source_files")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(StyleProfileStatus {
        exists: true,
        document_count: profile.get("analyzed_documents")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        section_count: profile.get("sections")
            .and_then(|v| v.as_array())
            .map(|arr| arr.len() as i32)
            .unwrap_or(0),
        created_at: profile.get("created_at")
            .and_then(|v| v.as_str())
            .map(String::from),
        source_files,
    })
}

/// Clear the existing StyleProfile and examples
#[command]
pub async fn clear_style_profile() -> Result<(), String> {
    let profile_dir = get_style_profile_dir()?;

    if profile_dir.exists() {
        fs::remove_dir_all(&profile_dir)
            .map_err(|e| format!("Failed to clear StyleProfile: {}", e))?;
        println!("StyleProfile cleared successfully");
    }

    Ok(())
}

/// Get the StyleProfile as a formatted prompt string for Llama
/// IMPORTANT: Only includes STRUCTURE (section names/order), NOT any content!
#[command]
pub async fn get_style_profile_prompt() -> Result<String, String> {
    let profile = load_style_profile().await?;

    let mut prompt = String::new();

    prompt.push_str("ABSCHNITTS-STRUKTUR DES GUTACHTENS:\n");
    prompt.push_str("(Verwende diese Reihenfolge für die Überschriften)\n\n");

    let required_sections: Vec<_> = profile.sections.iter()
        .filter(|s| s.is_required)
        .collect();

    let optional_sections: Vec<_> = profile.sections.iter()
        .filter(|s| !s.is_required)
        .collect();

    prompt.push_str("PFLICHT-ABSCHNITTE:\n");
    for (i, section) in required_sections.iter().enumerate() {
        prompt.push_str(&format!("  {}. {}\n", i + 1, section.display_name));
    }

    if !optional_sections.is_empty() {
        prompt.push_str("\nOPTIONALE ABSCHNITTE (nur wenn im Diktat vorhanden):\n");
        for section in &optional_sections {
            prompt.push_str(&format!("  - {}\n", section.display_name));
        }
    }

    Ok(prompt)
}
