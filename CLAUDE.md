# claude.md - Gutachten Assistant Project Context

**For Claude Coding Continuation - AI-Powered Medical Documentation Assistant**
**Last Updated:** January 2026

---

## 🎯 **PROJECT MISSION**

Developing a **DSGVO-compliant, offline-first AI-powered DESKTOP APPLICATION** that reduces administrative burden in creating medical expert reports (Gutachten) for German physicians.

### **Core Value Proposition**
- 60% time reduction in Gutachten creation (5+ hours → 2 hours)
- 100% offline processing for DSGVO compliance
- AI learns individual physician's formatting style
- End-to-end workflow: Document upload → AI processing → Final report

---

## ⚠️ **CRITICAL: RECURRING DEV SERVER ISSUE**

**PROBLEM**: Desktop app opens with NO UI elements (blank/colored background only).
**CAUSE**: Vite dev server not running at localhost:3000.
**SOLUTION**: Keep `npm run tauri:dev` running in background continuously.

**📖 Full details**: See `DEV_TROUBLESHOOTING.md` for complete troubleshooting guide.

---

## 🏗️ **TECHNICAL ARCHITECTURE** *(Updated - Clean Pipeline)*

### **COMPLETE AUDIO-TO-TEXT PIPELINE**
```
🎤 Microphone / 📁 Audio File Upload
    ↓
Frontend (React + MediaRecorder / File Input)
    ↓
Tauri Commands (Rust Backend)
    ↓
Python Subprocess → Whisper Large-v3 → German Transcription
    ↓
Python Subprocess → Llama 3.2 3B → Dictation Commands + Grammar Correction
    ↓
Final Corrected German Medical Text
```

### **DESKTOP APPLICATION Stack**
- **Desktop Framework:** Tauri 2.0 + React + TypeScript + Rust Backend
- **Audio Pipeline:** MediaRecorder API → Tauri save_audio command → FFmpeg → Whisper
- **Build System:** Tauri Build + Vite + Tailwind CSS
- **Language:** German DESKTOP UI throughout
- **AI Components (Free/Open Source Only):**
  - OpenAI Whisper Large-v3 (German speech recognition via Python subprocess)
  - FFmpeg (professional audio conversion to 16kHz WAV)
  - Llama 3.1 8B (German grammar correction and style learning)
  - spaCy + GERNERMED++ (German medical NER)

### **Current DESKTOP APPLICATION Status**
```
✅ COMPLETE: Tauri 2.0 + React + TypeScript DESKTOP foundation
✅ COMPLETE: Clean audio pipeline - MediaRecorder → Tauri → Python Whisper
✅ COMPLETE: Component 2.1A - Professional audio recording interface
✅ COMPLETE: Component 2.1B - Python Whisper virtual environment integration with German transcription
✅ COMPLETE: Component 2.2A - Document upload UI for style learning (drag & drop DOCX support)
✅ COMPLETE: Component 2.2B - Document analysis engine with comprehensive DOCX parsing
✅ COMPLETE: Component 2.2C - Llama 3.2 3B grammar correction with dictation commands
✅ COMPLETE: Component 2.3 - Full workflow integration (Record/Upload → Transcribe → Correct → Save)
✅ COMPLETE: First-launch onboarding for example Gutachten collection
✅ COMPLETE: Audio file upload option (WAV, MP3, WebM, M4A, OGG support)
📋 PLANNED: OCR (Tesseract), Medical NER (spaCy + GERNERMED++)
📋 PLANNED: Style template integration from uploaded example Gutachten
```

---

## 🚧 **CURRENT DEVELOPMENT STATE (January 2026)**

### **Unified Gutachten Workflow - FULLY FUNCTIONAL**

The main workflow is complete and working in `GutachtenWorkflowComponent.tsx`:

**1. Audio Input Options:**
- **Live Recording** (red microphone button) - Record directly via microphone
- **File Upload** (blue folder button) - Upload pre-recorded audio files
- Supported formats: WAV, MP3, WebM, M4A, OGG (max 100MB)

**2. Whisper Transcription:**
- Python Whisper Large-v3 via subprocess
- Optimized for German medical terminology
- UTF-8 encoding with proper umlaut handling (ä, ö, ü, ß)

**3. Grammar Correction (Llama 3.2 3B):**
- Converts dictation commands to punctuation (Schreibkraft-style)
- Corrects German grammar and spelling
- Preserves medical terminology and structure

**4. Output Options:**
- Edit text inline with save/cancel
- Copy to clipboard
- Save as .txt file
- Re-run grammar correction
- Start new dictation

### **Dictation Commands Supported**
| Spoken Command | Result |
|---------------|--------|
| "Punkt" | . |
| "Komma" | , |
| "Doppelpunkt" | : |
| "Semikolon" | ; |
| "Fragezeichen" | ? |
| "Ausrufezeichen" | ! |
| "In Klammern ... Klammern zu" | (...) |
| "Anführungszeichen auf/zu" | "..." |
| "Neue Zeile" | Line break |
| "Neuer Absatz" | Paragraph break |

### **First-Launch Onboarding - COMPLETE**

Located in `FirstLaunchOnboarding.tsx`:
- Shows on every app launch UNTIL user uploads example documents
- Collects example Gutachten to learn user's personal style
- "Skip" button dismisses only for current session (will show again next launch)
- Uploaded documents persist in localStorage
- After upload, navigates directly to Gutachten Diktat workflow

### **Component 2.2C: Grammar Correction - COMPLETED**

**Technical Implementation:**
- `llama_grammar_correct.py` - Python script with dictation command conversion
- `src-tauri/src/commands/llama_commands.rs` - Rust Tauri command interface
- Uses `llama_venv_gpu` virtual environment (NOT `llama_venv`)
- Chat API integration for proper Llama 3.2 format
- JSON fallback parsing for malformed LLM output

### **What's Next (When Development Resumes):**
1. Use uploaded example Gutachten to influence output formatting style
2. Integrate style templates into grammar correction pipeline
3. OCR for scanned documents (Tesseract)
4. Medical NER (spaCy + GERNERMED++)

---

## 📋 **DEVELOPMENT METHODOLOGY**

### **Component-by-Component Approach**
Each component goes through 5 phases:
1. **Development** - Write code
2. **Local Test** - Developer tests functionality
3. **Integration Test** - Test with existing components
4. **User Test** - Validate with target users
5. **Validation** - Confirm before next component

### **Mandatory Quality Standards**
**CRITICAL:** All development MUST follow `PROJECT_STANDARDS.md`:

- ✅ **File Path Verification:** Every import statement must exactly match file names
- ✅ **Naming Conventions:** PascalCase components, camelCase services
- ✅ **Import/Export Consistency:** Zero tolerance for mismatches
- ✅ **Cross-Reference Validation:** Check entire dependency chain

### **File Naming Rules**
```
✅ CORRECT:
- Components: AudioTestComponent.tsx, WhisperTestComponent.tsx
- Services: audioService.ts, whisperService.ts
- Directories: src/components/Audio/, src/services/

❌ INCORRECT:
- audio_test_component.tsx, AudioService.ts, src/components/audio/
```

---

## 🎨 **UI/UX DESIGN PRINCIPLES**

### **German Medical Professional Theme**
- **Primary Colors:** Medical blue (#1e40af, #3b82f6, #60a5fa)
- **Language:** 100% German throughout
- **Design:** Clean, clinical, professional medical aesthetic
- **Accessibility:** WCAG 2.1 AA compliance
- **Responsiveness:** Works on various screen sizes

### **Key UI Components**
- Professional header with German medical branding
- Sidebar navigation with component test links
- Progress indicators for AI processing
- Audio visualization and controls
- German error messages and success states

---

## 🔒 **COMPLIANCE REQUIREMENTS**

### **DSGVO (GDPR) Compliance**
- **100% Offline Processing:** No data leaves local machine
- **AES-256 Encryption:** All stored data encrypted
- **No Telemetry:** No external server communication
- **Local Storage:** SQLite with encryption at rest
- **User Control:** Complete data deletion capability

### **Non-Medical Device Positioning**
**CRITICAL CONSTRAINT:** Must remain administrative documentation tool, NOT medical device:
- ✅ **Permitted:** Document transcription, formatting automation, administrative efficiency
- ❌ **Prohibited:** Medical advice, diagnostic assistance, treatment recommendations

---

## 🧪 **TESTING FRAMEWORK**

### **DESKTOP APPLICATION Testing**
```bash
# Build the standalone .exe
npm run tauri:build

# Launch the DESKTOP APPLICATION (.exe file)
# Location: src-tauri/target/release/gutachten-assistant.exe
# Double-click the .exe file - NO SERVER NEEDED!

# Navigate to "Diktat" in sidebar for professional Diktiergerät interface
# All features: Record, Pause, Resume, Stop, Playback, Rewind, Fast-Forward
```

### **Testing Checklist for Each Component**
- [ ] Functionality works as specified
- [ ] No console errors
- [ ] Responsive design functional
- [ ] German language correct throughout
- [ ] Error handling implemented
- [ ] Performance within targets
- [ ] DSGVO compliance maintained

---

## 🎯 **IMMEDIATE DEVELOPMENT PRIORITIES**

### **1. Component 2.1B Testing (CURRENT)**
- Test WhisperTestComponent at `/test/whisper`
- Validate all system checks show green
- Confirm audio recording integration works
- Verify UI responsiveness and German text

### **2. Real Whisper Integration (NEXT)**
Replace testing stub in `whisperService.ts` with actual Whisper model:
- Download Whisper Large-v3 model to `models/` directory
- Implement actual speech recognition pipeline
- Add German medical vocabulary optimization
- Real-time transcription processing

### **3. Component 2.2 Development (CURRENT)**
AI Grammar Correction & Personal Style Learning System:
- First-time setup with document upload UI (.doc/.docx)
- Style analysis engine extracting user's formatting patterns
- Local Llama 3.1 8B integration for German grammar correction
- Personal template generation preserving user's individual style
- Automated DOCX generation with user's exact formatting

---

## 📁 **KEY PROJECT FILES**

### **Essential Documentation**
- `PROJECT_STANDARDS.md` - MANDATORY quality control standards
- `DEVELOPMENT.md` - Complete development workflow
- `CHANGELOG.md` - Version history and progress tracking
- `PROJECT_STRUCTURE.md` - Complete file map and status

### **Core Application Files**
- `src/App.tsx` - Main application with routing and onboarding integration
- `src/components/Workflow/GutachtenWorkflowComponent.tsx` - Main unified workflow (Record/Upload → Transcribe → Correct → Save)
- `src/components/Onboarding/FirstLaunchOnboarding.tsx` - First-launch example document collection
- `src/components/Layout/` - Header, Sidebar, Layout components
- `src/services/audioService.ts` - Component 2.1A (production ready)
- `src/services/whisperService.ts` - Component 2.1B (Whisper integration)
- `src/services/llamaService.ts` - Grammar correction service
- `src/components/Audio/AudioTestComponent.tsx` - Component 2.1A UI
- `src/components/Audio/WhisperTestComponent.tsx` - Component 2.1B UI

### **Backend Commands (Rust)**
- `src-tauri/src/commands/audio_commands.rs` - Audio save/process commands with UTF-8 fix
- `src-tauri/src/commands/llama_commands.rs` - Grammar correction command (uses llama_venv_gpu)
- `src-tauri/src/commands/document_commands.rs` - DOCX analysis commands

### **Python Scripts**
- `whisper_transcribe_tauri.py` - Whisper transcription script
- `llama_grammar_correct.py` - Grammar correction with dictation command conversion

### **Python Virtual Environments**
- `whisper_venv/` - Whisper transcription (Python 3.13)
- `llama_venv_gpu/` - Llama grammar correction (llama-cpp-python installed here)

---

## ⚠️ **CRITICAL DEVELOPMENT CONSTRAINTS**

### **Budget Constraints**
- **AI Components:** MUST be free/open source only
- **No Commercial APIs:** Everything runs locally
- **Model Storage:** Use efficient model caching and compression

### **Technical Constraints**
- **Offline First:** No internet dependency for core functionality
- **German Language:** All processing optimized for German medical text
- **Performance:** Real-time processing on consumer hardware
- **Memory:** Efficient model loading and memory management

### **Regulatory Constraints**
- **DSGVO Compliance:** Privacy by design, local processing only
- **Non-Medical Device:** Administrative tool positioning only
- **Quality Standards:** Follow PROJECT_STANDARDS.md religiously

---

## 🚀 **SUCCESS METRICS**

### **Technical Performance Targets**
- Audio processing latency: <500ms
- OCR processing: <30 seconds per page
- Speech recognition accuracy: >98% for German medical text
- Application startup: <10 seconds
- Memory usage: <4GB during operation

### **Business Objectives**
- 500 paying customers within 12 months
- 60% average time reduction in Gutachten creation
- 95%+ OCR accuracy on German medical documents
- 85%+ annual customer retention rate

---

## 💡 **DEVELOPMENT PHILOSOPHY**

### **Quality First Approach**
- Every component thoroughly tested before moving to next
- Zero tolerance for file path/import errors
- Comprehensive error handling and user feedback
- Professional medical-grade user experience

### **Incremental Delivery**
- Component-by-component development ensures steady progress
- Each component adds tangible value
- Users can test and provide feedback at each stage
- Risk is minimized through incremental validation

---

## 🔄 **CURRENT WORKFLOW STATE**

### **Ready for Immediate Development:**
1. **Start development server:** `npm run dev`
2. **Test Component 2.1B:** Navigate to `/test/whisper`
3. **Validate functionality:** Check all systems green, test audio recording
4. **Begin real Whisper integration:** Replace stub with actual model

### **DESKTOP APPLICATION Development:**
```bash
cd gutachten-assistant
npm install --legacy-peer-deps

# Build standalone desktop application
npm run tauri:build

# Launch .exe file (NO SERVER REQUIRED!)
# Location: src-tauri/target/release/gutachten-assistant.exe
```

### **Key Development Rules:**
- Read PROJECT_STANDARDS.md before creating any files
- Follow component-by-component methodology
- Test thoroughly before moving to next component
- Update CHANGELOG.md with all changes
- Maintain 100% German UI language
- Ensure DSGVO compliance in all features

---

**This context provides Claude Coding with complete understanding of project state, methodology, constraints, and immediate next steps.**