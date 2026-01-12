# 🛠️ DEVELOPMENT.md - Gutachten Assistant v2.0 Development Guide

**Tauri + React + TypeScript Development Workflow for 4GB All-in-One Medical Desktop App**

---

## 📋 **DEVELOPMENT OVERVIEW**

### **New Architecture (v2.0)**
- **Framework:** Tauri 2.0 + React 18 + TypeScript + Rust Backend
- **AI Models:** Embedded 3GB+ models (Whisper Large-v3, Tesseract, spaCy)
- **Distribution:** Single 4GB installer with all dependencies
- **Development:** Component-by-component approach with testing phases
- **Timeline:** 8 weeks, 16 phases (8 development + 8 testing)

### **Development Philosophy**
- **Plan-Develop-Test-Document:** Each phase follows structured methodology
- **Quality-First:** Mandatory testing phase after each development phase
- **Embedded AI:** All AI models bundled in application, no external dependencies
- **Medical-Grade:** DSGVO-compliant, professional medical UI, offline-first

---

## 🏗️ **DEVELOPMENT ENVIRONMENT SETUP**

### **Prerequisites**
```bash
# Core Development Tools
Node.js 18+                 # JavaScript runtime
npm 8+                      # Package manager
Rust 1.70+                  # Backend development language
Git                         # Version control
VS Code (recommended)       # IDE with Rust + TypeScript extensions

# Tauri Dependencies
cargo install tauri-cli     # Tauri command line tools
rustup target add x86_64-pc-windows-msvc  # Windows target

# AI Model Dependencies
Python 3.8+                 # For spaCy preprocessing (development only)
```

### **Project Initialization**
```bash
# 1. Create new Tauri project
npm create tauri-app@latest gutachten-assistant-v2
cd gutachten-assistant-v2

# 2. Add Rust dependencies (in src-tauri/Cargo.toml)
cargo add tokio --features full
cargo add serde --features derive
cargo add tauri --features api-all
cargo add whisper-rs
cargo add rusqlite --features bundled
cargo add cpal              # Native audio
cargo add reqwest           # HTTP client

# 3. Add frontend dependencies
npm install @reduxjs/toolkit react-redux
npm install @tailwindcss/forms @tailwindcss/typography
npm install framer-motion   # Loading animations
npm install react-router-dom

# 4. Development server
npm run tauri dev
```

### **VS Code Extensions**
```json
{
  "recommendations": [
    "rust-lang.rust-analyzer",
    "tauri-apps.tauri-vscode",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-eslint",
    "esbenp.prettier-vscode"
  ]
}
```

---

## 📁 **NEW PROJECT STRUCTURE (v2.0)**

### **Complete Directory Structure**
```
gutachten-assistant-v2/
├── 📄 task_master.md                    # Master implementation plan (16 phases)
├── 📄 development.md                    # This file - development guide
├── 📄 changelog.md                      # Version history with phase tracking
├── 📄 PROJECT_STRUCTURE.md              # Complete file structure
├── 📄 project_standards.md              # Quality standards + Rust guidelines
├── 📄 readme.md                         # Project overview
├── 📦 package.json                      # Frontend dependencies
├── ⚙️ tsconfig.json                     # TypeScript configuration
├── ⚙️ vite.config.ts                    # Frontend build configuration
├── ⚙️ tailwind.config.js                # Styling configuration
├── 🦀 src-tauri/                        # Rust backend
│   ├── 📄 Cargo.toml                    # Rust dependencies
│   ├── 📄 tauri.conf.json               # Tauri configuration
│   ├── 📁 src/
│   │   ├── 📄 main.rs                   # Main Tauri application
│   │   ├── 📁 commands/                 # Tauri commands (Frontend-Backend API)
│   │   │   ├── 📄 mod.rs                # Command module exports
│   │   │   ├── 📄 audio_processing.rs   # Audio capture & processing
│   │   │   ├── 📄 whisper_integration.rs # Speech recognition
│   │   │   ├── 📄 file_operations.rs    # File management
│   │   │   └── 📄 ai_models.rs          # AI model management
│   │   ├── 📁 services/                 # Core business logic
│   │   │   ├── 📄 mod.rs                # Service module exports
│   │   │   ├── 📄 audio_service.rs      # Native audio handling
│   │   │   ├── 📄 whisper_service.rs    # Whisper integration
│   │   │   ├── 📄 ocr_service.rs        # OCR processing
│   │   │   └── 📄 security_service.rs   # DSGVO compliance
│   │   ├── 📁 models/                   # AI model management
│   │   │   ├── 📄 mod.rs                # Model module exports
│   │   │   ├── 📄 model_manager.rs      # Universal model loading
│   │   │   ├── 📄 whisper_manager.rs    # Whisper model management
│   │   │   └── 📄 model_loader.rs       # Progressive loading system
│   │   ├── 📁 ai_processing/            # AI processing pipeline
│   │   │   ├── 📄 mod.rs                # Processing module exports
│   │   │   ├── 📄 speech_processor.rs   # Real-time speech processing
│   │   │   ├── 📄 ocr_processor.rs      # Document OCR processing
│   │   │   └── 📄 text_processor.rs     # Medical text processing
│   │   ├── 📁 storage/                  # Data management
│   │   │   ├── 📄 mod.rs                # Storage module exports
│   │   │   ├── 📄 encrypted_db.rs       # SQLite with encryption
│   │   │   └── 📄 file_manager.rs       # Secure file operations
│   │   ├── 📁 system/                   # System integration
│   │   │   ├── 📄 mod.rs                # System module exports
│   │   │   ├── 📄 memory_manager.rs     # Large model memory management
│   │   │   ├── 📄 gpu_detection.rs      # Hardware acceleration
│   │   │   └── 📄 performance_monitor.rs # Resource monitoring
│   │   └── 📁 utils/
│   │       ├── 📄 mod.rs                # Utility module exports
│   │       ├── 📄 encryption.rs         # AES-256 encryption
│   │       └── 📄 file_utils.rs         # File operations
├── 🌐 src/                              # React frontend
│   ├── 📄 main.tsx                      # React entry point
│   ├── 📄 App.tsx                       # Main React application
│   ├── 📄 App.css                       # Medical theme styling
│   ├── 📁 components/                   # React components
│   │   ├── 📁 Audio/                    # Audio components
│   │   │   ├── 📄 AudioRecorder.tsx     # Enhanced native audio recording
│   │   │   ├── 📄 TranscriptionView.tsx # Real-time transcription display
│   │   │   └── 📄 AudioVisualizer.tsx   # Audio waveform visualization
│   │   ├── 📁 Medical/                  # Medical workflow components
│   │   │   ├── 📄 GutachtenEditor.tsx   # Report editor with templates
│   │   │   ├── 📄 PatientDataForm.tsx   # Patient information forms
│   │   │   └── 📄 MedicalTemplates.tsx  # German medical report templates
│   │   ├── 📁 Desktop/                  # Desktop-specific components
│   │   │   ├── 📄 NativeMenuBar.tsx     # Desktop menu integration
│   │   │   ├── 📄 StatusBar.tsx         # System status information
│   │   │   └── 📄 FileExplorer.tsx      # File navigation component
│   │   ├── 📁 SystemStatus/             # System monitoring components
│   │   │   ├── 📄 MemoryUsage.tsx       # Memory consumption display
│   │   │   ├── 📄 ModelStatus.tsx       # AI model loading status
│   │   │   ├── 📄 PerformanceMetrics.tsx # Real-time performance metrics
│   │   │   └── 📄 ModelLoadingProgress.tsx # Model loading progress
│   │   └── 📁 Layout/                   # Layout components
│   │       ├── 📄 MainLayout.tsx        # Application layout wrapper
│   │       └── 📄 WindowControls.tsx    # Desktop window management
│   ├── 📁 services/                     # Frontend services
│   │   ├── 📄 tauriApi.ts               # Tauri backend communication
│   │   ├── 📄 audioService.ts           # Frontend audio operations
│   │   └── 📄 fileService.ts            # File handling service
│   ├── 📁 store/                        # Redux state management
│   │   ├── 📄 store.ts                  # Main Redux store
│   │   └── 📁 slices/
│   │       ├── 📄 audioSlice.ts         # Audio state management
│   │       ├── 📄 transcriptionSlice.ts # Transcription state
│   │       ├── 📄 fileSlice.ts          # File management state
│   │       └── 📄 modelSlice.ts         # AI model state
│   ├── 📁 styles/                       # Styling files
│   │   ├── 📄 globals.css               # Global application styles
│   │   └── 📄 medical-theme.css         # Medical professional theme
│   └── 📁 types/                        # TypeScript type definitions
│       ├── 📄 audio.ts                  # Audio-related types
│       ├── 📄 medical.ts                # Medical data types
│       └── 📄 tauri.ts                  # Tauri API types
├── 🤖 embedded-models/                  # EMBEDDED AI MODELS (3GB+)
│   ├── 📁 whisper/                      # Speech recognition models
│   │   ├── 📄 ggml-large-v3.bin        # 3.09GB - Whisper Large-v3 model
│   │   └── 📄 whisper-large-v3.bin     # Alternative format
│   ├── 📁 tesseract/                    # OCR models  
│   │   ├── 📄 deu.traineddata          # 50MB - German OCR training data
│   │   ├── 📄 deu_frak.traineddata     # German Fraktur script
│   │   └── 📄 osd.traineddata          # Orientation detection
│   ├── 📁 spacy/                        # NLP models
│   │   ├── 📁 de_core_news_lg-3.7.0/   # 200MB - German NLP model
│   │   └── 📁 de_dep_news_trf-3.7.0/   # German transformer model
│   └── 📁 medical/                      # Medical terminology
│       ├── 📄 medical_vocab_de.json     # German medical vocabulary
│       └── 📄 icd10_de.json             # German ICD-10 diagnostic codes
├── 🐍 python/                           # Python AI integration (development only)
│   ├── 📄 spacy_service.py              # Medical NER service
│   ├── 📄 ocr_processor.py              # OCR preprocessing
│   └── 📄 requirements.txt              # Python dependencies
├── 📦 distribution/                     # Distribution and packaging
│   ├── 📁 installer/                    # Installation package
│   │   ├── 📄 windows-installer.nsi     # NSIS installer for 4GB app
│   │   ├── 📄 compression-config.json   # Model compression settings
│   │   └── 📄 integrity-check.rs        # Model integrity verification
│   └── 📁 updater/                      # Update system
│       ├── 📄 delta-updates.rs          # Incremental updates
│       └── 📄 model-updater.rs          # AI model version management
├── 📄 docs/                             # Documentation
├── 🧪 tests/                            # Test files
│   ├── 📁 unit/                         # Unit tests (Rust + TypeScript)
│   ├── 📁 integration/                  # Integration tests
│   └── 📁 e2e/                          # End-to-end tests
└── 🔧 build/                            # Build configuration
    ├── 📄 embed-models.rs               # Model embedding in installer
    ├── 📄 compression.rs                # Model compression for distribution
    └── 📄 integrity.rs                  # Model file verification
```

---

## 🧪 **DEVELOPMENT METHODOLOGY: 16-PHASE APPROACH**

### **Phase Structure (From task_master.md)**
Each development phase follows strict methodology:

#### **DEVELOPMENT PHASE (Week X.1)**
```
1. 📋 PLANNING
   ├── Component specification
   ├── API design
   ├── File structure planning
   └── Success criteria definition

2. 🏗️ IMPLEMENTATION  
   ├── Rust backend services
   ├── React frontend components
   ├── Integration with existing systems
   └── PROJECT_STANDARDS.md compliance

3. 📝 DOCUMENTATION
   ├── Code comments and documentation
   ├── API documentation updates
   └── File structure updates
```

#### **TESTING PHASE (Week X.2)**
```
4. 🧪 TESTING
   ├── Unit tests (Rust + TypeScript)
   ├── Integration testing
   ├── Manual user testing
   ├── Performance validation
   └── German medical UI validation

5. ✅ VALIDATION
   ├── Success criteria verification
   ├── CHANGELOG.md update
   ├── Quality gate approval
   └── Next phase preparation
```

### **Quality Gates**
- **No phase proceeds without successful testing completion**
- **All success criteria must be met**
- **CHANGELOG.md must be updated after each test phase**
- **File verification checklists must be completed**

---

## 🔧 **DEVELOPMENT COMMANDS**

### **Tauri Development Commands**
```bash
# Start development server (both frontend and backend)
npm run tauri dev

# Frontend-only development (faster for UI work)
npm run dev

# Build for production
npm run tauri build

# Add Rust dependencies
cd src-tauri
cargo add [dependency-name]

# Run Rust tests
cargo test

# Check Rust code
cargo check
cargo clippy
```

### **Frontend Development Commands**
```bash
# Install dependencies
npm install

# TypeScript compilation check
npx tsc --noEmit

# Linting
npm run lint

# Formatting
npm run format
```

### **AI Model Management Commands**
```bash
# Download AI models (development phase)
npm run download-models

# Verify model integrity
npm run verify-models

# Compress models for distribution
npm run compress-models
```

---

## 📋 **TESTING STRATEGY**

### **16-Phase Testing Schedule**
Following task_master.md methodology:

#### **Phase 1.2: Foundation Testing**
```bash
# Test basic Tauri functionality
npm run tauri dev
# Verify React-Rust communication
# Test memory management for large models
# Validate German medical UI theme
```

#### **Phase 2.2: Model Architecture Testing**
```bash
# Test 3GB model loading simulation
# Verify progress callback system
# Test memory allocation within limits
# Validate GPU detection
```

#### **Phase 3.2: Whisper Integration Testing**
```bash
# Test real 3GB Whisper model loading
# Verify German speech recognition accuracy (>90%)
# Test real-time transcription latency (<500ms)
# Validate medical terminology recognition
```

### **Testing Tools and Framework**
```bash
# Rust testing
cargo test                      # Unit tests
cargo test --release           # Optimized tests
cargo bench                    # Performance benchmarks

# Frontend testing  
npm test                       # Jest/React Testing Library
npm run test:e2e               # End-to-end tests
npm run test:performance       # Performance tests

# Integration testing
npm run test:integration       # Full stack tests
npm run test:medical-workflow  # Medical use case tests
```

### **Manual Testing Checklist**
```markdown
## Manual Test Checklist (Each Phase)
- [ ] Application starts without errors
- [ ] German medical UI displays correctly
- [ ] Memory usage within acceptable limits
- [ ] AI models load with progress feedback
- [ ] Performance meets phase targets
- [ ] DSGVO compliance maintained
- [ ] Error handling works gracefully
- [ ] Professional medical user experience
```

---

## 🎯 **CURRENT DEVELOPMENT STATUS**

### **🔄 CURRENT PHASE: Audio Architecture Transition**
**Date:** October 7, 2025
**Status:** Transitioning to simplified Tauri-backend audio pipeline

### **Architecture Evolution: From Complex Frontend to Simple Backend**
**Problem:** Complex frontend audio processing with blob URL security issues in Tauri
**Solution:** Clean Tauri commands → Rust backend → Python subprocess approach

**🔄 TRANSITION IN PROGRESS:**
- [x] **Documentation Update** - Updated project docs with new architecture
- [ ] **Phase 1: Tauri Audio Commands** - Rust backend audio save/convert commands
- [ ] **Simplified Recording UI** - Clean MediaRecorder → Tauri bridge
- [ ] **Python Subprocess Integration** - FFmpeg → Whisper pipeline
- [ ] **WAV Format Support** - Native WAV encoding for compatibility

### **New Audio Pipeline Architecture:**
```
🎤 Microphone → Frontend (MediaRecorder) → Tauri Commands →
Rust Backend → Python Subprocess → FFmpeg → Whisper → German Text
```

### **Benefits of New Architecture:**
- **Cleaner Code:** Eliminates complex frontend audio processing
- **Better Compatibility:** No blob URL security restrictions
- **Easier Maintenance:** Standard file-based audio processing
- **More Reliable:** Backend handles all heavy lifting
- **Future-Proof:** Easy to extend with additional audio formats

### **Current Project Status: 80% Complete (January 2026)**
```
✅ Foundation Architecture (Tauri v2.0 + React + Rust) - WORKING
✅ Real Whisper Integration (Python Large-v3) - FUNCTIONAL
✅ Audio Recording System - COMPLETE
✅ Audio File Upload - COMPLETE (WAV, MP3, WebM, M4A, OGG)
✅ AI Grammar Correction (Llama 3.2 3B) - COMPLETE
✅ Dictation Commands (Punkt, Komma, Klammern) - COMPLETE
✅ Unified Workflow UI - COMPLETE
✅ First-Launch Onboarding - COMPLETE
📋 Style Template Integration - PLANNED
📋 OCR & Medical NER - PLANNED
```

### **What's Working:**
1. **Live Recording:** Microphone capture → Whisper → Llama → Corrected text
2. **File Upload:** Audio file → Whisper → Llama → Corrected text
3. **Dictation Commands:** "Punkt", "Komma", "Klammern" converted to punctuation
4. **German Support:** Full UTF-8 umlaut handling (ä, ö, ü, ß)
5. **Onboarding:** First-launch example Gutachten collection

### **Remaining Development:**
1. Use uploaded examples to influence output style
2. OCR for scanned documents (Tesseract)
3. Medical NER (spaCy + GERNERMED++)
4. DOCX export with user's formatting

---

## 🔍 **CODE QUALITY STANDARDS**

### **Mandatory Standards (Updated for Tauri)**
**ALL development must follow updated [project_standards.md]:**

#### **Rust Backend Standards**
```rust
// File naming: snake_case for Rust files
// src-tauri/src/services/audio_service.rs

// Module structure
pub mod audio_service;
pub mod whisper_service;

// Error handling
use anyhow::{Result, Context};

// Documentation
/// Component 2.1A: Audio Capture Service
/// Handles native audio capture for speech recognition
pub struct AudioService {
    // Implementation
}
```

#### **TypeScript Frontend Standards**
```typescript
// File naming: PascalCase for components, camelCase for services
// src/components/Audio/AudioRecorder.tsx
// src/services/tauriApi.ts

// Tauri API integration
import { invoke } from '@tauri-apps/api/tauri';

// Type safety
interface AudioConfig {
  sampleRate: number;
  channels: number;
}
```

### **File Verification Process (Updated)**
```markdown
## MANDATORY VERIFICATION CHECKLIST
✅ Rust module declarations (mod.rs files)
✅ Tauri command registrations in main.rs
✅ Frontend-backend API type consistency
✅ German medical UI text throughout
✅ DSGVO compliance in all data handling
✅ Memory management for large AI models
```

---

## ⚡ **PERFORMANCE TARGETS (4GB Application)**

### **Updated Performance Requirements**
```
APPLICATION PERFORMANCE:
├── Installation Time: <15 minutes (4GB download + extraction)
├── First Startup: <60 seconds (AI model initialization)
├── Subsequent Startups: <10 seconds (cached models)
├── Memory Usage: 2-6GB during AI processing
├── AI Model Loading: Progress feedback, cancellable
└── Real-time Processing: <500ms latency

HARDWARE REQUIREMENTS:
├── Minimum: 8GB RAM, 6GB storage, Intel i5 equivalent
├── Recommended: 16GB RAM, SSD, Intel i7, GPU acceleration
└── Optimal: 32GB RAM, NVMe SSD, RTX/RX GPU
```

### **Performance Monitoring**
```rust
// src-tauri/src/system/performance_monitor.rs
pub struct PerformanceMonitor {
    memory_usage: u64,
    cpu_usage: f32,
    gpu_usage: Option<f32>,
}

// Track AI model loading performance
pub fn track_model_loading_time() -> Duration {
    // Implementation
}
```

---

## 🚀 **BUILD AND DISTRIBUTION**

### **Development Builds**
```bash
# Quick development iteration
npm run tauri dev               # Full development with hot reload

# Component-specific development  
npm run dev                     # Frontend-only (faster iteration)
npm run tauri dev --release     # Performance testing build
```

### **Production Builds**
```bash
# Create production build with embedded models
npm run tauri build

# Create installer (4GB+ file)
npm run build-installer

# Verify model integrity in build
npm run verify-build-models
```

### **Distribution Strategy**
```
DISTRIBUTION OPTIONS:
├── Single 4GB Installer (RECOMMENDED)
│   ├── GutachtenAssistant-v2.0.0-Setup.exe
│   ├── All AI models embedded
│   └── Complete offline functionality
├── Portable Application (Alternative)
│   ├── 4GB folder with all dependencies
│   └── No installation required
└── Modular Installation (Not recommended)
    ├── Core app + model downloads
    └── Network dependency (conflicts with medical requirements)
```

---

## 🐛 **DEBUGGING AND TROUBLESHOOTING**

### **Tauri-Specific Debugging**
```bash
# Rust backend debugging
RUST_LOG=debug npm run tauri dev

# Frontend debugging (standard React DevTools)
# Backend debugging (VS Code Rust analyzer)

# Performance debugging
cargo flamegraph              # Profile Rust code
npm run analyze              # Analyze frontend bundle
```

### **Common Issues and Solutions**

#### **1. Large AI Model Loading Issues**
```
Problem: 3GB model takes too long to load
Solution: Implement progressive loading with UI feedback
Check: Memory limits, disk I/O performance
```

#### **2. Tauri Command Registration**
```rust
// src-tauri/src/main.rs
#[tauri::command]
async fn load_whisper_model() -> Result<String, String> {
    // Implementation
}

// Register in app builder
.invoke_handler(tauri::generate_handler![load_whisper_model])
```

#### **3. Frontend-Backend Type Synchronization**
```typescript
// Keep Rust types and TypeScript types synchronized
// src/types/tauri.ts
export interface ModelLoadingProgress {
  current: number;
  total: number;
  status: string;
}
```

---

## 📚 **DOCUMENTATION STANDARDS**

### **Code Documentation Requirements**
```rust
/// Component 3.1: Whisper Model Integration
/// 
/// Manages loading and operation of the 3GB Whisper Large-v3 model
/// for German medical speech recognition.
/// 
/// # Examples
/// ```
/// let mut service = WhisperService::new();
/// service.initialize().await?;
/// let transcript = service.transcribe(audio_data).await?;
/// ```
/// 
/// # Performance
/// - Model loading: ~60 seconds first time, ~10 seconds cached
/// - Memory usage: ~3-4GB during operation
/// - Latency: <500ms for real-time transcription
pub struct WhisperService {
    // Implementation
}
```

### **German Medical UI Documentation**
```typescript
/**
 * Component 3.2: Real-time Transcription Display
 * 
 * Displays live German medical speech transcription with
 * terminology highlighting and editing capabilities.
 * 
 * German Medical Features:
 * - ICD-10 code recognition
 * - Medical terminology highlighting
 * - Professional medical report formatting
 */
export const TranscriptionView: React.FC = () => {
    // Implementation
};
```

---

## 🎯 **NEXT DEVELOPMENT PHASES**

### **Phase 1.1: Project Foundation (This Week)**
- Initialize new Tauri project structure
- Setup Rust backend modules
- Implement basic React medical UI
- Configure build system for 4GB app

### **Phase 1.2: Foundation Testing (This Week)**  
- Test basic Tauri functionality
- Verify memory management for large models
- Validate German medical UI
- Confirm build system works

### **Phase 2.1: AI Model Architecture (Next Week)**
- Design model embedding system
- Implement progressive loading
- Create model management services
- Setup GPU acceleration detection

---

**This development guide provides the complete framework for creating a professional 4GB medical desktop application with embedded AI models using modern Tauri technology.**

**Development Status:** 80% Complete - Core Workflow Functional
**Last Updated:** January 2026
**Completed:** Audio recording, file upload, Whisper, Llama grammar, dictation commands, onboarding
**Next Features:** Style template integration, OCR, Medical NER, DOCX export