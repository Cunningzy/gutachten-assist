import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri base configuration
  base: './',

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 3000,
    strictPort: true,
    host: "0.0.0.0",
    hmr: {
      host: "localhost",
      port: 3001,
    },
  },

  // Build configuration for Tauri
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Tauri supports es2021
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Rollup options for Tauri 2.0
    // NOTE: @tauri-apps modules MUST be bundled, not marked as external
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  // Environment variables
  define: {
    __TAURI__: true,
  },

  // Clear screen when vite starts
  clearScreen: false,
});