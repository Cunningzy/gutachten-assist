# 🔧 Whisper WebAssembly Setup Guide

## Prerequisites Installation

### 1. Install Emscripten (WebAssembly Compiler)

**Windows (Recommended method):**
```bash
# Download Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# Install and activate latest Emscripten
./emsdk install latest
./emsdk activate latest

# Add to PATH (run this every time, or add to your shell profile)
source ./emsdk_env.sh
```

**Alternative - Docker method (if you have Docker):**
```bash
# Use pre-built Emscripten container
docker pull emscripten/emsdk:latest
```

### 2. Verify Installation
```bash
emcc --version  # Should show Emscripten version
```

## Whisper.cpp WebAssembly Build

### 1. Clone whisper.cpp
```bash
# In your project root
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
```

### 2. Build WebAssembly Version
```bash
# Build for WebAssembly
make clean
emmake make -j

# Or use the specific WebAssembly build target
make libwhisper.js
```

### 3. Copy WASM Files to Project
```bash
# Copy built files to your public directory
cp whisper.js ../public/
cp whisper.wasm ../public/
cp whisper.worker.js ../public/ # if generated
```

## Alternative: Use Pre-built Whisper.js

If building from source is complex, you can use the pre-built whisper.js:

```bash
# Download pre-built whisper.js
curl -L -o public/whisper.js https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper.js
curl -L -o public/whisper.wasm https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper.wasm
```

## Next Steps

After successful build:
1. ✅ Step 1: WebAssembly compilation completed
2. 🔄 Step 2: Download Whisper model
3. 🔄 Step 3: Integrate with Worker

---

**Note:** Building WebAssembly can take 15-30 minutes depending on your system.