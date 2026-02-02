import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider, useNotification, NotificationHistoryButton, NotificationHistoryDrawer } from './NotificationContext'

// Test component that uses the notification context
function TestConsumer({ onMount }) {
  const { notify, removeNotification, notificationHistory, unreadCount, toggleHistory, closeHistory, clearHistory } = useNotification()

  // Call onMount with the notify functions for test access
  if (onMount) {
    onMount({ notify, removeNotification, notificationHistory, unreadCount, toggleHistory, closeHistory, clearHistory })
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

  describe('notification history', () => {
    it('adds dismissed notifications to history', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      // Create and dismiss a notification
      fireEvent.click(screen.getByText('Info'))
      expect(screen.getByText('Info message')).toBeInTheDocument()

      // Dismiss it
      fireEvent.click(screen.getByTitle('Dismiss'))
      expect(screen.queryByText('Info message')).not.toBeInTheDocument()

      // Check history
      expect(context.notificationHistory).toHaveLength(1)
      expect(context.notificationHistory[0].message).toBe('Info message')
      expect(context.notificationHistory[0].type).toBe('info')
      expect(context.notificationHistory[0].timestamp).toBeDefined()
    })

    it('adds auto-dismissed notifications to history', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Info'))
      expect(context.notificationHistory).toHaveLength(0)

      // Fast-forward to auto-dismiss
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(context.notificationHistory).toHaveLength(1)
      expect(context.notificationHistory[0].message).toBe('Info message')
    })

    it('marks error notifications as important in history', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      fireEvent.click(screen.getByText('Error'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      expect(context.notificationHistory[0].important).toBe(true)
    })

    it('keeps most recent notifications first in history', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      // Create and dismiss notifications in order
      act(() => {
        context.notify.info('First')
      })
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      act(() => {
        context.notify.info('Second')
      })
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(context.notificationHistory[0].message).toBe('Second')
      expect(context.notificationHistory[1].message).toBe('First')
    })

    it('limits history to 50 items', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      // Create and dismiss 55 notifications
      for (let i = 0; i < 55; i++) {
        act(() => {
          context.notify.info(`Message ${i}`)
        })
        act(() => {
          vi.advanceTimersByTime(5000)
        })
      }

      expect(context.notificationHistory).toHaveLength(50)
      // Most recent should be first
      expect(context.notificationHistory[0].message).toBe('Message 54')
    })

    it('increments unread count when notification is dismissed', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      expect(context.unreadCount).toBe(0)

      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      expect(context.unreadCount).toBe(1)

      fireEvent.click(screen.getByText('Success'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      expect(context.unreadCount).toBe(2)
    })

    it('clears history when clearHistory is called', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
        </NotificationProvider>
      )

      // Add some notifications to history
      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))
      fireEvent.click(screen.getByText('Error'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      expect(context.notificationHistory).toHaveLength(2)
      expect(context.unreadCount).toBe(2)

      act(() => {
        context.clearHistory()
      })

      expect(context.notificationHistory).toHaveLength(0)
      expect(context.unreadCount).toBe(0)
    })
  })

  describe('NotificationHistoryButton', () => {
    it('renders without unread badge when no unread notifications', () => {
      render(
        <NotificationProvider>
          <NotificationHistoryButton />
        </NotificationProvider>
      )

      const button = screen.getByTitle('Notification history')
      expect(button).toBeInTheDocument()
      expect(button.querySelector('span')).not.toBeInTheDocument()
    })

    it('renders with unread badge showing count', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
        </NotificationProvider>
      )

      // Add notifications to history
      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      const badge = screen.getByText('1')
      expect(badge).toBeInTheDocument()
    })

    it('shows 99+ when unread count exceeds 99', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
        </NotificationProvider>
      )

      // Add 100+ notifications
      for (let i = 0; i < 100; i++) {
        act(() => {
          context.notify.info(`Message ${i}`)
        })
        act(() => {
          vi.advanceTimersByTime(5000)
        })
      }

      expect(screen.getByText('99+')).toBeInTheDocument()
    })

    it('toggles history drawer on click', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Initially drawer should not be visible
      expect(screen.queryByText('Notification History')).not.toBeInTheDocument()

      // Click button to open
      fireEvent.click(screen.getByTitle('Notification history'))
      expect(screen.getByText('Notification History')).toBeInTheDocument()

      // Click button again to close
      fireEvent.click(screen.getByTitle('Notification history'))
      expect(screen.queryByText('Notification History')).not.toBeInTheDocument()
    })

    it('resets unread count when opening history', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Add notifications to history
      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      expect(context.unreadCount).toBe(1)

      // Open history
      fireEvent.click(screen.getByTitle(/Notification history/))

      expect(context.unreadCount).toBe(0)
    })
  })

  describe('NotificationHistoryDrawer', () => {
    it('shows empty state when no history', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Open drawer
      fireEvent.click(screen.getByTitle('Notification history'))

      expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    })

    it('shows notification history items', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Add notifications to history
      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))
      fireEvent.click(screen.getByText('Error'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      // Open drawer
      fireEvent.click(screen.getByTitle(/Notification history/))

      expect(screen.getByText('Info message')).toBeInTheDocument()
      expect(screen.getByText('Error message')).toBeInTheDocument()
      expect(screen.getByText('(2)')).toBeInTheDocument()
    })

    it('clears history when Clear all is clicked', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Add notifications to history
      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      // Open drawer
      fireEvent.click(screen.getByTitle(/Notification history/))

      // Click Clear all
      fireEvent.click(screen.getByText('Clear all'))

      expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    })

    it('closes on Escape key', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Open drawer
      fireEvent.click(screen.getByTitle('Notification history'))
      expect(screen.getByText('Notification History')).toBeInTheDocument()

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByText('Notification History')).not.toBeInTheDocument()
    })

    it('closes when close button is clicked', () => {
      render(
        <NotificationProvider>
          <TestConsumer />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Open drawer
      fireEvent.click(screen.getByTitle('Notification history'))
      expect(screen.getByText('Notification History')).toBeInTheDocument()

      // Click close button
      fireEvent.click(screen.getByTitle('Close'))
      expect(screen.queryByText('Notification History')).not.toBeInTheDocument()
    })

    it('shows copy button on history entry hover', () => {
      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Add notification to history
      fireEvent.click(screen.getByText('Error'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      // Open drawer
      fireEvent.click(screen.getByTitle(/Notification history/))

      // The copy button should exist in the history entry
      // It appears on hover via CSS, but should be in the DOM
      expect(screen.getByTitle('Copy message')).toBeInTheDocument()
    })

    it('copies history entry message to clipboard when copy button clicked', () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      })

      let context

      render(
        <NotificationProvider>
          <TestConsumer onMount={(ctx) => { context = ctx }} />
          <NotificationHistoryButton />
          <NotificationHistoryDrawer />
        </NotificationProvider>
      )

      // Add notification to history
      fireEvent.click(screen.getByText('Info'))
      fireEvent.click(screen.getByTitle('Dismiss'))

      // Open drawer
      fireEvent.click(screen.getByTitle(/Notification history/))

      // Click copy button
      fireEvent.click(screen.getByTitle('Copy message'))

      expect(mockWriteText).toHaveBeenCalledWith('Info message')
    })
  })
})
