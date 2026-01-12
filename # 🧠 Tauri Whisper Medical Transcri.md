# 🧠 Tauri Whisper Medical Transcriber

## 1. Overview
This application is a **cross-platform desktop app** for **medical professionals** to dictate and automatically transcribe medical documentation.  
It uses **OpenAI Whisper** for speech-to-text transcription, running **entirely locally** for GDPR-safe medical use.  
Built with **Tauri** (Rust backend + web frontend) for secure, efficient distribution.

---

## 2. System Architecture

Microphone
↓
Frontend (React/Svelte/Vue + WebAudio)
↓ [MediaRecorder API]
Audio Blob → Save via Tauri invoke
↓
Rust backend writes audio file to disk
↓
Python subprocess runs Whisper (speech → text)
↓
Result text returned to frontend for display & Export


Optional modules:
- **ffmpeg** → convert audio to 16 kHz WAV
- **spaCy / regex / GPT-4-mini** → structure the medical text
- **python-docx / reportlab** → export Arztbrief as DOCX/PDF

---

## 3. Components

| Layer | Tech | Purpose |
|-------|------|----------|
| Frontend | React/Svelte + Tailwind + Tauri API | UI, microphone control, export |
| Backend | Rust (Tauri commands) | File I/O, IPC bridge, security |
| AI Engine | Python + Whisper | Offline transcription |
| Audio tools | FFmpeg, pydub | Format conversion |
| Output | python-docx, reportlab | DOCX/PDF reports |
| Packaging | Tauri builder | Cross-platform installer |
| Local DB (optional) | SQLite / encrypted JSON | Store patient metadata |

---

## 4. Whisper Setup

**Install:**
```bash
pip install openai-whisper
sudo apt install ffmpeg

Usage:

import whisper
model = whisper.load_model("base")
print(model.transcribe("out.wav", language="de")["text"])

License: MIT → ✅ commercial use allowed
Keep attribution: “Uses Whisper (MIT License) by OpenAI”

5. Audio Recording
Frontend (JavaScript)

let mediaRecorder;
let recordedChunks = [];

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    await window.__TAURI__.invoke("save_audio", { bytes });
  };

  mediaRecorder.start();
}

function stopRecording() { mediaRecorder.stop(); }

Backend (Rust)

#[tauri::command]
fn save_audio(bytes: Vec<u8>) -> Result<String, String> {
    use std::fs;
    let path = "C:\\temp\\recorded.webm"; // adjust path
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string())
}

Python Transcription Script

import sys, subprocess, whisper
infile = sys.argv[1]
outfile = "temp.wav"
subprocess.run(["ffmpeg", "-i", infile, "-ac", "1", "-ar", "16000", outfile])
model = whisper.load_model("base")
print(model.transcribe(outfile, language="de")["text"])

Rust → Python Bridge

#[tauri::command]
fn transcribe_audio(file_path: String) -> Result<String, String> {
    let output = std::process::Command::new("python")
        .arg("whisper_runner.py")
        .arg(&file_path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

Frontend call:

import { invoke } from "@tauri-apps/api/tauri";
const text = await invoke("transcribe_audio", { filePath });

6. Format Conversion

Whisper prefers 16 kHz mono WAV:

ffmpeg -i recorded.webm -ac 1 -ar 16000 out.wav

7. Common Issues
Symptom	Fix
navigator.mediaDevices undefined	Enable audio permissions in tauri.conf.json
No mic prompt	Add "allowlist.media": true
0-byte file	Ensure .stop() fires after recording
Whisper error	Convert audio to WAV before transcribing
8. Legal & Privacy

MIT license allows commercial redistribution.

Must display attribution (“Powered by Whisper – MIT License”).

For GDPR / §203 StGB compliance:

Process all audio/text locally (no cloud)

Encrypt local DB/files (e.g., sqlcipher)

No telemetry by default

Provide privacy policy (Art. 30 DSGVO)

9. Packaging & Distribution

Build:

pnpm tauri build

Outputs:

.msi (Windows)

.dmg (macOS)

.AppImage / .deb (Linux)

Commercialization options:

Local licenses for clinics/doctors

Subscription SaaS (with explicit consent for uploads)

Private deployment inside medical networks

10. Example Production Flow

1️⃣ Doctor records dictation → microphone
2️⃣ Frontend saves audio (WebM)
3️⃣ Backend converts → WAV
4️⃣ Whisper transcribes → text
5️⃣ Formatter structures → Arztbrief
6️⃣ Export → DOCX / PDF

11. Optional Enhancements

Local LLM for formatting (llama.cpp, gpt4all)

Noise reduction (ffmpeg -af arnndn=model.rnnn)

Template system for SOAP / Befund

Global hotkey recording (tauri-plugin-global-shortcut)

Word automation (pywin32)

12. Summary

✅ Fully local & GDPR-safe
✅ Commercially licensable (MIT)
✅ Built with Tauri (Rust) + Whisper (Python)
✅ Target users: doctors, neurologists, clinics
✅ Output: clean, editable medical documentation

End of file