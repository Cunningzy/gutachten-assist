# claude.md - Gutachten Assistant Project Context

**For Claude Coding Continuation - AI-Powered Medical Documentation Assistant**
**Last Updated:** January 25, 2026

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

## 🏗️ **TECHNICAL ARCHITECTURE** *(Updated January 25, 2026)*

### **COMPLETE AUDIO-TO-TEXT PIPELINE WITH GUARDRAILS**
```
🎤 Microphone / 📁 Audio File Upload
    ↓
Frontend (React + MediaRecorder / File Input)
    ↓
Tauri Commands (Rust Backend)
    ↓
Python Subprocess → Whisper Large-v3 → German Transcription
    ↓
TWO-STEP PIPELINE WITH GUARDRAILS:
  Step 1: Regex Cleanup (deterministic)
    - Convert "Punkt" → "."
    - Convert "Komma" → ","
    - etc.
  Step 2: Copy-Editor LLM (minimal changes only)
    - Fix spelling errors
    - Fix grammar errors
    - Fix punctuation
    - NO rewriting, NO new sentences
  Step 3: Guardrails Check
    - Length ratio (0.5x - 1.5x)
    - Banned phrases detection
    - Similarity check (>60%)
    - Sentence count check (+3 max)
    - New words check (<10 significant)
    ↓
Final Corrected German Medical Text
    ↓
(Future) DOCX Template Insertion (deterministic, NOT LLM)
```

### **KEY ARCHITECTURAL PRINCIPLE (January 2026)**
**LLM = Copy-Editor ONLY. Template insertion = App Code (deterministic).**

The LLM was previously hallucinating and rewriting text when asked to both correct AND format. The solution is strict separation:
- **LLM does:** Spelling, grammar, punctuation fixes (minimal changes)
- **App code does:** Template insertion, heading placement, DOCX generation

### **DESKTOP APPLICATION Stack**
- **Desktop Framework:** Tauri 2.0 + React + TypeScript + Rust Backend
- **Audio Pipeline:** MediaRecorder API → Tauri save_audio command → FFmpeg → Whisper
- **Build System:** Tauri Build + Vite + Tailwind CSS
- **Language:** German DESKTOP UI throughout
- **AI Components (Free/Open Source Only):**
  - OpenAI Whisper Large-v3 (German speech recognition via Python subprocess)
  - FFmpeg (professional audio conversion to 16kHz WAV)
  - Llama 3.1 8B (German grammar correction - copy-editor mode only)
  - spaCy + GERNERMED++ (German medical NER - planned)

### **Current DESKTOP APPLICATION Status**
```
✅ COMPLETE: Tauri 2.0 + React + TypeScript DESKTOP foundation
✅ COMPLETE: Clean audio pipeline - MediaRecorder → Tauri → Python Whisper
✅ COMPLETE: Component 2.1A - Professional audio recording interface
✅ COMPLETE: Component 2.1B - Python Whisper virtual environment integration
✅ COMPLETE: Component 2.2A - Document upload UI for style learning
✅ COMPLETE: Component 2.2B - Document analysis engine with DOCX parsing
✅ COMPLETE: Component 2.2C - Two-step pipeline with guardrails (NEW)
✅ COMPLETE: Component 2.3 - Full workflow integration
✅ COMPLETE: First-launch onboarding for example Gutachten collection
✅ COMPLETE: Audio file upload option (WAV, MP3, WebM, M4A, OGG, FLAC)
✅ COMPLETE: StyleProfile system for learning user's formatting style
✅ COMPLETE: Guardrails to prevent LLM hallucination (NEW)
📋 PLANNED: OCR (Tesseract), Medical NER (spaCy + GERNERMED++)
📋 PLANNED: Deterministic template insertion in DOCX generation
```

---

## 🚧 **CURRENT DEVELOPMENT STATE (January 25, 2026)**

### **Latest Session: Two-Step Pipeline with Guardrails**

**Problem Solved:** LLM was either doing nothing OR completely rewriting the text (hallucinating a new Gutachten instead of just correcting).

**Solution Implemented:**
1. **Strict role separation** - LLM is copy-editor only, not a template filler
2. **Two-step pipeline** - Regex cleanup first, then minimal LLM correction
3. **Guardrails** - Automatic checks to reject hallucinated outputs

### **Guardrails System (llama_grammar_correct.py)**

| Check | Threshold | Purpose |
|-------|-----------|---------|
| Length ratio | 0.5x - 1.5x | Reject if output too short/long |
| Banned phrases | Not in input | Block "Zusammenfassend", "Beurteilung", etc. |
| Similarity | >60% | Reject if too different from original |
| Sentence count | +3 max | Block if too many new sentences added |
| New words | <10 significant | Block if inventing new content |

**Retry Logic:** If guardrails fail, retry with lower temperature. If still fails, return best attempt or original text.

### **LLM System Prompt (Copy-Editor Mode)**

```
Du bist ein Korrekturleser für deutsche medizinische Texte.

AUFTRAG:
Schreibe den Text mit MINIMALEN Änderungen um:
- Korrigiere Rechtschreibung, Grammatik, Zeichensetzung.
- Normalisiere offensichtliche Tippfehler und Abstände.
- Behalte die ursprüngliche Bedeutung, Fakten, Reihenfolge und Absatzstruktur.

ABSOLUTE REGELN (STRENG):
1) Füge KEINE neuen medizinischen Fakten, Diagnosen, Befunde hinzu.
2) Erfinde KEINE Sätze, Zusammenfassungen, Beurteilungen.
3) Ändere NICHT die Struktur: Absatzzahl und Reihenfolge müssen gleich bleiben.
4) Schreibe NICHT stilistisch um.
5) Du darfst durchschnittlich nur 1-3 Wörter pro Satz ändern.

VERBOTENE WÖRTER (nur erlaubt wenn bereits im Input):
- "Zusammenfassend", "Beurteilung", "Empfehlung", "Diagnose:", "Fazit"
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
- `src-tauri/src/commands/llama_commands.rs` - Grammar correction command
- `src-tauri/src/commands/style_profile_commands.rs` - StyleProfile management
- `src-tauri/src/commands/docx_commands.rs` - DOCX analysis commands

### **Python Scripts**
- `whisper_transcribe_tauri.py` - Whisper transcription script
- `llama_grammar_correct.py` - Two-step pipeline with guardrails (UPDATED)
- `style_profile_analyzer.py` - StyleProfile extraction from example documents

### **Python Virtual Environments**
- `whisper_venv/` - Whisper transcription (Python 3.13)
- `llama_venv_gpu/` - Llama grammar correction (llama-cpp-python)

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
# Test grammar correction
llama_venv_gpu\Scripts\python.exe llama_grammar_correct.py test_input.txt

# Test Whisper transcription
whisper_venv\Scripts\python.exe whisper_transcribe_tauri.py audio.wav
```

---

## ⚠️ **CRITICAL LESSONS LEARNED**

### **LLM Hallucination Prevention**
**Problem:** When asked to both correct AND format, LLM switches from "copy editor" mode to "author" mode and invents content.

**Solution:**
1. LLM does ONLY copy-editing (spelling, grammar, punctuation)
2. Template insertion happens in app code (deterministic)
3. Guardrails check output similarity, length, banned phrases
4. Retries with lower temperature if guardrails fail

### **Guardrails Are Essential**
Without guardrails, the LLM will:
- Add "Zusammenfassend..." summaries that don't exist
- Invent medical findings
- Restructure the entire text
- Create a "proper" Gutachten from scratch

With guardrails, outputs are forced to be minimal corrections only.

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
| Grammar Correction | ✅ Complete | Two-step + guardrails |
| Guardrails | ✅ Complete | 5 checks + retry logic |
| StyleProfile | ✅ Complete | Section extraction only |
| First-Launch Onboarding | ✅ Complete | Example collection |
| DOCX Template Insertion | 📋 Planned | Deterministic, not LLM |
| OCR | 📋 Planned | Tesseract integration |
| Medical NER | 📋 Planned | spaCy + GERNERMED++ |

**Overall Progress:** ~85% complete for core dictation workflow

---

**This context provides Claude Coding with complete understanding of project state, the new guardrails architecture, and immediate next steps.**
