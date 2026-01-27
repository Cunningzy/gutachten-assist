"""Test different thread counts to find optimal setting"""
import sys
import os
import time

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from llama_cpp import Llama

model_path = os.path.join(os.path.dirname(__file__), "models", "llama-3.1-8b-instruct-q4_k_m.gguf")

print("Testing different thread counts...")
print("=" * 60)

# Test different thread counts
for n_threads in [1, 2, 4, 6, 8]:
    print(f"\nTesting n_threads={n_threads}...")

    llm = Llama(
        model_path=model_path,
        n_ctx=512,
        n_threads=n_threads,
        n_batch=512,
        n_gpu_layers=0,
        use_mmap=True,
        verbose=False,
    )

    # Warm up
    llm("test", max_tokens=1)

    # Test generation speed
    start = time.time()
    response = llm(
        "Hello",
        max_tokens=10,
        temperature=0,
    )
    elapsed = time.time() - start

    usage = response.get('usage', {})
    completion_tokens = usage.get('completion_tokens', 0)
    tok_per_sec = completion_tokens / elapsed if elapsed > 0 else 0

    print(f"  n_threads={n_threads}: {tok_per_sec:.2f} tok/s ({elapsed:.2f}s for {completion_tokens} tokens)")

    del llm

print("\n" + "=" * 60)
print("Done!")
