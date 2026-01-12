#!/usr/bin/env python3
"""
Whisper Transcription Script for Tauri Integration
Based on your working whisper_transcribe.py solution
"""

import sys
import os
import json
import whisper
from pathlib import Path

def transcribe_audio(audio_file_path, output_format='json'):
    """
    Transcribe audio file using Whisper Large model

    Args:
        audio_file_path (str): Path to the audio file (FLAC, MP3, WAV, etc.)
        output_format (str): 'text' for plain text, 'json' for detailed result

    Returns:
        dict: Transcription result with text and metadata
    """

    try:
        print(f"🎯 Loading Whisper Large model...", file=sys.stderr)

        # Load the large Whisper model (same as your working script)
        model = whisper.load_model("large")

        print(f"🎤 Transcribing audio file: {audio_file_path}", file=sys.stderr)

        # Check if file exists
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        # Transcribe with German language (same as your working script)
        result = model.transcribe(audio_file_path, language="de")

        # Extract the transcription text
        text = result["text"].strip()

        print(f"✅ Transcription completed. Length: {len(text)} characters", file=sys.stderr)

        if output_format == 'json':
            # Return detailed result for UI
            return {
                "text": text,
                "language": result.get("language", "de"),
                "segments": [
                    {
                        "start_time": seg.get("start", 0.0),
                        "end_time": seg.get("end", 0.0),
                        "text": seg.get("text", "").strip(),
                        "confidence": 1.0 - seg.get("no_speech_prob", 0.1)  # Convert no_speech_prob to confidence
                    }
                    for seg in result.get("segments", [])
                ],
                "processing_time_ms": 1000,  # Whisper doesn't provide this, approximate
                "confidence": 0.95  # Whisper doesn't provide overall confidence
            }
        else:
            # Return just the text (for compatibility)
            return {"text": text}

    except Exception as e:
        print(f"❌ Transcription failed: {str(e)}", file=sys.stderr)
        return {
            "error": str(e),
            "text": ""
        }

def main():
    """
    Main function for command line usage
    Expected arguments: python whisper_transcribe.py <audio_file_path> [output_format]
    """

    if len(sys.argv) < 2:
        print("Usage: python whisper_transcribe.py <audio_file_path> [output_format]")
        print("Example: python whisper_transcribe.py C:/Users/kalin/Documents/Dict/audio.flac json")
        sys.exit(1)

    audio_file_path = sys.argv[1]
    output_format = sys.argv[2] if len(sys.argv) > 2 else 'json'

    # Perform transcription
    result = transcribe_audio(audio_file_path, output_format)

    # Output result as JSON for Tauri to parse
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()