// Audio processing commands

use tauri::{command, Window, Emitter};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub confidence: f32,
    pub processing_time_ms: u32,
    pub language: String,
    pub segments: Vec<TranscriptionSegment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionSegment {
    pub start_time: f32,
    pub end_time: f32,
    pub text: String,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioProcessingProgress {
    pub progress: f32,
    pub stage: String,
    pub message: String,
}

/// Process audio file with Whisper model
#[command]
pub async fn process_audio_file(
    file_path: String,
    window: Window,
) -> Result<TranscriptionResult, String> {
    // Validate input
    if file_path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }
    
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }
    
    // Check file extension
    let extension = path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let supported_formats = ["wav", "mp3", "m4a", "flac", "ogg", "webm"];
    if !supported_formats.contains(&extension.as_str()) {
        return Err(format!(
            "Unsupported audio format: {}. Supported formats: {:?}",
            extension, supported_formats
        ));
    }
    
    // Emit processing started
    window.emit("audio_processing_progress", AudioProcessingProgress {
        progress: 0.0,
        stage: "loading".to_string(),
        message: format!("Audio-Datei wird geladen: {}", path.file_name().unwrap_or_default().to_string_lossy()),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;
    
    // Simulate audio loading
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    
    window.emit("audio_processing_progress", AudioProcessingProgress {
        progress: 0.2,
        stage: "preprocessing".to_string(),
        message: "Audio wird für Spracherkennung vorbereitet...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;
    
    // Simulate preprocessing
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    
    window.emit("audio_processing_progress", AudioProcessingProgress {
        progress: 0.4,
        stage: "transcribing".to_string(),
        message: "Spracherkennung läuft...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;
    
    // Real Whisper transcription
    window.emit("audio_processing_progress", AudioProcessingProgress {
        progress: 0.6,
        stage: "transcribing".to_string(),
        message: "Whisper-Spracherkennung läuft...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    let transcription_start = std::time::Instant::now();

    // Perform transcription using Python subprocess
    let result = tokio::task::spawn_blocking(move || {
        perform_whisper_transcription(&path)
    }).await.map_err(|e| format!("Transcription task failed: {}", e))??;

    let processing_time = transcription_start.elapsed().as_millis() as u32;

    window.emit("audio_processing_progress", AudioProcessingProgress {
        progress: 0.9,
        stage: "postprocessing".to_string(),
        message: "Transkription wird nachbearbeitet...".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    // Emit completion
    window.emit("audio_processing_progress", AudioProcessingProgress {
        progress: 1.0,
        stage: "completed".to_string(),
        message: "Echte Spracherkennung abgeschlossen!".to_string(),
    }).map_err(|e| format!("Failed to emit event: {}", e))?;

    // Return real transcription result
    Ok(TranscriptionResult {
        text: result.text,
        confidence: result.confidence,
        processing_time_ms: processing_time,
        language: "de".to_string(),
        segments: result.segments,
    })
}

/// Save audio blob data to file for processing (Enhanced for new architecture)
#[command]
pub async fn save_audio_file(
    audio_data: Vec<u8>,
    filename: Option<String>,
) -> Result<String, String> {
    // Use system temp directory for audio storage
    let temp_dir = std::env::temp_dir();

    // Generate unique filename with timestamp
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let base_name = filename.unwrap_or_else(|| "recording".to_string());
    let full_filename = format!("{}_{}.webm", base_name, timestamp);

    let file_path = temp_dir.join(&full_filename);

    // Save the raw audio data
    fs::write(&file_path, audio_data)
        .map_err(|e| format!("Failed to write audio file: {}", e))?;

    println!("Audio file saved: {} ({} bytes)", file_path.display(), fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0));

    // Return the actual path as string
    file_path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

/// Convert audio file to WAV format using FFmpeg (New architecture)
#[command]
pub async fn convert_audio_to_wav(
    input_path: String,
    output_filename: Option<String>,
) -> Result<String, String> {
    let input_path_buf = PathBuf::from(&input_path);

    if !input_path_buf.exists() {
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Generate output filename
    let temp_dir = std::env::temp_dir();
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let base_name = output_filename.unwrap_or_else(|| "converted".to_string());
    let wav_filename = format!("{}_{}.wav", base_name, timestamp);
    let output_path = temp_dir.join(&wav_filename);

    // Clone paths for the closure
    let output_path_clone = output_path.clone();

    // Convert to WAV using FFmpeg subprocess
    let result = tokio::task::spawn_blocking(move || {
        convert_to_wav_with_ffmpeg(&input_path_buf, &output_path_clone)
    }).await.map_err(|e| format!("Conversion task failed: {}", e))?;

    result?;

    println!("Audio converted to WAV: {}", output_path.display());

    // Return the WAV file path
    output_path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

/// Transcribe audio file using simplified pipeline (New architecture)
#[command]
pub async fn transcribe_audio_simple(
    audio_path: String,
    convert_to_wav: Option<bool>,
) -> Result<TranscriptionResult, String> {
    let input_path = PathBuf::from(&audio_path);

    if !input_path.exists() {
        return Err(format!("Audio file does not exist: {}", audio_path));
    }

    // Step 1: Convert to WAV if requested
    let wav_path = if convert_to_wav.unwrap_or(true) {
        println!("Converting audio to WAV format...");
        let input_path_clone = input_path.clone();
        let wav_result = tokio::task::spawn_blocking(move || {
            let temp_dir = std::env::temp_dir();
            let wav_filename = format!("whisper_input_{}.wav", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
            let wav_path = temp_dir.join(&wav_filename);

            convert_to_wav_with_ffmpeg(&input_path_clone, &wav_path)?;
            Ok::<PathBuf, String>(wav_path)
        }).await.map_err(|e| format!("WAV conversion failed: {}", e))??;

        wav_result
    } else {
        input_path.clone()
    };

    // Step 2: Transcribe with Whisper
    println!("Starting Whisper transcription...");
    let transcription_start = std::time::Instant::now();

    // Clone wav_path for the transcription closure
    let wav_path_clone = wav_path.clone();
    let result = tokio::task::spawn_blocking(move || {
        perform_whisper_transcription(&wav_path_clone)
    }).await.map_err(|e| format!("Transcription task failed: {}", e))??;

    let processing_time = transcription_start.elapsed().as_millis() as u32;

    // Step 3: Clean up temporary files if we converted
    if convert_to_wav.unwrap_or(true) && wav_path != input_path {
        if let Err(e) = fs::remove_file(&wav_path) {
            println!("Warning: Failed to clean up temporary WAV file: {}", e);
        }
    }

    Ok(TranscriptionResult {
        text: result.text,
        confidence: result.confidence,
        processing_time_ms: processing_time,
        language: "de".to_string(),
        segments: result.segments,
    })
}

/// Validate audio file for processing
#[command]
pub async fn validate_audio_file(file_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    // Check file size (limit to 500MB for now)
    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    
    const MAX_FILE_SIZE: u64 = 500 * 1024 * 1024; // 500MB
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large: {} MB. Maximum size: {} MB",
            metadata.len() / 1024 / 1024,
            MAX_FILE_SIZE / 1024 / 1024
        ));
    }
    
    // Check file extension
    let extension = path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let supported_formats = ["wav", "mp3", "m4a", "flac", "ogg", "webm"];
    if !supported_formats.contains(&extension.as_str()) {
        return Err(format!(
            "Unsupported audio format: {}. Supported formats: {:?}",
            extension, supported_formats
        ));
    }
    
    Ok(true)
}


/// Internal result structure for Whisper transcription
struct WhisperTranscriptionResult {
    text: String,
    confidence: f32,
    segments: Vec<TranscriptionSegment>,
}

/// Convert audio file to WAV using FFmpeg subprocess
fn convert_to_wav_with_ffmpeg(input_path: &PathBuf, output_path: &PathBuf) -> Result<(), String> {
    println!("Converting {} to WAV format using FFmpeg...", input_path.display());

    // Try multiple FFmpeg executable locations
    let ffmpeg_commands = [
        "ffmpeg",                    // In PATH
        "ffmpeg.exe",               // Windows with extension
        r"C:\ffmpeg\bin\ffmpeg.exe", // Common installation path
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ];

    let mut last_error = String::new();
    let mut conversion_success = false;

    for ffmpeg_cmd in &ffmpeg_commands {
        println!("Trying FFmpeg command: {}", ffmpeg_cmd);

        match Command::new(ffmpeg_cmd)
            .arg("-i")
            .arg(input_path.to_str().ok_or("Invalid input path")?)
            .arg("-ac")
            .arg("1")          // Mono channel (recommended for Whisper)
            .arg("-ar")
            .arg("16000")      // 16kHz sample rate (optimized for Whisper)
            .arg("-y")         // Overwrite output file
            .arg(output_path.to_str().ok_or("Invalid output path")?)
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    conversion_success = true;
                    println!("FFmpeg conversion successful: {}", ffmpeg_cmd);
                    break;
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    last_error = format!("FFmpeg failed with {}: {}", ffmpeg_cmd, stderr);
                    println!("{}", last_error);
                }
            },
            Err(e) => {
                last_error = format!("Failed to execute {}: {}", ffmpeg_cmd, e);
                println!("{}", last_error);
                continue;
            }
        }
    }

    if !conversion_success {
        return Err(format!("All FFmpeg attempts failed. Last error: {}. Please ensure FFmpeg is installed and accessible.", last_error));
    }

    // Verify the output file was created
    if !output_path.exists() {
        return Err("FFmpeg completed but output file was not created".to_string());
    }

    let file_size = std::fs::metadata(output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    if file_size == 0 {
        return Err("FFmpeg created empty output file".to_string());
    }

    println!("WAV conversion completed successfully: {} bytes", file_size);
    Ok(())
}

/// Perform Whisper transcription using Python subprocess
fn perform_whisper_transcription(audio_path: &PathBuf) -> Result<WhisperTranscriptionResult, String> {
    // Use the Tauri-compatible Python script in project root
    let script_path = PathBuf::from(r"C:\Users\kalin\Desktop\gutachten-assistant\whisper_transcribe_tauri.py");

    println!("Looking for Tauri Python script at: {}", script_path.display());

    if !script_path.exists() {
        return Err(format!("Whisper Tauri script not found at: {}", script_path.display()));
    }

    println!("Tauri Python script found successfully!");

    // Call Python script with json output format - try multiple Python paths
    println!("Attempting to call Python script with arguments:");
    println!("  Script: {}", script_path.display());
    println!("  Audio: {}", audio_path.display());

    let python_commands = [
        r"C:\Users\kalin\Desktop\gutachten-assistant\whisper_venv\Scripts\python.exe",
        "python",
        r"C:\Python313\python.exe",
        r"C:\Users\kalin\AppData\Local\Microsoft\WindowsApps\python.exe"
    ];

    let mut last_error = String::new();
    let mut output = None;

    for python_cmd in &python_commands {
        println!("Trying Python command: {}", python_cmd);
        match Command::new(python_cmd)
            .arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg(audio_path.to_str().ok_or("Invalid audio path")?)
            .arg("json")  // Request JSON output format
            .env("PYTHONIOENCODING", "utf-8")  // Force UTF-8 output on Windows
            .output()
        {
            Ok(cmd_output) => {
                output = Some(cmd_output);
                println!("Python command succeeded: {}", python_cmd);
                break;
            },
            Err(e) => {
                last_error = format!("Failed with {}: {}", python_cmd, e);
                println!("{}", last_error);
                continue;
            }
        }
    }

    let output = output.ok_or(format!("All Python commands failed. Last error: {}", last_error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python script failed: {}", stderr));
    }

    // Parse stdout as UTF-8 (Python outputs UTF-8 encoded JSON)
    let stdout = String::from_utf8(output.stdout.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).into_owned());

    // Parse JSON response
    let json_result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON response: {} - stdout: {}", e, stdout))?;

    if let Some(error) = json_result.get("error") {
        return Err(format!("Transcription error: {}", error.as_str().unwrap_or("Unknown error")));
    }

    // Extract transcription data
    let text = json_result.get("text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let confidence = json_result.get("confidence")
        .and_then(|c| c.as_f64())
        .unwrap_or(0.0) as f32;

    let segments = json_result.get("segments")
        .and_then(|s| s.as_array())
        .map(|segments_array| {
            segments_array.iter().filter_map(|segment| {
                Some(TranscriptionSegment {
                    start_time: segment.get("start_time")?.as_f64()? as f32,
                    end_time: segment.get("end_time")?.as_f64()? as f32,
                    text: segment.get("text")?.as_str()?.to_string(),
                    confidence: segment.get("confidence")?.as_f64()? as f32,
                })
            }).collect()
        })
        .unwrap_or_default();

    Ok(WhisperTranscriptionResult {
        text,
        confidence,
        segments,
    })
}

