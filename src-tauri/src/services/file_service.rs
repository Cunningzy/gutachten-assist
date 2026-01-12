// File management service for medical documents

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: String,
    pub modified: String,
    pub file_type: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationResult {
    pub success: bool,
    pub message: String,
    pub file_info: Option<FileInfo>,
}

pub struct FileService {
    app_data_dir: PathBuf,
}

impl FileService {
    /// Create a new FileService instance
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self { app_data_dir }
    }
    
    /// Get file information
    pub async fn get_file_info(&self, file_path: &Path) -> Result<FileInfo, String> {
        if !file_path.exists() {
            return Err(format!("File not found: {:?}", file_path));
        }
        
        let metadata = std::fs::metadata(file_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let file_name = file_path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        let extension = file_path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        let mime_type = self.get_mime_type(&extension);
        
        Ok(FileInfo {
            id: Uuid::new_v4().to_string(),
            name: file_name,
            path: file_path.to_string_lossy().to_string(),
            size: metadata.len(),
            created: format_system_time(metadata.created().ok()),
            modified: format_system_time(metadata.modified().ok()),
            file_type: extension,
            mime_type,
        })
    }
    
    /// Validate file for medical document processing
    pub async fn validate_medical_file(&self, file_path: &Path) -> Result<bool, String> {
        let file_info = self.get_file_info(file_path).await?;
        
        // Check file type
        let medical_file_types = [
            "pdf", "doc", "docx", "txt", "rtf",  // Documents
            "wav", "mp3", "m4a", "flac", "ogg",  // Audio
            "png", "jpg", "jpeg", "tiff", "bmp", // Images
        ];
        
        if !medical_file_types.contains(&file_info.file_type.as_str()) {
            return Err(format!(
                "Unsupported file type: {}. Supported types: {:?}",
                file_info.file_type, medical_file_types
            ));
        }
        
        // Check file size limits
        const MAX_DOCUMENT_SIZE: u64 = 100 * 1024 * 1024;  // 100MB
        const MAX_AUDIO_SIZE: u64 = 500 * 1024 * 1024;     // 500MB
        const MAX_IMAGE_SIZE: u64 = 50 * 1024 * 1024;      // 50MB
        
        let max_size = match file_info.file_type.as_str() {
            "wav" | "mp3" | "m4a" | "flac" | "ogg" => MAX_AUDIO_SIZE,
            "png" | "jpg" | "jpeg" | "tiff" | "bmp" => MAX_IMAGE_SIZE,
            _ => MAX_DOCUMENT_SIZE,
        };
        
        if file_info.size > max_size {
            return Err(format!(
                "File too large: {} MB (max: {} MB for {} files)",
                file_info.size / 1024 / 1024,
                max_size / 1024 / 1024,
                file_info.file_type
            ));
        }
        
        Ok(true)
    }
    
    /// Copy file to application data directory
    pub async fn import_medical_file(&self, source_path: &Path) -> Result<FileOperationResult, String> {
        // Validate the file first
        self.validate_medical_file(source_path).await?;
        
        // Create import directory structure
        let import_dir = self.app_data_dir.join("imported_files");
        let date_dir = import_dir.join(chrono::Utc::now().format("%Y-%m-%d").to_string());
        
        std::fs::create_dir_all(&date_dir)
            .map_err(|e| format!("Failed to create import directory: {}", e))?;
        
        // Generate unique filename
        let file_name = source_path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown");
        
        let unique_name = format!("{}_{}", Uuid::new_v4().simple(), file_name);
        let destination_path = date_dir.join(unique_name);
        
        // Copy the file
        std::fs::copy(source_path, &destination_path)
            .map_err(|e| format!("Failed to copy file: {}", e))?;
        
        // Get file info for the copied file
        let file_info = self.get_file_info(&destination_path).await?;
        
        Ok(FileOperationResult {
            success: true,
            message: format!("File imported successfully to: {:?}", destination_path),
            file_info: Some(file_info),
        })
    }
    
    /// Create temporary file for processing
    pub async fn create_temp_file(&self, content: &[u8], extension: &str) -> Result<PathBuf, String> {
        let temp_dir = self.app_data_dir.join("temp");
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
        
        let temp_filename = format!("temp_{}_{}.{}", 
            Uuid::new_v4().simple(),
            chrono::Utc::now().timestamp(),
            extension
        );
        
        let temp_path = temp_dir.join(temp_filename);
        
        std::fs::write(&temp_path, content)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        
        Ok(temp_path)
    }
    
    /// Cleanup temporary files older than specified hours
    pub async fn cleanup_temp_files(&self, hours_old: u64) -> Result<u64, String> {
        let temp_dir = self.app_data_dir.join("temp");
        
        if !temp_dir.exists() {
            return Ok(0);
        }
        
        let cutoff_time = std::time::SystemTime::now() - 
            std::time::Duration::from_secs(hours_old * 3600);
        
        let mut deleted_count = 0;
        
        let entries = std::fs::read_dir(&temp_dir)
            .map_err(|e| format!("Failed to read temp directory: {}", e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                let metadata = std::fs::metadata(&path)
                    .map_err(|e| format!("Failed to read metadata: {}", e))?;
                
                if let Ok(created) = metadata.created() {
                    if created < cutoff_time {
                        if std::fs::remove_file(&path).is_ok() {
                            deleted_count += 1;
                        }
                    }
                }
            }
        }
        
        Ok(deleted_count)
    }
    
    /// Get MIME type from file extension
    fn get_mime_type(&self, extension: &str) -> String {
        match extension {
            // Audio
            "wav" => "audio/wav",
            "mp3" => "audio/mpeg",
            "m4a" => "audio/mp4",
            "flac" => "audio/flac",
            "ogg" => "audio/ogg",
            
            // Documents
            "pdf" => "application/pdf",
            "doc" => "application/msword",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "txt" => "text/plain",
            "rtf" => "application/rtf",
            
            // Images
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "tiff" | "tif" => "image/tiff",
            "bmp" => "image/bmp",
            
            _ => "application/octet-stream",
        }.to_string()
    }
    
    /// Get supported file types for different operations
    pub fn get_supported_file_types() -> Vec<(String, Vec<String>)> {
        vec![
            ("Audio Processing".to_string(), vec![
                "wav".to_string(), "mp3".to_string(), "m4a".to_string(), 
                "flac".to_string(), "ogg".to_string()
            ]),
            ("Document Processing".to_string(), vec![
                "pdf".to_string(), "doc".to_string(), "docx".to_string(), 
                "txt".to_string(), "rtf".to_string()
            ]),
            ("Image OCR".to_string(), vec![
                "png".to_string(), "jpg".to_string(), "jpeg".to_string(), 
                "tiff".to_string(), "bmp".to_string()
            ]),
        ]
    }
}

/// Format system time for display
fn format_system_time(time: Option<std::time::SystemTime>) -> String {
    match time {
        Some(time) => {
            let datetime: chrono::DateTime<chrono::Utc> = time.into();
            datetime.format("%Y-%m-%d %H:%M:%S UTC").to_string()
        }
        None => "Unknown".to_string(),
    }
}