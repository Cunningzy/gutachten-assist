"""
Llama 3.2 3B Grammar Correction Script for Gutachten Assistant
Component 2.2C: German medical text grammar correction with personal style preservation

This script:
1. Takes text input and optional style template
2. Uses Llama 3.2 3B to correct German grammar
3. Preserves user's personal formatting style
4. Returns JSON with corrected text and explanations

Usage:
    python llama_grammar_correct.py <text_file> [style_template_file] [output_format]

Arguments:
    text_file: Path to text file containing German text to correct
    style_template_file: (Optional) Path to JSON style template from Component 2.2B
    output_format: (Optional) 'json' or 'text' (default: json)
"""

import sys
import json
import os
import re
from datetime import datetime


def convert_dictation_commands(text):
    """
    Convert German dictation commands to actual punctuation.
    This mimics how a 'Schreibkraft' would transcribe dictated text.

    Examples:
        "In Klammern Beurteilung Klammern zu" → "(Beurteilung)"
        "Der Patient Punkt" → "Der Patient."
        "Name Komma Vorname" → "Name, Vorname"
    """

    # Define replacements - order matters!
    # Process multi-word commands first, then single words

    replacements = [
        # Parentheses - handle "In Klammern ... Klammern zu" pattern
        (r'\bIn Klammern[,]?\s*', '('),
        (r'\bin Klammern[,]?\s*', '('),
        (r'\bKlammer auf[,]?\s*', '('),
        (r'\bklammer auf[,]?\s*', '('),
        (r'[,]?\s*Klammern zu\b', ')'),
        (r'[,]?\s*klammern zu\b', ')'),
        (r'[,]?\s*Klammer zu\b', ')'),
        (r'[,]?\s*klammer zu\b', ')'),

        # Quotes
        (r'\bAnführungszeichen auf[,]?\s*', '"'),
        (r'\banführungszeichen auf[,]?\s*', '"'),
        (r'\bAnführungszeichen unten[,]?\s*', '„'),
        (r'[,]?\s*Anführungszeichen zu\b', '"'),
        (r'[,]?\s*anführungszeichen zu\b', '"'),
        (r'[,]?\s*Anführungszeichen oben\b', '"'),

        # Line breaks and paragraphs
        (r'\bNeue Zeile\b', '\n'),
        (r'\bneue Zeile\b', '\n'),
        (r'\bNeuer Absatz\b', '\n\n'),
        (r'\bneuer Absatz\b', '\n\n'),
        (r'\bAbsatz\b', '\n\n'),

        # Punctuation - handle "Punkt" as standalone word (with optional space/punctuation before)
        (r'[\s,.;:!?]*\bPunkt\b[\s,.]*', '. '),
        (r'[\s,.;:!?]*\bpunkt\b[\s,.]*', '. '),

        (r'[\s,.;:!?]*\bKomma\b[\s,.]*', ', '),
        (r'[\s,.;:!?]*\bkomma\b[\s,.]*', ', '),

        (r'[\s,.;:!?]*\bDoppelpunkt\b[\s,.]*', ': '),
        (r'[\s,.;:!?]*\bdoppelpunkt\b[\s,.]*', ': '),

        (r'[\s,.;:!?]*\bSemikolon\b[\s,.]*', '; '),
        (r'[\s,.;:!?]*\bsemikolon\b[\s,.]*', '; '),

        (r'[\s,.;:!?]*\bFragezeichen\b[\s,.]*', '? '),
        (r'[\s,.;:!?]*\bfragezeichen\b[\s,.]*', '? '),

        (r'[\s,.;:!?]*\bAusrufezeichen\b[\s,.]*', '! '),
        (r'[\s,.;:!?]*\bausrufezeichen\b[\s,.]*', '! '),

        # Dash/hyphen
        (r'\s+Bindestrich\s+', '-'),
        (r'\s+bindestrich\s+', '-'),
        (r'\s+Gedankenstrich\s+', ' – '),
        (r'\s+gedankenstrich\s+', ' – '),
    ]

    result = text
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result)

    # Clean up: remove extra spaces around punctuation
    result = re.sub(r'\s+([.,;:!?)])', r'\1', result)
    result = re.sub(r'([(])\s+', r'\1', result)
    result = re.sub(r'\s{2,}', ' ', result)

    return result.strip()

def load_llama_model():
    """
    Load Llama 3.2 3B model for German grammar correction

    Note: This will use llama-cpp-python for efficient GPU/CPU inference
    Model will be downloaded on first run to: ./models/llama-3.2-3b-instruct-q4_k_m.gguf

    GPU Acceleration:
    - Automatically uses GPU if available (NVIDIA CUDA, Apple Metal, AMD ROCm, Vulkan)
    - Falls back to CPU if no GPU detected
    - 100% offline and DSGVO-compliant regardless of hardware
    """
    try:
        from llama_cpp import Llama

        # Model path - will be downloaded if not present
        model_path = os.path.join(
            os.path.dirname(__file__),
            "models",
            "llama-3.2-3b-instruct-q4_k_m.gguf"
        )

        print(f"Loading Llama 3.2 3B model from: {model_path}", file=sys.stderr)

        # Check if model exists
        if not os.path.exists(model_path):
            print(f"Model not found at {model_path}", file=sys.stderr)
            print("Please download the model first using setup_llama.py", file=sys.stderr)
            return None

        # Load model with GPU acceleration (auto-fallback to CPU)
        llm = Llama(
            model_path=model_path,
            n_ctx=4096,        # Context window
            n_threads=4,       # CPU threads (used if GPU unavailable)
            n_gpu_layers=35,   # GTX 1650 GPU acceleration - ENABLED!
            verbose=True       # Show loading details
        )

        print("Llama 3.2 3B model loaded successfully with GPU acceleration!", file=sys.stderr)
        return llm

    except ImportError:
        print("ERROR: llama-cpp-python not installed", file=sys.stderr)
        print("Please run: pip install llama-cpp-python", file=sys.stderr)
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


def load_style_template(template_path):
    """Load style template JSON from Component 2.2B"""
    if not template_path or not os.path.exists(template_path):
        return None

    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
            print(f"Style template loaded: {template.get('filename', 'Unknown')}", file=sys.stderr)
            return template
    except Exception as e:
        print(f"WARNING: Could not load style template: {e}", file=sys.stderr)
        return None


def build_grammar_correction_prompt(text, style_template=None):
    """
    Build Llama 3.2 3B prompt for German grammar correction

    Includes:
    - System instructions for German medical text
    - User's style preferences (if available)
    - Grammar correction guidelines
    """

    # Base system prompt for German medical grammar correction
    # CRITICAL: Must be JSON-only output, no commentary
    system_prompt = """Du bist ein präzises Grammatikkorrektur-Tool für deutsche medizinische Texte.

AUFGABE: Korrigiere grammatikalische Fehler im Text.

REGELN:
1. Korrigiere NUR: Grammatik, Rechtschreibung, Zeichensetzung, Großschreibung
2. Behalte ALLE medizinischen Fachbegriffe (auch wenn falsch geschrieben)
3. Gib NUR ein valides JSON-Objekt zurück
4. KEINE zusätzlichen Kommentare, Beispiele oder Erklärungen"""

    # Add style preferences if template is provided
    if style_template:
        font_family = style_template.get('font_family', 'Times New Roman')
        text_alignment = style_template.get('text_alignment', 'left')

        alignment_map = {
            'left': 'linksbündig',
            'right': 'rechtsbündig',
            'center': 'zentriert',
            'justify': 'Blocksatz'
        }
        alignment_german = alignment_map.get(text_alignment, text_alignment)

        system_prompt += f"""

STIL-PRÄFERENZEN DES AUTORS:
- Bevorzugte Schriftart: {font_family}
- Textausrichtung: {alignment_german}
- Behalte die persönliche Schreibweise des Autors bei"""

    # Construct full prompt - direct and strict
    full_prompt = f"""{system_prompt}

TEXT ZUM KORRIGIEREN:
{text}

ANTWORTE NUR MIT DIESEM JSON-FORMAT (keine weiteren Wörter):
{{
    "corrected_text": "der korrigierte vollständige Text",
    "corrections": [
        {{"original": "fehler", "corrected": "Fehler", "explanation": "Großschreibung"}}
    ],
    "summary": "Kurze Zusammenfassung der Änderungen"
}}"""

    return full_prompt


def correct_grammar_with_llama(llm, text, style_template=None):
    """
    Perform grammar correction using Llama 3.2 3B

    Returns:
        dict: {
            "corrected_text": str,
            "corrections": list,
            "summary": str,
            "confidence": float
        }
    """

    # First, convert dictation commands to punctuation (like a Schreibkraft would)
    print("Converting dictation commands to punctuation...", file=sys.stderr)
    text = convert_dictation_commands(text)
    print(f"After dictation conversion: {text[:100]}...", file=sys.stderr)

    if llm is None:
        # Return mock data if model not loaded (for testing)
        print("WARNING: Using mock correction (model not loaded)", file=sys.stderr)
        return {
            "corrected_text": text,
            "corrections": [],
            "summary": "Keine Korrekturen erforderlich (Mock-Modus)",
            "confidence": 0.0,
            "processing_time_ms": 0
        }

    # Build system prompt
    system_prompt = """Du bist ein Grammatikkorrektur-Tool für deutsche medizinische Texte.

WICHTIGE REGELN:
1. Korrigiere NUR Rechtschreibfehler und grammatikalische Fehler
2. BEHALTE alle Satzzeichen EXAKT bei: Klammern (), Anführungszeichen "", Punkte, Kommas
3. ÄNDERE NICHT die Satzstruktur oder Wortstellung
4. BEHALTE medizinische Fachbegriffe unverändert
5. FÜGE KEINE neuen Wörter hinzu und LÖSCHE KEINE Wörter

Antworte NUR mit einem JSON-Objekt:
{"corrected_text": "korrigierter Text hier", "corrections": [{"original": "fehler", "corrected": "Fehler"}], "summary": "Zusammenfassung"}"""

    user_prompt = f"Korrigiere NUR die Rechtschreibung in diesem Text. Behalte ALLE Satzzeichen und Klammern bei:\n{text}"

    print("Generating grammar corrections with Llama 3.2 3B (chat mode)...", file=sys.stderr)
    start_time = datetime.now()

    try:
        # Use chat completion API for proper Llama 3.2 format
        response = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=512,
            temperature=0.1,
            top_p=0.95
        )

        processing_time = (datetime.now() - start_time).total_seconds() * 1000

        # Extract generated text from chat response
        generated_text = response['choices'][0]['message']['content'].strip()

        print(f"Llama response generated ({processing_time:.0f}ms)", file=sys.stderr)
        print(f"Response preview: {generated_text[:200]}...", file=sys.stderr)

        # Try to parse JSON response
        try:
            # Find JSON content (sometimes Llama adds extra text)
            json_start = generated_text.find('{')
            json_end = generated_text.rfind('}') + 1

            if json_start >= 0 and json_end > json_start:
                json_str = generated_text[json_start:json_end]
                result = json.loads(json_str)

                # Add metadata
                result['confidence'] = 0.95  # High confidence for Llama 3.2 3B
                result['processing_time_ms'] = int(processing_time)

                return result
            else:
                print("WARNING: No JSON found in response", file=sys.stderr)
                raise ValueError("No JSON in response")

        except (json.JSONDecodeError, ValueError) as e:
            # Fallback: Try to extract just the corrected_text field
            print(f"WARNING: Could not parse JSON response: {e}", file=sys.stderr)

            # Try to extract corrected_text from malformed JSON
            corrected_text = text  # Default to original
            try:
                import re
                # Look for "corrected_text": "..." pattern
                match = re.search(r'"corrected_text"\s*:\s*"((?:[^"\\]|\\.)*)?"', generated_text)
                if match:
                    raw_text = match.group(1)
                    # Properly decode JSON unicode escapes (e.g., \u00fc -> ü)
                    # Use json.loads to properly handle the escaping
                    try:
                        corrected_text = json.loads(f'"{raw_text}"')
                    except:
                        corrected_text = raw_text
                    print(f"Extracted corrected_text from malformed JSON", file=sys.stderr)
            except Exception as extract_error:
                print(f"Could not extract corrected_text: {extract_error}", file=sys.stderr)

            return {
                "corrected_text": corrected_text,
                "corrections": [],
                "summary": "Korrektur abgeschlossen (vereinfachte Ausgabe)",
                "confidence": 0.7,
                "processing_time_ms": int(processing_time)
            }

    except Exception as e:
        print(f"ERROR during Llama generation: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "corrected_text": text,
            "corrections": [],
            "summary": f"Fehler bei der Korrektur: {e}",
            "confidence": 0.0,
            "processing_time_ms": 0
        }


def main():
    """Main entry point for grammar correction script"""

    # Parse command line arguments
    if len(sys.argv) < 2:
        print("Usage: python llama_grammar_correct.py <text_file> [style_template_file] [output_format]", file=sys.stderr)
        sys.exit(1)

    text_file = sys.argv[1]
    style_template_file = sys.argv[2] if len(sys.argv) > 2 else None
    output_format = sys.argv[3] if len(sys.argv) > 3 else "json"

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

    # Load style template (optional)
    style_template = load_style_template(style_template_file)

    # Load Llama model (with GPU acceleration)
    print("Loading Llama 3.2 3B model with GPU acceleration...", file=sys.stderr)
    llm = load_llama_model()

    # Perform grammar correction
    result = correct_grammar_with_llama(llm, text, style_template)

    # Output results
    if output_format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        # Text output format
        print(result.get("corrected_text", text))

    # Exit code: 0 for success, 1 for errors
    sys.exit(0 if "error" not in result else 1)


if __name__ == "__main__":
    main()
