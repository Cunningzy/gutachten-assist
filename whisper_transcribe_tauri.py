#!/usr/bin/env python3
"""
Whisper Transcription Script for Tauri Backend
Compatible with audio_commands.rs expectations
"""

import sys
import json
import whisper
import whisper.audio
import time
import os
from pathlib import Path

# Patch Whisper's load_audio function to use our ffmpeg
def patched_load_audio(file: str, sr: int = 16000):
    """
    Load audio with explicit ffmpeg path
    """
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ffmpeg_path = "ffmpeg"  # fallback

    # Create the command with explicit ffmpeg path
    cmd = [
        ffmpeg_path,
        "-nostdin",
        "-threads", "0",
        "-i", file,
        "-f", "s16le",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-ar", str(sr),
        "-"
    ]

    try:
        import subprocess
        out = subprocess.run(cmd, capture_output=True, check=True).stdout
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to load audio: {e}")
    except FileNotFoundError as e:
        raise RuntimeError(f"FFmpeg not found at {ffmpeg_path}")

    import numpy as np
    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0

# Monkey patch Whisper's load_audio function
whisper.audio.load_audio = patched_load_audio

# Set up ffmpeg path for Whisper
try:
    import imageio_ffmpeg
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"FFmpeg configured: {ffmpeg_path}", file=sys.stderr)
except ImportError:
    print("Warning: imageio-ffmpeg not available, ffmpeg must be in PATH", file=sys.stderr)

def transcribe_audio(audio_path, output_format="json"):
    """
    Transcribe audio file using Whisper model

    Args:
        audio_path (str): Path to the audio file
        output_format (str): Output format - "json" or "text"

    Returns:
        JSON string with transcription results or error
    """
    try:
        print(f"Loading Whisper model...", file=sys.stderr)

        # Load Whisper model - using 'base' for fast transcription
        # Options: tiny, base, small, medium, large
        # Base model: Good accuracy, ~10x faster than large
        model = whisper.load_model("base")

        print(f"Transcribing audio file: {audio_path}", file=sys.stderr)

        # Check if file exists
        audio_file = Path(audio_path)
        if not audio_file.exists():
            error_result = {
                "error": f"Audio file not found: {audio_path}"
            }
            return json.dumps(error_result)

        # Start transcription timer
        start_time = time.time()

        # Transcribe audio with German language setting
        # Fix dtype compatibility issue
        import torch
        with torch.no_grad():
            result = model.transcribe(str(audio_file), language="de", fp16=False)

        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)

        # Extract segments with timing information
        segments = []
        if "segments" in result:
            for segment in result["segments"]:
                segments.append({
                    "start_time": float(segment.get("start", 0.0)),
                    "end_time": float(segment.get("end", 0.0)),
                    "text": str(segment.get("text", "")).strip(),
                    "confidence": float(segment.get("prob", 0.0))  # Whisper uses 'prob' for confidence
                })

        # Prepare JSON response format expected by Tauri
        transcription_result = {
            "text": str(result["text"]).strip(),
            "confidence": 0.95,  # Whisper doesn't provide overall confidence, use default
            "processing_time_ms": processing_time_ms,
            "language": result.get("language", "de"),
            "segments": segments
        }

        print(f"Transcription completed successfully in {processing_time_ms}ms", file=sys.stderr)

        if output_format.lower() == "json":
            return json.dumps(transcription_result, ensure_ascii=False, indent=2)
        else:
            return result["text"]

    except Exception as e:
        print(f"Transcription error: {str(e)}", file=sys.stderr)
        error_result = {
            "error": f"Transcription failed: {str(e)}"
        }
        return json.dumps(error_result)

def main():
    """
    Main function for command line execution
    Expected usage: python whisper_transcribe_tauri.py <audio_file_path> [output_format]
    """
    if len(sys.argv) < 2:
        error_result = {
            "error": "Usage: python whisper_transcribe_tauri.py <audio_file_path> [output_format]"
        }
        print(json.dumps(error_result))
        sys.exit(1)

    audio_path = sys.argv[1]
    output_format = sys.argv[2] if len(sys.argv) > 2 else "json"

    # Perform transcription
    result = transcribe_audio(audio_path, output_format)

    # Output result to stdout (Tauri reads this) with proper encoding
    sys.stdout.reconfigure(encoding='utf-8')
    print(result)

if __name__ == "__main__":
    main()
