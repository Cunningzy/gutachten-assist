@echo off
call whisper_venv\Scripts\activate.bat
python -c "
import whisper
import whisper.audio

def patched_load_audio(file: str, sr: int = 16000):
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ffmpeg_path = 'ffmpeg'
    cmd = [ffmpeg_path, '-nostdin', '-threads', '0', '-i', file, '-f', 's16le', '-ac', '1', '-acodec', 'pcm_s16le', '-ar', str(sr), '-']
    try:
        import subprocess
        out = subprocess.run(cmd, capture_output=True, check=True).stdout
    except Exception as e:
        raise RuntimeError(f'Audio processing failed: {e}')
    import numpy as np
    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0

whisper.audio.load_audio = patched_load_audio

print('Loading large model...')
large_model = whisper.load_model('large-v3')
print('Running transcription...')
large_result = large_model.transcribe('audio.mp3', fp16=False)
print(large_result['text'])
"