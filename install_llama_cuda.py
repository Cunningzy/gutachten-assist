"""
Install llama-cpp-python with CUDA support
Sets environment variables before running pip
"""
import os
import subprocess
import sys

# Set environment variables for CUDA build
os.environ['CMAKE_ARGS'] = '-DGGML_CUDA=on'
os.environ['FORCE_CMAKE'] = '1'
os.environ['CUDA_PATH'] = r'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0'

print("Environment variables set:")
print(f"CMAKE_ARGS={os.environ['CMAKE_ARGS']}")
print(f"FORCE_CMAKE={os.environ['FORCE_CMAKE']}")
print(f"CUDA_PATH={os.environ['CUDA_PATH']}")
print()
print("Starting pip install with CUDA support...")
print("This will take 10-20 minutes to compile...")
print()

# Run pip install
result = subprocess.run(
    [sys.executable, '-m', 'pip', 'install', 'llama-cpp-python', '--force-reinstall', '--no-cache-dir', '-v'],
    env=os.environ.copy()
)

sys.exit(result.returncode)
