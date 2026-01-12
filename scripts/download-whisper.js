/**
 * scripts/download-whisper.js
 * Optimized Whisper Large-v3 download with resume capability
 * Component 2.1B: Real Whisper Integration (OPTIMIZED)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Whisper Large-v3 model configuration
const WHISPER_CONFIG = {
  model: 'large-v3',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
  filename: 'whisper-large-v3.bin',
  expectedSize: 3090000000, // ~3GB (approximate)
  description: 'OpenAI Whisper Large-v3 (German optimized)',
  chunkSize: 1024 * 1024 * 10, // 10MB chunks
  maxRetries: 5,
  retryDelay: 3000, // 3 seconds
  timeout: 60000 // 60 seconds per chunk
};

class OptimizedWhisperDownloader {
  constructor() {
    this.modelsDir = path.join(__dirname, '..', 'models');
    this.modelPath = path.join(this.modelsDir, WHISPER_CONFIG.filename);
    this.tempPath = this.modelPath + '.download';
    this.progressPath = this.modelPath + '.progress';
    this.maxRedirects = 10;
    this.downloadUrl = null; // Store resolved download URL
  }

  /**
   * Ensure models directory exists
   */
  ensureModelsDirectory() {
    if (!fs.existsSync(this.modelsDir)) {
      console.log('📁 Creating models directory...');
      fs.mkdirSync(this.modelsDir, { recursive: true });
      fs.writeFileSync(path.join(this.modelsDir, '.gitkeep'), '');
    }
  }

  /**
   * Check for existing complete model
   */
  async checkExistingModel() {
    if (!fs.existsSync(this.modelPath)) {
      return false;
    }

    console.log('🔍 Checking existing model...');
    const stats = fs.statSync(this.modelPath);
    
    if (stats.size < 1024 * 1024 * 1024) { // Less than 1GB
      console.log('⚠️ Model file too small. Re-downloading...');
      return false;
    }

    console.log('✅ Valid model found. Skipping download.');
    console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
    return true;
  }

  /**
   * Check for resumable download
   */
  checkResumableDownload() {
    let resumeFrom = 0;
    
    if (fs.existsSync(this.tempPath)) {
      const stats = fs.statSync(this.tempPath);
      resumeFrom = stats.size;
      console.log(`🔄 Resuming download from ${(resumeFrom / 1024 / 1024).toFixed(1)}MB`);
    }
    
    return resumeFrom;
  }

  /**
   * Resolve download URL through redirects
   */
  async resolveDownloadUrl(url, redirectCount = 0) {
    if (redirectCount >= this.maxRedirects) {
      throw new Error('Too many redirects');
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      console.log(`🔗 Resolving URL (redirect ${redirectCount})`);

      const request = client.request(url, { method: 'HEAD' }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return this.resolveDownloadUrl(response.headers.location, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode === 200) {
          console.log('✅ Download URL resolved');
          const contentLength = parseInt(response.headers['content-length'], 10);
          console.log(`📊 File size: ${(contentLength / 1024 / 1024).toFixed(1)}MB`);
          resolve({ url, contentLength });
          return;
        }

        reject(new Error(`Failed to resolve URL: ${response.statusCode}`));
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('URL resolution timeout'));
      });
      
      request.end();
    });
  }

  /**
   * Download a chunk with retry logic
   */
  async downloadChunk(url, start, end, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        headers: {
          'Range': `bytes=${start}-${end}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const request = client.get(url, options, (response) => {
        if (response.statusCode === 206 || response.statusCode === 200) {
          const chunks = [];
          
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const data = Buffer.concat(chunks);
            resolve(data);
          });

          response.on('error', (error) => {
            reject(error);
          });
        } else {
          reject(new Error(`Chunk download failed: ${response.statusCode}`));
        }
      });

      request.on('error', (error) => {
        if (retryCount < WHISPER_CONFIG.maxRetries) {
          console.log(`\n⚠️ Chunk failed, retrying (${retryCount + 1}/${WHISPER_CONFIG.maxRetries})...`);
          setTimeout(() => {
            this.downloadChunk(url, start, end, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, WHISPER_CONFIG.retryDelay);
        } else {
          reject(error);
        }
      });

      request.setTimeout(WHISPER_CONFIG.timeout, () => {
        request.destroy();
        if (retryCount < WHISPER_CONFIG.maxRetries) {
          console.log(`\n⏱️ Chunk timeout, retrying (${retryCount + 1}/${WHISPER_CONFIG.maxRetries})...`);
          setTimeout(() => {
            this.downloadChunk(url, start, end, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, WHISPER_CONFIG.retryDelay);
        } else {
          reject(new Error('Chunk download timeout'));
        }
      });

      request.end();
    });
  }

  /**
   * Download with chunked resume capability
   */
  async downloadWithResume() {
    console.log('🚀 Starting optimized chunked download...');

    // Resolve the actual download URL
    const { url, contentLength } = await this.resolveDownloadUrl(WHISPER_CONFIG.url);
    this.downloadUrl = url;

    // Check for resumable download
    const resumeFrom = this.checkResumableDownload();
    const totalSize = contentLength || WHISPER_CONFIG.expectedSize;

    // Open file for appending
    const writeStream = fs.createWriteStream(this.tempPath, { 
      flags: resumeFrom > 0 ? 'a' : 'w' 
    });

    let downloaded = resumeFrom;
    const chunkSize = WHISPER_CONFIG.chunkSize;

    try {
      while (downloaded < totalSize) {
        const start = downloaded;
        const end = Math.min(downloaded + chunkSize - 1, totalSize - 1);

        console.log(`\r📥 Downloading chunk: ${(start / 1024 / 1024).toFixed(1)}MB - ${(end / 1024 / 1024).toFixed(1)}MB`);

        // Download chunk with retry
        const chunkData = await this.downloadChunk(url, start, end);
        
        // Write chunk to file
        writeStream.write(chunkData);
        downloaded += chunkData.length;

        // Update progress
        this.showProgress(downloaded, totalSize);

        // Small delay to prevent overwhelming the server
        if (downloaded < totalSize) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      writeStream.end();
      
      // Move completed file
      fs.renameSync(this.tempPath, this.modelPath);
      
      // Cleanup progress tracking
      if (fs.existsSync(this.progressPath)) {
        fs.unlinkSync(this.progressPath);
      }

      console.log('\n✅ Download completed successfully!');
      return downloaded;

    } catch (error) {
      writeStream.destroy();
      throw error;
    }
  }

  /**
   * Show download progress
   */
  showProgress(downloaded, total) {
    if (!total || total === 0) {
      process.stdout.write(`\r📥 Downloaded: ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
      return;
    }

    const percentage = ((downloaded / total) * 100).toFixed(1);
    const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
    const totalMB = (total / 1024 / 1024).toFixed(1);
    
    // Create progress bar
    const barLength = 30;
    const filledLength = Math.floor((downloaded / total) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    process.stdout.write(`\r📥 [${bar}] ${percentage}% (${downloadedMB}/${totalMB} MB)`);
  }

  /**
   * Create model info file
   */
  createModelInfo() {
    const stats = fs.statSync(this.modelPath);
    
    const modelInfo = {
      ...WHISPER_CONFIG,
      downloadDate: new Date().toISOString(),
      filePath: this.modelPath,
      actualSize: stats.size,
      downloadUrl: this.downloadUrl,
      status: 'ready'
    };

    const infoPath = path.join(this.modelsDir, 'model-info.json');
    fs.writeFileSync(infoPath, JSON.stringify(modelInfo, null, 2));
    console.log('📋 Model info created');
  }

  /**
   * Verify downloaded model
   */
  async verifyModel() {
    console.log('🔍 Verifying model...');
    
    if (!fs.existsSync(this.modelPath)) {
      throw new Error('Model file not found');
    }

    const stats = fs.statSync(this.modelPath);
    console.log(`📊 Final size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
    
    if (stats.size < 1024 * 1024 * 1024) {
      throw new Error('Model file too small');
    }

    console.log('✅ Model verified');
    return true;
  }

  /**
   * Main download process
   */
  async run() {
    try {
      console.log('🎤 Whisper Large-v3 Model Setup (Optimized)');
      console.log('==========================================');
      
      this.ensureModelsDirectory();
      
      // Check existing model
      if (await this.checkExistingModel()) {
        this.createModelInfo();
        return;
      }

      // Download with resume
      await this.downloadWithResume();
      
      // Verify
      await this.verifyModel();
      
      // Create info
      this.createModelInfo();
      
      console.log('\n🎉 Whisper model ready for Component 2.1B!');
      console.log('🚀 Real speech recognition now available');
      
    } catch (error) {
      console.error('\n❌ Download failed:', error.message);
      
      console.log('\n💡 The download can be resumed by running the command again');
      console.log('   Your progress has been saved automatically');
      
      process.exit(1);
    }
  }
}

// Always run when executed
const downloader = new OptimizedWhisperDownloader();
downloader.run();

export default OptimizedWhisperDownloader;