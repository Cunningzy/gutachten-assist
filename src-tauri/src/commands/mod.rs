// Tauri command module - Frontend-Backend communication

pub mod system_commands;
pub mod model_commands;
pub mod audio_commands;
pub mod document_commands;
pub mod llama_commands;
pub mod docx_commands;
pub mod format_commands;
pub mod style_profile_commands;
pub mod template_commands;


// Re-export all commands for easy access in main.rs
pub use system_commands::*;
pub use model_commands::*;
pub use audio_commands::*;
pub use document_commands::*;
pub use llama_commands::*;
pub use docx_commands::*;
pub use format_commands::*;
pub use style_profile_commands::*;
pub use template_commands::*;