# Testing Component 2.2C: Llama 3.1 8B Grammar Correction

## Overview
This guide explains how to test the grammar correction functionality step-by-step.

---

## 📋 Test Levels

### **Level 1: Python Scripts (No Desktop App Required)**
Test the Python scripts independently before integration.

### **Level 2: Desktop App - Document Upload & Analysis**
Test existing Component 2.2A/2.2B functionality.

### **Level 3: Full Integration** (After Rust backend is complete)
Test the complete workflow in the desktop app.

---

## 🧪 Level 1: Testing Python Scripts

### Option A: Quick Mock Test (No Model Download)

**Purpose:** Verify script logic without downloading 4.5GB model

**Steps:**
```bash
# Run the mock test
python test_grammar_mock.py
```

**Expected Output:**
- ✅ Script found
- ✅ JSON parsing successful
- ✅ All required fields present
- Mock correction result displayed

**Time:** ~10 seconds

---

### Option B: Full Test (With Model Download)

**Purpose:** Test real Llama 3.1 8B grammar correction

**Steps:**

#### Step 1: Run automated test script
```bash
# Windows
test_llama_setup.bat

# This script will:
# 1. Create Python virtual environment
# 2. Install llama-cpp-python (with GPU support)
# 3. Check for model (prompt to download if missing)
# 4. Create test file
# 5. Run grammar correction
```

#### Step 2: Manual testing (alternative)

```bash
# 1. Create virtual environment
python -m venv llama_venv
llama_venv\Scripts\activate

# 2. Install dependencies
pip install llama-cpp-python

# For GPU support (NVIDIA):
pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121

# 3. Download model
python setup_llama.py

# 4. Create test file
echo "Der Patient zeigt deutliche Symptome einer Grippe. Die Untersuchung ergab das er Fieber hat." > test.txt

# 5. Test grammar correction
python llama_grammar_correct.py test.txt

# 6. Test with style template (optional)
python llama_grammar_correct.py test.txt user-data/templates/my_template.json
```

**Expected Output:**
```json
{
  "corrected_text": "Der Patient zeigt deutliche Symptome einer Grippe. Die Untersuchung ergab, dass er Fieber hat.",
  "corrections": [
    {
      "original": "das er",
      "corrected": "dass er",
      "explanation": "Konjunktion 'dass' mit doppeltem 's' nach Komma"
    }
  ],
  "summary": "1 grammatikalischer Fehler korrigiert",
  "confidence": 0.95,
  "processing_time_ms": 2341
}
```

**Time:**
- Model download: ~15-30 minutes (one-time, 4.5GB)
- First correction: ~10-20 seconds (model loading)
- Subsequent corrections: ~2-5 seconds (GPU) or ~10-30 seconds (CPU)

---

## 🖥️ Level 2: Testing Existing Desktop App Features

**Purpose:** Verify Component 2.2A/2.2B (Document Upload & Style Analysis) works

**Steps:**

### 1. Build the Desktop App
```bash
npm run tauri:build
```

### 2. Launch the App
```bash
# Navigate to the built .exe
src-tauri\target\release\gutachten-assistant.exe
```

### 3. Test Document Upload (Component 2.2A)
1. Navigate to **Stil-Training** in sidebar
2. Drag & drop a .docx file or click to select
3. Verify upload starts

**Expected:**
- ✅ File upload progress shown
- ✅ Document appears in upload list

### 4. Test Style Analysis (Component 2.2B)
1. Wait for analysis to complete
2. Check analyzed style features

**Expected:**
- ✅ Font family detected (e.g., "Times New Roman")
- ✅ Font size shown (e.g., "12pt")
- ✅ Line spacing displayed
- ✅ Heading styles detected
- ✅ Header/Footer info shown (if present)

**Example Output:**
```
Erkannte Stilmerkmale:
Schrift: Times New Roman (12pt)
Zeilenabstand: 1.15
Kopfzeile: Arial (10pt)
3 Überschriftenebenen erkannt
```

### 5. Save Style Template
1. Click "Stil-Training abschließen"
2. Verify template saved

**Expected:**
- ✅ Success message shown
- ✅ Template file created in `user-data/templates/`

---

## 🔬 Level 3: Full Integration Testing

**Status:** ⚠️ **NOT READY YET** - Requires Rust backend completion

**After we complete:**
- Rust `llama_service.rs` update (Python subprocess integration)
- TypeScript `grammarService.ts`
- UI `GrammarCorrectionComponent.tsx`

**Then you can test:**
1. Upload document → Analyze style → Load template
2. Record audio → Transcribe → Correct grammar (using learned style)
3. Review corrections → Accept/Reject → Generate final DOCX

---

## 📊 Test Results Checklist

### Python Scripts
- [ ] `test_grammar_mock.py` passes
- [ ] `setup_llama.py` downloads model successfully
- [ ] `llama_grammar_correct.py` corrects test text
- [ ] GPU acceleration working (check processing time)
- [ ] JSON output format correct

### Desktop App (Existing Features)
- [ ] Document upload works
- [ ] Style analysis extracts font correctly
- [ ] Heading styles detected
- [ ] Header/Footer detected (if present)
- [ ] Template saved to `user-data/templates/`

### Full Integration (After completion)
- [ ] Grammar correction called from UI
- [ ] Style template applied
- [ ] Corrections displayed
- [ ] Accept/reject functionality
- [ ] Final DOCX generation

---

## 🐛 Troubleshooting

### "llama-cpp-python not installed"
```bash
pip install llama-cpp-python
```

### "GPU not detected" (NVIDIA)
```bash
# Install with CUDA support
pip uninstall llama-cpp-python
pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121
```

### "Model download failed"
**Manual download:**
1. Visit: https://huggingface.co/TheBloke/Llama-3.1-8B-Instruct-GGUF
2. Download: `llama-3.1-8b-instruct-q4_k_m.gguf`
3. Place in: `models/` directory

### "Processing too slow"
- Check if GPU is being used (look for "GPU layers" in stderr)
- Ensure CUDA/ROCm drivers installed
- Try smaller model (Q4_0 instead of Q4_K_M)

---

## ✅ What Can You Test RIGHT NOW?

1. **✅ Mock test (instant):**
   ```bash
   python test_grammar_mock.py
   ```

2. **✅ Full Python test (after model download):**
   ```bash
   test_llama_setup.bat
   ```

3. **✅ Existing desktop app features:**
   ```bash
   npm run tauri:build
   src-tauri\target\release\gutachten-assistant.exe
   ```
   Then test document upload and style analysis.

---

## 📝 Next Steps After Testing

If all tests pass:
1. ✅ Python scripts working → Continue with Rust backend integration
2. ✅ Desktop app working → Continue with grammar UI component
3. ✅ Model downloaded → Ready for real inference testing

If tests fail:
1. Check error messages
2. Verify Python dependencies
3. Check model file integrity
4. Review troubleshooting section
