"""Test CPU usage during Llama inference"""
import sys
import os
import time
import threading

# Force UTF-8
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# CPU monitoring in background
cpu_samples = []
stop_monitoring = False

def monitor_cpu():
    """Monitor CPU usage in background thread"""
    try:
        import psutil
        while not stop_monitoring:
            cpu_samples.append(psutil.cpu_percent(interval=0.5))
    except ImportError:
        print("psutil not installed - can't monitor CPU", file=sys.stderr)

# Start CPU monitoring
try:
    import psutil
    monitor_thread = threading.Thread(target=monitor_cpu)
    monitor_thread.start()
    has_psutil = True
except ImportError:
    has_psutil = False
    print("Installing psutil for CPU monitoring...")
    os.system(f'"{sys.executable}" -m pip install psutil -q')
    import psutil
    monitor_thread = threading.Thread(target=monitor_cpu)
    monitor_thread.start()
    has_psutil = True

print("=" * 60)
print("LLAMA.CPP CPU DIAGNOSTIC TEST")
print("=" * 60)

from llama_cpp import Llama

model_path = os.path.join(os.path.dirname(__file__), "models", "llama-3.1-8b-instruct-q4_k_m.gguf")

print(f"\nLoading model with VERBOSE=True to see CPU features...")
print(f"Model: {model_path}\n")

load_start = time.time()

# Load with verbose to see CPU feature detection
llm = Llama(
    model_path=model_path,
    n_ctx=512,        # Minimal context for speed test
    n_threads=8,
    n_batch=512,
    n_gpu_layers=0,
    use_mmap=True,
    verbose=True,     # VERBOSE to see CPU info
)

load_time = time.time() - load_start
print(f"\n{'=' * 60}")
print(f"Model loaded in {load_time:.2f}s")
print(f"{'=' * 60}\n")

# Simple inference test
print("Running inference test...")
print("Watch your Task Manager - CPU should spike to ~100%\n")

test_text = "Der Patient hat beschwerden."

infer_start = time.time()

response = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": "Fix spelling. Output only JSON: {\"text\": \"...\"}"},
        {"role": "user", "content": test_text}
    ],
    max_tokens=50,
    temperature=0,
)

infer_time = time.time() - infer_start

# Stop CPU monitoring
stop_monitoring = True
if has_psutil:
    monitor_thread.join(timeout=2)

# Results
usage = response.get('usage', {})
prompt_tokens = usage.get('prompt_tokens', 0)
completion_tokens = usage.get('completion_tokens', 0)
tok_per_sec = completion_tokens / infer_time if infer_time > 0 else 0

print(f"\n{'=' * 60}")
print("RESULTS")
print(f"{'=' * 60}")
print(f"Load time:         {load_time:.2f}s")
print(f"Inference time:    {infer_time:.2f}s")
print(f"Prompt tokens:     {prompt_tokens}")
print(f"Completion tokens: {completion_tokens}")
print(f"Tokens/sec:        {tok_per_sec:.2f}")

if cpu_samples:
    avg_cpu = sum(cpu_samples) / len(cpu_samples)
    max_cpu = max(cpu_samples)
    print(f"\nCPU Usage:")
    print(f"  Average: {avg_cpu:.1f}%")
    print(f"  Maximum: {max_cpu:.1f}%")
    print(f"  Samples: {len(cpu_samples)}")

    if max_cpu < 50:
        print(f"\n⚠️  WARNING: CPU usage is LOW ({max_cpu:.1f}%)")
        print("   This suggests threading or acceleration issues!")
    elif max_cpu > 90:
        print(f"\n✓ CPU usage looks NORMAL ({max_cpu:.1f}%)")

print(f"\nResponse: {response['choices'][0]['message']['content'][:100]}")
print(f"{'=' * 60}")
