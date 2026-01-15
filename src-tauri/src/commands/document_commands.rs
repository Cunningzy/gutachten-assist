// Component 2.2B: Document Analysis Engine Commands
// Extracts formatting and style information from DOCX files

use tauri::{command, Window, Emitter};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use zip::ZipArchive;
use std::io::{Read, BufReader};
use regex::Regex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentStyleInfo {
    pub document_id: String,
    pub filename: String,
    pub analysis_date: String,
    pub font_family: String,
    pub font_size: f32,
    pub line_spacing: f32,
    pub paragraph_spacing_before: f32,
    pub paragraph_spacing_after: f32,
    pub heading_styles: Vec<HeadingStyle>,
    pub text_alignment: String,
    pub page_margins: PageMargins,
    pub header_footer_info: HeaderFooterInfo,
    pub style_summary: String,
    pub headers_found: Vec<String>,  // Actual header text content found in document
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeadingStyle {
    pub level: u8,
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: String,
    pub color: String,
    pub spacing_before: f32,
    pub spacing_after: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PageMargins {
    pub top: f32,
    pub bottom: f32,
    pub left: f32,
    pub right: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeaderFooterInfo {
    pub has_header: bool,
    pub has_footer: bool,
    pub header_content: String,
    pub footer_content: String,
    pub header_style: Option<HeaderFooterStyle>,
    pub footer_style: Option<HeaderFooterStyle>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeaderFooterStyle {
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: String,
    pub color: String,
    pub alignment: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentAnalysisProgress {
    pub progress: f32,
    pub stage: String,
    pub message: String,
    pub document_id: String,
}

/// Analyze a DOCX document to extract style and formatting information
#[command]
pub async fn analyze_document_style(
    file_path: String,
    document_id: String,
    window: Window,
) -> Result<DocumentStyleInfo, String> {
    // Validate input
    if file_path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("Document file not found: {}", file_path));
    }

    // Check file extension
    let extension = path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !["docx", "doc"].contains(&extension.as_str()) {
        return Err(format!("Unsupported document format: {}. Only .docx and .doc files are supported.", extension));
    }

    // Start analysis process
    window.emit("document_analysis_progress", DocumentAnalysisProgress {
        progress: 0.0,
        stage: "loading".to_string(),
        message: "Dokument wird geladen...".to_string(),
        document_id: document_id.clone(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    // For .doc files, we'll need to handle them differently (for now, return an error)
    if extension == "doc" {
        return Err("Legacy .doc files are not yet supported. Please convert to .docx format.".to_string());
    }

    // Analyze DOCX file
    let document_id_clone = document_id.clone();
    let analysis_result = tokio::task::spawn_blocking(move || {
        analyze_docx_file(&path, &document_id_clone)
    }).await.map_err(|e| format!("Analysis task failed: {}", e))??;

    // Emit progress updates during analysis
    for progress in [20.0, 40.0, 60.0, 80.0] {
        window.emit("document_analysis_progress", DocumentAnalysisProgress {
            progress,
            stage: "analyzing".to_string(),
            message: format!("Stil-Analyse läuft... {}%", progress as u8),
            document_id: document_id.clone(),
        }).map_err(|e| format!("Failed to emit event: {}", e))?;

        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    // Complete analysis
    window.emit("document_analysis_progress", DocumentAnalysisProgress {
        progress: 100.0,
        stage: "completed".to_string(),
        message: "Stil-Analyse abgeschlossen!".to_string(),
        document_id: document_id.clone(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(analysis_result)
}

/// Save analyzed style information as a user template
#[command]
pub async fn save_style_template(
    style_info: DocumentStyleInfo,
    template_name: String,
) -> Result<String, String> {
    // Create user-data directory if it doesn't exist
    let app_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let user_data_dir = app_dir.join("user-data").join("templates");
    fs::create_dir_all(&user_data_dir)
        .map_err(|e| format!("Failed to create templates directory: {}", e))?;

    // Generate template filename
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let safe_name = template_name.chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
        .collect::<String>()
        .replace(' ', "_");

    let template_filename = format!("{}_{}.json", safe_name, timestamp);
    let template_path = user_data_dir.join(&template_filename);

    // Save template to JSON file
    let json_content = serde_json::to_string_pretty(&style_info)
        .map_err(|e| format!("Failed to serialize style template: {}", e))?;

    fs::write(&template_path, json_content)
        .map_err(|e| format!("Failed to write template file: {}", e))?;

    println!("Style template saved: {}", template_path.display());

    Ok(template_path.to_string_lossy().to_string())
}

/// Save uploaded document file to user-data directory
#[command]
pub async fn save_uploaded_document(
    file_data: Vec<u8>,
    filename: String,
    document_id: String,
) -> Result<String, String> {
    // Create user-data directory if it doesn't exist
    let app_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let user_data_dir = app_dir.join("user-data").join("uploads");
    fs::create_dir_all(&user_data_dir)
        .map_err(|e| format!("Failed to create uploads directory: {}", e))?;

    // Generate safe filename
    let safe_filename = filename.chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect::<String>();

    let file_path = user_data_dir.join(format!("{}_{}", document_id, safe_filename));

    // Save file data
    fs::write(&file_path, file_data)
        .map_err(|e| format!("Failed to write document file: {}", e))?;

    println!("Document saved: {}", file_path.display());

    Ok(file_path.to_string_lossy().to_string())
}

/// Get list of saved style templates
#[command]
pub async fn get_saved_templates() -> Result<Vec<String>, String> {
    let app_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let user_data_dir = app_dir.join("user-data").join("templates");

    if !user_data_dir.exists() {
        return Ok(Vec::new());
    }

    let mut templates = Vec::new();

    let entries = fs::read_dir(&user_data_dir)
        .map_err(|e| format!("Failed to read templates directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                templates.push(filename.to_string());
            }
        }
    }

    templates.sort();
    Ok(templates)
}

/// Internal function to analyze DOCX file structure
fn analyze_docx_file(file_path: &PathBuf, document_id: &str) -> Result<DocumentStyleInfo, String> {
    println!("🔍 Starting DOCX analysis for: {}", file_path.display());

    // Check file size
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    println!("📄 File size: {} bytes", metadata.len());

    // Open DOCX as ZIP archive
    let file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open DOCX file: {}", e))?;
    println!("✅ File opened successfully");

    let reader = BufReader::new(file);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| {
            println!("❌ ZIP archive error: {}", e);
            format!("Failed to read DOCX archive (file may be corrupted or not a valid DOCX): {}", e)
        })?;
    println!("✅ ZIP archive opened, {} files found", archive.len());

    // List all files in the archive for debugging
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            println!("📁 Archive contains: {}", file.name());
        }
    }

    // Extract document.xml for content analysis
    println!("🔍 Extracting document.xml...");
    let document_xml = extract_document_xml(&mut archive)?;
    println!("✅ document.xml extracted ({} chars)", document_xml.len());

    // Extract styles.xml for style definitions
    println!("🔍 Extracting styles.xml...");
    let styles_xml = extract_styles_xml(&mut archive)?;
    println!("✅ styles.xml extracted ({} chars)", styles_xml.len());

    // Analyze the extracted XML content
    println!("🔍 Analyzing document content...");
    let style_info = analyze_document_content(&document_xml, &styles_xml, document_id, &mut archive)?;
    println!("✅ Content analysis completed");

    println!("🎉 DOCX analysis completed successfully");
    Ok(style_info)
}

/// Extract document.xml from DOCX archive
fn extract_document_xml(archive: &mut ZipArchive<BufReader<fs::File>>) -> Result<String, String> {
    let mut document_xml = String::new();

    match archive.by_name("word/document.xml") {
        Ok(mut file) => {
            file.read_to_string(&mut document_xml)
                .map_err(|e| format!("Failed to read document.xml: {}", e))?;
        },
        Err(_) => {
            return Err("document.xml not found in DOCX file".to_string());
        }
    }

    Ok(document_xml)
}

/// Extract styles.xml from DOCX archive
fn extract_styles_xml(archive: &mut ZipArchive<BufReader<fs::File>>) -> Result<String, String> {
    let mut styles_xml = String::new();

    match archive.by_name("word/styles.xml") {
        Ok(mut file) => {
            file.read_to_string(&mut styles_xml)
                .map_err(|e| format!("Failed to read styles.xml: {}", e))?;
        },
        Err(_) => {
            // styles.xml is optional, provide default
            println!("Warning: styles.xml not found, using defaults");
        }
    }

    Ok(styles_xml)
}

/// Analyze document content and extract style information
fn analyze_document_content(
    document_xml: &str,
    styles_xml: &str,
    document_id: &str,
    archive: &mut ZipArchive<BufReader<fs::File>>
) -> Result<DocumentStyleInfo, String> {
    println!("📊 Starting document content analysis...");
    println!("📄 Document XML length: {} chars", document_xml.len());
    println!("🎨 Styles XML length: {} chars", styles_xml.len());

    // Debug: Print first 500 chars of document_xml to see structure
    println!("📋 Document XML preview:\n{}", &document_xml[..document_xml.len().min(500)]);

    // Parse basic document properties with improved extraction
    let font_family = extract_font_family(document_xml, styles_xml);
    let font_size = extract_font_size(document_xml, styles_xml);
    let line_spacing = extract_line_spacing(document_xml);
    let text_alignment = extract_text_alignment(document_xml);

    println!("🔍 Extracted properties:");
    println!("  Font Family: {}", font_family);
    println!("  Font Size: {}pt", font_size);
    println!("  Line Spacing: {}", line_spacing);
    println!("  Text Alignment: {}", text_alignment);

    // Extract heading styles
    let heading_styles = extract_heading_styles(document_xml, styles_xml);

    // Extract actual header text content from the document
    let headers_found = extract_header_text_content(document_xml);
    println!("📋 Headers found in document: {:?}", headers_found);

    // Extract page margins (simplified)
    let page_margins = PageMargins {
        top: 2.54,    // Default values in cm
        bottom: 2.54,
        left: 2.54,
        right: 2.54,
    };

    // Extract header/footer info with improved detection
    let header_footer_info = extract_header_footer_info(document_xml, archive);

    // Generate style summary with header/footer info
    let mut summary_parts = vec![
        format!("Hauptschrift: {} ({}pt)", font_family, font_size),
        format!("Zeilenabstand: {}", line_spacing),
        format!("Ausrichtung: {}", text_alignment),
        format!("{} Überschriftenebenen erkannt", heading_styles.len()),
    ];

    if header_footer_info.has_header {
        if let Some(ref header_style) = header_footer_info.header_style {
            summary_parts.push(format!("Kopfzeile: {} ({}pt)",
                header_style.font_family, header_style.font_size));
        } else {
            summary_parts.push("Kopfzeile vorhanden".to_string());
        }
    }

    if header_footer_info.has_footer {
        if let Some(ref footer_style) = header_footer_info.footer_style {
            summary_parts.push(format!("Fußzeile: {} ({}pt)",
                footer_style.font_family, footer_style.font_size));
        } else {
            summary_parts.push("Fußzeile vorhanden".to_string());
        }
    }

    let style_summary = summary_parts.join(", ");

    Ok(DocumentStyleInfo {
        document_id: document_id.to_string(),
        filename: format!("Document_{}", document_id),
        analysis_date: chrono::Utc::now().to_rfc3339(),
        font_family,
        font_size,
        line_spacing,
        paragraph_spacing_before: 0.0,
        paragraph_spacing_after: 0.0,
        heading_styles,
        text_alignment,
        page_margins,
        header_footer_info,
        style_summary,
        headers_found,
    })
}

/// Extract primary font family from document
fn extract_font_family(document_xml: &str, styles_xml: &str) -> String {
    println!("🔤 Extracting font family...");

    // Try multiple patterns for font family extraction
    let font_patterns = vec![
        r#"<w:rFonts[^>]*w:ascii="([^"]+)""#,           // Direct font attribute
        r#"<w:rFonts[^>]*w:hAnsi="([^"]+)""#,           // High ANSI font
        r#"<w:rFonts[^>]*w:cs="([^"]+)""#,              // Complex script font
        r#"<w:name[^>]*w:val="([^"]+)""#,               // Font name in styles
        r#"w:ascii="([^"]+)""#,                         // Simple ascii pattern
    ];

    for pattern in &font_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(document_xml) {
                if let Some(font) = captures.get(1) {
                    let font_name = font.as_str().to_string();
                    println!("  ✅ Found font in document: {}", font_name);
                    return font_name;
                }
            }
        }
    }

    // Try styles.xml as well
    for pattern in &font_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(styles_xml) {
                if let Some(font) = captures.get(1) {
                    let font_name = font.as_str().to_string();
                    println!("  ✅ Found font in styles: {}", font_name);
                    return font_name;
                }
            }
        }
    }

    println!("  ❌ No font found, using default");
    "Times New Roman".to_string()
}

/// Extract primary font size from document
fn extract_font_size(document_xml: &str, styles_xml: &str) -> f32 {
    println!("📏 Extracting font size...");

    // Try multiple patterns for font size extraction
    let size_patterns = vec![
        r#"<w:sz[^>]*w:val="(\d+)""#,                  // Size element with val attribute
        r#"w:sz="(\d+)""#,                             // Direct size attribute
        r#"<w:szCs[^>]*w:val="(\d+)""#,                // Complex script size
        r#"w:val="(\d+)"[^>]*>[^<]*</w:sz>"#,          // Size value in content
    ];

    for pattern in &size_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(document_xml) {
                if let Some(size_str) = captures.get(1) {
                    if let Ok(half_points) = size_str.as_str().parse::<f32>() {
                        let points = half_points / 2.0; // Convert from half-points to points
                        println!("  ✅ Found font size in document: {} half-points = {}pt", half_points, points);
                        return points;
                    }
                }
            }
        }
    }

    // Try styles.xml as well
    for pattern in &size_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(styles_xml) {
                if let Some(size_str) = captures.get(1) {
                    if let Ok(half_points) = size_str.as_str().parse::<f32>() {
                        let points = half_points / 2.0;
                        println!("  ✅ Found font size in styles: {} half-points = {}pt", half_points, points);
                        return points;
                    }
                }
            }
        }
    }

    println!("  ❌ No font size found, using default");
    12.0
}

/// Extract line spacing information
fn extract_line_spacing(document_xml: &str) -> f32 {
    println!("📐 Extracting line spacing...");

    // Try multiple patterns for line spacing extraction
    let spacing_patterns = vec![
        r#"<w:spacing[^>]*w:line="(\d+)""#,                // Line spacing in spacing element
        r#"<w:spacing[^>]*w:lineRule="([^"]+)"[^>]*w:line="(\d+)""#, // With line rule
        r#"w:line="(\d+)""#,                               // Simple line attribute
        r#"<w:pPr[^>]*><w:spacing[^>]*w:line="(\d+)""#,     // In paragraph properties
    ];

    for pattern in spacing_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(document_xml) {
                // Get the last capture group (line value)
                if let Some(spacing_str) = captures.get(captures.len() - 1) {
                    if let Ok(spacing_value) = spacing_str.as_str().parse::<f32>() {
                        // Convert from twips to line spacing multiplier (240 twips = 1.0 spacing)
                        let line_spacing = spacing_value / 240.0;
                        println!("  ✅ Found line spacing: {} twips = {}", spacing_value, line_spacing);
                        return line_spacing;
                    }
                }
            }
        }
    }

    // Check for specific line spacing rules
    if document_xml.contains(r#"w:lineRule="auto""#) {
        println!("  ✅ Found auto line spacing");
        return 1.0; // Auto spacing
    }

    println!("  ❌ No line spacing found, using default");
    1.15
}

/// Extract text alignment information
fn extract_text_alignment(document_xml: &str) -> String {
    println!("🔄 Extracting text alignment...");

    // Look for justification elements
    let alignment_patterns = vec![
        (r#"<w:jc[^>]*w:val="center""#, "center"),
        (r#"<w:jc[^>]*w:val="right""#, "right"),
        (r#"<w:jc[^>]*w:val="both""#, "justify"),
        (r#"<w:jc[^>]*w:val="distribute""#, "justify"),
        (r#"<w:jc[^>]*w:val="left""#, "left"),
        (r#"w:val="center""#, "center"),
        (r#"w:val="right""#, "right"),
        (r#"w:val="both""#, "justify"),
    ];

    for (pattern, alignment) in alignment_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if regex.is_match(document_xml) {
                println!("  ✅ Found text alignment: {}", alignment);
                return alignment.to_string();
            }
        }
    }

    println!("  ❌ No specific alignment found, using default: left");
    "left".to_string()
}

/// Extract heading styles from document
fn extract_heading_styles(document_xml: &str, styles_xml: &str) -> Vec<HeadingStyle> {
    println!("🔍 Extracting heading styles from document...");
    println!("📊 Document XML length: {} chars", document_xml.len());
    println!("📊 Styles XML length: {} chars", styles_xml.len());

    let mut heading_styles = Vec::new();

    // First, try to find heading styles in styles.xml
    if !styles_xml.is_empty() {
        println!("📋 Analyzing styles.xml for heading definitions...");

        // Look for heading style definitions with specific patterns (no generic patterns to avoid duplicates)
        let heading_patterns = vec![
            // English heading patterns
            (r#"<w:style[^>]*w:styleId="Heading1"[^>]*>.*?</w:style>"#, "Heading1", 1),
            (r#"<w:style[^>]*w:styleId="Heading2"[^>]*>.*?</w:style>"#, "Heading2", 2),
            (r#"<w:style[^>]*w:styleId="Heading3"[^>]*>.*?</w:style>"#, "Heading3", 3),
            (r#"<w:style[^>]*w:styleId="Heading4"[^>]*>.*?</w:style>"#, "Heading4", 4),
            (r#"<w:style[^>]*w:styleId="Heading5"[^>]*>.*?</w:style>"#, "Heading5", 5),
            (r#"<w:style[^>]*w:styleId="Heading6"[^>]*>.*?</w:style>"#, "Heading6", 6),
            // German heading patterns
            (r#"<w:style[^>]*w:styleId="berschrift1"[^>]*>.*?</w:style>"#, "Überschrift1", 1),
            (r#"<w:style[^>]*w:styleId="berschrift2"[^>]*>.*?</w:style>"#, "Überschrift2", 2),
            (r#"<w:style[^>]*w:styleId="berschrift3"[^>]*>.*?</w:style>"#, "Überschrift3", 3),
            (r#"<w:style[^>]*w:styleId="berschrift4"[^>]*>.*?</w:style>"#, "Überschrift4", 4),
            (r#"<w:style[^>]*w:styleId="berschrift5"[^>]*>.*?</w:style>"#, "Überschrift5", 5),
            (r#"<w:style[^>]*w:styleId="berschrift6"[^>]*>.*?</w:style>"#, "Überschrift6", 6),
            // Alternative patterns (specific only)
            (r#"<w:style[^>]*w:styleId="Title"[^>]*>.*?</w:style>"#, "Title", 1),
            (r#"<w:style[^>]*w:styleId="Subtitle"[^>]*>.*?</w:style>"#, "Subtitle", 2),
        ];

        for (pattern, name, level) in heading_patterns.iter() {
            println!("🔍 Searching for pattern: {}", name);
            if let Ok(regex) = Regex::new(pattern) {
                if let Some(style_match) = regex.find(styles_xml) {
                    let style_content = style_match.as_str();
                    println!("✅ Found heading style {}: {} chars", name, style_content.len());

                    // Extract font info from this heading style
                    let font_family = extract_font_from_style(style_content);
                    let font_size = extract_size_from_style(style_content);
                    let font_weight = if style_content.contains("<w:b") { "bold".to_string() } else { "normal".to_string() };

                    println!("   📝 Extracted: {} {}pt {} (level {})", font_family, font_size, font_weight, level);

                    heading_styles.push(HeadingStyle {
                        level: *level as u8,
                        font_family,
                        font_size,
                        font_weight,
                        color: "#000000".to_string(),
                        spacing_before: 12.0,
                        spacing_after: 6.0,
                    });
                } else {
                    println!("❌ No match found for {}", name);
                }
            } else {
                println!("❌ Failed to compile regex for {}", name);
            }
        }
    } else {
        println!("⚠️ Styles XML is empty");
    }

    // If no styles found in styles.xml, look for actual heading paragraphs in document.xml
    if heading_styles.is_empty() {
        println!("📄 No heading styles in styles.xml, scanning document.xml for heading paragraphs...");

        // Look for paragraphs that use heading styles or have heading-like formatting
        let heading_paragraph_patterns = vec![
            (r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="Heading1"[^>]*/>.*?</w:p>"#, "Heading1 paragraph", 1),
            (r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="Heading2"[^>]*/>.*?</w:p>"#, "Heading2 paragraph", 2),
            (r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="Heading3"[^>]*/>.*?</w:p>"#, "Heading3 paragraph", 3),
            (r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="berschrift1"[^>]*/>.*?</w:p>"#, "Überschrift1 paragraph", 1),
            (r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="berschrift2"[^>]*/>.*?</w:p>"#, "Überschrift2 paragraph", 2),
            (r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="Title"[^>]*/>.*?</w:p>"#, "Title paragraph", 1),
        ];

        for (pattern, name, level) in heading_paragraph_patterns.iter() {
            println!("🔍 Searching for paragraph pattern: {}", name);
            if let Ok(regex) = Regex::new(pattern) {
                if let Some(paragraph_match) = regex.find(document_xml) {
                    let paragraph_content = paragraph_match.as_str();
                    println!("✅ Found heading paragraph {}: {} chars", name, paragraph_content.len());

                    let font_family = extract_font_from_paragraph(paragraph_content);
                    let font_size = extract_size_from_paragraph(paragraph_content);
                    let font_weight = if paragraph_content.contains("<w:b") { "bold".to_string() } else { "normal".to_string() };

                    println!("   📝 Extracted from paragraph: {} {}pt {} (level {})", font_family, font_size, font_weight, level);

                    heading_styles.push(HeadingStyle {
                        level: *level as u8,
                        font_family,
                        font_size,
                        font_weight,
                        color: "#000000".to_string(),
                        spacing_before: 12.0,
                        spacing_after: 6.0,
                    });
                } else {
                    println!("❌ No match found for {}", name);
                }
            }
        }
    }

    if heading_styles.is_empty() {
        println!("⚠️ No heading styles found in document, returning empty list");
    } else {
        println!("✅ Extracted {} heading styles", heading_styles.len());
        for (i, style) in heading_styles.iter().enumerate() {
            println!("   Style {}: {} {}pt {}", i + 1, style.font_family, style.font_size, style.font_weight);
        }
    }

    // Deduplicate heading styles by level - keep only the first occurrence of each level
    println!("🔧 Deduplicating heading styles...");
    println!("📊 Before deduplication: {} heading styles found", heading_styles.len());

    let mut unique_levels = std::collections::HashSet::new();
    let mut deduplicated_styles = Vec::new();

    for style in heading_styles {
        if unique_levels.insert(style.level) {
            println!("✅ Keeping heading level {} ({} {}pt {})",
                style.level, style.font_family, style.font_size, style.font_weight);
            deduplicated_styles.push(style);
        } else {
            println!("⚠️ Removing duplicate heading level {} ({} {}pt {})",
                style.level, style.font_family, style.font_size, style.font_weight);
        }
    }

    println!("📊 After deduplication: {} unique heading styles", deduplicated_styles.len());

    // Sort by level for consistent output
    deduplicated_styles.sort_by_key(|style| style.level);

    deduplicated_styles
}

/// Extract actual header text content from document (like "FAMILIENANAMNESE", "DIAGNOSE", etc.)
fn extract_header_text_content(document_xml: &str) -> Vec<String> {
    println!("🔍 Extracting header text content from document...");

    let mut headers = Vec::new();

    // Common German medical report section headers to look for
    let known_headers = vec![
        "FAMILIENANAMNESE", "EIGENANAMNESE", "AKTUELLE BESCHWERDEN",
        "BEFUND", "DIAGNOSE", "DIAGNOSEN", "THERAPIE", "EPIKRISE",
        "BEURTEILUNG", "SOZIALANAMNESE", "ARBEITSANAMNESE",
        "NEUROLOGISCHER BEFUND", "PSYCHIATRISCHER BEFUND",
        "PSYCHOPATHOLOGISCHER BEFUND", "KÖRPERLICHE UNTERSUCHUNG",
        "ZUSAMMENFASSUNG", "EMPFEHLUNG", "EMPFEHLUNGEN",
        "ANAMNESE", "VORGESCHICHTE", "MEDIKATION", "MEDIKAMENTE",
        "LABORWERTE", "APPARATIVE DIAGNOSTIK", "BILDGEBUNG",
        "PSYCHOLOGISCHE TESTUNG", "NEUROPSYCHOLOGISCHE TESTUNG",
        "SOZIALMEDIZINISCHE BEURTEILUNG", "LEISTUNGSBEURTEILUNG",
        "PROGNOSE", "VERLAUF", "KRANKHEITSVERLAUF",
        // Also check for lowercase and mixed case variations
        "Familienanamnese", "Eigenanamnese", "Aktuelle Beschwerden",
        "Befund", "Diagnose", "Diagnosen", "Therapie", "Epikrise",
        "Beurteilung", "Sozialanamnese", "Arbeitsanamnese",
    ];

    // Method 1: Look for paragraphs with heading styles that contain text
    let heading_paragraph_patterns = vec![
        r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="(Heading\d|berschrift\d|Title)"[^>]*/>.*?<w:t[^>]*>([^<]+)</w:t>.*?</w:p>"#,
        r#"<w:p[^>]*>.*?<w:pStyle[^>]*w:val="(Heading\d)"[^>]*/>.*?</w:p>"#,
    ];

    for pattern in heading_paragraph_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            for captures in regex.captures_iter(document_xml) {
                // Try to get the text content
                if let Some(text) = captures.get(2) {
                    let header_text = text.as_str().trim().to_string();
                    if !header_text.is_empty() && !headers.contains(&header_text) {
                        println!("✅ Found header from style: {}", header_text);
                        headers.push(header_text);
                    }
                }
            }
        }
    }

    // Method 2: Look for known medical report headers in the document text
    // Extract all text elements and check if any match known headers
    if let Ok(text_regex) = Regex::new(r#"<w:t[^>]*>([^<]+)</w:t>"#) {
        for captures in text_regex.captures_iter(document_xml) {
            if let Some(text) = captures.get(1) {
                let text_content = text.as_str().trim();

                // Check if this text matches any known header
                for known_header in &known_headers {
                    if text_content.eq_ignore_ascii_case(known_header) ||
                       text_content.to_uppercase() == known_header.to_uppercase() {
                        let header_text = text_content.to_string();
                        if !headers.contains(&header_text) &&
                           !headers.iter().any(|h| h.eq_ignore_ascii_case(&header_text)) {
                            println!("✅ Found known header: {}", header_text);
                            headers.push(header_text);
                        }
                    }
                }

                // Also check for all-caps text that looks like a header (short, no punctuation)
                if text_content.len() >= 4 &&
                   text_content.len() <= 50 &&
                   text_content.chars().all(|c| c.is_uppercase() || c.is_whitespace()) &&
                   !text_content.contains('.') &&
                   !text_content.contains(',') {
                    let header_text = text_content.to_string();
                    if !headers.contains(&header_text) {
                        println!("✅ Found uppercase header: {}", header_text);
                        headers.push(header_text);
                    }
                }
            }
        }
    }

    // Method 3: Look for bold paragraphs that might be headers
    // These are often marked with <w:b/> or <w:b w:val="true"/>
    let bold_patterns = vec![
        r#"<w:p[^>]*>.*?<w:b[^>]*/?>.*?<w:t[^>]*>([^<]+)</w:t>.*?</w:p>"#,
        r#"<w:r[^>]*>.*?<w:b[^>]*/?>.*?<w:t[^>]*>([^<]+)</w:t>.*?</w:r>"#,
    ];

    for pattern in bold_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            for captures in regex.captures_iter(document_xml) {
                if let Some(text) = captures.get(1) {
                    let text_content = text.as_str().trim();

                    // Check if it's a short text that could be a header
                    if text_content.len() >= 4 && text_content.len() <= 50 {
                        // Check against known headers
                        for known_header in &known_headers {
                            if text_content.eq_ignore_ascii_case(known_header) {
                                let header_text = text_content.to_string();
                                if !headers.contains(&header_text) &&
                                   !headers.iter().any(|h| h.eq_ignore_ascii_case(&header_text)) {
                                    println!("✅ Found bold header: {}", header_text);
                                    headers.push(header_text);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    println!("📊 Total headers extracted: {}", headers.len());
    for (i, header) in headers.iter().enumerate() {
        println!("   {}: {}", i + 1, header);
    }

    headers
}

/// Extract font family from a style definition
fn extract_font_from_style(style_content: &str) -> String {
    let font_patterns = vec![
        r#"<w:rFonts[^>]*w:ascii="([^"]+)""#,
        r#"<w:name[^>]*w:val="([^"]+)""#,
    ];

    for pattern in font_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if let Some(captures) = regex.captures(style_content) {
                if let Some(font) = captures.get(1) {
                    return font.as_str().to_string();
                }
            }
        }
    }

    "Arial".to_string() // fallback
}

/// Extract font size from a style definition
fn extract_size_from_style(style_content: &str) -> f32 {
    if let Ok(regex) = Regex::new(r#"<w:sz[^>]*w:val="([^"]+)""#) {
        if let Some(captures) = regex.captures(style_content) {
            if let Some(size_str) = captures.get(1) {
                // Word uses half-points, so divide by 2
                if let Ok(size) = size_str.as_str().parse::<f32>() {
                    return size / 2.0;
                }
            }
        }
    }

    16.0 // fallback
}

/// Extract font family from a paragraph
fn extract_font_from_paragraph(paragraph_content: &str) -> String {
    extract_font_from_style(paragraph_content) // same logic
}

/// Extract font size from a paragraph
fn extract_size_from_paragraph(paragraph_content: &str) -> f32 {
    extract_size_from_style(paragraph_content) // same logic
}

/// Extract header and footer information from DOCX
fn extract_header_footer_info(document_xml: &str, archive: &mut ZipArchive<BufReader<fs::File>>) -> HeaderFooterInfo {
    println!("🔍 Extracting header/footer information...");

    let mut has_header = false;
    let mut has_footer = false;
    let mut header_content = String::new();
    let mut footer_content = String::new();
    let mut header_style = None;
    let mut footer_style = None;

    // Check for header/footer references in document.xml first
    let doc_has_header = document_xml.contains("<w:headerReference") ||
                        document_xml.contains("w:hdr") ||
                        document_xml.contains("headerReference");
    let doc_has_footer = document_xml.contains("<w:footerReference") ||
                        document_xml.contains("w:ftr") ||
                        document_xml.contains("footerReference");

    println!("📋 Header reference found in document.xml: {}", doc_has_header);
    println!("📋 Footer reference found in document.xml: {}", doc_has_footer);

    // Collect all file names first to avoid borrowing conflicts
    let mut file_names = Vec::new();
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            file_names.push(file.name().to_string());
        }
    }

    println!("📁 Found {} files in DOCX archive", file_names.len());

    // Prioritize header files - main header first, then fallbacks
    let mut header_files: Vec<(String, u8)> = file_names.iter()
        .filter(|name| name.contains("header") || name.starts_with("word/header"))
        .map(|name| {
            let priority = if name == "word/header1.xml" { 1 }
                          else if name.contains("header1") { 2 }
                          else if name.contains("header.xml") { 3 }
                          else { 9 };
            (name.clone(), priority)
        })
        .collect();

    // Sort by priority (lower number = higher priority)
    header_files.sort_by_key(|(_, priority)| *priority);

    // Now search for header files in priority order
    for (file_name, priority) in header_files {
        println!("🔍 Checking header file: {} (priority: {})", file_name, priority);

        // Try to extract content and style from header file
        if let Ok(mut header_file) = archive.by_name(&file_name) {
            let mut content = String::new();
            if header_file.read_to_string(&mut content).is_ok() {
                // Extract text content from header XML
                let extracted_content = extract_text_from_xml(&content);

                // Only consider it a real header if it has actual content
                if !extracted_content.trim().is_empty() {
                    // Only update if we haven't found a header yet, or this is higher priority
                    if !has_header || priority <= 2 {
                        has_header = true;
                        header_content = extracted_content;
                        println!("✅ Using header from {}: {}...",
                            file_name, header_content.chars().take(50).collect::<String>());

                        // Extract style information from header XML
                        let new_style = extract_header_footer_style(&content, "header");
                        header_style = Some(new_style);
                        if let Some(ref style) = header_style {
                            println!("🎨 Selected header style: {} {}pt {} {}",
                                style.font_family, style.font_size, style.font_weight, style.alignment);
                        }

                        // If this is the main header, we're done
                        if priority == 1 {
                            println!("🎯 Found main header file, stopping search");
                            break;
                        }
                    } else {
                        println!("⏭️ Skipping {} - already have higher priority header", file_name);
                    }
                } else {
                    println!("⚠️ Header file exists but has no content: {}", file_name);
                }
            }
        }
    }

    // Now search for footer files
    for file_name in &file_names {
        if file_name.contains("footer") || file_name.starts_with("word/footer") {
            println!("🔍 Checking footer file: {}", file_name);

            // Try to extract content and style from footer file
            if let Ok(mut footer_file) = archive.by_name(file_name) {
                let mut content = String::new();
                if footer_file.read_to_string(&mut content).is_ok() {
                    // Extract text content from footer XML
                    let extracted_content = extract_text_from_xml(&content);

                    // Only consider it a real footer if it has meaningful content (not just page numbers)
                    let trimmed_content = extracted_content.trim();
                    if !trimmed_content.is_empty() && !is_just_page_number(trimmed_content) {
                        has_footer = true;
                        footer_content = extracted_content;
                        println!("✅ Found real footer with content: {}...",
                            footer_content.chars().take(50).collect::<String>());

                        // Extract style information from footer XML
                        footer_style = Some(extract_header_footer_style(&content, "footer"));
                        if let Some(ref style) = footer_style {
                            println!("🎨 Footer style: {} {}pt {} {}",
                                style.font_family, style.font_size, style.font_weight, style.alignment);
                        }
                    } else {
                        println!("⚠️ Footer file exists but only contains page numbers or empty content: {}", file_name);
                    }
                }
            }
        }
    }

    // Only use document.xml references as a fallback if we found references but no actual content
    if doc_has_header && !has_header {
        println!("📋 Header reference found in document.xml but no content extracted");
        // Don't automatically set has_header = true without content
    }
    if doc_has_footer && !has_footer {
        println!("📋 Footer reference found in document.xml but no content extracted");
        // Don't automatically set has_footer = true without content
    }

    println!("🎯 Final header/footer detection: Header={}, Footer={}", has_header, has_footer);

    HeaderFooterInfo {
        has_header,
        has_footer,
        header_content,
        footer_content,
        header_style,
        footer_style,
    }
}

/// Extract style information from header/footer XML content
fn extract_header_footer_style(xml_content: &str, element_type: &str) -> HeaderFooterStyle {
    println!("🎨 Extracting {} style information...", element_type);

    // Extract font family from run properties (w:rPr > w:rFonts)
    let font_family = extract_font_from_style(xml_content);

    // Extract font size from run properties (w:rPr > w:sz)
    let font_size = extract_size_from_style(xml_content);

    // Extract font weight (look for bold tags)
    let font_weight = if xml_content.contains("<w:b") || xml_content.contains("<w:b/>") {
        "bold".to_string()
    } else {
        "normal".to_string()
    };

    // Extract color (w:rPr > w:color)
    let color = extract_color_from_style(xml_content);

    // Extract alignment from paragraph properties (w:pPr > w:jc)
    let alignment = extract_alignment_from_xml(xml_content);

    println!("🎨 Extracted {} style: {} {}pt {} {} {}",
        element_type, font_family, font_size, font_weight, color, alignment);

    HeaderFooterStyle {
        font_family,
        font_size,
        font_weight,
        color,
        alignment,
    }
}

/// Extract alignment from XML content
fn extract_alignment_from_xml(xml_content: &str) -> String {
    // Look for paragraph justification (w:jc w:val="...")
    if let Ok(regex) = Regex::new(r#"<w:jc[^>]*w:val="([^"]*)"[^>]*/?>"#) {
        if let Some(capture) = regex.captures(xml_content) {
            if let Some(alignment) = capture.get(1) {
                let alignment_value = alignment.as_str();
                println!("📐 Found alignment: {}", alignment_value);
                return match alignment_value {
                    "left" => "left".to_string(),
                    "right" => "right".to_string(),
                    "center" => "center".to_string(),
                    "both" | "distribute" => "justify".to_string(),
                    _ => alignment_value.to_string(),
                };
            }
        }
    }
    "left".to_string() // default
}

/// Check if content is just a page number or similar automatic content
fn is_just_page_number(content: &str) -> bool {
    let trimmed = content.trim();

    // Check if it's just a number (page number)
    if trimmed.parse::<u32>().is_ok() {
        return true;
    }

    // Check if it's a simple page number pattern like "Page 1", "Seite 1", etc.
    if let Ok(regex) = Regex::new(r"^(page|seite|p\.)\s*\d+$") {
        if regex.is_match(&trimmed.to_lowercase()) {
            return true;
        }
    }

    // Check if it's just "- N -" pattern
    if let Ok(regex) = Regex::new(r"^-\s*\d+\s*-$") {
        if regex.is_match(trimmed) {
            return true;
        }
    }

    false
}

/// Extract color from style content
fn extract_color_from_style(style_content: &str) -> String {
    // Look for color definitions (w:color w:val="...")
    if let Ok(regex) = Regex::new(r#"<w:color[^>]*w:val="([^"]*)"[^>]*/?>"#) {
        if let Some(capture) = regex.captures(style_content) {
            if let Some(color) = capture.get(1) {
                let color_value = color.as_str();
                if color_value != "auto" && !color_value.is_empty() {
                    println!("🎨 Found color: #{}", color_value);
                    return format!("#{}", color_value);
                }
            }
        }
    }
    "#000000".to_string() // default black
}

/// Extract text content from XML (simplified)
fn extract_text_from_xml(xml_content: &str) -> String {
    // Simple text extraction - removes XML tags and extracts text content
    if let Ok(regex) = Regex::new(r"<w:t[^>]*>([^<]*)</w:t>") {
        let mut text_parts = Vec::new();
        for capture in regex.captures_iter(xml_content) {
            if let Some(text) = capture.get(1) {
                text_parts.push(text.as_str().trim());
            }
        }
        text_parts.join(" ").trim().to_string()
    } else {
        String::new()
    }
}