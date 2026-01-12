"""
Test script to verify GPU acceleration for Llama model
"""

import sys
import os

def test_gpu_acceleration():
    """Test if llama-cpp-python can use GPU"""

    print("=" * 60)
    print("Testing GPU Acceleration for Llama")
    print("=" * 60)

    # Test 1: Import llama_cpp
    try:
        from llama_cpp import Llama
        print("[OK] llama_cpp imported successfully")
    except ImportError as e:
        print(f"[FAIL] Failed to import llama_cpp: {e}")
        return False

    # Test 2: Check model file exists
    model_path = os.path.join(
        os.path.dirname(__file__),
        "models",
        "llama-3.2-3b-instruct-q4_k_m.gguf"
    )

    if not os.path.exists(model_path):
        print(f"[FAIL] Model not found at: {model_path}")
        return False

    print(f"[OK] Model found at: {model_path}")
    print(f"   Size: {os.path.getsize(model_path) / (1024**3):.2f} GB")

    # Test 3: Try loading model with GPU layers
    print("\n" + "=" * 60)
    print("Attempting to load model with GPU acceleration...")
    print("=" * 60)

    try:
        # Try to load with GPU layers
        llm = Llama(
            model_path=model_path,
            n_ctx=2048,         # Smaller context for testing
            n_threads=4,
            n_gpu_layers=35,    # GTX 1650 can handle ~35 layers for 3B model
            verbose=True
        )

        print("\n[OK] MODEL LOADED WITH GPU ACCELERATION!")
        print(f"   GPU layers: 35")

        # Test 4: Quick inference test
        print("\n" + "=" * 60)
        print("Testing inference speed...")
        print("=" * 60)

        prompt = "Korrigiere: der patient hat schmerzen"

        import time
        start = time.time()

        response = llm(
            prompt,
            max_tokens=50,
            temperature=0.1,
            echo=False
        )

        elapsed = time.time() - start

        print(f"[OK] Inference completed in {elapsed:.2f} seconds")
        print(f"   Prompt: {prompt}")
        print(f"   Response: {response['choices'][0]['text'][:100]}...")

        return True

    except Exception as e:
        print(f"\n[FAIL] Failed to load model with GPU: {e}")
        print("\nTrying CPU-only fallback...")

        try:
            llm = Llama(
                model_path=model_path,
                n_ctx=2048,
                n_threads=4,
                n_gpu_layers=0,  # CPU only
                verbose=False
            )
            print("[WARN] Model loaded but GPU acceleration NOT working")
            print("   Falling back to CPU-only mode")
            return False
        except Exception as e2:
            print(f"[FAIL] Even CPU loading failed: {e2}")
            return False


if __name__ == "__main__":
    print("\n")
    success = test_gpu_acceleration()
    print("\n" + "=" * 60)
    if success:
        print("[SUCCESS] GPU ACCELERATION IS WORKING!")
        print("   Your GTX 1650 is accelerating Llama 3.2 3B")
    else:
        print("[FAIL] GPU ACCELERATION NOT WORKING")
        print("   Falling back to CPU-only mode")
    print("=" * 60)
    print("\n")

    sys.exit(0 if success else 1)
