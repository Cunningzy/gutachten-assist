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
    // Supports multi-line headers (separated by newlines)
    // Header is BOLD and LEFT-ALIGNED (linksbündig)
    if let Some(ref header_text) = header_content {
        if !header_text.trim().is_empty() {
            println!("Adding document header: {}", header_text);

            // Create header with multiple lines
            let mut header = Header::new();
            let header_font_size = ((font_size - 1.0) * 2.0) as usize; // Slightly smaller than body

            for line in header_text.lines() {
                if !line.trim().is_empty() {
                    let header_run = Run::new()
                        .add_text(line.trim())
                        .size(header_font_size)
                        .bold()  // BOLD
                        .fonts(RunFonts::new().ascii(&font_family).hi_ansi(&font_family));

                    let header_paragraph = Paragraph::new()
                        .add_run(header_run)
                        .align(AlignmentType::Left);  // LEFT-ALIGNED (linksbündig)

                    header = header.add_paragraph(header_paragraph);
                }
            }

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
            // Detect if this line is a heading (all caps, or known section patterns)
            let trimmed = para_text.trim();
            let is_heading = is_section_heading(trimmed);

            if is_heading {
                // Format as heading: bold, slightly larger
                let heading_size = ((font_size + 2.0) * 2.0) as usize;
                let run = Run::new()
                    .add_text(para_text)
                    .size(heading_size)
                    .bold()
                    .fonts(RunFonts::new().ascii(&font_family).hi_ansi(&font_family));

                let paragraph = Paragraph::new()
                    .add_run(run)
                    .line_spacing(LineSpacing::new().line(line_spacing_twips));

                doc = doc.add_paragraph(paragraph);
            } else {
                // Regular paragraph
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

/// Detect if a line is a section heading
/// Matches: all caps text, numbered sections, or known German medical report sections
fn is_section_heading(text: &str) -> bool {
    let trimmed = text.trim();

    // Skip if empty or too long (headings are usually short)
    if trimmed.is_empty() || trimmed.len() > 80 {
        return false;
    }

    // Check if all uppercase (common heading pattern)
    let is_all_caps = trimmed.chars()
        .filter(|c| c.is_alphabetic())
        .all(|c| c.is_uppercase());

    if is_all_caps && trimmed.len() >= 3 && trimmed.chars().filter(|c| c.is_alphabetic()).count() >= 3 {
        return true;
    }

    // Check for numbered section patterns: "1.", "I.", "1)", "A.", etc.
    let numbered_pattern = trimmed.starts_with(|c: char| c.is_numeric() || c == 'I' || c == 'V' || c == 'X')
        && (trimmed.contains('.') || trimmed.contains(')'))
        && trimmed.len() < 60;

    if numbered_pattern {
        // Check if rest is mostly uppercase
        let after_number: String = trimmed.chars()
            .skip_while(|c| c.is_numeric() || *c == '.' || *c == ')' || *c == ' ' || *c == 'I' || *c == 'V' || *c == 'X')
            .collect();

        if !after_number.is_empty() {
            let upper_count = after_number.chars().filter(|c| c.is_uppercase()).count();
            let alpha_count = after_number.chars().filter(|c| c.is_alphabetic()).count();
            if alpha_count > 0 && upper_count as f32 / alpha_count as f32 > 0.7 {
                return true;
            }
        }
    }

    // Known German medical section headings (case-insensitive contains check)
    let known_sections = [
        "ANAMNESE", "FAMILIENANAMNESE", "EIGENANAMNESE", "SOZIALANAMNESE",
        "BEFUND", "DIAGNOSE", "DIAGNOSEN", "BEURTEILUNG",
        "ZUSAMMENFASSUNG", "EPIKRISE", "PROGNOSE", "THERAPIE",
        "MEDIKATION", "MEDIKAMENTE", "LABOR", "BILDGEBUNG",
        "NEUROLOGISCH", "PSYCHIATRISCH", "PSYCHOPATHOLOGISCH",
        "VORGESCHICHTE", "KRANKENGESCHICHTE", "BESCHWERDEN",
        "LEISTUNGSBEURTEILUNG", "SOZIALMEDIZINISCH", "EMPFEHLUNG",
    ];

    let upper_trimmed = trimmed.to_uppercase();
    for section in &known_sections {
        if upper_trimmed.contains(section) && trimmed.len() < 60 {
            return true;
        }
    }

    // Check for heading ending with colon
    if trimmed.ends_with(':') && trimmed.len() < 50 {
        let without_colon = &trimmed[..trimmed.len()-1];
        let word_count = without_colon.split_whitespace().count();
        if word_count <= 4 {
            return true;
        }
    }

    false
}
