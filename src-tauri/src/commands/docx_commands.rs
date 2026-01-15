// DOCX Export Commands
// Creates styled Word documents from transcribed text

use tauri::{command, AppHandle};
use tauri_plugin_dialog::DialogExt;
use docx_rs::*;
use std::fs;
use std::path::PathBuf;

/// Create a styled DOCX document from text with save dialog
/// Includes optional document header (repeated text at top of every page)
#[command]
pub async fn create_styled_docx(
    app: AppHandle,
    text: String,
    font_family: String,
    font_size: f32,
    line_spacing: f32,
    header_content: Option<String>,
) -> Result<String, String> {
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
        .add_filter("Word Dokument", &["docx"])
        .add_filter("Alle Dateien", &["*"])
        .set_title("Gutachten speichern")
        .blocking_save_file();

    let output_path = match file_path {
        Some(path) => PathBuf::from(path.to_string()),
        None => return Err("Speichern abgebrochen".to_string())
    };

    // Convert font size from points to half-points (DOCX uses half-points)
    let font_size_half_points = (font_size * 2.0) as usize;

    // Convert line spacing to DOCX format (240 = single spacing)
    let line_spacing_twips = (line_spacing * 240.0) as i32;

    // Create the document
    let mut doc = Docx::new();

    // Add document header if provided (appears at top of every page)
    if let Some(ref header_text) = header_content {
        if !header_text.trim().is_empty() {
            println!("Adding document header: {}", header_text);

            // Create header with styled text
            let header_run = Run::new()
                .add_text(header_text)
                .size(font_size_half_points)
                .fonts(RunFonts::new().ascii(&font_family).hi_ansi(&font_family));

            let header_paragraph = Paragraph::new()
                .add_run(header_run)
                .align(AlignmentType::Center);

            let header = Header::new()
                .add_paragraph(header_paragraph);

            doc = doc.header(header);
        }
    }

    // Split text into paragraphs
    let paragraphs: Vec<&str> = text.split('\n').collect();

    for para_text in paragraphs {
        if para_text.trim().is_empty() {
            // Empty paragraph for spacing
            doc = doc.add_paragraph(
                Paragraph::new()
                    .add_run(Run::new().add_text(""))
            );
        } else {
            // Create paragraph with styled text
            let run = Run::new()
                .add_text(para_text)
                .size(font_size_half_points)
                .fonts(RunFonts::new().ascii(&font_family).hi_ansi(&font_family));

            let paragraph = Paragraph::new()
                .add_run(run)
                .line_spacing(LineSpacing::new().line(line_spacing_twips));

            doc = doc.add_paragraph(paragraph);
        }
    }

    // Write the document to file
    let file = fs::File::create(&output_path)
        .map_err(|e| format!("Fehler beim Erstellen der Datei: {}", e))?;

    doc.build()
        .pack(file)
        .map_err(|e| format!("Fehler beim Schreiben des Dokuments: {}", e))?;

    println!("DOCX created: {}", output_path.display());

    Ok(output_path.to_string_lossy().to_string())
}
