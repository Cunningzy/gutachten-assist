// Style Profile Commands - Manages example document analysis and style learning
use tauri::{command, AppHandle};
use tauri_plugin_dialog::DialogExt;
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

    prompt.push_str("ERLAUBTE ÜBERSCHRIFTEN (in dieser Reihenfolge einfügen):\n\n");

    let required_sections: Vec<_> = profile.sections.iter()
        .filter(|s| s.is_required)
        .collect();

    let optional_sections: Vec<_> = profile.sections.iter()
        .filter(|s| !s.is_required)
        .collect();

    for (i, section) in required_sections.iter().enumerate() {
        prompt.push_str(&format!("{}. {}\n", i + 1, section.display_name));
    }

    if !optional_sections.is_empty() {
        prompt.push_str("\nOptional:\n");
        for section in &optional_sections {
            prompt.push_str(&format!("- {}\n", section.display_name));
        }
    }

    Ok(prompt)
}

/// Get the path to the template DOCX file
fn get_template_path() -> Result<PathBuf, String> {
    Ok(get_style_profile_dir()?.join("profile_template.docx"))
}

/// Get the path to the approved template marker file
fn get_approved_marker_path() -> Result<PathBuf, String> {
    Ok(get_style_profile_dir()?.join(".template_approved"))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TemplateInfo {
    pub exists: bool,
    pub template_path: String,
    pub is_approved: bool,
    pub sections: Vec<String>,
    pub formatting: Option<FormattingInfo>,
}

/// Get information about the generated template
#[command]
pub async fn get_template_info() -> Result<TemplateInfo, String> {
    let template_path = get_template_path()?;
    let approved_marker = get_approved_marker_path()?;
    let profile_path = get_style_profile_path()?;

    if !template_path.exists() {
        return Ok(TemplateInfo {
            exists: false,
            template_path: template_path.to_string_lossy().to_string(),
            is_approved: false,
            sections: Vec::new(),
            formatting: None,
        });
    }

    // Check if template is approved
    let is_approved = approved_marker.exists();

    // Load profile to get sections
    let mut sections = Vec::new();
    let mut formatting = None;

    if profile_path.exists() {
        if let Ok(content) = fs::read_to_string(&profile_path) {
            if let Ok(profile) = serde_json::from_str::<Value>(&content) {
                // Extract section names
                if let Some(section_arr) = profile.get("sections").and_then(|v| v.as_array()) {
                    for section in section_arr {
                        if let Some(name) = section.get("display_name").and_then(|v| v.as_str()) {
                            sections.push(name.to_string());
                        }
                    }
                }

                // Extract formatting
                if let Some(fmt) = profile.get("formatting") {
                    formatting = Some(FormattingInfo {
                        font_family: fmt.get("font_family")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Times New Roman")
                            .to_string(),
                        font_size_pt: fmt.get("font_size_pt")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(12.0) as f32,
                        line_spacing: fmt.get("line_spacing")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(1.15) as f32,
                    });
                }
            }
        }
    }

    Ok(TemplateInfo {
        exists: true,
        template_path: template_path.to_string_lossy().to_string(),
        is_approved,
        sections,
        formatting,
    })
}

/// Get the template DOCX file as bytes for download
#[command]
pub async fn download_template() -> Result<Vec<u8>, String> {
    let template_path = get_template_path()?;

    if !template_path.exists() {
        return Err("Template file not found. Please analyze documents first.".to_string());
    }

    fs::read(&template_path)
        .map_err(|e| format!("Failed to read template file: {}", e))
}

/// Save template to user-selected location with dialog
#[command]
pub async fn save_template_with_dialog(app: AppHandle) -> Result<String, String> {
    let template_path = get_template_path()?;

    if !template_path.exists() {
        return Err("Template file not found. Please analyze documents first.".to_string());
    }

    // Get default Documents folder
    let default_dir = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."));

    // Show save dialog
    let file_path = app.dialog()
        .file()
        .set_file_name("gutachten_vorlage.docx")
        .set_directory(&default_dir)
        .add_filter("Word Dokument", &["docx"])
        .add_filter("Alle Dateien", &["*"])
        .set_title("Vorlage speichern unter...")
        .blocking_save_file();

    let output_path = match file_path {
        Some(path) => PathBuf::from(path.to_string()),
        None => return Err("Speichern abgebrochen".to_string())
    };

    // Copy template to selected location
    fs::copy(&template_path, &output_path)
        .map_err(|e| format!("Fehler beim Speichern: {}", e))?;

    println!("Template saved to: {}", output_path.display());

    Ok(output_path.to_string_lossy().to_string())
}

/// Upload a corrected template DOCX file
#[command]
pub async fn upload_corrected_template(
    file_data: Vec<u8>,
) -> Result<String, String> {
    let template_path = get_template_path()?;
    let profile_dir = get_style_profile_dir()?;

    // Ensure directory exists
    fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Failed to create profile directory: {}", e))?;

    // Backup the old template
    if template_path.exists() {
        let backup_path = profile_dir.join("profile_template_backup.docx");
        let _ = fs::rename(&template_path, &backup_path);
        println!("Backed up old template to: {}", backup_path.display());
    }

    // Write the new template
    fs::write(&template_path, file_data)
        .map_err(|e| format!("Failed to write template file: {}", e))?;

    // Clear the approved marker (user needs to re-approve)
    let approved_marker = get_approved_marker_path()?;
    let _ = fs::remove_file(&approved_marker);

    println!("Corrected template uploaded: {}", template_path.display());

    Ok(template_path.to_string_lossy().to_string())
}

/// Approve the current template for use
#[command]
pub async fn approve_template() -> Result<(), String> {
    let template_path = get_template_path()?;
    let approved_marker = get_approved_marker_path()?;

    if !template_path.exists() {
        return Err("Template file not found. Please analyze documents first.".to_string());
    }

    // Create the approved marker file
    fs::write(&approved_marker, chrono::Utc::now().to_rfc3339())
        .map_err(|e| format!("Failed to create approval marker: {}", e))?;

    println!("Template approved at: {}", chrono::Utc::now().to_rfc3339());

    Ok(())
}

/// Check if the template has been approved
#[command]
pub async fn is_template_approved() -> Result<bool, String> {
    let approved_marker = get_approved_marker_path()?;
    Ok(approved_marker.exists())
}
