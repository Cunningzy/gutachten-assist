"""
Llama Text Correction Worker - Persistent Process for German Medical Dictation

ARCHITECTURE:
- Model loaded ONCE at startup, reused for all requests
- Communication via stdin/stdout JSON lines (fully offline, no networking)
- LLM does ONLY text correction (spelling/grammar/punctuation)
- Word/DOCX formatting is done separately in code (not here)

PROTOCOL:
  Input:  {"text": "...", "input_type": "short"|"long"} or {"command": "ping"|"shutdown"|"metrics"}
  Output: {"clean_text": "...", "notes": [], "metrics": {...}}
"""

import sys
import json
import os
import re
import platform
from datetime import datetime
from difflib import SequenceMatcher

# Force UTF-8 for Windows
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', newline='\n')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


# =============================================================================
# CONFIGURATION
# =============================================================================

CONFIG = {
    # Model settings optimized for i5-9300H (4C/8T)
    "n_ctx": 2048,           # Context window (sufficient for our task)
    "n_threads": 8,          # Match logical processors
    "n_batch": 512,          # Batch size for prompt eval
    "n_gpu_layers": 0,       # CPU only
    "use_mmap": True,        # Memory-mapped loading
    "verbose": False,        # Reduce noise in production

    # Generation settings
    "temperature": 0.0,      # Deterministic output
    "top_p": 1.0,            # No nucleus sampling with temp=0
    "repeat_penalty": 1.0,   # No repeat penalty needed with temp=0

    # Token limits (hard caps)
    "max_tokens_short": 200,   # For inputs < 500 chars
    "max_tokens_medium": 500,  # For inputs 500-2000 chars
    "max_tokens_long": 2000,   # For inputs > 2000 chars
    "max_tokens_absolute": 3000,  # Absolute maximum

    # Stop sequences for JSON
    "stop_sequences": ["\n}", "}\n", "\n\n"],
}


# =============================================================================
# SYSTEM PROMPTS - Short vs Full
# =============================================================================

# SHORT PROMPT for inputs < 500 chars (~50 tokens)
SYSTEM_PROMPT_SHORT = """Korrekturleser: Minimale Korrekturen an deutschem Text.
Korrigiere nur Rechtschreibung, Grammatik, Zeichensetzung.
Entferne Diktierbefehle (Punkt, Komma, Absatz).
Ausgabe NUR: {"clean_text": "...", "notes": []}"""

# FULL PROMPT for longer inputs (~100 tokens)
SYSTEM_PROMPT_FULL = """Du bist ein Korrekturleser für deutsche medizinische Diktate.

AUFGABE:
- Korrigiere Rechtschreibung, Grammatik, Zeichensetzung
- Entferne Diktierbefehle ("Punkt", "Komma", "Absatz", etc.)
- Normalisiere Abstände

REGELN:
- Minimale Änderungen (1-3 Wörter pro Satz max)
- Struktur/Reihenfolge/Absätze beibehalten
- Keine neuen Inhalte oder Umformulierungen
- Unklare Stellen: [UNKLAR: originaltext] markieren, nicht raten

AUSGABE NUR gültiges JSON:
{"clean_text": "korrigierter text", "notes": ["optional"]}"""


# =============================================================================
# DICTATION COMMAND CLEANUP (Regex - deterministic)
# =============================================================================

DICTATION_PATTERNS = [
    (r'\bpunkt\b', '.'),
    (r'\bkomma\b', ','),
    (r'\bdoppelpunkt\b', ':'),
    (r'\bsemikolon\b', ';'),
    (r'\bfragezeichen\b', '?'),
    (r'\bausrufezeichen\b', '!'),
    (r'\bbindestrich\b', '-'),
    (r'\bgedankenstrich\b', ' – '),
    (r'\bschrägstrich\b', '/'),
    (r'\bin klammern\b', '('),
    (r'\bklammer auf\b', '('),
    (r'\bklammern? zu\b', ')'),
    (r'\banführungszeichen auf\b', '"'),
    (r'\banführungszeichen zu\b', '"'),
    (r'\bzitat anfang\b', '"'),
    (r'\bzitat ende\b', '"'),
    (r'\bneue zeile\b', '\n'),
    (r'\bzeilenumbruch\b', '\n'),
    (r'\bneuer absatz\b', '\n\n'),
    (r'\babsatz\b', '\n\n'),
]


def cleanup_dictation_commands(text: str) -> tuple[str, list[str]]:
    """Remove dictation commands and normalize spacing. Returns (cleaned_text, removed_tokens)."""
    result = text
    removed = []

    for pattern, replacement in DICTATION_PATTERNS:
        matches = re.findall(pattern, result, flags=re.IGNORECASE)
        if matches:
            removed.extend(matches)
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    # Normalize spacing
    result = re.sub(r'\s+([.,;:!?])', r'\1', result)
    result = re.sub(r'([.,;:!?])(\w)', r'\1 \2', result)
    result = re.sub(r' +', ' ', result)
    result = re.sub(r'\n{3,}', '\n\n', result)

    return result.strip(), removed


# =============================================================================
# GUARDRAILS
# =============================================================================

BANNED_NEW_PHRASES = ["zusammenfassend", "beurteilung", "empfehlung",
                       "fazit", "abschließend", "resümierend"]


def check_output_quality(input_text: str, output_text: str) -> tuple[bool, list[str]]:
    """Verify output doesn't hallucinate or rewrite excessively."""
    issues = []
    input_lower = input_text.lower()
    output_lower = output_text.lower()

    # Length check (output shouldn't be much longer/shorter)
    ratio = len(output_text) / max(len(input_text), 1)
    if ratio > 1.5:
        issues.append(f"Output too long ({ratio:.1f}x)")
    if ratio < 0.5:
        issues.append(f"Output too short ({ratio:.1f}x)")

    # Banned phrases check
    for phrase in BANNED_NEW_PHRASES:
        if phrase in output_lower and phrase not in input_lower:
            issues.append(f"Added banned phrase: '{phrase}'")

    # Similarity check
    similarity = SequenceMatcher(None, input_lower, output_lower).ratio()
    if similarity < 0.6:
        issues.append(f"Too different from original ({similarity:.0%})")

    return len(issues) == 0, issues


def extract_json_safely(response: str) -> dict:
    """Extract JSON from LLM response, handling edge cases."""
    response = response.strip()

    # Try direct parse
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object
    match = re.search(r'\{[^{}]*"clean_text"[^{}]*\}', response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Try adding missing brace
    if response.startswith('{') and not response.endswith('}'):
        try:
            return json.loads(response + '}')
        except json.JSONDecodeError:
            pass

    # Fallback: treat as raw text
    return {"clean_text": response, "notes": ["JSON parse failed, using raw"]}


# =============================================================================
# WORKER CLASS
# =============================================================================

class LlamaWorker:
    def __init__(self):
        self.llm = None
        self.model_loaded = False
        self.load_time_ms = 0
        self.model_path = ""
        self.cpu_features = ""
        self.request_count = 0

    def load_model(self) -> bool:
        """Load model once at startup."""
        if self.model_loaded:
            return True

        try:
            from llama_cpp import Llama

            self.model_path = os.path.join(
                os.path.dirname(__file__),
                "models",
                "llama-3.1-8b-instruct-q4_k_m.gguf"
            )

            if not os.path.exists(self.model_path):
                print(f"[WORKER] ERROR: Model not found at {self.model_path}", file=sys.stderr)
                return False

            print(f"[WORKER] Loading model (this happens ONCE)...", file=sys.stderr)
            start = datetime.now()

            self.llm = Llama(
                model_path=self.model_path,
                n_ctx=CONFIG["n_ctx"],
                n_threads=CONFIG["n_threads"],
                n_batch=CONFIG["n_batch"],
                n_gpu_layers=CONFIG["n_gpu_layers"],
                use_mmap=CONFIG["use_mmap"],
                verbose=CONFIG["verbose"],
            )

            self.load_time_ms = int((datetime.now() - start).total_seconds() * 1000)
            self.model_loaded = True

            # Log CPU features (from llama.cpp output during load)
            self.cpu_features = "AVX2+FMA (assumed)"  # We can't easily extract this

            print(f"[WORKER] Model loaded in {self.load_time_ms}ms", file=sys.stderr)
            print(f"[WORKER] Config: n_ctx={CONFIG['n_ctx']}, n_threads={CONFIG['n_threads']}, "
                  f"n_batch={CONFIG['n_batch']}, mmap={CONFIG['use_mmap']}", file=sys.stderr)

            return True

        except Exception as e:
            print(f"[WORKER] Load error: {e}", file=sys.stderr)
            return False

    def get_max_tokens(self, text_length: int) -> int:
        """Dynamic max_tokens with hard caps based on input size."""
        if text_length < 500:
            return CONFIG["max_tokens_short"]
        elif text_length < 2000:
            return CONFIG["max_tokens_medium"]
        else:
            # For very long texts, scale but cap
            estimated = min(text_length // 3 + 200, CONFIG["max_tokens_long"])
            return min(estimated, CONFIG["max_tokens_absolute"])

    def get_system_prompt(self, text_length: int) -> str:
        """Use shorter prompt for short inputs."""
        if text_length < 500:
            return SYSTEM_PROMPT_SHORT
        return SYSTEM_PROMPT_FULL

    def correct_text(self, text: str, input_type: str = "auto") -> dict:
        """Main correction pipeline."""
        self.request_count += 1
        request_start = datetime.now()

        # Step 1: Regex cleanup (deterministic)
        cleaned, removed_tokens = cleanup_dictation_commands(text)
        text_length = len(cleaned)

        if not self.model_loaded:
            return {
                "clean_text": cleaned,
                "notes": ["LLM not loaded - regex cleanup only"],
                "removed_tokens": removed_tokens,
                "metrics": self._build_metrics(request_start, 0, 0, 0, "llm_unavailable")
            }

        # Step 2: LLM correction
        system_prompt = self.get_system_prompt(text_length)
        max_tokens = self.get_max_tokens(text_length)

        user_prompt = f"Text:\n{cleaned}"

        try:
            infer_start = datetime.now()

            response = self.llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=max_tokens,
                temperature=CONFIG["temperature"],
                top_p=CONFIG["top_p"],
                repeat_penalty=CONFIG["repeat_penalty"],
                stop=CONFIG["stop_sequences"],
            )

            infer_time_ms = int((datetime.now() - infer_start).total_seconds() * 1000)

            # Extract metrics
            usage = response.get('usage', {})
            prompt_tokens = usage.get('prompt_tokens', 0)
            completion_tokens = usage.get('completion_tokens', 0)
            tokens_per_sec = completion_tokens / (infer_time_ms / 1000) if infer_time_ms > 0 else 0

            # Parse response
            response_text = response['choices'][0]['message']['content'].strip()
            parsed = extract_json_safely(response_text)
            clean_text = parsed.get("clean_text", cleaned)
            notes = parsed.get("notes", [])

            # Guardrails check
            is_valid, issues = check_output_quality(cleaned, clean_text)
            guardrail_status = "passed" if is_valid else "violations"
            if not is_valid:
                notes.extend(issues)
                print(f"[WORKER] Guardrail issues: {issues}", file=sys.stderr)

            metrics = self._build_metrics(
                request_start, prompt_tokens, completion_tokens,
                tokens_per_sec, guardrail_status
            )

            print(f"[WORKER] Request #{self.request_count}: {prompt_tokens}+{completion_tokens} tokens, "
                  f"{tokens_per_sec:.2f} tok/s, {infer_time_ms}ms", file=sys.stderr)

            return {
                "clean_text": clean_text,
                "notes": notes,
                "removed_tokens": removed_tokens,
                "guardrail_status": guardrail_status,
                "metrics": metrics
            }

        except Exception as e:
            print(f"[WORKER] Inference error: {e}", file=sys.stderr)
            return {
                "clean_text": cleaned,
                "notes": [f"LLM error: {str(e)}"],
                "removed_tokens": removed_tokens,
                "guardrail_status": "error",
                "metrics": self._build_metrics(request_start, 0, 0, 0, "error")
            }

    def _build_metrics(self, start_time, prompt_tokens, completion_tokens,
                       tokens_per_sec, status) -> dict:
        """Build structured metrics object."""
        return {
            "model_loaded_once": True,
            "load_time_ms": self.load_time_ms,
            "request_number": self.request_count,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "tokens_per_sec": round(tokens_per_sec, 2),
            "total_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
            "n_ctx": CONFIG["n_ctx"],
            "n_threads": CONFIG["n_threads"],
            "n_batch": CONFIG["n_batch"],
            "mmap": CONFIG["use_mmap"],
            "temperature": CONFIG["temperature"],
            "status": status,
        }

    def get_full_metrics(self) -> dict:
        """Return full system metrics."""
        return {
            "model_loaded": self.model_loaded,
            "model_path": self.model_path,
            "load_time_ms": self.load_time_ms,
            "request_count": self.request_count,
            "config": CONFIG,
            "platform": platform.platform(),
            "python_version": platform.python_version(),
        }

    def handle_request(self, request: dict) -> dict:
        """Handle incoming request."""
        cmd = request.get("command")

        if cmd == "ping":
            return {"status": "ready", "model_loaded": self.model_loaded}

        if cmd == "shutdown":
            return {"status": "shutting_down"}

        if cmd == "metrics":
            return self.get_full_metrics()

        if "text" in request:
            input_type = request.get("input_type", "auto")
            return self.correct_text(request["text"], input_type)

        return {"error": "Unknown request format"}

    def run(self):
        """Main loop - read JSON from stdin, write JSON to stdout."""
        print("[WORKER] Starting persistent worker...", file=sys.stderr)

        # Load model at startup (ONCE)
        if not self.load_model():
            print("[WORKER] WARNING: Model failed to load, will use regex-only mode", file=sys.stderr)

        print("[WORKER] Ready for requests", file=sys.stderr)

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
                response = self.handle_request(request)

                # Output single JSON line
                print(json.dumps(response, ensure_ascii=False), flush=True)

                if request.get("command") == "shutdown":
                    break

            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"Invalid JSON: {e}"}), flush=True)
            except Exception as e:
                print(json.dumps({"error": f"Error: {e}"}), flush=True)

        print("[WORKER] Shutting down", file=sys.stderr)


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    worker = LlamaWorker()
    worker.run()
