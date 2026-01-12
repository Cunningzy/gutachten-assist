// Tests for TauriSystemInfo component

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import TauriSystemInfo from './TauriSystemInfo'

// Mock system info data
const mockSystemInfo = {
  available_memory: 6000000000,
  total_memory: 8000000000,
  platform: 'windows',
  architecture: 'x86_64',
  app_version: '2.0.0',
}

const mockMemoryStatus = {
  available_bytes: 6000000000,
  used_by_models: 0,
  total_system: 8000000000,
  percentage_used: 25.0,
}

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>{component}</BrowserRouter>
  )
}

describe('TauriSystemInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default mock responses
    globalThis.mockInvoke
      .mockResolvedValueOnce(mockSystemInfo) // system_info
      .mockResolvedValueOnce(mockMemoryStatus) // get_system_memory
      .mockResolvedValueOnce(true) // check_system_requirements
  })

  it('renders loading state initially', () => {
    renderWithRouter(<TauriSystemInfo />)
    
    expect(screen.getByText('Systeminformationen werden geladen...')).toBeInTheDocument()
  })

  it('displays system information after loading', async () => {
    renderWithRouter(<TauriSystemInfo />)
    
    await waitFor(() => {
      expect(screen.getByText('Systeminformationen')).toBeInTheDocument()
    })

    // Check system info display
    expect(screen.getByText('windows')).toBeInTheDocument()
    expect(screen.getByText('x86_64')).toBeInTheDocument()
    expect(screen.getByText('v2.0.0')).toBeInTheDocument()

    // Check memory info
    expect(screen.getByText('25.0%')).toBeInTheDocument()
  })

  it('shows system requirements met status', async () => {
    renderWithRouter(<TauriSystemInfo />)
    
    await waitFor(() => {
      expect(screen.getByText(/System erfüllt alle Mindestanforderungen/)).toBeInTheDocument()
    })
  })

  it('handles API errors gracefully', async () => {
    globalThis.mockInvoke.mockRejectedValue(new Error('API Error'))
    
    renderWithRouter(<TauriSystemInfo />)
    
    await waitFor(() => {
      expect(screen.getByText(/API Error/)).toBeInTheDocument()
    })
  })

  it('formats memory sizes correctly', async () => {
    renderWithRouter(<TauriSystemInfo />)
    
    await waitFor(() => {
      // Should display memory in GB
      expect(screen.getByText(/7.5 GB/)).toBeInTheDocument() // total memory
      expect(screen.getByText(/5.6 GB/)).toBeInTheDocument() // available memory
    })
  })

  it('shows Tauri desktop indicator', async () => {
    renderWithRouter(<TauriSystemInfo />)
    
    await waitFor(() => {
      expect(screen.getByText('Tauri v2.0')).toBeInTheDocument()
      expect(screen.getByText(/Desktop-Anwendung mit eingebetteten AI-Modellen/)).toBeInTheDocument()
    })
  })
})