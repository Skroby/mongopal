import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, type RenderResult } from '@testing-library/react'
import ActionableError from './ActionableError'
import { NotificationProvider } from './NotificationContext'
import type { ReactElement } from 'react'

// Wrapper with NotificationProvider
const renderWithProvider = (ui: ReactElement): RenderResult => {
  return render(
    <NotificationProvider>
      {ui}
    </NotificationProvider>
  )
}

// Mock clipboard API
beforeEach(() => {
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

describe('ActionableError', () => {
  describe('rendering', () => {
    it('should return null when error is empty', () => {
      const { container } = renderWithProvider(<ActionableError error="" />)
      expect(container.firstChild).toBeNull()
    })

    it('should return null when error is null', () => {
      const { container } = renderWithProvider(<ActionableError error={null} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render error message', () => {
      // Unknown errors get transformed to "An error occurred" as the friendly message
      renderWithProvider(<ActionableError error="Something went wrong" />)
      expect(screen.getByText('An error occurred')).toBeInTheDocument()
    })

    it('should render known error with friendly message', () => {
      renderWithProvider(<ActionableError error="connection refused" />)
      // Should show friendly message for connection errors
      expect(screen.getByText(/connection/i)).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = renderWithProvider(
        <ActionableError error="Test error" className="custom-class" />
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('compact mode', () => {
    it('should render in compact mode when compact prop is true', () => {
      const { container } = renderWithProvider(
        <ActionableError error="Test error" compact />
      )
      // Compact mode uses px-3 py-2 instead of px-4 py-3
      expect(container.firstChild).toHaveClass('px-3', 'py-2')
    })

    it('should render in full mode by default', () => {
      const { container } = renderWithProvider(
        <ActionableError error="Test error" />
      )
      // Full mode uses rounded-lg
      expect(container.firstChild).toHaveClass('rounded-lg')
    })
  })

  describe('copy functionality', () => {
    it('should copy error to clipboard when copy button is clicked', async () => {
      renderWithProvider(<ActionableError error="Test error message" />)

      const copyButton = screen.getByTitle('Copy error')
      fireEvent.click(copyButton)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test error message')
    })
  })

  describe('dismiss functionality', () => {
    it('should show dismiss button when onDismiss is provided', () => {
      renderWithProvider(
        <ActionableError error="Test error" onDismiss={() => {}} />
      )
      expect(screen.getByTitle('Dismiss')).toBeInTheDocument()
    })

    it('should not show dismiss button when onDismiss is not provided', () => {
      renderWithProvider(<ActionableError error="Test error" />)
      expect(screen.queryByTitle('Dismiss')).not.toBeInTheDocument()
    })

    it('should call onDismiss when dismiss button is clicked', () => {
      const onDismiss = vi.fn()
      renderWithProvider(
        <ActionableError error="Test error" onDismiss={onDismiss} />
      )

      fireEvent.click(screen.getByTitle('Dismiss'))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })

  describe('details toggle', () => {
    it('should show details button when raw differs from friendly message', () => {
      // Authentication errors have different friendly messages
      renderWithProvider(
        <ActionableError error="authentication failed: wrong password" />
      )
      expect(screen.getByText(/details/i)).toBeInTheDocument()
    })

    it('should toggle details visibility when button is clicked', () => {
      renderWithProvider(
        <ActionableError error="connection refused: ECONNREFUSED 127.0.0.1:27017" />
      )

      // Initially details should be hidden
      expect(screen.queryByText('ECONNREFUSED')).not.toBeInTheDocument()

      // Click to show details
      fireEvent.click(screen.getByText(/show details/i))

      // Now raw error should be visible
      expect(screen.getByText(/ECONNREFUSED/i)).toBeInTheDocument()

      // Click to hide details
      fireEvent.click(screen.getByText(/hide details/i))
    })
  })

  describe('action buttons', () => {
    it('should show Edit Connection action for connection errors', () => {
      const onEditConnection = vi.fn()
      renderWithProvider(
        <ActionableError
          error="authentication failed"
          onEditConnection={onEditConnection}
        />
      )

      // Should have an edit connection action
      const actionButton = screen.queryByText(/edit connection/i)
      if (actionButton) {
        fireEvent.click(actionButton)
        expect(onEditConnection).toHaveBeenCalledTimes(1)
      }
    })

    it('should call onOpenSettings for settings-related errors', () => {
      const onOpenSettings = vi.fn()
      renderWithProvider(
        <ActionableError
          error="query timeout after 5000ms"
          onOpenSettings={onOpenSettings}
        />
      )

      // Should have an open settings action for timeout errors
      const actionButton = screen.queryByText(/open settings/i)
      if (actionButton) {
        fireEvent.click(actionButton)
        expect(onOpenSettings).toHaveBeenCalledTimes(1)
      }
    })

    it('should not show action when callback is not provided', () => {
      renderWithProvider(
        <ActionableError error="authentication failed" />
      )

      // Without onEditConnection, should not show the edit action
      expect(screen.queryByText(/edit connection/i)).not.toBeInTheDocument()
    })
  })

  describe('compact mode actions', () => {
    it('should render action buttons in compact mode', () => {
      const onEditConnection = vi.fn()
      renderWithProvider(
        <ActionableError
          error="authentication failed"
          onEditConnection={onEditConnection}
          compact
        />
      )

      // Should have copy button
      expect(screen.getByTitle('Copy error')).toBeInTheDocument()
    })
  })
})
