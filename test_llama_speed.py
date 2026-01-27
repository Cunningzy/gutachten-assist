"""Quick speed test for the Llama model"""
import sys
import os
import time

# Force UTF-8
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from llama_cpp import Llama

model_path = os.path.join(os.path.dirname(__file__), "models", "llama-3.1-8b-instruct-q4_k_m.gguf")

print(f"Loading model: {model_path}")
start = time.time()

llm = Llama(
    model_path=model_path,
    n_ctx=2048,
    n_threads=8,
    n_batch=256,
    n_gpu_layers=0,
    use_mmap=True,
    verbose=True  # Show llama.cpp info including CPU features
)

load_time = time.time() - start
print(f"\nModel loaded in {load_time:.2f}s\n")

# Simple test
test_text = "Der Patient ist 45 Jahre alt. Er hat beschwerden seit 5 Jahren."
system_prompt = """Korrekturleser für deutsche medizinische Texte.
Minimale Korrekturen - nur Rechtschreibung, Grammatik, Zeichensetzung.
Ausgabe: Nur JSON: {"clean_text": "..."}"""

print("Running inference...")
start = time.time()

response = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Text:\n{test_text}"}
    ],
    max_tokens=200,
    temperature=0.1,
    stop=["}\n", "\n}"]
)

infer_time = time.time() - start

usage = response.get('usage', {})
completion_tokens = usage.get('completion_tokens', 0)
prompt_tokens = usage.get('prompt_tokens', 0)
tok_per_sec = completion_tokens / infer_time if infer_time > 0 else 0

print(f"\n=== PERFORMANCE METRICS ===")
print(f"Load time: {load_time:.2f}s")
print(f"Inference time: {infer_time:.2f}s")
print(f"Prompt tokens: {prompt_tokens}")
print(f"Completion tokens: {completion_tokens}")
print(f"Tokens/sec: {tok_per_sec:.2f}")
print(f"===========================\n")

print("Response:", response['choices'][0]['message']['content'])
