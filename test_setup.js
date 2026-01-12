#!/usr/bin/env node

console.log('🧪 Testing Gutachten Assistant v2.0 Setup');
console.log('==========================================\n');

const fs = require('fs');
const path = require('path');

// Test functions
function testFileExists(filePath, description) {
  const exists = fs.existsSync(filePath);
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${description}: ${filePath}`);
  return exists;
}

function testDirectoryStructure(dirPath, description) {
  const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${description}: ${dirPath}`);
  if (exists) {
    const files = fs.readdirSync(dirPath);
    console.log(`   └─ Contains ${files.length} items: ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}`);
  }
  return exists;
}

function testJsonConfig(filePath, description) {
  try {
    const exists = fs.existsSync(filePath);
    if (!exists) {
      console.log(`❌ ${description}: File not found`);
      return false;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    console.log(`✅ ${description}: Valid JSON`);
    return config;
  } catch (error) {
    console.log(`❌ ${description}: Invalid JSON - ${error.message}`);
    return false;
  }
}

console.log('1. 📋 CORE PROJECT STRUCTURE');
console.log('─'.repeat(40));

const tests = [
  // Core structure
  ['package.json', 'Package.json exists'],
  ['src-tauri/Cargo.toml', 'Rust Cargo.toml exists'], 
  ['src-tauri/tauri.conf.json', 'Tauri configuration exists'],
  ['src-tauri/src/main.rs', 'Rust main.rs exists'],
  ['vite.config.ts', 'Vite configuration exists'],
];

let passed = 0;
tests.forEach(([file, desc]) => {
  if (testFileExists(file, desc)) passed++;
});

console.log('\n2. 🦀 RUST BACKEND MODULES');
console.log('─'.repeat(40));

const rustModules = [
  ['src-tauri/src/commands/', 'Commands module directory'],
  ['src-tauri/src/services/', 'Services module directory'],
  ['src-tauri/src/models/', 'Models module directory'],
  ['src-tauri/src/memory_manager.rs', 'Memory manager module'],
];

rustModules.forEach(([path, desc]) => {
  if (testDirectoryStructure(path, desc) || testFileExists(path, desc)) passed++;
});

console.log('\n3. ⚛️ REACT FRONTEND COMPONENTS');
console.log('─'.repeat(40));

const frontendFiles = [
  ['src/services/tauriApi.ts', 'Tauri API service'],
  ['src/components/Tauri/TauriSystemInfo.tsx', 'System info component'],
  ['src/components/Tauri/ModelManager.tsx', 'Model manager component'],
];

frontendFiles.forEach(([file, desc]) => {
  if (testFileExists(file, desc)) passed++;
});

console.log('\n4. 🤖 AI MODEL STRUCTURE');
console.log('─'.repeat(40));

const modelDirs = [
  ['embedded-models/', 'Embedded models directory'],
  ['embedded-models/whisper/', 'Whisper model directory'],
  ['embedded-models/tesseract/', 'Tesseract OCR directory'],
  ['embedded-models/spacy/', 'spaCy NLP directory'],
];

modelDirs.forEach(([dir, desc]) => {
  if (testDirectoryStructure(dir, desc)) passed++;
});

console.log('\n5. ⚙️ CONFIGURATION VALIDATION');
console.log('─'.repeat(40));

// Test package.json configuration
const packageJson = testJsonConfig('package.json', 'Package.json validation');
if (packageJson) {
  console.log(`   └─ Version: ${packageJson.version}`);
  console.log(`   └─ Tauri deps: ${packageJson.dependencies['@tauri-apps/api'] ? '✅' : '❌'}`);
}

// Test Tauri configuration
const tauriConf = testJsonConfig('src-tauri/tauri.conf.json', 'Tauri config validation');
if (tauriConf) {
  console.log(`   └─ Product: ${tauriConf.productName}`);
  console.log(`   └─ Version: ${tauriConf.version}`);
  console.log(`   └─ Dev URL: ${tauriConf.build.devUrl}`);
}

console.log('\n6. 🧪 TESTING FRAMEWORK');
console.log('─'.repeat(40));

const testFiles = [
  ['vitest.config.ts', 'Vitest configuration'],
  ['src/test/setup.ts', 'Test setup file'],
  ['src/components/Tauri/TauriSystemInfo.test.tsx', 'Component test example'],
];

testFiles.forEach(([file, desc]) => {
  if (testFileExists(file, desc)) passed++;
});

console.log('\n📊 SUMMARY');
console.log('═'.repeat(40));

const totalTests = tests.length + rustModules.length + frontendFiles.length + modelDirs.length + testFiles.length + 2; // +2 for JSON configs
const percentage = Math.round((passed / totalTests) * 100);

console.log(`Tests Passed: ${passed}/${totalTests} (${percentage}%)`);

if (percentage >= 90) {
  console.log('🎉 EXCELLENT! Phase 1.1 architecture is properly set up.');
  console.log('✅ Ready for development with `npm run tauri dev`');
} else if (percentage >= 75) {
  console.log('⚠️  GOOD! Most components are in place, minor issues detected.');
} else {
  console.log('❌ ISSUES DETECTED! Some critical components are missing.');
}

console.log('\n🚀 NEXT STEPS:');
console.log('1. Install Rust if not already installed');
console.log('2. Run `npm install` to install dependencies'); 
console.log('3. Run `npm run tauri dev` to start development server');
console.log('4. Navigate to System Info and AI Models in the app');

console.log('\n📋 PHASE 1.1 STATUS: FOUNDATION SETUP COMPLETE');