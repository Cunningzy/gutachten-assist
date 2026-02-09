# claude.md - Gutachten Assistant Project Context

**For Claude Coding Continuation - AI-Powered Medical Documentation Assistant**
**Last Updated:** February 9, 2026

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

## 🏗️ **TECHNICAL ARCHITECTURE** *(Updated February 9, 2026)*

### **COMPLETE AUDIO-TO-DOCX PIPELINE**
```
🎤 Microphone / 📁 Audio File Upload
    ↓
Frontend (React + MediaRecorder / File Input)
    ↓
Tauri Commands (Rust Backend)
    ↓
Python Subprocess → Whisper Large-v3 → German Transcription
    ↓
QWEN STRUCTURING PIPELINE:
  Step 1: Regex Cleanup (deterministic)
    - Convert "Punkt" → "."
    - Convert "Komma" → ","
    - etc.
  Step 2: Qwen2.5-7B-Instruct (qwen_structurer.py)
    - Assign content to template slots
    - Mark unclear parts with {unclear:...}
    - Output structured JSON with slots
    ↓
Structured JSON:
  { slots: {...}, unclear_spans: [...], missing_slots: [...] }
    ↓
docx_renderer.py + template_spec.json
  - Insert content into slots
  - Apply styles from template
  - Highlight unclear spans in yellow
    ↓
Final Gutachten.docx
```

### **KEY ARCHITECTURAL PRINCIPLE (February 2026)**
**Qwen = Structuring ONLY. DOCX generation = App Code (deterministic).**

The LLM assigns dictated content to template slots. The DOCX renderer then:
- Applies the learned styles from template_spec.json
- Inserts fixed blocks (headers, boilerplate)
- Fills slots with structured content

### **DESKTOP APPLICATION Stack**
- **Desktop Framework:** Tauri 2.0 + React + TypeScript + Rust Backend
- **Audio Pipeline:** MediaRecorder API → Tauri save_audio command → FFmpeg → Whisper
- **Build System:** Tauri Build + Vite + Tailwind CSS
- **Language:** German DESKTOP UI throughout
- **AI Components (Free/Open Source Only):**
  - OpenAI Whisper Large-v3 (German speech recognition via Python subprocess)
  - FFmpeg (professional audio conversion to 16kHz WAV)
  - Qwen2.5-7B-Instruct (Gutachten structuring - assigns content to template slots)
  - Llama 3.2 3B (chat-based text revision feature)
  - spaCy + GERNERMED++ (German medical NER - planned)

### **Current DESKTOP APPLICATION Status**
```
✅ COMPLETE: Tauri 2.0 + React + TypeScript DESKTOP foundation
✅ COMPLETE: Clean audio pipeline - MediaRecorder → Tauri → Python Whisper
✅ COMPLETE: Component 2.1A - Professional audio recording interface
✅ COMPLETE: Component 2.1B - Python Whisper virtual environment integration
✅ COMPLETE: Component 2.2A - Document upload UI for style learning
✅ COMPLETE: Component 2.2B - Document analysis engine with DOCX parsing
✅ COMPLETE: Component 2.3 - Full workflow integration
✅ COMPLETE: First-launch onboarding for example Gutachten collection
✅ COMPLETE: Audio file upload option (WAV, MP3, WebM, M4A, OGG, FLAC)
✅ COMPLETE: Template extraction system (template_extractor.py)
✅ COMPLETE: Qwen-based structuring pipeline (qwen_structurer.py)
✅ COMPLETE: DOCX rendering system (docx_renderer.py)
📋 IN PROGRESS: Integrate template extraction into onboarding
📋 PLANNED: OCR (Tesseract), Medical NER (spaCy + GERNERMED++)
```

---

## 🚧 **CURRENT DEVELOPMENT STATE (February 9, 2026)**

### **Latest Session: Qwen Structuring Pipeline**

**New Architecture:** Replaced old Llama copy-editor with Qwen structuring pipeline.

**How It Works:**
1. **Template Extraction** (one-time during onboarding)
   - User uploads 5-10 example Gutachten
   - `template_extractor.py` analyzes structure
   - Outputs `template_spec.json` with anchors, skeleton, styles

2. **Dictation Workflow** (each Gutachten)
   - Audio → Whisper → Raw transcript
   - Qwen assigns content to template slots
   - `docx_renderer.py` creates final DOCX

### **Template Spec Structure**
```json
{
  "anchors": [{"id": "anamnese", "text": "Anamnese:", ...}],
  "skeleton": [
    {"type": "fixed", "anchor_id": "header"},
    {"type": "slot", "slot_id": "anamnese_body"},
    ...
  ],
  "style_roles": {"heading": {...}, "body": {...}}
}
```

### **Qwen Structuring Output**
```json
{
  "slots": {
    "fragestellung_body": ["paragraph1", "paragraph2"],
    "anamnese_body": ["..."],
    ...
  },
  "unclear_spans": [{"slot_id": "...", "text": "...", "reason": "garbled"}],
  "missing_slots": ["sozialanamnese_body"]
}
```

### **Unified Gutachten Workflow - FULLY FUNCTIONAL**

The main workflow in `GutachtenWorkflowComponent.tsx`:

**1. Audio Input Options:**
- **Live Recording** (red microphone button) - Record directly via microphone
- **File Upload** (blue folder button) - Upload pre-recorded audio files
- Supported formats: WAV, MP3, WebM, M4A, OGG, FLAC (max 100MB)

**2. Whisper Transcription:**
- Python Whisper Large-v3 via subprocess
- Optimized for German medical terminology
- UTF-8 encoding with proper umlaut handling (ä, ö, ü, ß)

**3. Grammar Correction (Two-Step Pipeline):**
- Step 1: Regex cleanup of dictation commands (deterministic)
- Step 2: Copy-editor LLM correction (minimal changes)
- Step 3: Guardrails check (reject hallucination)

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

### **StyleProfile System - COMPLETE**

Located in `style_profile_analyzer.py` and `FirstLaunchOnboarding.tsx`:
- Collects 5-10 example Gutachten from user
- Extracts ONLY section structure (not content)
- Learns section names, order, and formatting preferences
- Stores in `user-data/style-profile/profile.json`

**Important:** StyleProfile provides section names for future DOCX generation, but does NOT feed into LLM (to prevent hallucination).

### **What's Next (When Development Resumes):**
1. Implement deterministic template insertion in DOCX generation
2. Use StyleProfile sections in app code (not LLM) for document structure
3. OCR for scanned documents (Tesseract)
4. Medical NER (spaCy + GERNERMED++)

---

## 📁 **KEY PROJECT FILES**

### **Essential Documentation**
- `PROJECT_STANDARDS.md` - MANDATORY quality control standards
- `DEVELOPMENT.md` - Complete development workflow
- `CHANGELOG.md` - Version history and progress tracking
- `PROJECT_STRUCTURE.md` - Complete file map and status

### **Core Application Files**
- `src/App.tsx` - Main application with routing and onboarding integration
- `src/components/Workflow/GutachtenWorkflowComponent.tsx` - Main unified workflow
- `src/components/Onboarding/FirstLaunchOnboarding.tsx` - First-launch example collection
- `src/components/Layout/` - Header, Sidebar, Layout components

### **Backend Commands (Rust)**
- `src-tauri/src/commands/audio_commands.rs` - Audio save/process commands
- `src-tauri/src/commands/llama_commands.rs` - Qwen structuring + Llama chat commands
- `src-tauri/src/commands/template_commands.rs` - Template extraction and DOCX rendering
- `src-tauri/src/commands/style_profile_commands.rs` - StyleProfile management
- `src-tauri/src/commands/docx_commands.rs` - DOCX analysis commands

### **Python Scripts**
- `whisper_transcribe_tauri.py` - Whisper transcription script
- `qwen_structurer.py` - Qwen structuring (assigns content to template slots)
- `llama_worker.py` - Llama worker for chat-based text revision
- `template_extractor.py` - Extracts template from example Gutachten
- `docx_renderer.py` - Renders DOCX from template + structured content
- `style_profile_analyzer.py` - StyleProfile extraction from example documents

### **Python Virtual Environments**
- `whisper_venv/` - Whisper transcription (Python 3.13)
- `llama_venv_gpu/` - Qwen/Llama inference (llama-cpp-python)

### **Models Directory**
- `models/qwen2.5-7b-instruct-q4_k_m.gguf` - Qwen for structuring (~4.4GB)
- `models/llama-3.2-3b-instruct-q4_k_m.gguf` - Llama for chat (~2GB)

---

## 🔧 **DEVELOPMENT COMMANDS**

### **Build Desktop Application**
```bash
npm run tauri:build

# Output locations:
# - src-tauri/target/release/gutachten-assistant.exe (direct)
# - src-tauri/target/release/bundle/nsis/Gutachten Assistant_2.0.0_x64-setup.exe (installer)
```

### **Development Mode**
```bash
npm run tauri:dev
```

### **Test Python Scripts Directly**
```bash
# Test Qwen structuring
llama_venv_gpu\Scripts\python.exe qwen_structurer.py

# Test template extraction
llama_venv_gpu\Scripts\python.exe template_extractor.py <input_folder> <output_folder>

# Test DOCX rendering
llama_venv_gpu\Scripts\python.exe docx_renderer.py --test

# Test Whisper transcription
whisper_venv\Scripts\python.exe whisper_transcribe_tauri.py audio.wav
```

---

## ⚠️ **CRITICAL LESSONS LEARNED**

### **LLM Role Separation**
**Problem:** When asked to both correct AND format, LLM switches from "copy editor" mode to "author" mode and invents content.

**Solution:** Qwen's role is strictly defined:
1. Qwen assigns content to predefined template slots
2. It does NOT generate new content or restructure
3. Unclear parts are marked with `{unclear:...}` for human review
4. DOCX rendering is fully deterministic (no LLM involvement)

### **Template-First Approach**
The template system ensures consistency:
- Template is extracted once from user's examples
- Every new dictation follows the same structure
- LLM cannot deviate from the learned template

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

## 🎯 **CURRENT STATUS SUMMARY**

| Component | Status | Notes |
|-----------|--------|-------|
| Audio Recording | ✅ Complete | Live mic + file upload |
| Whisper Transcription | ✅ Complete | German medical optimized |
| Dictation Commands | ✅ Complete | Regex-based, deterministic |
| Template Extraction | ✅ Complete | template_extractor.py |
| Qwen Structuring | ✅ Complete | qwen_structurer.py |
| DOCX Rendering | ✅ Complete | docx_renderer.py |
| Chat Revision | ✅ Complete | Llama 3.2 3B for text edits |
| First-Launch Onboarding | ✅ Complete | Example collection |
| Onboarding + Template | 📋 In Progress | Integrate template extraction |
| OCR | 📋 Planned | Tesseract integration |
| Medical NER | 📋 Planned | spaCy + GERNERMED++ |

**Overall Progress:** ~90% complete for core dictation workflow

---

**This context provides Claude Coding with complete understanding of project state, the new guardrails architecture, and immediate next steps.**
