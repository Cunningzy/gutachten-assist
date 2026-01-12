// Test setup for Vitest with React Testing Library
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri API for testing
const mockInvoke = vi.fn()
const mockListen = vi.fn(() => Promise.resolve(() => {}))

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mockInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}))

// Mock window.__TAURI__ for desktop detection
Object.defineProperty(window, '__TAURI__', {
  value: true,
  writable: true,
})

// Extend global with mock functions
declare global {
  var mockInvoke: typeof mockInvoke
  var mockListen: typeof mockListen
}

// Global test utilities
globalThis.mockInvoke = mockInvoke
globalThis.mockListen = mockListen