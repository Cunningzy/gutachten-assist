# PROJECT STRUCTURE - Gutachten Assistant v2.0

**Complete architecture map for 4GB All-in-One Desktop Medical Application**
**Last Updated:** January 1, 2026
**Architecture:** Tauri 2.0 + React + TypeScript + Rust + Embedded 3GB+ AI Models
**Development Status:** 80% Complete - Core Workflow Fully Functional

---

## 🎯 **ARCHITECTURE OVERVIEW**

### **New v2.0 Architecture (Tauri-Based)**
- **Framework:** Tauri 2.0 + React 18 + TypeScript + Rust Backend
- **Distribution:** Single 4GB installer with embedded AI models
- **AI Models:** Whisper Large-v3 (3GB), Tesseract OCR, spaCy NLP
- **Development:** 16-phase implementation (8 development + 8 testing)
- **Target:** Professional German medical documentation desktop application

### **Key Architecture Benefits**
- **90% smaller runtime** than Electron (15MB vs 150MB framework overhead)
- **Better performance** with native Rust backend
- **Enhanced security** with process isolation
- **All-in-one distribution** with no external dependencies
- **Professional desktop integration** with native OS features

---

## 📁 **COMPLETE PROJECT STRUCTURE (v2.0)**

```
gutachten-assistant-v2/
├── 📋 **PROJECT DOCUMENTATION**
│   ├── 📄 task_master.md                    ✅ Master 16-phase implementation plan
│   ├── 📄 development.md                    ✅ Tauri development workflow & guidelines  
│   ├── 📄 changelog.md                      ✅ Fresh start tracking for v2.0
│   ├── 📄 PROJECT_STRUCTURE.md              🆕 This file - v2.0 architecture map
│   ├── 📄 project_standards.md              🔄 Updated Tauri + Rust standards (in progress)
│   └── 📄 readme.md                         🔄 Updated project overview (in progress)
├── 📦 **FRONTEND CONFIGURATION** 
│   ├── 📄 package.json                      🔄 Updated dependencies for Tauri
│   ├── 📄 tsconfig.json                     ✅ TypeScript configuration
│   ├── 📄 vite.config.ts                    🔄 Vite + Tauri integration
│   ├── 📄 tailwind.config.js                🔄 Medical theme configuration
│   └── 📄 index.html                        🔄 HTML entry point
├── 🦀 **RUST BACKEND (NEW)**
│   ├── 📄 Cargo.toml                        📋 Rust dependencies & project config
│   ├── 📄 tauri.conf.json                   📋 Tauri app configuration
│   ├── 📁 src/
│   │   ├── 📄 main.rs                       📋 Main Tauri application entry
│   │   ├── 📁 commands/                     📋 Tauri Commands (Frontend ↔ Backend API)
│   │   │   ├── 📄 mod.rs                    📋 Command module exports
│   │   │   ├── 📄 audio_processing.rs       📋 Audio capture & processing commands
│   │   │   ├── 📄 whisper_integration.rs    📋 Speech recognition API
│   │   │   ├── 📄 file_operations.rs        📋 File management commands  
│   │   │   ├── 📄 ai_models.rs              📋 AI model management API
│   │   │   └── 📄 system_info.rs            📋 System compatibility & hardware detection
│   │   ├── 📁 services/                     📋 Core Business Logic (Rust Services)
│   │   │   ├── 📄 mod.rs                    📋 Service module exports
│   │   │   ├── 📄 audio_service.rs          📋 Native audio capture & streaming
│   │   │   ├── 📄 whisper_service.rs        📋 Whisper model integration
│   │   │   ├── 📄 ocr_service.rs            📋 Tesseract OCR processing
│   │   │   ├── 📄 text_service.rs           📋 spaCy medical NLP processing
│   │   │   └── 📄 security_service.rs       📋 DSGVO compliance & encryption
│   │   ├── 📁 models/                       📋 AI Model Management System
│   │   │   ├── 📄 mod.rs                    📋 Model module exports
│   │   │   ├── 📄 model_manager.rs          📋 Universal model loading & caching
│   │   │   ├── 📄 whisper_manager.rs        📋 3GB Whisper model management
│   │   │   ├── 📄 ocr_manager.rs            📋 Tesseract model management
│   │   │   ├── 📄 spacy_manager.rs          📋 spaCy model integration
│   │   │   └── 📄 model_loader.rs           📋 Progressive loading with UI feedback
│   │   ├── 📁 ai_processing/                📋 AI Processing Pipeline
│   │   │   ├── 📄 mod.rs                    📋 Processing module exports
│   │   │   ├── 📄 speech_processor.rs       📋 Real-time speech recognition
│   │   │   ├── 📄 ocr_processor.rs          📋 Document OCR processing
│   │   │   ├── 📄 text_processor.rs         📋 Medical text analysis & NER
│   │   │   └── 📄 workflow_processor.rs     📋 Complete AI workflow orchestration
│   │   ├── 📁 storage/                      📋 Data Management & Persistence
│   │   │   ├── 📄 mod.rs                    📋 Storage module exports
│   │   │   ├── 📄 encrypted_db.rs           📋 SQLite with AES-256 encryption
│   │   │   ├── 📄 file_manager.rs           📋 Secure file operations
│   │   │   └── 📄 patient_data.rs           📋 Medical data management
│   │   ├── 📁 system/                       📋 System Integration & Performance
│   │   │   ├── 📄 mod.rs                    📋 System module exports  
│   │   │   ├── 📄 memory_manager.rs         📋 Large model memory optimization
│   │   │   ├── 📄 gpu_detection.rs          📋 Hardware acceleration detection
│   │   │   ├── 📄 performance_monitor.rs    📋 Resource usage monitoring
│   │   │   └── 📄 desktop_integration.rs    📋 Native OS integration
│   │   ├── 📁 security/                     📋 Security & DSGVO Compliance
│   │   │   ├── 📄 mod.rs                    📋 Security module exports
│   │   │   ├── 📄 encryption.rs             📋 AES-256 encryption utilities
│   │   │   ├── 📄 audit_log.rs              📋 Compliance audit logging
│   │   │   └── 📄 data_protection.rs        📋 DSGVO data protection
│   │   └── 📁 utils/                        📋 Utility Functions
│   │       ├── 📄 mod.rs                    📋 Utility module exports
│   │       ├── 📄 file_utils.rs             📋 File system operations
│   │       ├── 📄 string_utils.rs           📋 Text processing utilities
│   │       └── 📄 medical_utils.rs          📋 German medical terminology helpers
│   ├── 📁 icons/                            📋 Application icons for desktop
│   └── 📁 build/                            📋 Build scripts and configuration
├── 🌐 **REACT FRONTEND (ENHANCED)**
│   ├── 📄 main.tsx                          ✅ React entry point
│   ├── 📄 App.tsx                           🔄 Main app with Tauri integration
│   ├── 📄 App.css                           🔄 Enhanced medical theme
│   ├── 📁 components/                       📋 React UI Components
│   │   ├── 📁 Audio/                        📋 Audio & Speech Components
│   │   │   ├── 📄 AudioRecorder.tsx         📋 Enhanced native audio recording
│   │   │   ├── 📄 TranscriptionView.tsx     📋 Real-time transcription display
│   │   │   ├── 📄 AudioVisualizer.tsx       📋 Audio waveform visualization
│   │   │   ├── 📄 AudioSettings.tsx         📋 Audio device management
│   │   │   └── 📄 VoiceCommands.tsx         📋 Voice command interface
│   │   ├── 📁 Medical/                      📋 Medical Workflow Components
│   │   │   ├── 📄 GutachtenEditor.tsx       📋 Medical report editor
│   │   │   ├── 📄 PatientDataForm.tsx       📋 Patient information forms
│   │   │   ├── 📄 MedicalTemplates.tsx      📋 German report templates
│   │   │   ├── 📄 DiagnosisHelper.tsx       📋 ICD-10 diagnosis assistance
│   │   │   ├── 📄 MedicalTerminology.tsx    📋 Medical vocabulary assistance
│   │   │   └── 📄 ReportGenerator.tsx       📋 Automated report generation
│   │   ├── 📁 DocumentProcessing/           📋 Document & OCR Components
│   │   │   ├── 📄 DocumentUploader.tsx      📋 File upload and management
│   │   │   ├── 📄 OCRResults.tsx            📋 OCR processing results
│   │   │   ├── 📄 BatchProcessor.tsx        📋 Batch document processing
│   │   │   └── 📄 DocumentPreview.tsx       📋 Document preview and editing
│   │   ├── 📁 Desktop/                      📋 Desktop Integration Components
│   │   │   ├── 📄 NativeMenuBar.tsx         📋 Desktop menu integration
│   │   │   ├── 📄 StatusBar.tsx             📋 System status information
│   │   │   ├── 📄 FileExplorer.tsx          📋 Native file navigation
│   │   │   ├── 📄 SystemTray.tsx            📋 System tray functionality
│   │   │   └── 📄 WindowControls.tsx        📋 Desktop window management
│   │   ├── 📁 SystemStatus/                 📋 System Monitoring Components
│   │   │   ├── 📄 MemoryUsage.tsx           📋 Memory consumption display
│   │   │   ├── 📄 ModelStatus.tsx           📋 AI model loading status
│   │   │   ├── 📄 PerformanceMetrics.tsx    📋 Real-time performance metrics
│   │   │   ├── 📄 ModelLoadingProgress.tsx  📋 3GB model loading progress
│   │   │   ├── 📄 SystemCompatibility.tsx   📋 Hardware compatibility checks
│   │   │   └── 📄 ResourceMonitor.tsx       📋 System resource monitoring
│   │   ├── 📁 Workflow/                     📋 AI Workflow Components
│   │   │   ├── 📄 PipelineProgress.tsx      📋 Complete workflow progress
│   │   │   ├── 📄 WorkflowManager.tsx       📋 Workflow orchestration UI
│   │   │   ├── 📄 ProcessingQueue.tsx       📋 Task queue management
│   │   │   └── 📄 ResultsViewer.tsx         📋 AI processing results
│   │   └── 📁 Layout/                       📋 Layout & Navigation
│   │       ├── 📄 MainLayout.tsx            📋 Application layout wrapper
│   │       ├── 📄 Sidebar.tsx               📋 Navigation sidebar
│   │       ├── 📄 Header.tsx                📋 Application header
│   │       └── 📄 Footer.tsx                📋 Status footer
│   ├── 📁 services/                         📋 Frontend Services
│   │   ├── 📄 tauriApi.ts                   📋 Tauri backend communication layer
│   │   ├── 📄 audioService.ts               📋 Frontend audio operations
│   │   ├── 📄 fileService.ts                📋 File handling service
│   │   ├── 📄 modelService.ts               📋 AI model state management
│   │   └── 📄 workflowService.ts            📋 Workflow coordination service
│   ├── 📁 store/                            📋 Redux State Management
│   │   ├── 📄 store.ts                      📋 Main Redux store configuration
│   │   └── 📁 slices/
│   │       ├── 📄 audioSlice.ts             📋 Audio recording & processing state
│   │       ├── 📄 transcriptionSlice.ts     📋 Speech recognition state
│   │       ├── 📄 ocrSlice.ts               📋 OCR processing state
│   │       ├── 📄 medicalSlice.ts           📋 Medical data & terminology state
│   │       ├── 📄 fileSlice.ts              📋 File management state
│   │       ├── 📄 modelSlice.ts             📋 AI model loading & status state
│   │       ├── 📄 workflowSlice.ts          📋 Workflow progress state
│   │       └── 📄 systemSlice.ts            📋 System status & performance state
│   ├── 📁 styles/                           📋 Enhanced Styling System
│   │   ├── 📄 globals.css                   📋 Global application styles
│   │   ├── 📄 medical-theme.css             📋 German medical professional theme
│   │   ├── 📄 desktop-integration.css       📋 Native desktop styling
│   │   └── 📄 components.css                📋 Component-specific styles
│   ├── 📁 types/                            📋 TypeScript Type Definitions
│   │   ├── 📄 tauri.ts                      📋 Tauri API types
│   │   ├── 📄 audio.ts                      📋 Audio processing types
│   │   ├── 📄 medical.ts                    📋 Medical data & terminology types
│   │   ├── 📄 ai-models.ts                  📋 AI model types
│   │   ├── 📄 workflow.ts                   📋 Workflow & processing types
│   │   └── 📄 system.ts                     📋 System & performance types
│   └── 📁 hooks/                            📋 Custom React Hooks
│       ├── 📄 useAudio.ts                   📋 Audio recording hooks
│       ├── 📄 useTauri.ts                   📋 Tauri integration hooks
│       ├── 📄 useModels.ts                  📋 AI model management hooks
│       └── 📄 useWorkflow.ts                📋 Workflow management hooks
├── 🤖 **EMBEDDED AI MODELS (3GB+)**
│   ├── 📁 whisper/                          📋 Speech Recognition Models
│   │   ├── 📄 ggml-large-v3.bin            📋 3.09GB - Primary Whisper model
│   │   ├── 📄 whisper-large-v3.bin         📋 Alternative model format
│   │   └── 📄 model-info.json              📋 Model metadata & configuration
│   ├── 📁 tesseract/                        📋 OCR Models & Training Data
│   │   ├── 📄 deu.traineddata              📋 50MB - German OCR training data
│   │   ├── 📄 deu_frak.traineddata         📋 German Fraktur script recognition
│   │   ├── 📄 osd.traineddata              📋 Orientation & script detection
│   │   └── 📄 ocr-config.json              📋 OCR configuration & settings
│   ├── 📁 spacy/                            📋 German NLP Models
│   │   ├── 📁 de_core_news_lg-3.7.0/       📋 200MB - German language model
│   │   ├── 📁 de_dep_news_trf-3.7.0/       📋 German transformer model  
│   │   └── 📄 nlp-config.json              📋 NLP processing configuration
│   ├── 📁 medical/                          📋 Medical Terminology & Knowledge
│   │   ├── 📄 medical_vocab_de.json        📋 German medical vocabulary
│   │   ├── 📄 icd10_de.json                📋 German ICD-10 diagnostic codes
│   │   ├── 📄 medical_abbreviations.json   📋 Medical abbreviations & expansions
│   │   └── 📄 specialty_terms.json         📋 Medical specialty terminology
│   └── 📁 templates/                        📋 Medical Report Templates
│       ├── 📄 gutachten_template.json      📋 Standard German medical report template
│       ├── 📄 speciality_templates/        📋 Specialty-specific templates
│       └── 📄 template_config.json         📋 Template configuration
├── 🐍 **PYTHON AI INTEGRATION** (Development Only)
│   ├── 📄 spacy_service.py                  📋 Medical NER service
│   ├── 📄 ocr_processor.py                  📋 OCR preprocessing pipeline
│   ├── 📄 model_converter.py               📋 Model format conversion utilities
│   ├── 📄 medical_terminology.py           📋 Medical vocabulary processing
│   └── 📄 requirements.txt                 📋 Python development dependencies
├── 📦 **DISTRIBUTION & PACKAGING**
│   ├── 📁 installer/                        📋 Installation Package Creation
│   │   ├── 📄 windows-installer.nsi         📋 NSIS installer script (4GB app)
│   │   ├── 📄 compression-config.json       📋 Model compression settings
│   │   ├── 📄 integrity-check.rs            📋 Model file integrity verification
│   │   └── 📄 installer-assets/             📋 Installer graphics & resources
│   ├── 📁 updater/                          📋 Auto-Update System
│   │   ├── 📄 delta-updates.rs              📋 Incremental update system
│   │   ├── 📄 model-updater.rs              📋 AI model version management
│   │   └── 📄 update-config.json            📋 Update system configuration
│   └── 📁 packaging/                        📋 Cross-Platform Packaging
│       ├── 📄 tauri-build.json              📋 Tauri build configuration
│       └── 📄 release-scripts/              📋 Release automation scripts
├── 🧪 **TESTING FRAMEWORK**
│   ├── 📁 unit/                             📋 Unit Tests
│   │   ├── 📁 rust/                         📋 Rust backend unit tests
│   │   └── 📁 typescript/                   📋 TypeScript frontend unit tests
│   ├── 📁 integration/                      📋 Integration Tests
│   │   ├── 📄 tauri-integration.spec.ts     📋 Frontend-backend integration tests
│   │   ├── 📄 ai-models.spec.ts             📋 AI model integration tests
│   │   └── 📄 workflow.spec.ts              📋 Complete workflow tests
│   ├── 📁 e2e/                              📋 End-to-End Tests
│   │   ├── 📄 medical-workflow.spec.ts      📋 Complete medical workflow tests
│   │   └── 📄 performance.spec.ts           📋 Performance & load tests
│   └── 📁 fixtures/                         📋 Test Data & Fixtures
│       ├── 📁 audio-samples/                📋 German medical audio samples
│       ├── 📁 documents/                    📋 Sample medical documents  
│       └── 📁 expected-results/             📋 Expected test outputs
├── 📚 **DOCUMENTATION**
│   ├── 📁 api/                              📋 API Documentation
│   │   ├── 📄 tauri-commands.md             📋 Tauri command documentation
│   │   └── 📄 rust-services.md              📋 Rust service documentation
│   ├── 📁 deployment/                       📋 Deployment Documentation
│   │   ├── 📄 installation-guide.md         📋 Installation & setup guide
│   │   └── 📄 system-requirements.md        📋 Hardware & software requirements
│   ├── 📁 development/                      📋 Development Documentation
│   │   ├── 📄 getting-started.md            📋 Development setup guide
│   │   └── 📄 contribution-guide.md         📋 Contribution guidelines
│   └── 📁 user/                             📋 User Documentation
│       ├── 📄 user-manual-de.md             📋 German user manual
│       └── 📄 medical-workflow-guide.md     📋 Medical workflow documentation
└── 🔧 **BUILD & CONFIGURATION**
    ├── 📄 embed-models.rs                   📋 Model embedding in build process
    ├── 📄 compression.rs                    📋 Model compression for distribution
    ├── 📄 integrity.rs                      📋 Model file verification
    └── 📄 build-config.toml                 📋 Build system configuration
```

---

## 📊 **DEVELOPMENT STATUS (January 2026)**

### **✅ COMPLETED COMPONENTS**

#### **Core Application Infrastructure**
- ✅ Tauri 2.0 + React + TypeScript + Rust backend
- ✅ Manual state-based routing (Tauri-compatible)
- ✅ German medical UI theme
- ✅ Build system with NSIS installer

#### **Audio Recording & Transcription (Components 2.1A, 2.1B)**
- ✅ `src/components/Audio/SimpleRecorderComponent.tsx` - Audio recording
- ✅ `src/services/audioService.ts` - Audio service
- ✅ `src-tauri/src/commands/audio_commands.rs` - Rust audio commands
- ✅ `whisper_transcribe_tauri.py` - Python Whisper integration
- ✅ `whisper_venv/` - Python virtual environment

#### **Document Analysis (Components 2.2A, 2.2B)**
- ✅ `src/components/StyleTraining/StyleTrainingComponent.tsx` - Document upload UI
- ✅ `src-tauri/src/commands/document_commands.rs` - DOCX parsing

#### **Grammar Correction (Component 2.2C)**
- ✅ `llama_grammar_correct.py` - Llama 3.2 3B with dictation commands
- ✅ `src-tauri/src/commands/llama_commands.rs` - Rust Llama command
- ✅ `src/services/llamaService.ts` - Grammar correction service
- ✅ `llama_venv_gpu/` - Python virtual environment with llama-cpp-python

#### **Unified Workflow (Component 2.3)**
- ✅ `src/components/Workflow/GutachtenWorkflowComponent.tsx` - Main workflow
  - Live microphone recording
  - Audio file upload (WAV, MP3, WebM, M4A, OGG)
  - Whisper transcription
  - Llama grammar correction
  - Text editing, copying, saving

#### **First-Launch Onboarding**
- ✅ `src/components/Onboarding/FirstLaunchOnboarding.tsx` - Example collection
- ✅ Shows until user uploads example documents
- ✅ Persists in localStorage

---

### **📋 REMAINING FEATURES (20%)**

#### **Style Template Integration**
- 📋 Use uploaded example Gutachten to influence output style
- 📋 Extract formatting patterns from DOCX files
- 📋 Apply user's personal style to grammar-corrected text

#### **OCR Processing**
- 📋 Tesseract OCR for scanned documents
- 📋 German medical document recognition
- 📋 Integration into workflow

#### **Medical NER**
- 📋 spaCy + GERNERMED++ integration
- 📋 German medical entity recognition
- 📋 ICD-10 code detection

#### **DOCX Export**
- 📋 Export corrected text to DOCX
- 📋 Apply user's formatting style
- 📋 Template-based document generation

---

## 🎯 **KEY ARCHITECTURE DECISIONS**

### **Desktop Framework: Tauri 2.0**
**Why Tauri over Electron:**
- **Performance:** 90% smaller runtime overhead
- **Security:** Better process isolation and permission system  
- **Native Integration:** True desktop application behavior
- **Medical Compliance:** Enhanced security for sensitive medical data
- **Resource Efficiency:** Better memory management for large AI models

### **AI Model Strategy: Fully Embedded**
**Distribution Approach:**
- **Single Installer:** 4GB package with all models included
- **Offline First:** No external dependencies or internet requirements
- **Medical Grade:** Consistent performance regardless of network availability
- **DSGVO Compliant:** All data processing happens locally

### **Development Methodology: 16-Phase Approach**
**Structured Implementation:**
- **Plan-Develop-Test-Document:** Every phase follows structured methodology
- **Quality Gates:** Mandatory testing phase after each development phase
- **Progress Tracking:** CHANGELOG.md updated after every test phase
- **Risk Mitigation:** Early validation prevents late-stage integration issues

---

## 🔍 **FILE VERIFICATION STATUS**

### **Documentation Files**
- ✅ **task_master.md** - Master implementation plan complete
- ✅ **development.md** - Tauri development workflow complete
- ✅ **changelog.md** - Fresh start tracking system complete
- ✅ **PROJECT_STRUCTURE.md** - Complete architecture map (this file)
- 🔄 **project_standards.md** - Updated standards in progress
- 🔄 **readme.md** - Updated overview in progress

### **Implementation Files**
- 📋 **All Rust backend files** - Ready for Phase 1.1 creation
- 📋 **Enhanced React components** - Ready for implementation  
- 📋 **AI model management system** - Architecture defined
- 📋 **Build and distribution system** - Configuration planned

---

## 💡 **DEVELOPMENT GUIDELINES**

### **For AI Assistants Continuing Development:**

#### **Essential Reading Order:**
1. **Read this file first** - Complete architecture understanding
2. **Review task_master.md** - Understand 16-phase methodology  
3. **Check development.md** - Follow Tauri development workflow
4. **Reference project_standards.md** - Apply quality standards
5. **Update changelog.md** - Document all progress

#### **Development Priorities:**
1. **Complete documentation updates** (project_standards.md, readme.md)
2. **Begin Phase 1.1** - Project foundation setup
3. **Follow 16-phase methodology** - Never skip testing phases
4. **Maintain German medical focus** - Professional medical UI throughout
5. **Preserve DSGVO compliance** - All processing remains local

#### **Quality Control:**
- **Test after every development phase** - Non-negotiable requirement
- **Update CHANGELOG.md** - After every test phase completion  
- **File verification** - Ensure all imports and references work
- **German medical standards** - Maintain professional medical UI/UX
- **Performance targets** - Meet all defined benchmarks

---

## 📈 **SUCCESS METRICS**

### **Technical Targets**
- **Application Size:** 3.5-4GB installer (models embedded)
- **Installation Time:** <15 minutes on target systems
- **Startup Performance:** <10 seconds after initial model loading
- **Memory Usage:** Stable operation within 6GB RAM
- **AI Accuracy:** >90% German medical speech recognition

### **Development Targets**  
- **16 Phases Completed:** All development and testing phases
- **Zero Critical Issues:** All phases meet success criteria
- **Documentation Complete:** All files updated and maintained
- **Professional Quality:** Medical-grade application ready for deployment

---

## 🔮 **NEXT STEPS**

### **Immediate Actions:**
1. **Complete documentation updates** (project_standards.md, readme.md)
2. **Initialize Phase 1.1** - Create new Tauri project structure
3. **Setup development environment** - Install Tauri, Rust, and dependencies
4. **Begin implementation** - Follow 16-phase methodology

### **Success Indicators:**
- All documentation files updated and consistent
- Phase 1.1 implementation plan ready for execution
- Development environment configured for 4GB application
- Team aligned on architecture and methodology

---

**This project structure document provides the definitive architecture reference for the Gutachten Assistant v2.0 desktop application. All development should reference this structure for consistency and completeness.**

**Architecture Status:** ✅ **80% COMPLETE - CORE WORKFLOW FUNCTIONAL**
**Completed:** Audio recording, file upload, Whisper transcription, Llama grammar correction, first-launch onboarding
**Next Features:** Style template integration, OCR, Medical NER, DOCX export
**Confidence Level:** Very High - All core dictation features working in production