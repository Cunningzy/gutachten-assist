// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::sync::Arc;

mod commands;
mod services;
mod models;
mod memory_manager;

use commands::{system_info, model_info};
use memory_manager::MemoryManager;

#[tokio::main]
async fn main() {
    // Initialize memory manager for large AI models
    let memory_manager = Arc::new(MemoryManager::new());

    // Initialize Llama service for grammar correction

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(memory_manager)
        .invoke_handler(tauri::generate_handler![
            system_info,
            model_info,
            commands::load_whisper_model,
            commands::process_audio_file,
            commands::save_audio_file,
            commands::convert_audio_to_wav,
            commands::transcribe_audio_simple,
            commands::validate_audio_file,
            commands::get_system_memory,
            commands::cleanup_models,
            commands::analyze_document_style,
            commands::save_style_template,
            commands::save_uploaded_document,
            commands::get_saved_templates,
            commands::download_llama_model,
            commands::load_llama_model,
            commands::correct_german_grammar,
            commands::get_llama_model_info,
            commands::is_llama_model_ready,
            commands::create_styled_docx,
            commands::detect_formatting_request,
            commands::format_docx_with_request,
            commands::format_docx_with_spec,
            // Style Profile commands
            commands::analyze_example_documents,
            commands::load_style_profile,
            commands::get_style_profile_status,
            commands::clear_style_profile,
            commands::get_style_profile_prompt
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Setup application-specific configurations
            tauri::async_runtime::spawn(async move {
                // Pre-initialize system components
                if let Err(e) = initialize_application_systems(&app_handle).await {
                    eprintln!("Failed to initialize application systems: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Initialize application-specific systems
async fn initialize_application_systems(app_handle: &tauri::AppHandle) -> Result<(), anyhow::Error> {
    // Check system requirements
    let available_memory = get_available_memory().await?;
    if available_memory < 4_000_000_000 {  // 4GB minimum
        eprintln!("Warning: System has less than 4GB available memory. AI models may not load properly.");
    }
    
    // Verify embedded model files exist
    let app_dir = app_handle.path().app_data_dir()?;
    let models_dir = app_dir.join("embedded-models");
    
    if !models_dir.exists() {
        std::fs::create_dir_all(&models_dir)?;
        println!("Created embedded models directory: {:?}", models_dir);
    }
    
    Ok(())
}

/// Get available system memory in bytes
async fn get_available_memory() -> Result<u64, anyhow::Error> {
    // Platform-specific memory detection would go here
    // For now, return a conservative estimate
    Ok(8_000_000_000) // 8GB
}