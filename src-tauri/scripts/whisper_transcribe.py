import whisper
import json
import sys
import os

def transcribe_audio(audio_path):
    try:
        # Load Whisper model
        model = whisper.load_model("base")  # Using base model for faster processing

        # Transcribe the audio file
        result = model.transcribe(audio_path, language="de")

        # Extract segments with timestamps
        segments = []
        if "segments" in result:
            for segment in result["segments"]:
                segments.append({
                    "start_time": segment.get("start", 0.0),
                    "end_time": segment.get("end", 0.0),
                    "text": segment.get("text", "").strip(),
                    "confidence": 0.85  # Default confidence for successful transcription
                })

        # Return structured result
        transcription_result = {
            "text": result["text"].strip(),
            "confidence": 0.85,
            "language": result.get("language", "de"),
            "segments": segments
        }

        return transcription_result

    except Exception as e:
        raise Exception(f"Whisper transcription failed: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python whisper_transcribe.py <audio_file_path>"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    try:
        result = transcribe_audio(audio_path)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)