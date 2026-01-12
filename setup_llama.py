"""
Llama 3.1 8B Model Setup Script
Downloads and configures Llama 3.1 8B Instruct model for Gutachten Assistant

This script:
1. Creates models directory
2. Downloads Llama 3.1 8B Instruct (Q4_K_M quantized version)
3. Verifies model integrity
4. Tests GPU/CPU inference

Model Details:
- Model: Llama 3.1 8B Instruct (GGUF format)
- Quantization: Q4_K_M (4-bit quantized for efficient inference)
- Size: ~4.5 GB
- Source: Hugging Face (TheBloke/Llama-3.1-8B-Instruct-GGUF)

Usage:
    python setup_llama.py
"""

import os
import sys
import urllib.request
from pathlib import Path

def create_models_directory():
    """Create models directory if it doesn't exist"""
    models_dir = Path(__file__).parent / "models"
    models_dir.mkdir(exist_ok=True)
    print(f"[OK] Models directory: {models_dir}")
    return models_dir


def download_llama_model(models_dir):
    """
    Download Llama 3.1 8B Instruct Q4_K_M model from Hugging Face

    Using TheBloke's quantized GGUF version:
    - Optimized for CPU and GPU inference
    - 4-bit quantization (Q4_K_M) for good quality/size balance
    - ~4.5 GB download size
    """

    model_filename = "llama-3.1-8b-instruct-q4_k_m.gguf"
    model_path = models_dir / model_filename

    # Check if model already exists
    if model_path.exists():
        file_size_mb = model_path.stat().st_size / (1024 * 1024)
        print(f"[OK] Model already exists: {model_path}")
        print(f"   Size: {file_size_mb:.2f} MB")
        return model_path

    print(f" Downloading Llama 3.1 8B Instruct model...")
    print(f"   This will download ~4.5 GB - please be patient!")

    # Hugging Face download URL (TheBloke's GGUF models)
    model_url = "https://huggingface.co/TheBloke/Llama-3.1-8B-Instruct-GGUF/resolve/main/llama-3.1-8b-instruct-q4_k_m.gguf"

    # Note: For production, we should use huggingface_hub library for better download management
    # For now, direct download with progress tracking

    print(f"   Source: {model_url}")
    print(f"   Destination: {model_path}")
    print()
    print("   NOTE: If download is too slow, you can manually download from:")
    print(f"   {model_url}")
    print(f"   And place it in: {models_dir}")
    print()

    try:
        # Download with progress tracking
        def download_progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            percent = min(100, downloaded * 100 / total_size)
            downloaded_mb = downloaded / (1024 * 1024)
            total_mb = total_size / (1024 * 1024)

            # Print progress bar
            bar_length = 50
            filled_length = int(bar_length * downloaded / total_size)
            bar = '█' * filled_length + '-' * (bar_length - filled_length)

            print(f'\r   [{bar}] {percent:.1f}% ({downloaded_mb:.1f}/{total_mb:.1f} MB)', end='')

            if downloaded >= total_size:
                print()  # New line when complete

        urllib.request.urlretrieve(model_url, model_path, reporthook=download_progress)

        print(f"\n[OK] Model downloaded successfully!")
        print(f"   Location: {model_path}")

        return model_path

    except Exception as e:
        print(f"\n[FAIL] Download failed: {e}")
        print()
        print("ALTERNATIVE DOWNLOAD METHOD:")
        print("1. Visit: https://huggingface.co/TheBloke/Llama-3.1-8B-Instruct-GGUF")
        print(f"2. Download: {model_filename}")
        print(f"3. Place in: {models_dir}")

        return None


def verify_model(model_path):
    """Verify that the model file is valid"""
    if not model_path or not model_path.exists():
        print("[FAIL] Model file not found")
        return False

    file_size = model_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"\n Verifying model...")
    print(f"   File size: {file_size_mb:.2f} MB")

    # Basic size check (Q4_K_M should be ~4-5 GB)
    expected_min_size = 4000  # MB
    expected_max_size = 6000  # MB

    if file_size_mb < expected_min_size:
        print(f"[FAIL] File size too small (expected {expected_min_size}-{expected_max_size} MB)")
        print("   Download may be incomplete. Please delete and try again.")
        return False

    if file_size_mb > expected_max_size:
        print(f"[WARN] File size larger than expected (expected {expected_min_size}-{expected_max_size} MB)")
        print("   This may be a different quantization. Proceeding anyway...")

    # Check file extension
    if model_path.suffix != '.gguf':
        print(f"[WARN] Unexpected file extension: {model_path.suffix} (expected .gguf)")
        return False

    print("[OK] Model file appears valid")
    return True


def test_llama_import():
    """Test if llama-cpp-python is installed"""
    print("\n Checking llama-cpp-python installation...")

    try:
        import llama_cpp
        print(f"[OK] llama-cpp-python installed (version: {llama_cpp.__version__})")
        return True
    except ImportError:
        print("[FAIL] llama-cpp-python not installed")
        print()
        print("INSTALLATION INSTRUCTIONS:")
        print("1. For GPU support (NVIDIA):")
        print("   pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121")
        print()
        print("2. For CPU only:")
        print("   pip install llama-cpp-python")
        print()
        return False


def test_model_loading(model_path):
    """Test loading the model with llama-cpp-python"""
    print("\n Testing model loading...")

    try:
        from llama_cpp import Llama

        print("   Loading model (this may take a moment)...")
        llm = Llama(
            model_path=str(model_path),
            n_ctx=512,  # Small context for quick test
            n_threads=4,
            n_gpu_layers=-1,  # Use GPU if available
            verbose=False
        )

        print("[OK] Model loaded successfully!")

        # Quick test generation
        print("\n Testing text generation...")
        response = llm(
            "Test: Wie heißt du?",
            max_tokens=20,
            temperature=0.7,
            echo=False
        )

        generated = response['choices'][0]['text'].strip()
        print(f"   Test output: {generated[:100]}...")
        print("[OK] Text generation working!")

        return True

    except ImportError:
        print("[FAIL] llama-cpp-python not available (run pip install first)")
        return False
    except Exception as e:
        print(f"[FAIL] Model loading failed: {e}")
        return False


def main():
    """Main setup workflow"""
    print("=" * 70)
    print("Llama 3.1 8B Model Setup for Gutachten Assistant")
    print("Component 2.2C: German Grammar Correction")
    print("=" * 70)
    print()

    # Step 1: Create models directory
    models_dir = create_models_directory()

    # Step 2: Download model
    print()
    model_path = download_llama_model(models_dir)

    if not model_path:
        print("\n[FAIL] Setup incomplete - model not downloaded")
        sys.exit(1)

    # Step 3: Verify model
    if not verify_model(model_path):
        print("\n[FAIL] Setup incomplete - model verification failed")
        sys.exit(1)

    # Step 4: Check llama-cpp-python installation
    if not test_llama_import():
        print("\n[WARN] Setup incomplete - llama-cpp-python not installed")
        print("   Model downloaded, but you need to install llama-cpp-python to use it")
        sys.exit(1)

    # Step 5: Test model loading
    if not test_model_loading(model_path):
        print("\n[WARN] Model downloaded but loading test failed")
        print("   You may need to reinstall llama-cpp-python with GPU support")
        sys.exit(1)

    # Success!
    print()
    print("=" * 70)
    print("[OK] Llama 3.1 8B Setup Complete!")
    print("=" * 70)
    print()
    print("You can now use grammar correction with:")
    print(f"  python llama_grammar_correct.py <text_file>")
    print()
    print("Model location:")
    print(f"  {model_path}")
    print()
    print("Next steps:")
    print("  1. Test grammar correction: python llama_grammar_correct.py test.txt")
    print("  2. Use in Gutachten Assistant UI")
    print()


if __name__ == "__main__":
    main()
