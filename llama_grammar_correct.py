"""
Llama 3.1 8B Grammar Correction Script for Gutachten Assistant
Component 2.2C: German medical text grammar correction

TWO-STEP PIPELINE WITH GUARDRAILS:
1. Regex cleanup - Convert dictation commands to punctuation
2. Copy-editor correction - MINIMAL changes (spelling, grammar only)
3. Guardrails - Reject outputs that hallucinate or rewrite

NO TEMPLATING IN LLM - Template insertion happens in app code (deterministic)
"""

import sys
import json
import os
import re
from datetime import datetime
from difflib import SequenceMatcher


# =============================================================================
# STEP 1: REGEX CLEANUP - Convert dictation commands to punctuation
# =============================================================================

DICTATION_COMMANDS = {
    # Punctuation - case insensitive
    r'\bpunkt\b': '.',
    r'\bkomma\b': ',',
    r'\bdoppelpunkt\b': ':',
    r'\bsemikolon\b': ';',
    r'\bfragezeichen\b': '?',
    r'\bausrufezeichen\b': '!',
    r'\bbindestrich\b': '-',
    r'\bgedankenstrich\b': ' - ',
    r'\bschrägstrich\b': '/',

    # Parentheses and quotes
    r'\bin klammern\b': '(',
    r'\bklammer auf\b': '(',
    r'\bklammern zu\b': ')',
    r'\bklammer zu\b': ')',
    r'\banführungszeichen auf\b': '"',
    r'\banführungszeichen zu\b': '"',
    r'\bzitat anfang\b': '"',
    r'\bzitat ende\b': '"',

    # Line breaks and paragraphs
    r'\bneue zeile\b': '\n',
    r'\bzeilenumbruch\b': '\n',
    r'\bneuer absatz\b': '\n\n',
    r'\babsatz\b': '\n\n',
    r'\benter\b': '\n',
}

# Tokens that get removed (for tracking)
REMOVED_TOKENS = []


def regex_cleanup_dictation_commands(text: str) -> tuple:
    """
    STEP 1: Convert spoken dictation commands to actual punctuation/formatting.
    Returns (cleaned_text, list_of_removed_tokens)
    """
    result = text
    removed = []

    for pattern, replacement in DICTATION_COMMANDS.items():
        matches = re.findall(pattern, result, flags=re.IGNORECASE)
        if matches:
            removed.extend(matches)
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    # Clean up extra spaces around punctuation
    result = re.sub(r'\s+([.,;:!?])', r'\1', result)  # Remove space before punctuation
    result = re.sub(r'([.,;:!?])(\w)', r'\1 \2', result)  # Add space after punctuation if missing

    # Clean up multiple spaces
    result = re.sub(r' +', ' ', result)

    # Clean up multiple newlines (max 2)
    result = re.sub(r'\n{3,}', '\n\n', result)

    # Trim lines
    lines = result.split('\n')
    lines = [line.strip() for line in lines]
    result = '\n'.join(lines)

    return result.strip(), removed


# =============================================================================
# STEP 2: COPY-EDITOR CORRECTION (LLM) - Minimal changes only
# =============================================================================

COPY_EDITOR_SYSTEM_PROMPT = """Du bist ein Korrekturleser für deutsche medizinische Texte.

AUFTRAG:
Schreibe den Text mit MINIMALEN Änderungen um:
- Korrigiere Rechtschreibung, Grammatik, Zeichensetzung.
- Normalisiere offensichtliche Tippfehler und Abstände.
- Behalte die ursprüngliche Bedeutung, Fakten, Reihenfolge und Absatzstruktur.

ABSOLUTE REGELN (STRENG):
1) Füge KEINE neuen medizinischen Fakten, Diagnosen, Befunde oder Interpretationen hinzu.
2) Erfinde KEINE Sätze, Zusammenfassungen, Beurteilungen oder Empfehlungen.
3) Ändere NICHT die Struktur: Absatzzahl und Reihenfolge müssen gleich bleiben.
4) Schreibe NICHT stilistisch um. Keine "schönere Formulierung" außer korrekter Grammatik.
5) Bei unklaren Stellen: behalte sie bei und markiere mit [UNKLAR: ...], aber rate nicht.
6) Du darfst durchschnittlich nur 1-3 Wörter pro Satz ändern. Erstelle KEINE neuen Sätze.

VERBOTENE WÖRTER (nur erlaubt wenn bereits im Input):
- "Zusammenfassend"
- "Beurteilung"
- "Empfehlung"
- "Diagnose:"
- "Fazit"

AUSGABE:
Gib NUR gültiges JSON mit genau diesen Schlüsseln zurück:
{
  "clean_text": "...",
  "notes": []
}

Das "clean_text" Feld enthält NUR die korrigierte Version des Eingabetexts."""


def load_llama_model():
    """Load Llama 3.1 8B model for German grammar correction"""
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

        load_start = datetime.now()

        llm = Llama(
            model_path=model_path,
            n_ctx=4096,  # Reduced context for faster processing
            n_threads=8,  # Match CPU cores
            n_batch=512,  # Larger batch for faster prompt processing
            n_gpu_layers=0,  # CPU only (no GPU)
            verbose=True  # Enable verbose to see what's happening
        )

        load_time = (datetime.now() - load_start).total_seconds()
        print(f"MODEL LOAD TIME: {load_time:.2f} seconds", file=sys.stderr)

        return llm

    except ImportError:
        print("ERROR: llama-cpp-python not installed", file=sys.stderr)
        return None
    except Exception as e:
        print(f"ERROR loading Llama model: {e}", file=sys.stderr)
        return None


# =============================================================================
# STEP 3: GUARDRAILS - Detect hallucination or rewriting
# =============================================================================

BANNED_PHRASES = [
    "zusammenfassend",
    "beurteilung",
    "empfehlung",
    "fazit",
    "diagnose:",
    "abschließend",
    "insgesamt",
    "resümierend",
]


def check_guardrails(input_text: str, output_text: str) -> tuple:
    """
    Check if the output violates guardrails.
    Returns (is_valid, list_of_violations)
    """
    violations = []
    input_lower = input_text.lower()
    output_lower = output_text.lower()

    # 1. Length check - output shouldn't be much longer or shorter
    input_len = len(input_text)
    output_len = len(output_text)
    length_ratio = output_len / max(input_len, 1)

    if length_ratio > 1.5:
        violations.append(f"Output ist zu lang ({length_ratio:.1f}x länger als Input)")
    if length_ratio < 0.5:
        violations.append(f"Output ist zu kurz ({length_ratio:.1f}x kürzer als Input)")

    # 2. Banned phrases check - only if not in input
    for phrase in BANNED_PHRASES:
        if phrase in output_lower and phrase not in input_lower:
            violations.append(f"Verbotenes Wort hinzugefügt: '{phrase}'")

    # 3. Similarity check - should be at least 70% similar
    similarity = SequenceMatcher(None, input_lower, output_lower).ratio()
    if similarity < 0.6:
        violations.append(f"Zu wenig Ähnlichkeit mit Original ({similarity:.0%})")

    # 4. Sentence count check - shouldn't add many new sentences
    input_sentences = len(re.split(r'[.!?]+', input_text))
    output_sentences = len(re.split(r'[.!?]+', output_text))
    sentence_diff = output_sentences - input_sentences

    if sentence_diff > 3:
        violations.append(f"Zu viele neue Sätze hinzugefügt (+{sentence_diff})")

    # 5. Word overlap check
    input_words = set(re.findall(r'\b\w+\b', input_lower))
    output_words = set(re.findall(r'\b\w+\b', output_lower))
    new_words = output_words - input_words

    # Filter out common German words that might be added for grammar
    common_additions = {'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'war', 'waren',
                        'wird', 'werden', 'hat', 'haben', 'ein', 'eine', 'einer', 'eines',
                        'zu', 'bei', 'mit', 'für', 'auf', 'an', 'in', 'von', 'nach'}
    new_significant_words = new_words - common_additions

    if len(new_significant_words) > 10:
        violations.append(f"Zu viele neue Wörter hinzugefügt ({len(new_significant_words)})")

    is_valid = len(violations) == 0
    return is_valid, violations


def extract_json_from_response(response_text: str) -> dict:
    """
    Extract JSON from LLM response, handling various formats.
    """
    # Try direct JSON parse first
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON block in response
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # Fallback: treat entire response as clean_text
    return {
        "clean_text": response_text.strip(),
        "notes": ["JSON parsing failed, using raw response"]
    }


def run_copy_editor(llm, text: str, max_retries: int = 2) -> dict:
    """
    Run the copy-editor LLM with guardrails and retries.
    """
    user_prompt = f"""Eingabetext (roh):
<<<
{text}
>>>"""

    best_result = None
    best_similarity = 0

    # Calculate max_tokens based on input length (output should be similar length)
    # Estimate ~4 chars per token for German, add buffer for JSON wrapper
    estimated_tokens = len(text) // 4
    max_output_tokens = min(max(estimated_tokens + 300, 500), 2048)  # Min 500, max 2048

    print(f"Input length: {len(text)} chars, max_tokens: {max_output_tokens}", file=sys.stderr)

    for attempt in range(max_retries):
        # Adjust temperature based on attempt (stricter on retries)
        temperature = 0.2 if attempt == 0 else 0.1

        print(f"Copy-editor attempt {attempt + 1}/{max_retries} (temp={temperature})", file=sys.stderr)

        try:
            infer_start = datetime.now()

            response = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": COPY_EDITOR_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=max_output_tokens,
                temperature=temperature,
                top_p=0.9,
                repeat_penalty=1.1
            )

            infer_time = (datetime.now() - infer_start).total_seconds()

            # Extract token counts from response
            usage = response.get('usage', {})
            prompt_tokens = usage.get('prompt_tokens', 0)
            completion_tokens = usage.get('completion_tokens', 0)
            total_tokens = usage.get('total_tokens', 0)

            tokens_per_sec = completion_tokens / infer_time if infer_time > 0 else 0

            print(f"=== INFERENCE METRICS ===", file=sys.stderr)
            print(f"INFERENCE TIME: {infer_time:.2f} seconds", file=sys.stderr)
            print(f"INPUT TOKENS: {prompt_tokens}", file=sys.stderr)
            print(f"OUTPUT TOKENS: {completion_tokens}", file=sys.stderr)
            print(f"TOTAL TOKENS: {total_tokens}", file=sys.stderr)
            print(f"TOKENS/SEC: {tokens_per_sec:.2f}", file=sys.stderr)
            print(f"=========================", file=sys.stderr)

            response_text = response['choices'][0]['message']['content'].strip()
            parsed = extract_json_from_response(response_text)
            clean_text = parsed.get("clean_text", response_text)

            # Check guardrails
            is_valid, violations = check_guardrails(text, clean_text)

            if is_valid:
                print(f"Guardrails passed on attempt {attempt + 1}", file=sys.stderr)
                return {
                    "clean_text": clean_text,
                    "notes": parsed.get("notes", []),
                    "guardrail_status": "passed",
                    "attempts": attempt + 1
                }
            else:
                print(f"Guardrail violations: {violations}", file=sys.stderr)

                # Track best result (highest similarity)
                similarity = SequenceMatcher(None, text.lower(), clean_text.lower()).ratio()
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_result = {
                        "clean_text": clean_text,
                        "notes": parsed.get("notes", []) + violations,
                        "guardrail_status": "violations_detected",
                        "violations": violations,
                        "attempts": attempt + 1
                    }

        except Exception as e:
            print(f"LLM error on attempt {attempt + 1}: {e}", file=sys.stderr)

    # All retries failed - return best result or original
    if best_result:
        print(f"Returning best attempt (similarity: {best_similarity:.0%})", file=sys.stderr)
        return best_result
    else:
        print("All attempts failed, returning original text", file=sys.stderr)
        return {
            "clean_text": text,
            "notes": ["LLM correction failed, returning original"],
            "guardrail_status": "fallback_to_original",
            "attempts": max_retries
        }


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def extract_input_text_from_prompt(full_prompt: str) -> str:
    """
    Extract the actual dictated text from the prompt.
    """
    markers = [
        "DIKTIERTER TEXT:",
        "Diktierter Text:",
        "TEXT ZUM FORMATIEREN:",
        "Input text:",
    ]

    for marker in markers:
        if marker in full_prompt:
            parts = full_prompt.split(marker, 1)
            if len(parts) > 1:
                dictated_text = parts[1].strip()
                # Remove any trailing instructions
                for end_marker in ["---", "Output:", "AUSGABE:", "STRENGE REGEL:"]:
                    if end_marker in dictated_text:
                        dictated_text = dictated_text.split(end_marker)[0].strip()
                return dictated_text

    # If no marker found, return the whole text
    return full_prompt


def process_with_pipeline(llm, full_prompt: str) -> dict:
    """
    FULL PIPELINE:
    1. Extract dictated text
    2. Regex cleanup of dictation commands
    3. Copy-editor correction with guardrails
    """
    print("=" * 50, file=sys.stderr)
    print("STARTING TWO-STEP PIPELINE WITH GUARDRAILS", file=sys.stderr)
    print("=" * 50, file=sys.stderr)
    start_time = datetime.now()

    # Extract the actual dictated text from the prompt
    dictated_text = extract_input_text_from_prompt(full_prompt)
    print(f"Extracted dictated text: {len(dictated_text)} chars", file=sys.stderr)

    # STEP 1: Regex cleanup
    print("Step 1: Regex cleanup of dictation commands...", file=sys.stderr)
    cleaned_text, removed_tokens = regex_cleanup_dictation_commands(dictated_text)
    print(f"After regex cleanup: {len(cleaned_text)} chars", file=sys.stderr)
    print(f"Removed tokens: {removed_tokens[:10]}{'...' if len(removed_tokens) > 10 else ''}", file=sys.stderr)

    # STEP 2: Copy-editor correction
    if llm is None:
        print("WARNING: LLM not available, returning regex-cleaned text only", file=sys.stderr)
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        return {
            "corrected_text": cleaned_text,
            "removed_tokens": removed_tokens,
            "notes": ["LLM nicht verfügbar - nur Diktierbefehle bereinigt"],
            "guardrail_status": "llm_unavailable",
            "processing_time_ms": int(processing_time)
        }

    print("Step 2: Copy-editor correction with guardrails...", file=sys.stderr)
    editor_result = run_copy_editor(llm, cleaned_text)

    processing_time = (datetime.now() - start_time).total_seconds() * 1000

    print(f"Pipeline completed in {processing_time:.0f}ms", file=sys.stderr)
    print(f"Guardrail status: {editor_result.get('guardrail_status', 'unknown')}", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    return {
        "corrected_text": editor_result["clean_text"],
        "removed_tokens": removed_tokens,
        "notes": editor_result.get("notes", []),
        "guardrail_status": editor_result.get("guardrail_status", "unknown"),
        "violations": editor_result.get("violations", []),
        "attempts": editor_result.get("attempts", 1),
        "processing_time_ms": int(processing_time)
    }


def load_text_file(file_path):
    """Load text content from file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        print(f"ERROR reading text file: {e}", file=sys.stderr)
        return None


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
            "notes": ["Fehler beim Laden der Textdatei"]
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(1)

    print(f"Input text loaded: {len(text)} characters", file=sys.stderr)

    # Load Llama model
    print("Loading Llama 3.1 8B model...", file=sys.stderr)
    llm = load_llama_model()

    # Run the pipeline
    result = process_with_pipeline(llm, text)

    # Output results
    if output_format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result.get("corrected_text", text))

    sys.exit(0 if "error" not in result else 1)


if __name__ == "__main__":
    main()
