@echo off
REM Add CUDA to PATH so DLLs can be found
set PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin;%PATH%

REM Run the grammar correction script
llama_venv_gpu\Scripts\python.exe llama_grammar_correct.py %*
