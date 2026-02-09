"""
Qwen Structurer - LLM component for transcript → structured JSON

Uses Qwen2.5-7B-Instruct via llama.cpp server to:
1. Clean text (spelling, grammar, punctuation)
2. Assign content to template slots
3. Mark unclear parts with {unclear:...}
4. Convert dictation tokens to structure

Input: Raw Whisper transcript
Output: content.json with slots, unclear_spans, missing_slots
"""

import sys
import os
import json
import re
import urllib.request
import urllib.error
import subprocess
import time
from datetime import datetime

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
    "server_host": "127.0.0.1",
    "server_port": 8766,  # Different port than old worker
    "n_ctx": 4096,        # Larger context for full Gutachten
    "n_threads": 8,
    "model_path": os.path.join(os.path.dirname(__file__), "models", "qwen2.5-7b-instruct-q4_k_m.gguf"),
    "server_path": os.path.join(os.path.dirname(__file__), "llama-cpp-bin", "llama-server.exe"),
    "temperature": 0.1,   # Low but not zero for slight flexibility
    "max_tokens": 2000,
}

# =============================================================================
# SYSTEM PROMPT
# =============================================================================

SYSTEM_PROMPT_TEMPLATE = """Du bist ein Strukturierer für deutsche medizinische Gutachten-Diktate.

AUFGABE:
1. Korrigiere Rechtschreibung, Grammatik, Zeichensetzung (minimale Änderungen)
2. Wandle Diktierbefehle um: "Punkt"→".", "Komma"→",", "Absatz"→neuer Absatz
3. Ordne den Text den passenden Abschnitten zu
4. Markiere unklare Stellen mit {{unclear:text}}

VERFÜGBARE ABSCHNITTE (slot_ids):
{slot_list}

ABSOLUTE REGELN:
1. Verwende NUR Inhalte aus dem Input - NIEMALS eigene medizinische Fakten erfinden
2. Wenn unsicher, behalte Original-Wortlaut bei
3. Wenn ein Abschnitt nicht im Text vorkommt, füge ihn zu missing_slots hinzu
4. Markiere unverständliche/unklare Stellen mit {{unclear:...}}

AUSGABE NUR als gültiges JSON:
{{
  "slots": {{
    "slot_id_1": ["Absatz 1", "Absatz 2"],
    "slot_id_2": ["..."]
  }},
  "unclear_spans": [
    {{"slot_id": "...", "text": "...", "reason": "garbled/ambiguous/incomplete"}}
  ],
  "missing_slots": ["slot_id_3"]
}}"""

# Path to template spec (loaded automatically)
TEMPLATE_SPEC_PATH = os.path.join(os.path.dirname(__file__), "template_output", "template_spec.json")

# =============================================================================
# DICTATION CLEANUP (Regex preprocessing)
# =============================================================================

DICTATION_PATTERNS = [
    (r'\bpunkt\b', '.'),
    (r'\bkomma\b', ','),
    (r'\bdoppelpunkt\b', ':'),
    (r'\bsemikolon\b', ';'),
    (r'\bfragezeichen\b', '?'),
    (r'\bausrufezeichen\b', '!'),
    (r'\bbindestrich\b', '-'),
    (r'\bschrägstrich\b', '/'),
    (r'\bin klammern\b', '('),
    (r'\bklammer auf\b', '('),
    (r'\bklammern? zu\b', ')'),
    (r'\banführungszeichen auf\b', '"'),
    (r'\banführungszeichen zu\b', '"'),
    (r'\bneue zeile\b', '\n'),
    (r'\bneuer absatz\b', '\n\n'),
    (r'\babsatz\b', '\n\n'),
]


def preprocess_dictation(text: str) -> str:
    """Regex-based dictation command conversion (deterministic)."""
    result = text
    for pattern, replacement in DICTATION_PATTERNS:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    # Clean up spacing around punctuation
    result = re.sub(r'\s+([.,;:!?])', r'\1', result)
    result = re.sub(r'([.,;:!?])(\w)', r'\1 \2', result)
    result = re.sub(r' +', ' ', result)
    result = re.sub(r'\n\s*\n\s*\n+', '\n\n', result)  # Max 2 newlines

    return result.strip()


# =============================================================================
# QWEN STRUCTURER CLASS
# =============================================================================

class QwenStructurer:
    def __init__(self):
        self.server_process = None
        self.server_ready = False
        self.base_url = f"http://{CONFIG['server_host']}:{CONFIG['server_port']}"
        self.template_spec = self._load_template_spec()
        self.slot_names = self._get_slot_names(self.template_spec)
        self.system_prompt = self._build_system_prompt()

    def _load_template_spec(self) -> dict:
        """Load template spec from file if available."""
        if os.path.exists(TEMPLATE_SPEC_PATH):
            try:
                with open(TEMPLATE_SPEC_PATH, 'r', encoding='utf-8') as f:
                    spec = json.load(f)
                    print(f"[STRUCTURER] Loaded template spec with {len(spec.get('anchors', []))} anchors", file=sys.stderr)
                    return spec
            except Exception as e:
                print(f"[STRUCTURER] Failed to load template spec: {e}", file=sys.stderr)
        return None

    def _build_system_prompt(self) -> str:
        """Build system prompt with slot names from template."""
        slot_list = "\n".join(f"- {slot}" for slot in self.slot_names)
        return SYSTEM_PROMPT_TEMPLATE.format(slot_list=slot_list)

    def start_server(self) -> bool:
        """Start llama-server with Qwen model."""
        if self.server_process and self.server_process.poll() is None:
            return True

        if not os.path.exists(CONFIG["server_path"]):
            print(f"[STRUCTURER] ERROR: Server not found at {CONFIG['server_path']}", file=sys.stderr)
            return False
        if not os.path.exists(CONFIG["model_path"]):
            print(f"[STRUCTURER] ERROR: Model not found at {CONFIG['model_path']}", file=sys.stderr)
            return False

        print(f"[STRUCTURER] Starting Qwen server on {self.base_url}...", file=sys.stderr)
        start = datetime.now()

        cmd = [
            CONFIG["server_path"],
            "-m", CONFIG["model_path"],
            "--host", CONFIG["server_host"],
            "--port", str(CONFIG["server_port"]),
            "-c", str(CONFIG["n_ctx"]),
            "-t", str(CONFIG["n_threads"]),
            "--log-disable",
        ]

        try:
            self.server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )

            # Wait for server ready
            for i in range(90):  # 90 second timeout
                time.sleep(1)
                if self._check_health():
                    self.server_ready = True
                    elapsed = (datetime.now() - start).total_seconds()
                    print(f"[STRUCTURER] Server ready in {elapsed:.1f}s", file=sys.stderr)
                    return True
                if self.server_process.poll() is not None:
                    print(f"[STRUCTURER] Server exited unexpectedly", file=sys.stderr)
                    return False

            print(f"[STRUCTURER] Server startup timeout", file=sys.stderr)
            return False

        except Exception as e:
            print(f"[STRUCTURER] Failed to start server: {e}", file=sys.stderr)
            return False

    def _check_health(self) -> bool:
        try:
            req = urllib.request.Request(f"{self.base_url}/health")
            with urllib.request.urlopen(req, timeout=2) as resp:
                return resp.status == 200
        except:
            return False

    def _api_call(self, data: dict) -> dict:
        url = f"{self.base_url}/completion"
        body = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode('utf-8'))

    def structure_transcript(self, transcript: str, template_spec: dict = None) -> dict:
        """
        Main function: Convert transcript to structured JSON.

        Args:
            transcript: Raw Whisper transcript
            template_spec: Optional template spec for slot names (uses loaded spec if not provided)

        Returns:
            content.json structure
        """
        start = datetime.now()

        # Step 1: Regex preprocessing
        cleaned = preprocess_dictation(transcript)

        if not self.server_ready:
            return self._fallback_structure(cleaned)

        # Step 2: Build prompt using loaded template spec
        prompt = f"""<|im_start|>system
{self.system_prompt}
<|im_end|>
<|im_start|>user
Strukturiere diesen Gutachten-Text:

{cleaned}
<|im_end|>
<|im_start|>assistant
"""

        try:
            response = self._api_call({
                "prompt": prompt,
                "n_predict": CONFIG["max_tokens"],
                "temperature": CONFIG["temperature"],
                "stop": ["<|im_end|>", "<|im_start|>"],
                "cache_prompt": True,
            })

            content = response.get("content", "").strip()
            elapsed = (datetime.now() - start).total_seconds()

            tokens = response.get("tokens_predicted", 0)
            print(f"[STRUCTURER] Generated {tokens} tokens in {elapsed:.1f}s", file=sys.stderr)

            # Parse JSON from response
            result = self._parse_response(content, self.slot_names)
            result["metrics"] = {
                "tokens_predicted": tokens,
                "processing_time_s": elapsed,
            }

            return result

        except Exception as e:
            print(f"[STRUCTURER] API error: {e}", file=sys.stderr)
            return self._fallback_structure(cleaned)

    def _get_slot_names(self, template_spec: dict = None) -> list:
        """Extract slot names from template spec or use defaults."""
        spec = template_spec or self.template_spec if hasattr(self, 'template_spec') else None

        if spec and "skeleton" in spec:
            slots = []
            for item in spec["skeleton"]:
                if item.get("type") == "slot":
                    slots.append(item.get("slot_id", ""))
            if slots:
                return slots

        # Default slots (fallback if no template)
        return [
            "gutachterliche_fragestellung_body",
            "1._anamnese_body",
            "familienanamnese_body",
            "eigenanamnese_body",
            "aktuelle_beschwerden_body",
            "2._untersuchungsbefunde_body",
            "3._diagnosen_body",
            "4._epikrise_body",
            "5._sozialmedizinische_leistungsbeurteilung_body",
        ]

    def _parse_response(self, content: str, slot_names: list) -> dict:
        """Parse LLM response into structured JSON."""
        # Try direct JSON parse
        try:
            # Find JSON in response
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                data = json.loads(json_match.group())
                return self._validate_structure(data, slot_names)
        except json.JSONDecodeError:
            pass

        # Fallback: treat entire response as single slot
        print("[STRUCTURER] JSON parse failed, using fallback", file=sys.stderr)
        return {
            "slots": {"raw_content": [content]},
            "unclear_spans": [],
            "missing_slots": slot_names,
            "parse_error": True,
        }

    def _validate_structure(self, data: dict, slot_names: list) -> dict:
        """Validate and clean up the structured data."""
        result = {
            "slots": {},
            "unclear_spans": [],
            "missing_slots": [],
        }

        # Copy slots
        if "slots" in data:
            for slot_id, content in data["slots"].items():
                if isinstance(content, list):
                    result["slots"][slot_id] = content
                elif isinstance(content, str):
                    result["slots"][slot_id] = [content]

        # Find missing slots
        present_slots = set(result["slots"].keys())
        for slot in slot_names:
            if slot not in present_slots:
                result["missing_slots"].append(slot)

        # Copy unclear spans
        if "unclear_spans" in data:
            result["unclear_spans"] = data["unclear_spans"]

        # Extract {unclear:...} from slot content
        for slot_id, paragraphs in result["slots"].items():
            for para in paragraphs:
                matches = re.findall(r'\{unclear:([^}]+)\}', para)
                for match in matches:
                    result["unclear_spans"].append({
                        "slot_id": slot_id,
                        "text": match,
                        "reason": "marked_by_llm",
                    })

        return result

    def _fallback_structure(self, text: str) -> dict:
        """Fallback when LLM not available."""
        return {
            "slots": {"raw_content": [text]},
            "unclear_spans": [],
            "missing_slots": [],
            "fallback": True,
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
            print("[STRUCTURER] Server stopped", file=sys.stderr)

    def handle_request(self, request: dict) -> dict:
        """Handle a single request from the worker protocol."""
        cmd = request.get("command")

        if cmd == "ping":
            return {"status": "ready", "server_ready": self.server_ready}
        if cmd == "shutdown":
            self.stop_server()
            return {"status": "shutting_down"}
        if cmd == "metrics":
            return {"server_ready": self.server_ready}
        if "text" in request:
            return self.structure_transcript(request["text"])
        return {"error": "Unknown request"}

    def run(self):
        """Main worker loop - reads from stdin, writes to stdout."""
        print("[STRUCTURER] Starting Qwen structurer worker...", file=sys.stderr)

        if not self.start_server():
            print("[STRUCTURER] WARNING: Server failed to start", file=sys.stderr)

        print("[STRUCTURER] Ready for requests", file=sys.stderr)

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
        print("[STRUCTURER] Exiting", file=sys.stderr)


# =============================================================================
# CLI
# =============================================================================

def main():
    """CLI interface - supports both worker mode and direct testing."""
    # Worker mode (no args) - run as stdin/stdout worker
    if len(sys.argv) == 1:
        structurer = QwenStructurer()
        structurer.run()
        return

    # Test mode or file mode
    structurer = QwenStructurer()

    try:
        if sys.argv[1] == "--test":
            test_text = """
            Fragestellung punkt Die Begutachtung erfolgt auf Veranlassung der DRV Bund punkt

            Eigenanamnese punkt Der Patient berichtet komma dass er seit 2019 unter Rueckenschmerzen leidet punkt
            Eine Operation wurde im Jahr 2020 durchgefuehrt punkt

            Aktuelle Beschwerden punkt Aktuell klagt der Patient ueber Schmerzen im Bereich des unteren Rueckens punkt
            Die Schmerzen strahlen in das linke Bein aus punkt
            """
            transcript = test_text
        else:
            # Read from file
            with open(sys.argv[1], 'r', encoding='utf-8') as f:
                transcript = f.read()

        if not structurer.start_server():
            print("ERROR: Could not start server", file=sys.stderr)
            sys.exit(1)

        result = structurer.structure_transcript(transcript)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    finally:
        structurer.stop_server()


if __name__ == "__main__":
    main()
