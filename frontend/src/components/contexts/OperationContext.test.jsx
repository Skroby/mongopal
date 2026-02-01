import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OperationProvider, useOperation } from './OperationContext'

// Test component that uses the context
function TestConsumer({ onMount }) {
  const context = useOperation()
  if (onMount) onMount(context)
  return (
    <div>
      <span data-testid="op-count">{context.activeOperations.length}</span>
      <span data-testid="has-destructive">{context.hasDestructiveOperation.toString()}</span>
      {context.activeOperations.map(op => (
        <span key={op.id} data-testid={`op-${op.id}`}>{op.label}</span>
      ))}
    </div>
  )
}

describe('OperationContext', () => {
  describe('useOperation outside provider', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('useOperation must be used within OperationProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('OperationProvider', () => {
    it('should provide context to children', () => {
      render(
        <OperationProvider>
          <TestConsumer />
        </OperationProvider>
      )

      expect(screen.getByTestId('op-count')).toHaveTextContent('0')
    })

    it('should start with no active operations', () => {
      render(
        <OperationProvider>
          <TestConsumer />
        </OperationProvider>
      )

      expect(screen.getByTestId('op-count')).toHaveTextContent('0')
      expect(screen.getByTestId('has-destructive')).toHaveTextContent('false')
    })
  })

  describe('startOperation', () => {
    it('should add an operation', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'test-op-1',
          type: 'export',
          label: 'Exporting database...',
          progress: 0,
          destructive: false,
        })
      })

      expect(screen.getByTestId('op-count')).toHaveTextContent('1')
      expect(screen.getByTestId('op-test-op-1')).toHaveTextContent('Exporting database...')
    })

    it('should generate id if not provided', () => {
      let contextRef
      let returnedId
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        returnedId = contextRef.startOperation({
          type: 'export',
          label: 'Test operation',
          destructive: false,
        })
      })

      expect(returnedId).toMatch(/^op-\d+-[a-z0-9]+$/)
      expect(screen.getByTestId('op-count')).toHaveTextContent('1')
    })

    it('should track destructive operations', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'delete-op',
          type: 'bulk-delete',
          label: 'Deleting documents...',
          destructive: true,
        })
      })

      expect(screen.getByTestId('has-destructive')).toHaveTextContent('true')
    })

    it('should allow multiple operations', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({ id: 'op-1', type: 'export', label: 'Op 1', destructive: false })
        contextRef.startOperation({ id: 'op-2', type: 'import', label: 'Op 2', destructive: false })
        contextRef.startOperation({ id: 'op-3', type: 'export', label: 'Op 3', destructive: false })
      })

      expect(screen.getByTestId('op-count')).toHaveTextContent('3')
    })
  })

  describe('updateOperation', () => {
    it('should update operation progress', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'test-op',
          type: 'export',
          label: 'Exporting...',
          progress: 0,
          destructive: false,
        })
      })

      act(() => {
        contextRef.updateOperation('test-op', { progress: 50 })
      })

      // Check that operation still exists
      expect(screen.getByTestId('op-count')).toHaveTextContent('1')
    })

    it('should update operation label', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'test-op',
          type: 'export',
          label: 'Starting...',
          destructive: false,
        })
      })

      act(() => {
        contextRef.updateOperation('test-op', { label: 'Processing...' })
      })

      expect(screen.getByTestId('op-test-op')).toHaveTextContent('Processing...')
    })

    it('should not fail for non-existent operation', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      // Should not throw
      act(() => {
        contextRef.updateOperation('non-existent', { progress: 50 })
      })

      expect(screen.getByTestId('op-count')).toHaveTextContent('0')
    })
  })

  describe('completeOperation', () => {
    it('should remove an operation', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'test-op',
          type: 'export',
          label: 'Exporting...',
          destructive: false,
        })
      })

      expect(screen.getByTestId('op-count')).toHaveTextContent('1')

      act(() => {
        contextRef.completeOperation('test-op')
      })

      expect(screen.getByTestId('op-count')).toHaveTextContent('0')
    })

    it('should update hasDestructiveOperation when destructive op completes', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'delete-op',
          type: 'bulk-delete',
          label: 'Deleting...',
          destructive: true,
        })
      })

      expect(screen.getByTestId('has-destructive')).toHaveTextContent('true')

      act(() => {
        contextRef.completeOperation('delete-op')
      })

      expect(screen.getByTestId('has-destructive')).toHaveTextContent('false')
    })

    it('should not fail for non-existent operation', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      // Should not throw
      act(() => {
        contextRef.completeOperation('non-existent')
      })

      expect(screen.getByTestId('op-count')).toHaveTextContent('0')
    })
  })

  describe('beforeunload handler', () => {
    let addEventListenerSpy
    let removeEventListenerSpy
    let registeredHandler

    beforeEach(() => {
      registeredHandler = null
      addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'beforeunload') {
          registeredHandler = handler
        }
      })
      removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    })

    afterEach(() => {
      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()
    })

    it('should register beforeunload handler', () => {
      render(
        <OperationProvider>
          <TestConsumer />
        </OperationProvider>
      )

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })

    it('should prevent unload during destructive operation', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'delete-op',
          type: 'bulk-delete',
          label: 'Deleting...',
          destructive: true,
        })
      })

      // Simulate beforeunload event
      const event = { preventDefault: vi.fn() }
      registeredHandler(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.returnValue).toBe('An operation is in progress. Are you sure you want to leave?')
    })

    it('should allow unload when no destructive operation', () => {
      let contextRef
      render(
        <OperationProvider>
          <TestConsumer onMount={ctx => { contextRef = ctx }} />
        </OperationProvider>
      )

      act(() => {
        contextRef.startOperation({
          id: 'export-op',
          type: 'export',
          label: 'Exporting...',
          destructive: false,
        })
      })

      // Simulate beforeunload event
      const event = { preventDefault: vi.fn() }
      registeredHandler(event)

      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})
