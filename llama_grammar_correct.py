"""
Llama 3.1 8B Grammar Correction Script for Gutachten Assistant
Component 2.2C: German medical text grammar correction with personal style preservation

This script:
1. Takes text input (either raw text or a full prompt)
2. Uses Llama 3.1 8B to correct/format German text
3. Returns JSON with corrected text

Usage:
    python llama_grammar_correct.py <text_file> [output_format]
"""

import sys
import json
import os
import re
from datetime import datetime


def load_llama_model():
    """
    Load Llama 3.1 8B model for German grammar correction
    """
    try:
        from llama_cpp import Llama

        model_path = os.path.join(
            os.path.dirname(__file__),
            "models",
            "llama-3.1-8b-instruct-q4_k_m.gguf"
        )

        print(f"Loading Llama 3.1 8B model from: {model_path}", file=sys.stderr)

        if not os.path.exists(model_path):
            print(f"Model not found at {model_path}", file=sys.stderr)
            return None

        llm = Llama(
            model_path=model_path,
            n_ctx=8192,        # Increased context window for longer texts
            n_threads=4,
            n_gpu_layers=33,   # GPU acceleration (8B model has 32 layers + embedding)
            verbose=False
        )

        print("Llama 3.1 8B model loaded successfully!", file=sys.stderr)
        return llm

    except ImportError:
        print("ERROR: llama-cpp-python not installed", file=sys.stderr)
        return None
    except Exception as e:
        print(f"ERROR loading Llama model: {e}", file=sys.stderr)
        return None


def load_text_file(file_path):
    """Load text content from file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        print(f"ERROR reading text file: {e}", file=sys.stderr)
        return None


def is_formatting_prompt(text):
    """
    Check if the input text is a formatting prompt (contains instructions)
    vs raw dictation text that needs grammar correction
    """
    prompt_indicators = [
        "You are a medical typist",
        "Your task is to transform",
        "Output format:",
        "Input text:",
        "IMPORTANT:",
        "medical documents for the Deutsche Rentenversicherung"
    ]

    for indicator in prompt_indicators:
        if indicator in text:
            return True
    return False


def process_with_formatting_prompt(llm, full_prompt):
    """
    Process text with the full formatting prompt already included.
    The input IS the complete prompt to send to Llama.
    """
    print("Processing with custom formatting prompt...", file=sys.stderr)
    start_time = datetime.now()

    try:
        # Use the full prompt directly - it already contains all instructions
        response = llm.create_chat_completion(
            messages=[
                {"role": "user", "content": full_prompt}
            ],
            max_tokens=4096,  # Increased for longer formatted output
            temperature=0.3,  # Slightly higher for more natural text
            top_p=0.95
        )

        processing_time = (datetime.now() - start_time).total_seconds() * 1000

        # Get the response text
        generated_text = response['choices'][0]['message']['content'].strip()

        print(f"Generated {len(generated_text)} characters in {processing_time:.0f}ms", file=sys.stderr)

        return {
            "corrected_text": generated_text,
            "corrections": [],
            "summary": "Text formatiert nach Gutachten-Stil",
            "confidence": 0.95,
            "processing_time_ms": int(processing_time)
        }

    except Exception as e:
        print(f"ERROR during Llama generation: {e}", file=sys.stderr)
        # Extract just the input text (after "Input text:") for fallback
        fallback_text = full_prompt
        if "Input text:" in full_prompt:
            fallback_text = full_prompt.split("Input text:")[-1].strip()

        return {
            "error": str(e),
            "corrected_text": fallback_text,
            "corrections": [],
            "summary": f"Fehler: {e}",
            "confidence": 0.0,
            "processing_time_ms": 0
        }


def process_grammar_correction(llm, text):
    """
    Process raw text for simple grammar correction (original behavior)
    """
    print("Processing grammar correction...", file=sys.stderr)

    if llm is None:
        return {
            "corrected_text": text,
            "corrections": [],
            "summary": "Keine Korrektur (Model nicht geladen)",
            "confidence": 0.0,
            "processing_time_ms": 0
        }

    system_prompt = """Du bist ein Grammatikkorrektur-Tool für deutsche medizinische Texte.

REGELN:
1. Korrigiere Rechtschreibfehler und grammatikalische Fehler
2. Behalte medizinische Fachbegriffe unverändert
3. Behalte die Satzstruktur bei

Gib NUR den korrigierten Text aus, ohne JSON oder Erklärungen."""

    start_time = datetime.now()

    try:
        response = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Korrigiere diesen Text:\n{text}"}
            ],
            max_tokens=2048,
            temperature=0.1,
            top_p=0.95
        )

        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        generated_text = response['choices'][0]['message']['content'].strip()

        return {
            "corrected_text": generated_text,
            "corrections": [],
            "summary": "Grammatikkorrektur abgeschlossen",
            "confidence": 0.95,
            "processing_time_ms": int(processing_time)
        }

    except Exception as e:
        print(f"ERROR during grammar correction: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "corrected_text": text,
            "corrections": [],
            "summary": f"Fehler: {e}",
            "confidence": 0.0,
            "processing_time_ms": 0
        }


def main():
    """Main entry point"""

    if len(sys.argv) < 2:
        print("Usage: python llama_grammar_correct.py <text_file> [output_format]", file=sys.stderr)
        sys.exit(1)

    text_file = sys.argv[1]
    output_format = sys.argv[2] if len(sys.argv) > 2 else "json"

    # Load input text
    text = load_text_file(text_file)
    if text is None:
        result = {
            "error": f"Could not read text file: {text_file}",
            "corrected_text": "",
            "corrections": [],
            "summary": "Fehler beim Laden der Textdatei"
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(1)

    print(f"Input text loaded: {len(text)} characters", file=sys.stderr)

    # Load Llama model
    print("Loading Llama 3.1 8B model...", file=sys.stderr)
    llm = load_llama_model()

    # Check if this is a formatting prompt or raw text
    if is_formatting_prompt(text):
        # Full prompt with instructions - pass through directly
        result = process_with_formatting_prompt(llm, text)
    else:
        # Raw text - apply simple grammar correction
        result = process_grammar_correction(llm, text)

    # Output results
    if output_format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result.get("corrected_text", text))

    sys.exit(0 if "error" not in result else 1)


if __name__ == "__main__":
    main()
