"""
Llama Native Worker - Uses official llama.cpp binaries for 10x faster inference

ARCHITECTURE:
- Launches llama-server.exe as subprocess (local HTTP, no external network)
- Model loaded ONCE at startup, reused for all requests
- Communicates via localhost HTTP (127.0.0.1 only - DSGVO compliant)
- ~1.7 tok/s instead of ~0.15 tok/s with Python binding

PROTOCOL:
  Input:  {"text": "..."} or {"command": "ping"|"shutdown"|"metrics"}
  Output: {"clean_text": "...", "notes": [], "metrics": {...}}
"""

import sys
import json
import os
import re
import subprocess
import time
import urllib.request
import urllib.error
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
    "server_host": "127.0.0.1",  # Localhost only - no external network
    "server_port": 8765,          # Arbitrary high port
    "n_ctx": 2048,
    "n_threads": 8,
    "model_path": os.path.join(os.path.dirname(__file__), "models", "llama-3.1-8b-instruct-q4_k_m.gguf"),
    "server_path": os.path.join(os.path.dirname(__file__), "llama-cpp-bin", "llama-server.exe"),

    # Generation settings
    "temperature": 0.0,
    "max_tokens_short": 200,
    "max_tokens_long": 1000,
}

# Simple prompt template for raw completion (NOT chat - avoids tool-calling mode)
# Using Llama 3.1 instruct format but minimal tokens
PROMPT_TEMPLATE = """<|begin_of_text|><|start_header_id|>system<|end_header_id|>

Korrekturleser. Korrigiere Rechtschreibung/Grammatik. Minimale Änderungen.<|eot_id|><|start_header_id|>user<|end_header_id|>

{text}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

"""

# =============================================================================
# DICTATION CLEANUP
# =============================================================================

DICTATION_PATTERNS = [
    (r'\bpunkt\b', '.'), (r'\bkomma\b', ','), (r'\bdoppelpunkt\b', ':'),
    (r'\bsemikolon\b', ';'), (r'\bfragezeichen\b', '?'), (r'\bausrufezeichen\b', '!'),
    (r'\bbindestrich\b', '-'), (r'\bschrägstrich\b', '/'),
    (r'\bin klammern\b', '('), (r'\bklammer auf\b', '('), (r'\bklammern? zu\b', ')'),
    (r'\banführungszeichen auf\b', '"'), (r'\banführungszeichen zu\b', '"'),
    (r'\bneue zeile\b', '\n'), (r'\bneuer absatz\b', '\n\n'), (r'\babsatz\b', '\n\n'),
]

def cleanup_dictation(text: str) -> tuple[str, list[str]]:
    result, removed = text, []
    for pattern, replacement in DICTATION_PATTERNS:
        matches = re.findall(pattern, result, flags=re.IGNORECASE)
        if matches:
            removed.extend(matches)
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    result = re.sub(r'\s+([.,;:!?])', r'\1', result)
    result = re.sub(r'([.,;:!?])(\w)', r'\1 \2', result)
    result = re.sub(r' +', ' ', result)
    return result.strip(), removed

# =============================================================================
# GUARDRAILS
# =============================================================================

BANNED_PHRASES = ["zusammenfassend", "beurteilung", "empfehlung", "fazit", "abschließend"]

def check_output(input_text: str, output_text: str) -> tuple[bool, list[str]]:
    issues = []
    ratio = len(output_text) / max(len(input_text), 1)
    if ratio > 1.5: issues.append(f"Output too long ({ratio:.1f}x)")
    if ratio < 0.5: issues.append(f"Output too short ({ratio:.1f}x)")
    for phrase in BANNED_PHRASES:
        if phrase in output_text.lower() and phrase not in input_text.lower():
            issues.append(f"Added banned: '{phrase}'")
    similarity = SequenceMatcher(None, input_text.lower(), output_text.lower()).ratio()
    if similarity < 0.6: issues.append(f"Too different ({similarity:.0%})")
    return len(issues) == 0, issues

def extract_json(response: str) -> dict:
    try:
        return json.loads(response)
    except:
        match = re.search(r'\{[^{}]*"clean_text"[^{}]*\}', response, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                pass
    return {"clean_text": response.strip(), "notes": ["JSON parse failed"]}

# =============================================================================
# NATIVE WORKER CLASS
# =============================================================================

class LlamaNativeWorker:
    def __init__(self):
        self.server_process = None
        self.server_ready = False
        self.load_time_ms = 0
        self.request_count = 0
        self.base_url = f"http://{CONFIG['server_host']}:{CONFIG['server_port']}"

    def start_server(self) -> bool:
        """Start llama-server.exe as subprocess."""
        if self.server_process and self.server_process.poll() is None:
            return True  # Already running

        if not os.path.exists(CONFIG["server_path"]):
            print(f"[WORKER] ERROR: Server not found at {CONFIG['server_path']}", file=sys.stderr)
            return False
        if not os.path.exists(CONFIG["model_path"]):
            print(f"[WORKER] ERROR: Model not found at {CONFIG['model_path']}", file=sys.stderr)
            return False

        print(f"[WORKER] Starting llama-server on {self.base_url}...", file=sys.stderr)
        start = datetime.now()

        cmd = [
            CONFIG["server_path"],
            "-m", CONFIG["model_path"],
            "--host", CONFIG["server_host"],
            "--port", str(CONFIG["server_port"]),
            "-c", str(CONFIG["n_ctx"]),
            "-t", str(CONFIG["n_threads"]),
            "--log-disable",  # Reduce noise
        ]

        try:
            self.server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )

            # Wait for server to be ready
            for i in range(60):  # 60 second timeout
                time.sleep(1)
                if self._check_health():
                    self.server_ready = True
                    self.load_time_ms = int((datetime.now() - start).total_seconds() * 1000)
                    print(f"[WORKER] Server ready in {self.load_time_ms}ms", file=sys.stderr)
                    return True
                if self.server_process.poll() is not None:
                    print(f"[WORKER] Server exited unexpectedly", file=sys.stderr)
                    return False

            print(f"[WORKER] Server startup timeout", file=sys.stderr)
            return False

        except Exception as e:
            print(f"[WORKER] Failed to start server: {e}", file=sys.stderr)
            return False

    def _check_health(self) -> bool:
        """Check if server is responding."""
        try:
            req = urllib.request.Request(f"{self.base_url}/health")
            with urllib.request.urlopen(req, timeout=1) as resp:
                return resp.status == 200
        except:
            return False

    def _api_call(self, endpoint: str, data: dict) -> dict:
        """Make API call to local server."""
        url = f"{self.base_url}{endpoint}"
        body = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})

        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode('utf-8'))

    def correct_text(self, text: str) -> dict:
        """Main correction pipeline."""
        self.request_count += 1
        start = datetime.now()

        # Regex cleanup first (deterministic - always works)
        cleaned, removed = cleanup_dictation(text)

        if not self.server_ready:
            return {
                "clean_text": cleaned,
                "notes": ["Server not ready - regex only"],
                "removed_tokens": removed,
                "metrics": {"status": "server_unavailable"}
            }

        # Build minimal prompt using raw completion (NOT chat - avoids tool mode)
        prompt = PROMPT_TEMPLATE.format(text=cleaned)

        # Estimate output tokens needed (roughly same as input + small buffer)
        estimated_output = min(len(cleaned.split()) + 20, CONFIG["max_tokens_short"])

        try:
            infer_start = datetime.now()

            # Use /completion endpoint (faster than /v1/chat/completions)
            response = self._api_call("/completion", {
                "prompt": prompt,
                "n_predict": estimated_output,
                "temperature": CONFIG["temperature"],
                "stop": ["<|eot_id|>", "<|end_of_text|>"],  # Llama 3.1 stop tokens
                "cache_prompt": True,  # Cache system prompt for speed
            })

            infer_ms = int((datetime.now() - infer_start).total_seconds() * 1000)

            # Extract response (raw text, not JSON)
            content = response.get("content", "").strip()

            # The model should output corrected text directly
            clean_text = content if content else cleaned
            notes = []

            # Metrics from llama.cpp
            tokens_predicted = response.get("tokens_predicted", 0)
            tokens_evaluated = response.get("tokens_evaluated", 0)

            # Calculate generation speed (excluding prompt processing)
            generation_ms = infer_ms - (tokens_evaluated / 2.5 * 1000) if tokens_evaluated > 0 else infer_ms
            tok_per_sec = tokens_predicted / (generation_ms / 1000) if generation_ms > 0 else 0

            # Guardrails
            is_valid, issues = check_output(cleaned, clean_text)
            if not is_valid:
                notes.extend(issues)
                # If guardrails fail badly, fall back to regex-only result
                if "Too different" in str(issues):
                    clean_text = cleaned
                    notes.append("Fallback to regex-only")

            total_ms = int((datetime.now() - start).total_seconds() * 1000)
            print(f"[WORKER] #{self.request_count}: eval={tokens_evaluated} pred={tokens_predicted} {tok_per_sec:.2f} tok/s, {infer_ms}ms", file=sys.stderr)

            return {
                "clean_text": clean_text,
                "notes": notes,
                "removed_tokens": removed,
                "guardrail_status": "passed" if is_valid else "violations",
                "metrics": {
                    "tokens_per_sec": round(tok_per_sec, 2),
                    "tokens_predicted": tokens_predicted,
                    "tokens_evaluated": tokens_evaluated,
                    "inference_ms": infer_ms,
                    "total_ms": total_ms,
                    "request_number": self.request_count,
                }
            }

        except Exception as e:
            print(f"[WORKER] API error: {e}", file=sys.stderr)
            return {
                "clean_text": cleaned,
                "notes": [f"Error: {str(e)}"],
                "removed_tokens": removed,
                "guardrail_status": "error",
                "metrics": {"status": "error"}
            }

    def stop_server(self):
        """Stop the server process."""
        if self.server_process:
            self.server_process.terminate()
            try:
                self.server_process.wait(timeout=5)
            except:
                self.server_process.kill()
            self.server_process = None
            self.server_ready = False
            print("[WORKER] Server stopped", file=sys.stderr)

    def handle_request(self, request: dict) -> dict:
        cmd = request.get("command")
        if cmd == "ping":
            return {"status": "ready", "server_ready": self.server_ready}
        if cmd == "shutdown":
            self.stop_server()
            return {"status": "shutting_down"}
        if cmd == "metrics":
            return {"load_time_ms": self.load_time_ms, "request_count": self.request_count, "server_ready": self.server_ready}
        if "text" in request:
            return self.correct_text(request["text"])
        return {"error": "Unknown request"}

    def run(self):
        """Main loop."""
        print("[WORKER] Starting native llama.cpp worker...", file=sys.stderr)

        if not self.start_server():
            print("[WORKER] WARNING: Server failed to start", file=sys.stderr)

        print("[WORKER] Ready for requests", file=sys.stderr)

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                response = self.handle_request(request)
                print(json.dumps(response, ensure_ascii=False), flush=True)
                if request.get("command") == "shutdown":
                    break
            except Exception as e:
                print(json.dumps({"error": str(e)}), flush=True)

        self.stop_server()
        print("[WORKER] Exiting", file=sys.stderr)


if __name__ == "__main__":
    worker = LlamaNativeWorker()
    worker.run()
