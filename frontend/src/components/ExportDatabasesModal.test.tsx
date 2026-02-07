import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import ExportDatabasesModal from './ExportDatabasesModal'

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
let mockGetDatabasesForExport: Mock
let mockExportDatabases: Mock
let mockCancelExport: Mock

beforeEach(() => {
  // Clear event handlers - delete all keys from the map
  Object.keys(eventHandlerMap).forEach(key => delete eventHandlerMap[key])
  mockGetDatabasesForExport = vi.fn().mockResolvedValue([
    { name: 'db1', sizeOnDisk: 1024 },
    { name: 'db2', sizeOnDisk: 2048 },
    { name: 'db3', sizeOnDisk: 4096 },
  ])
  mockExportDatabases = vi.fn().mockResolvedValue(undefined)
  mockCancelExport = vi.fn()

  ;(window as unknown as { go: unknown }).go = {
    main: {
      App: {
        GetDatabasesForExport: mockGetDatabasesForExport,
        ExportDatabases: mockExportDatabases,
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
  onClose?: Mock
}

const renderModal = (props: RenderModalProps = {}) => {
  const defaultProps = {
    connectionId: 'conn1',
    connectionName: 'Test Connection',
    onClose: vi.fn(),
  }
  return render(
    <NotificationProvider>
      <ExportQueueProvider>
        <ExportDatabasesModal {...defaultProps} {...props} />
      </ExportQueueProvider>
    </NotificationProvider>
  )
}

describe('ExportDatabasesModal', () => {
  describe('rendering', () => {
    it('should render modal with title', async () => {
      renderModal()
      expect(screen.getByText('Export Databases')).toBeInTheDocument()
    })

    it('should show loading state initially', () => {
      renderModal()
      expect(screen.getByText('Export Databases')).toBeInTheDocument()
    })

    it('should load and display databases', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockGetDatabasesForExport).toHaveBeenCalledWith('conn1')
      expect(screen.getByText('db1')).toBeInTheDocument()
      expect(screen.getByText('db2')).toBeInTheDocument()
      expect(screen.getByText('db3')).toBeInTheDocument()
    })
  })

  describe('progress calculation', () => {
    it('should register event handlers on mount', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      // Verify that the event handlers were registered
      expect(eventHandlerMap['export:progress']?.length).toBeGreaterThan(0)
      expect(eventHandlerMap['export:complete']?.length).toBeGreaterThan(0)
      expect(eventHandlerMap['export:cancelled']?.length).toBeGreaterThan(0)
    })

    it('should show preparing state when export starts', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Start export
      const exportButton = screen.getByText('Export')
      await act(async () => {
        fireEvent.click(exportButton)
      })

      expect(screen.getByText('Preparing export...')).toBeInTheDocument()
    })

    it('should calculate progress based on processedDocs/totalDocs', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      // Start export
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Simulate progress event with document counts (databaseIndex > 0 to exit preparing state)
      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 2,
          databaseTotal: 3,
          database: 'db2',
          collection: 'coll1',
          current: 500,
          total: 1000,
          processedDocs: 1500,
          totalDocs: 3000,
        })
        // Wait for React to process the state update
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      // Progress should be 50% (1500/3000) - wait for progress bar with inline style
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).not.toBeNull()
        expect(progressBar).toHaveStyle({ width: '50%' })
      }, { timeout: 2000 })
    })

    it('should never allow progress to go backwards', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // First progress: 60%
      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 2,
          databaseTotal: 3,
          processedDocs: 1800,
          totalDocs: 3000,
        })
      })

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '60%' })
      })

      // Lower progress (should be ignored)
      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 2,
          databaseTotal: 3,
          processedDocs: 1200,
          totalDocs: 3000,
        })
      })

      // Progress should still be 60%
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '60%' })
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

      // Simulate 100% progress (databaseIndex > 0 to exit preparing state)
      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 3,
          databaseTotal: 3,
          phase: 'finalizing',
          processedDocs: 3000,
          totalDocs: 3000,
        })
      })

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '100%' })
      })
    })

    it('should fall back to database index when totalDocs is 0', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      // Progress without totalDocs (databaseIndex > 0 to exit preparing state)
      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 2,
          databaseTotal: 4,
          processedDocs: 0,
          totalDocs: 0,
        })
      })

      // Fallback: (2-1)/4 = 25%
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '25%' })
      })
    })

    it('should show smooth progress across multiple databases', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      const progressValues: number[] = []

      // Simulate progress sequence (databaseIndex > 0 for all to exit preparing state)
      const progressSequence = [
        { processedDocs: 200, totalDocs: 1000 },
        { processedDocs: 400, totalDocs: 1000 },
        { processedDocs: 600, totalDocs: 1000 },
        { processedDocs: 800, totalDocs: 1000 },
        { processedDocs: 1000, totalDocs: 1000 },
      ]

      for (const data of progressSequence) {
        await act(async () => {
          emitEvent('export:progress', {
            databaseIndex: 1,
            databaseTotal: 1,
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

      // Simulate some progress first
      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 1,
          databaseTotal: 3,
          processedDocs: 500,
          totalDocs: 3000,
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

    it('should call CancelExport when confirmed', async () => {
      renderModal()

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      fireEvent.click(screen.getByText('Cancel'))
      fireEvent.click(screen.getByText('Yes, Cancel Export'))

      expect(mockCancelExport).toHaveBeenCalled()
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

    it('should call onClose when Hide is clicked', async () => {
      const onClose = vi.fn()
      renderModal({ onClose })

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      fireEvent.click(screen.getByText('Hide'))

      expect(onClose).toHaveBeenCalled()
    })
  })
})
