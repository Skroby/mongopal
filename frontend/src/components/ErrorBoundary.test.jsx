import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary, { getPreservedState, clearPreservedState, hasPreservedState } from './ErrorBoundary'

// Component that throws an error
function ThrowError({ shouldThrow = true }) {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

// Suppress console.error for cleaner test output
const originalConsoleError = console.error

describe('ErrorBoundary', () => {
  beforeEach(() => {
    console.error = vi.fn()
    localStorage.clear()
  })

  afterEach(() => {
    console.error = originalConsoleError
    localStorage.clear()
  })

  describe('normal rendering', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      )
      expect(screen.getByText('Child content')).toBeInTheDocument()
    })

    it('renders multiple children', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      )
      expect(screen.getByText('First child')).toBeInTheDocument()
      expect(screen.getByText('Second child')).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('catches errors and displays fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('The application encountered an unexpected error')).toBeInTheDocument()
    })

    it('displays the error message', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText(/Test error message/)).toBeInTheDocument()
    })

    it('logs error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('fallback UI buttons', () => {
    it('renders Reload Application button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Reload Application')).toBeInTheDocument()
    })

    it('renders Reset and Continue button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Reset and Continue')).toBeInTheDocument()
    })

    it('renders Copy Error to Clipboard button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Copy Error to Clipboard')).toBeInTheDocument()
    })

    it('renders Report this issue button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Report this issue')).toBeInTheDocument()
    })

    it('clears error state when Reset and Continue is clicked', () => {
      // Use a ref-like pattern to control throwing behavior
      let shouldThrow = true

      function ConditionalThrow() {
        if (shouldThrow) {
          throw new Error('Test error')
        }
        return <div>No error</div>
      }

      render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      )

      // Error should be displayed
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Stop throwing before clicking dismiss
      shouldThrow = false

      // Click dismiss - this clears error state and re-renders children
      fireEvent.click(screen.getByText('Reset and Continue'))

      // Should show normal content now
      expect(screen.getByText('No error')).toBeInTheDocument()
    })
  })

  describe('warning message', () => {
    it('displays warning about state reset', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Recovery will reset your session')).toBeInTheDocument()
      expect(screen.getByText(/Open tabs and unsaved changes may be lost/)).toBeInTheDocument()
    })
  })

  describe('stack trace', () => {
    it('renders stack trace details element', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Show stack trace')).toBeInTheDocument()
    })
  })

  describe('copy to clipboard', () => {
    it('copies error to clipboard when button clicked', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      }
      Object.assign(navigator, { clipboard: mockClipboard })

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      fireEvent.click(screen.getByText('Copy Error to Clipboard'))

      expect(mockClipboard.writeText).toHaveBeenCalled()
      // Verify clipboard content includes error report header
      expect(mockClipboard.writeText.mock.calls[0][0]).toContain('MongoPal Error Report')
    })

    it('handles clipboard error gracefully', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      }
      Object.assign(navigator, { clipboard: mockClipboard })

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      // Should not throw
      fireEvent.click(screen.getByText('Copy Error to Clipboard'))

      expect(mockClipboard.writeText).toHaveBeenCalled()
    })
  })

  describe('reload', () => {
    it('calls window.location.reload when Reload Application clicked', () => {
      const mockReload = vi.fn()
      const originalLocation = window.location

      delete window.location
      window.location = { ...originalLocation, reload: mockReload }

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      fireEvent.click(screen.getByText('Reload Application'))

      expect(mockReload).toHaveBeenCalled()

      window.location = originalLocation
    })

    it('saves state before reload', () => {
      const mockReload = vi.fn()
      const originalLocation = window.location

      delete window.location
      window.location = { ...originalLocation, reload: mockReload }

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      fireEvent.click(screen.getByText('Reload Application'))

      // Check that state was saved to localStorage
      expect(hasPreservedState()).toBe(true)
      const preserved = getPreservedState()
      expect(preserved).not.toBeNull()
      expect(preserved.error).toContain('Test error message')

      window.location = originalLocation
    })
  })

  describe('state preservation helpers', () => {
    it('getPreservedState returns null when no state saved', () => {
      expect(getPreservedState()).toBeNull()
    })

    it('hasPreservedState returns false when no state saved', () => {
      expect(hasPreservedState()).toBe(false)
    })

    it('clearPreservedState removes saved state', () => {
      localStorage.setItem('mongopal_error_recovery_state', JSON.stringify({ test: true }))
      expect(hasPreservedState()).toBe(true)

      clearPreservedState()

      expect(hasPreservedState()).toBe(false)
      expect(getPreservedState()).toBeNull()
    })

    it('getPreservedState handles invalid JSON gracefully', () => {
      localStorage.setItem('mongopal_error_recovery_state', 'not valid json')
      expect(getPreservedState()).toBeNull()
    })
  })

  describe('report issue', () => {
    it('copies error details to clipboard when Report this issue is clicked', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      })

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      fireEvent.click(screen.getByText('Report this issue'))

      // Should copy error details to clipboard
      await vi.waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled()
      })
      const copiedText = mockWriteText.mock.calls[0][0]
      expect(copiedText).toContain('MongoPal Error Report')
      expect(copiedText).toContain('Test error')
    })
  })
})
