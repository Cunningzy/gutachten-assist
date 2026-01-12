
# Whisper Transcription System (Local Desktop Version)

This project enables local, offline transcription of German-language audio files using OpenAI Whisper, FFmpeg, and Python. It is built for integration into a Claude Code-based desktop app and tested on Windows 10/11.

---

## ✅ Technology Stack

### 🐍 Python
- **Version**: Python 3.10 or 3.11 (⚠️ NOT 3.13)
- **Virtual Environment**: `whisper-env`

### 📦 Python Packages (Installed via pip)
- `openai-whisper` (installed from GitHub)
- `torch`, `torchaudio`, `torchvision`
- `python-docx` (for exporting to Word)
- `ffmpeg-python` or `imageio[ffmpeg]` (for audio handling)

### ⚙️ System Dependencies
- **FFmpeg**: Installed manually from [BtbN builds](https://github.com/BtbN/FFmpeg-Builds/releases)
  - Added to PATH (e.g. `C:\ffmpeg\bin`)
- **Git**: Git for Windows, required for installing whisper from GitHub

---

## ✅ File Structure

### Main Script & Environment
```
C:\Users\kalin\
├── whisper_transcribe.py       # Main Python script
├── whisper-env\               # Python virtual environment (NOT for GitHub)
```

### Audio Input Files
```
C:\Users\kalin\Documents\Dict\
├── untitled.flac
├── another_file.flac
```

### Transcription Output
```
C:\Users\kalin\Documents\
├── Transcription.docx
```

---

## ✅ Setup Instructions

### 1. Create Virtual Environment
```bash
python -m venv whisper-env
whisper-env\Scripts\activate
```

### 2. Install Requirements
```bash
pip install --upgrade pip setuptools wheel
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install git+https://github.com/openai/whisper.git
pip install python-docx ffmpeg-python
```

### 3. Install FFmpeg Manually (if needed)
- Download zip from: https://github.com/BtbN/FFmpeg-Builds/releases
- Extract to: `C:\ffmpeg`
- Add `C:\ffmpeg\bin` to **System PATH**
- Restart your PC

---

## ✅ Usage

### Transcribe an Audio File via Python
```bash
python whisper_transcribe.py
```

### whisper_transcribe.py Overview
- Loads Whisper model (default: "base")
- Transcribes the file `untitled.flac` in German
- Saves the result as a `.docx` Word document

---

## ✅ Claude Code Integration

Claude Code can execute or invoke:
- `python whisper_transcribe.py`
- Read audio files from `Documents\Dict\`
- Access the transcription in `Documents\Transcription.docx`

The stack is fully offline-capable and deployable across Windows machines.

