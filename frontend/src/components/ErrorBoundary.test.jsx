import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

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
  })

  afterEach(() => {
    console.error = originalConsoleError
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

    it('renders Try to Continue button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Try to Continue')).toBeInTheDocument()
    })

    it('renders Copy Error to Clipboard button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Copy Error to Clipboard')).toBeInTheDocument()
    })

    it('clears error state when Try to Continue is clicked', () => {
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
      fireEvent.click(screen.getByText('Try to Continue'))

      // Should show normal content now
      expect(screen.getByText('No error')).toBeInTheDocument()
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
  })
})
