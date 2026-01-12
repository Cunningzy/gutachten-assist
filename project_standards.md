# PROJECT STANDARDS - Gutachten Assistant v2.0

**Quality Control & Development Standards for Tauri + React + Rust Architecture**  
**Updated for:** 4GB Desktop Application with Embedded AI Models  
**Last Updated:** August 24, 2025

---

## 📋 **MANDATORY QUALITY CONTROL STANDARDS**

This document establishes comprehensive quality control standards for the Gutachten Assistant v2.0 project, covering both the existing React/TypeScript frontend and the new Rust backend architecture.

### **🎯 ZERO TOLERANCE POLICY**
- ❌ **File name mismatches** in import/export statements
- ❌ **Missing directory creation** instructions
- ❌ **Inconsistent naming conventions** across languages
- ❌ **Unverified file paths** in code delivery
- ❌ **Breaking existing references** during updates
- ❌ **Skipping testing phases** in development workflow

---

## 🔍 **MANDATORY FILE VERIFICATION PROCESS**

### **Before Creating/Modifying ANY File:**

#### **1. 📁 Complete File Path Verification**
- ✅ **Rust Files:** Verify all module declarations in `mod.rs` files
- ✅ **TypeScript Files:** Ensure exact path matching in import statements
- ✅ **Tauri Commands:** Confirm registration in `main.rs` and frontend API
- ✅ **Cross-Language Integration:** Validate Rust-TypeScript type consistency

#### **2. 🔍 Multi-Language Cross-Reference Validation**
- ✅ **Rust Modules:** Check all `pub mod` declarations match file structure
- ✅ **Tauri Commands:** Verify command names match in Rust and TypeScript
- ✅ **Type Definitions:** Ensure Rust types align with TypeScript interfaces
- ✅ **API Contracts:** Validate frontend-backend communication contracts

#### **3. 📂 Architecture-Specific Verification**
- ✅ **Rust Backend:** All services properly exposed through commands
- ✅ **React Frontend:** All components properly integrated with Tauri API
- ✅ **AI Model Integration:** Verify model file references and loading paths
- ✅ **Desktop Integration:** Confirm native OS feature implementations

---

## 📝 **FILE NAMING CONVENTIONS**

### **🦀 Rust Backend Standards**

#### **File Naming (snake_case)**
```rust
✅ CORRECT:
src-tauri/src/services/audio_service.rs
src-tauri/src/models/whisper_manager.rs
src-tauri/src/commands/file_operations.rs

❌ INCORRECT:
src-tauri/src/services/AudioService.rs
src-tauri/src/models/WhisperManager.rs
src-tauri/src/commands/FileOperations.rs
```

#### **Module Structure**
```rust
// ✅ CORRECT - Every directory needs mod.rs
src-tauri/src/services/mod.rs:
pub mod audio_service;
pub mod whisper_service;
pub mod ocr_service;

// ✅ CORRECT - Service exports
src-tauri/src/services/audio_service.rs:
pub struct AudioService { ... }
pub impl AudioService { ... }
```

#### **Tauri Command Naming**
```rust
// ✅ CORRECT - snake_case for commands
#[tauri::command]
async fn load_whisper_model() -> Result<String, String> { ... }

#[tauri::command]
async fn process_audio_file(file_path: String) -> Result<TranscriptionResult, String> { ... }

// ❌ INCORRECT - camelCase in Rust
#[tauri::command]
async fn loadWhisperModel() -> Result<String, String> { ... }
```

### **🌐 TypeScript Frontend Standards**

#### **Component Naming (PascalCase)**
```typescript
✅ CORRECT:
src/components/Audio/AudioRecorder.tsx
src/components/Medical/GutachtenEditor.tsx
src/components/SystemStatus/ModelLoadingProgress.tsx

❌ INCORRECT:
src/components/Audio/audioRecorder.tsx
src/components/Medical/gutachten_editor.tsx
src/components/SystemStatus/model-loading-progress.tsx
```

#### **Service Naming (camelCase)**
```typescript
✅ CORRECT:
src/services/tauriApi.ts
src/services/audioService.ts
src/services/modelService.ts

❌ INCORRECT:
src/services/TauriApi.ts
src/services/AudioService.ts
src/services/model_service.ts
```

#### **Tauri API Integration**
```typescript
// ✅ CORRECT - Import Tauri API
import { invoke } from '@tauri-apps/api/tauri';

// ✅ CORRECT - Command naming matches Rust
const result = await invoke('load_whisper_model');
const transcription = await invoke('process_audio_file', { filePath: 'path/to/file.wav' });

// ❌ INCORRECT - Mismatched command names
const result = await invoke('loadWhisperModel');  // Rust uses snake_case
```

### **🤖 AI Model File Standards**

#### **Model Directory Structure**
```
embedded-models/
├── whisper/
│   ├── ggml-large-v3.bin           # 3GB model file
│   ├── model-info.json             # Metadata
│   └── whisper-config.toml         # Configuration
├── tesseract/
│   ├── deu.traineddata             # OCR training data
│   └── ocr-config.json             # OCR settings
└── spacy/
    ├── de_core_news_lg-3.7.0/      # spaCy model directory
    └── nlp-config.json             # NLP configuration
```

#### **Model File Verification**
```rust
// ✅ CORRECT - Model path verification
const MODEL_PATH: &str = "embedded-models/whisper/ggml-large-v3.bin";

pub fn verify_model_exists() -> Result<(), String> {
    if !std::path::Path::new(MODEL_PATH).exists() {
        return Err(format!("Model file not found: {}", MODEL_PATH));
    }
    Ok(())
}
```

---

## 🏗️ **ARCHITECTURE-SPECIFIC STANDARDS**

### **🦀 Rust Backend Development**

#### **Error Handling Standards**
```rust
// ✅ CORRECT - Use Result types throughout
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessingError {
    message: String,
    error_type: String,
}

// ✅ CORRECT - Structured error handling
pub async fn load_whisper_model() -> Result<WhisperModel, ProcessingError> {
    let model_path = "embedded-models/whisper/ggml-large-v3.bin";
    
    WhisperModel::load(model_path)
        .await
        .context("Failed to load Whisper model")
        .map_err(|e| ProcessingError {
            message: e.to_string(),
            error_type: "ModelLoadError".to_string(),
        })
}

// ❌ INCORRECT - Panic on errors
pub async fn load_whisper_model() -> WhisperModel {
    let model_path = "embedded-models/whisper/ggml-large-v3.bin";
    WhisperModel::load(model_path).await.unwrap()  // DON'T USE UNWRAP
}
```

#### **Memory Management for Large AI Models**
```rust
// ✅ CORRECT - Smart memory management
pub struct ModelManager {
    whisper_model: Option<Arc<WhisperModel>>,  // Use Arc for shared ownership
    max_memory_usage: usize,
    
}

impl ModelManager {
    pub async fn load_model_if_needed(&mut self) -> Result<()> {
        if self.whisper_model.is_none() {
            // Check available memory before loading
            if self.get_available_memory() < 4_000_000_000 {  // 4GB
                return Err("Insufficient memory for model loading".into());
            }
            
            let model = Arc::new(WhisperModel::load().await?);
            self.whisper_model = Some(model);
        }
        Ok(())
    }
    
    // Implement proper cleanup
    pub fn cleanup(&mut self) {
        if let Some(model) = self.whisper_model.take() {
            drop(model);  // Explicit cleanup
        }
    }
}

// ❌ INCORRECT - No memory management
pub struct ModelManager {
    whisper_model: WhisperModel,  // Always loaded, no Option
}
```

#### **Tauri Command Standards**
```rust
// ✅ CORRECT - Proper Tauri command structure
#[tauri::command]
async fn transcribe_audio(
    file_path: String,
    app_handle: tauri::AppHandle,
    window: tauri::Window,
) -> Result<TranscriptionResult, String> {
    // Validate input parameters
    if file_path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }
    
    // Progress callbacks to frontend
    window.emit("transcription_progress", 0.0).map_err(|e| e.to_string())?;
    
    // Perform actual transcription
    let result = perform_transcription(&file_path).await
        .map_err(|e| format!("Transcription failed: {}", e))?;
    
    window.emit("transcription_progress", 1.0).map_err(|e| e.to_string())?;
    
    Ok(result)
}

// Register in main.rs
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![transcribe_audio])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ❌ INCORRECT - Missing error handling and progress updates
#[tauri::command]
async fn transcribe_audio(file_path: String) -> TranscriptionResult {
    perform_transcription(&file_path).await.unwrap()
}
```

### **🌐 React Frontend Development**

#### **Tauri Integration Standards**
```typescript
// ✅ CORRECT - Proper Tauri API usage
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

// ✅ CORRECT - Type-safe API calls
interface TranscriptionResult {
  text: string;
  confidence: number;
  processing_time: number;
}

export const useWhisperTranscription = () => {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  
  useEffect(() => {
    // Listen for progress updates
    const unlisten = listen<number>('transcription_progress', (event) => {
      setProgress(event.payload);
    });
    
    return () => {
      unlisten.then(f => f());
    };
  }, []);
  
  const transcribeFile = async (filePath: string): Promise<TranscriptionResult> => {
    try {
      const result = await invoke<TranscriptionResult>('transcribe_audio', {
        filePath,
      });
      setResult(result);
      return result;
    } catch (error) {
      throw new Error(`Transcription failed: ${error}`);
    }
  };
  
  return { progress, result, transcribeFile };
};

// ❌ INCORRECT - No type safety, error handling
export const transcribeFile = async (filePath: string) => {
  return await invoke('transcribe_audio', { filePath });
};
```

#### **Component Standards for AI Integration**
```typescript
// ✅ CORRECT - Proper component structure for AI features
export const WhisperTranscriptionComponent: React.FC = () => {
  const { progress, result, transcribeFile } = useWhisperTranscription();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const filePath = await saveFileTemporarily(file);
      await transcribeFile(filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="medical-card p-6">
      <h3 className="text-lg font-semibold text-blue-700 mb-4">
        Spracherkennung mit Whisper Large-v3
      </h3>
      
      {isLoading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Verarbeitung: {Math.round(progress * 100)}%
          </p>
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded">
          <p className="text-red-700">Fehler: {error}</p>
        </div>
      )}
      
      {result && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded">
          <p className="text-green-700">Transkription erfolgreich!</p>
          <p className="text-sm mt-1">Genauigkeit: {Math.round(result.confidence * 100)}%</p>
        </div>
      )}
    </div>
  );
};

// ❌ INCORRECT - No error handling, progress feedback, or German UI
export const WhisperTranscriptionComponent = () => {
  const [result, setResult] = useState(null);
  
  const handleFile = async (file) => {
    const result = await invoke('transcribe_audio', { filePath: file.name });
    setResult(result);
  };
  
  return <div>{result ? result.text : 'No result'}</div>;
};
```

---

## 🧪 **TESTING STANDARDS**

### **🦀 Rust Testing Standards**

#### **Unit Testing**
```rust
// ✅ CORRECT - Comprehensive unit tests
#[cfg(test)]
mod tests {
    use super::*;
    use tokio;
    
    #[tokio::test]
    async fn test_model_loading_success() {
        let mut manager = ModelManager::new();
        
        // Mock sufficient memory
        manager.set_available_memory(8_000_000_000);  // 8GB
        
        let result = manager.load_model_if_needed().await;
        assert!(result.is_ok());
        assert!(manager.whisper_model.is_some());
    }
    
    #[tokio::test]
    async fn test_model_loading_insufficient_memory() {
        let mut manager = ModelManager::new();
        
        // Mock insufficient memory
        manager.set_available_memory(2_000_000_000);  // 2GB
        
        let result = manager.load_model_if_needed().await;
        assert!(result.is_err());
        assert!(manager.whisper_model.is_none());
    }
    
    #[test]
    fn test_model_path_validation() {
        let valid_path = "embedded-models/whisper/ggml-large-v3.bin";
        let invalid_path = "non-existent/model.bin";
        
        assert!(is_valid_model_path(valid_path));
        assert!(!is_valid_model_path(invalid_path));
    }
}

// ❌ INCORRECT - Minimal or no tests
#[cfg(test)]
mod tests {
    #[test]
    fn test_something() {
        assert!(true);
    }
}
```

#### **Integration Testing**
```rust
// ✅ CORRECT - Integration tests for Tauri commands
#[cfg(test)]
mod integration_tests {
    use tauri::test::{mock_app, MockBuilder};
    
    #[tokio::test]
    async fn test_transcribe_audio_command() {
        let app = MockBuilder::new().build();
        
        // Test with valid audio file
        let result = tauri::test::get_ipc_response(
            &app,
            tauri::InvokePayload {
                cmd: "transcribe_audio".into(),
                args: serde_json::json!({
                    "filePath": "test_audio.wav"
                }),
            },
        );
        
        assert!(result.is_ok());
    }
    
    #[tokio::test]
    async fn test_transcribe_audio_invalid_file() {
        let app = MockBuilder::new().build();
        
        let result = tauri::test::get_ipc_response(
            &app,
            tauri::InvokePayload {
                cmd: "transcribe_audio".into(),
                args: serde_json::json!({
                    "filePath": ""
                }),
            },
        );
        
        assert!(result.is_err());
    }
}
```

### **🌐 TypeScript Testing Standards**

#### **Component Testing**
```typescript
// ✅ CORRECT - Comprehensive component tests
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { WhisperTranscriptionComponent } from './WhisperTranscriptionComponent';

// Mock Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('WhisperTranscriptionComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders with German UI text', () => {
    render(<WhisperTranscriptionComponent />);
    expect(screen.getByText('Spracherkennung mit Whisper Large-v3')).toBeInTheDocument();
  });
  
  it('handles file transcription successfully', async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValue({
      text: 'Test transcription',
      confidence: 0.95,
      processing_time: 1500,
    });
    
    render(<WhisperTranscriptionComponent />);
    
    const fileInput = screen.getByTestId('file-input');
    const testFile = new File(['test'], 'test.wav', { type: 'audio/wav' });
    
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    
    await waitFor(() => {
      expect(screen.getByText(/Transkription erfolgreich!/)).toBeInTheDocument();
      expect(screen.getByText(/Genauigkeit: 95%/)).toBeInTheDocument();
    });
  });
  
  it('displays error message in German on failure', async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockRejectedValue(new Error('Model loading failed'));
    
    render(<WhisperTranscriptionComponent />);
    
    const fileInput = screen.getByTestId('file-input');
    const testFile = new File(['test'], 'test.wav', { type: 'audio/wav' });
    
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    
    await waitFor(() => {
      expect(screen.getByText(/Fehler: Model loading failed/)).toBeInTheDocument();
    });
  });
});

// ❌ INCORRECT - Minimal or no component testing
describe('WhisperTranscriptionComponent', () => {
  it('renders', () => {
    render(<WhisperTranscriptionComponent />);
  });
});
```

---

## 📋 **MANDATORY RESPONSE CHECKLIST**

### **Every Code Response MUST Include:**

#### **1. 🦀 Rust Backend Verification**
```markdown
RUST BACKEND VERIFICATION:
✅ src-tauri/src/main.rs - Commands registered
✅ src-tauri/src/services/mod.rs - Module exports correct
✅ src-tauri/src/commands/mod.rs - Command implementations exist
✅ All mod.rs files include proper pub mod declarations
✅ Error handling with Result types throughout
✅ Memory management for large AI models implemented
```

#### **2. 🌐 Frontend Integration Verification**
```markdown
FRONTEND INTEGRATION VERIFICATION:
✅ src/services/tauriApi.ts - API calls match Rust commands
✅ TypeScript types align with Rust data structures
✅ Progress callbacks implemented for long operations
✅ Error handling displays German error messages
✅ Loading states and user feedback implemented
```

#### **3. 🤖 AI Model Integration Verification**
```markdown
AI MODEL INTEGRATION VERIFICATION:
✅ Model file paths verified in embedded-models/ directory
✅ Model loading with progress feedback implemented
✅ Memory management for 3GB+ models configured
✅ Error handling for model loading failures
✅ Performance monitoring for AI operations
```

#### **4. 📁 Complete File Creation Instructions**
```markdown
REQUIRED FILE OPERATIONS:
Create directory: mkdir src-tauri\src\services
Create file: src-tauri\src\services\mod.rs
Create file: src-tauri\src\services\audio_service.rs
Update file: src-tauri\src\main.rs (register commands)
Update file: src\services\tauriApi.ts (add API calls)
```

#### **5. 🧪 Testing Verification**
```markdown
TESTING REQUIREMENTS:
✅ Rust unit tests for all service functions
✅ Integration tests for Tauri commands
✅ TypeScript component tests with German UI validation
✅ Error handling tests for AI model operations
✅ Performance tests for large model loading
```

---

## 🎯 **QUALITY GATES**

### **Development Phase Completion Criteria**
- [ ] All Rust modules compile without warnings
- [ ] All TypeScript types resolve correctly
- [ ] All Tauri commands registered and tested
- [ ] German medical UI text throughout
- [ ] Memory management tested with large models
- [ ] Error handling covers all failure scenarios
- [ ] Documentation updated with architecture changes

### **Testing Phase Completion Criteria**
- [ ] All unit tests pass (Rust + TypeScript)
- [ ] Integration tests validate frontend-backend communication
- [ ] Performance benchmarks meet targets
- [ ] German UI text validated by native speakers
- [ ] DSGVO compliance verified for all data operations
- [ ] Memory usage stays within defined limits
- [ ] AI model loading tested on minimum hardware

---

## 💡 **DEVELOPMENT WORKFLOW INTEGRATION**

### **Phase-by-Phase Standards Application**

#### **Phase 1.1: Foundation Setup**
- Apply Rust backend standards for initial project structure
- Implement proper module organization with mod.rs files
- Setup Tauri command registration framework
- Establish frontend-backend type synchronization

#### **Phase 2.1: AI Model Architecture**  
- Implement memory management standards for 3GB+ models
- Create model loading progress feedback systems
- Establish error handling for model operations
- Setup performance monitoring for resource usage

#### **Phase 3.1+: Feature Development**
- Apply component standards for each AI integration
- Maintain German medical UI consistency
- Implement comprehensive testing for each feature
- Document all architectural decisions and trade-offs

---

## ✅ **IMPLEMENTATION COMMITMENT**

### **Every Development Response Will:**
1. ✅ **Verify all file paths** across Rust and TypeScript
2. ✅ **Include complete verification checklists** for both languages
3. ✅ **Cross-check Tauri command integration** between backend and frontend
4. ✅ **Validate German medical UI** text and terminology
5. ✅ **Test memory management** for large AI model operations
6. ✅ **Implement proper error handling** with user-friendly German messages

### **Zero Tolerance For:**
- ❌ Rust module declaration mismatches
- ❌ Tauri command registration errors
- ❌ TypeScript-Rust type inconsistencies
- ❌ Missing German medical UI text
- ❌ Inadequate memory management for large models
- ❌ Insufficient error handling for AI operations
- ❌ Breaking existing functionality during updates

---

**This document serves as the definitive quality control standard for the Gutachten Assistant v2.0 project. All development must comply with these standards to ensure a professional, reliable medical application.**

**Architecture:** Tauri 2.0 + React + TypeScript + Rust + Embedded AI Models  
**Status:** Active and Mandatory for All Development Phases  
**Last Updated:** August 24, 2025