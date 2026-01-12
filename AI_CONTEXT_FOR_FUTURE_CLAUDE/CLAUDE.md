# claude.md - Gutachten Assistant Project Context

**For Claude Coding Continuation - AI-Powered Medical Documentation Assistant**

---

## 🎯 **PROJECT MISSION**

Developing a **DSGVO-compliant, offline-first AI-powered DESKTOP APPLICATION** that reduces administrative burden in creating medical expert reports (Gutachten) for German physicians.

### **Core Value Proposition**
- 60% time reduction in Gutachten creation (5+ hours → 2 hours)
- 100% offline processing for DSGVO compliance
- AI learns individual physician's formatting style
- End-to-end workflow: Document upload → AI processing → Final report

---

## 🏗️ **TECHNICAL ARCHITECTURE**

### **DESKTOP APPLICATION Stack**
- **Desktop Framework:** Tauri 2.0 + React + TypeScript + Rust Backend
- **Build System:** Tauri Build + Vite + Tailwind CSS
- **State Management:** Redux Toolkit
- **Language:** German DESKTOP UI throughout
- **AI Components (Free/Open Source Only):**
  - OpenAI Whisper Large-v3 (German speech recognition)
  - Tesseract 5.x + OpenCV (OCR processing)
  - spaCy + GERNERMED++ (German medical NER)

### **Current DESKTOP APPLICATION Status**
```
✅ COMPLETE: Tauri 2.0 + React + TypeScript DESKTOP foundation
✅ COMPLETE: Professional Diktiergerät interface with full controls
✅ COMPLETE: Real Whisper integration with German medical recognition
🔄 IN PROGRESS: AI grammar correction system for dictated text
📋 PLANNED: OCR, Medical NER, complete AI workflow
```

---

## 🚧 **CURRENT DEVELOPMENT STATE**

### **Component 2.1B: Whisper Integration - TESTING READY**

**Files Created:**
- `src/services/whisperService.ts` - Whisper service (testing stub)
- `src/components/Audio/WhisperTestComponent.tsx` - Test UI
- Updated `src/components/Layout/Sidebar.tsx` - Navigation link
- Updated `src/App.tsx` - Route configuration

**Current Status:** All files exist, imports resolve, ready for testing at `http://localhost:5173/#/test/whisper`

### **What Component 2.1B Currently Does:**
- System compatibility checks (5 green checkmarks)
- Audio recording integration (uses Component 2.1A)
- Whisper initialization simulation with progress bars
- German medical vocabulary preview
- Professional medical UI styling

### **What's Next:**
- Test Component 2.1B functionality
- Replace testing stub with real Whisper integration
- Begin Component 2.1C (real-time transcription UI)

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

### **3. Component 2.1C Development (UPCOMING)**
Create real-time transcription UI:
- Live transcription display
- Text editing and correction
- German medical terminology highlighting
- Voice command recognition interface

---

## 📁 **KEY PROJECT FILES**

### **Essential Documentation**
- `PROJECT_STANDARDS.md` - MANDATORY quality control standards
- `DEVELOPMENT.md` - Complete development workflow
- `CHANGELOG.md` - Version history and progress tracking
- `PROJECT_STRUCTURE.md` - Complete file map and status

### **Core Application Files**
- `src/App.tsx` - Main application with routing
- `src/components/Layout/` - Header, Sidebar, Layout components
- `src/services/audioService.ts` - Component 2.1A (production ready)
- `src/services/whisperService.ts` - Component 2.1B (testing stub)
- `src/components/Audio/AudioTestComponent.tsx` - Component 2.1A UI
- `src/components/Audio/WhisperTestComponent.tsx` - Component 2.1B UI

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