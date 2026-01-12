@echo off
set CMAKE_ARGS=-DGGML_CUDA=on
set FORCE_CMAKE=1
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
llama_venv\Scripts\python.exe -m pip install llama-cpp-python --force-reinstall --no-cache-dir
