import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import ExportCollectionsModal from './ExportCollectionsModal'

// Event handlers storage - supports multiple handlers per event
// This is needed because both the modal AND the ExportQueueContext register handlers
const eventHandlerMap: Record<string, ((data: unknown) => void)[]> = {}

// Mock EventsOn/EventsOff - capture ALL handlers for simulation
vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn((event: string, handler: (data: unknown) => void) => {
    if (!eventHandlerMap[event]) {
      eventHandlerMap[event] = []
    }
    eventHandlerMap[event].push(handler)
    return () => {
      const idx = eventHandlerMap[event]?.indexOf(handler)
      if (idx >= 0) eventHandlerMap[event].splice(idx, 1)
    }
  }),
  EventsOff: vi.fn(),
}))

// Helper to emit events to ALL registered handlers
const emitEvent = (eventName: string, data: unknown): void => {
  const handlers = eventHandlerMap[eventName] || []
  handlers.forEach(handler => handler(data))
}

// Mock the go object
let mockGetCollectionsForExport: Mock
let mockExportCollections: Mock
let mockCancelExport: Mock

beforeEach(() => {
  // Clear event handlers - delete all keys from the map
  Object.keys(eventHandlerMap).forEach(key => delete eventHandlerMap[key])
  mockGetCollectionsForExport = vi.fn().mockResolvedValue([
    { name: 'users', count: 1000, sizeOnDisk: 1024 },
    { name: 'orders', count: 5000, sizeOnDisk: 2048 },
    { name: 'products', count: 500, sizeOnDisk: 512 },
  ])
  mockExportCollections = vi.fn().mockResolvedValue(undefined)
  mockCancelExport = vi.fn()

  ;(window as unknown as { go: unknown }).go = {
    main: {
      App: {
        GetCollectionsForExport: mockGetCollectionsForExport,
        ExportCollections: mockExportCollections,
        CancelExport: mockCancelExport,
      },
    },
  }
})

afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as { go?: unknown }).go
})

interface RenderModalProps {
  connectionId?: string
  connectionName?: string
  databaseName?: string
  onClose?: Mock
}

const renderModal = (props: RenderModalProps = {}) => {
  const defaultProps = {
    connectionId: 'conn1',
    connectionName: 'Test Connection',
    databaseName: 'testdb',
    onClose: vi.fn(),
  }
  return render(
    <NotificationProvider>
      <ExportQueueProvider>
        <ExportCollectionsModal {...defaultProps} {...props} />
      </ExportQueueProvider>
    </NotificationProvider>
  )
}

describe('ExportCollectionsModal', () => {
  describe('rendering', () => {
    it('should render modal with title', async () => {
      renderModal()
      expect(screen.getByText('Export Collections')).toBeInTheDocument()
    })

    it('should show database name in header', async () => {
      renderModal()
      expect(screen.getByText('Test Connection / testdb')).toBeInTheDocument()
    })

    it('should load and display collections', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockGetCollectionsForExport).toHaveBeenCalledWith('conn1', 'testdb')
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('orders')).toBeInTheDocument()
      expect(screen.getByText('products')).toBeInTheDocument()
    })

    it('should show document counts for collections', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(screen.getByText('1.0K docs')).toBeInTheDocument()
      expect(screen.getByText('5.0K docs')).toBeInTheDocument()
      expect(screen.getByText('500 docs')).toBeInTheDocument()
    })
  })

  describe('progress calculation', () => {
    it('should show preparing state when export starts', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      expect(screen.getByText('Preparing export...')).toBeInTheDocument()
    })

    it('should calculate progress based on processedDocs/totalDocs', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // Simulate progress event with document counts
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 2,
          collectionTotal: 3,
          collection: 'orders',
          current: 2500,
          total: 5000,
          processedDocs: 3500,
          totalDocs: 6500,
        })
      })

      // Progress should be ~54% (3500/6500) - wait for progress bar with inline style
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '54%' })
      })
    })

    it('should never allow progress to go backwards', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // First progress: 70%
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 2,
          collectionTotal: 3,
          processedDocs: 4550,
          totalDocs: 6500,
        })
      })

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '70%' })
      })

      // Lower progress (should be ignored)
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 2,
          collectionTotal: 3,
          processedDocs: 3000,
          totalDocs: 6500,
        })
      })

      // Progress should still be 70%
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '70%' })
      })
    })

    it('should reach 100% when processedDocs equals totalDocs', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // Simulate 100% progress
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 3,
          collectionTotal: 3,
          phase: 'finalizing',
          processedDocs: 6500,
          totalDocs: 6500,
        })
      })

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '100%' })
      })
    })

    it('should fall back to collection index when totalDocs is 0', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // Progress without totalDocs
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 3,
          collectionTotal: 4,
          processedDocs: 0,
          totalDocs: 0,
        })
      })

      // Fallback: (3-1)/4 = 50%
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '50%' })
      })
    })

    it('should show smooth progress across multiple collections', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      const progressValues: number[] = []

      // Simulate progress sequence across collections
      const progressSequence = [
        { processedDocs: 500, totalDocs: 6500 },    // ~8%
        { processedDocs: 1000, totalDocs: 6500 },   // ~15%
        { processedDocs: 2000, totalDocs: 6500 },   // ~31%
        { processedDocs: 4000, totalDocs: 6500 },   // ~62%
        { processedDocs: 6000, totalDocs: 6500 },   // ~92%
        { processedDocs: 6500, totalDocs: 6500 },   // 100%
      ]

      for (const data of progressSequence) {
        await act(async () => {
          emitEvent('export:progress', {
            collectionIndex: 1,
            collectionTotal: 3,
            ...data,
          })
        })

        await waitFor(() => {
          const progressBar = document.querySelector('[style*="width"]') as HTMLElement
          expect(progressBar).not.toBeNull()
          const width = parseInt(progressBar.style.width)
          progressValues.push(width)
        })
      }

      // Should have captured progress values
      expect(progressValues.length).toBeGreaterThan(0)

      // Progress should be monotonically increasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1])
      }

      // Final should be 100%
      expect(progressValues[progressValues.length - 1]).toBe(100)
    })

    it('should handle progress from refs when event data is missing', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // First event sets totalDocs
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 1,
          collectionTotal: 3,
          processedDocs: 1000,
          totalDocs: 6500,
        })
      })

      // Second event without totalDocs - should use ref value
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 2,
          collectionTotal: 3,
          processedDocs: 3000,
        })
      })

      // Progress should be ~46% (3000/6500) using ref value
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '46%' })
      })
    })
  })

  describe('selection controls', () => {
    it('should pre-select all collections', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(screen.getByText('3 selected')).toBeInTheDocument()
    })

    it('should allow deselecting all', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      fireEvent.click(screen.getByText('Deselect All'))

      expect(screen.getByText('0 selected')).toBeInTheDocument()
    })

    it('should disable Export button when nothing selected', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      fireEvent.click(screen.getByText('Deselect All'))

      expect(screen.getByText('Export')).toBeDisabled()
    })
  })

  describe('export completion', () => {
    it('should close modal on export complete', async () => {
      const onClose = vi.fn()
      renderModal({ onClose })

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // Wait for export to start and be tracked
      await waitFor(() => {
        expect(screen.getByText('Preparing export...')).toBeInTheDocument()
      })

      // Simulate some progress first to ensure export is tracked
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 1,
          collectionTotal: 3,
          processedDocs: 500,
          totalDocs: 6500,
        })
      })

      await act(async () => {
        emitEvent('export:complete', { filePath: '/path/to/file.zip' })
      })

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled()
      })
    })
  })

  describe('export cancellation', () => {
    it('should show confirmation dialog when cancel clicked during export', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      fireEvent.click(screen.getByText('Cancel'))

      expect(screen.getByText('Cancel Export?')).toBeInTheDocument()
    })

    it('should reset progress state on cancel', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // Wait for export to start
      await waitFor(() => {
        expect(screen.getByText('Preparing export...')).toBeInTheDocument()
      })

      // Simulate some progress
      await act(async () => {
        emitEvent('export:progress', {
          collectionIndex: 2,
          collectionTotal: 3,
          processedDocs: 3000,
          totalDocs: 6500,
        })
      })

      // Trigger cancelled event
      await act(async () => {
        emitEvent('export:cancelled', {})
      })

      // Should be back to selection view
      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument()
      })
    })
  })

  describe('hide functionality', () => {
    it('should show Hide button during export', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      expect(screen.getByText('Hide')).toBeInTheDocument()
    })
  })
})
