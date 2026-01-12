@echo off
REM Wrapper script to run Whisper transcription in virtual environment
call "%~dp0whisper_venv\Scripts\activate.bat"
python "%~dp0whisper_transcribe_tauri.py" %*