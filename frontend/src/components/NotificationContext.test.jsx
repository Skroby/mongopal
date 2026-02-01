import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider, useNotification } from './NotificationContext'

// Test component that uses the notification context
function TestConsumer({ onMount }) {
  const { notify, removeNotification } = useNotification()

  // Call onMount with the notify functions for test access
  if (onMount) {
    onMount({ notify, removeNotification })
  }

  return (
    <div>
      <button onClick={() => notify.info('Info message')}>Info</button>
      <button onClick={() => notify.success('Success message')}>Success</button>
      <button onClick={() => notify.warning('Warning message')}>Warning</button>
      <button onClick={() => notify.error('Error message')}>Error</button>
    </div>
  )
}

describe('NotificationContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('useNotification hook', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('useNotification must be used within NotificationProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('notification types', () => {
    it('adds info notification', async () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Info'))
      expect(screen.getByText('Info message')).toBeInTheDocument()
    })

    it('adds success notification', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Success'))
      expect(screen.getByText('Success message')).toBeInTheDocument()
    })

    it('adds warning notification', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Warning'))
      expect(screen.getByText('Warning message')).toBeInTheDocument()
    })

    it('adds error notification', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Error'))
      expect(screen.getByText('Error message')).toBeInTheDocument()
    })
  })

  describe('multiple notifications', () => {
    it('displays multiple notifications', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByText('Success'))
      fireEvent.click(screen.getByText('Error'))

      expect(screen.getByText('Info message')).toBeInTheDocument()
      expect(screen.getByText('Success message')).toBeInTheDocument()
      expect(screen.getByText('Error message')).toBeInTheDocument()
    })
  })

  describe('auto-dismiss', () => {
    it('auto-dismisses info notification after 5 seconds', async () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Info'))
      expect(screen.getByText('Info message')).toBeInTheDocument()

      // Fast-forward 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(screen.queryByText('Info message')).not.toBeInTheDocument()
    })

    it('auto-dismisses error notification after 8 seconds', async () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Error'))
      expect(screen.getByText('Error message')).toBeInTheDocument()

      // After 5 seconds, error should still be visible
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.getByText('Error message')).toBeInTheDocument()

      // After 8 seconds total, error should be gone
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.queryByText('Error message')).not.toBeInTheDocument()
    })
  })

  describe('manual dismiss', () => {
    it('dismisses notification when dismiss button clicked', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Info'))
      expect(screen.getByText('Info message')).toBeInTheDocument()

      // Click dismiss button
      fireEvent.click(screen.getByTitle('Dismiss'))
      expect(screen.queryByText('Info message')).not.toBeInTheDocument()
    })
  })

  describe('notification options', () => {
    it('respects custom duration option', () => {
      let notifyFn

      render(
        <NotificationProvider>
          <TestConsumer onMount={({ notify }) => { notifyFn = notify }} />
        </NotificationProvider>
      )

      act(() => {
        notifyFn.info('Custom duration', { duration: 1000 })
      })

      expect(screen.getByText('Custom duration')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(screen.queryByText('Custom duration')).not.toBeInTheDocument()
    })

    it('does not auto-dismiss when duration is 0', () => {
      let notifyFn

      render(
        <NotificationProvider>
          <TestConsumer onMount={({ notify }) => { notifyFn = notify }} />
        </NotificationProvider>
      )

      act(() => {
        notifyFn.info('Persistent notification', { duration: 0 })
      })

      expect(screen.getByText('Persistent notification')).toBeInTheDocument()

      // Even after a long time, notification should persist
      act(() => {
        vi.advanceTimersByTime(60000)
      })

      expect(screen.getByText('Persistent notification')).toBeInTheDocument()
    })

    it('hides dismiss button when dismissible is false', () => {
      let notifyFn

      render(
        <NotificationProvider>
          <TestConsumer onMount={({ notify }) => { notifyFn = notify }} />
        </NotificationProvider>
      )

      act(() => {
        notifyFn.info('Non-dismissible', { dismissible: false, duration: 0 })
      })

      expect(screen.getByText('Non-dismissible')).toBeInTheDocument()
      expect(screen.queryByTitle('Dismiss')).not.toBeInTheDocument()
    })
  })

  describe('error notification copy button', () => {
    it('shows copy button only for error notifications', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      // Info notification should not have copy button
      fireEvent.click(screen.getByText('Info'))
      expect(screen.queryByTitle('Copy error message')).not.toBeInTheDocument()

      // Error notification should have copy button
      fireEvent.click(screen.getByText('Error'))
      expect(screen.getByTitle('Copy error message')).toBeInTheDocument()
    })

    it('copies error message to clipboard when copy button clicked', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      }
      Object.assign(navigator, { clipboard: mockClipboard })

      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Error'))
      fireEvent.click(screen.getByTitle('Copy error message'))

      expect(mockClipboard.writeText).toHaveBeenCalledWith('Error message')
    })
  })

  describe('notification container', () => {
    it('does not render container when no notifications', () => {
      const { container } = render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      // The notification container should not be in the DOM
      expect(container.querySelector('.fixed.bottom-4')).not.toBeInTheDocument()
    })

    it('renders container when notifications exist', () => {
      const { container } = render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Info'))

      // The notification container should be in the DOM
      expect(container.querySelector('.fixed.bottom-4')).toBeInTheDocument()
    })
  })
})
