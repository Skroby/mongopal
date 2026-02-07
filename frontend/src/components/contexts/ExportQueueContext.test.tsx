import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ExportQueueProvider, useExportQueue, ExportQueueContextValue } from './ExportQueueContext'
import { NotificationProvider } from '../NotificationContext'

// Event handler registry for mocked Wails events
type EventHandler = (data: unknown) => void
let eventHandlers: Record<string, EventHandler> = {}

// Mock EventsOn/EventsOff - capture handlers for simulation
vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn((event: string, handler: EventHandler) => {
    eventHandlers[event] = handler
    return () => { delete eventHandlers[event] }
  }),
  EventsOff: vi.fn(),
}))

// Mock the go object
beforeEach(() => {
  eventHandlers = {}
  // Update the existing window.go from test setup
  if (window.go?.main?.App) {
    window.go.main.App.ExportCollectionAsCSV = vi.fn()
    window.go.main.App.CancelExport = vi.fn()
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

// Test component that uses the context
interface TestConsumerProps {
  onMount?: (context: ExportQueueContextValue) => void
}

function TestConsumer({ onMount }: TestConsumerProps) {
  const context = useExportQueue()
  if (onMount) onMount(context)
  return (
    <div>
      <span data-testid="export-count">{context.exports.length}</span>
      <span data-testid="queued-count">{context.queuedCount}</span>
      <span data-testid="active-count">{context.activeCount}</span>
      {context.exports.map(exp => (
        <div key={exp.id} data-testid={`export-${exp.id}`}>
          <span data-testid={`progress-${exp.id}`}>{exp.progress}</span>
          <span data-testid={`phase-${exp.id}`}>{exp.phase}</span>
          <span data-testid={`current-${exp.id}`}>{exp.current}</span>
          <span data-testid={`total-${exp.id}`}>{exp.total || exp.totalDocs || 0}</span>
        </div>
      ))}
    </div>
  )
}

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <NotificationProvider>
      <ExportQueueProvider>
        {component}
      </ExportQueueProvider>
    </NotificationProvider>
  )
}

describe('ExportQueueContext', () => {
  describe('useExportQueue outside provider', () => {
    it('should throw error when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('useExportQueue must be used within ExportQueueProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('ExportQueueProvider', () => {
    it('should provide context to children', () => {
      renderWithProviders(<TestConsumer />)
      expect(screen.getByTestId('export-count')).toHaveTextContent('0')
    })

    it('should start with no active exports', () => {
      renderWithProviders(<TestConsumer />)
      expect(screen.getByTestId('queued-count')).toHaveTextContent('0')
      expect(screen.getByTestId('active-count')).toHaveTextContent('0')
    })
  })

  describe('trackZipExport', () => {
    it('should track a new zip export', () => {
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        contextRef!.trackZipExport('conn1', 'testdb', ['coll1', 'coll2'], 'Test Export')
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('1')
      expect(screen.getByTestId('active-count')).toHaveTextContent('1')
    })

    it('should return export id', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
      })

      expect(exportId).toMatch(/^export-\d+-[a-z0-9]+$/)
    })
  })

  describe('ZIP export progress calculation', () => {
    it('should calculate progress based on processedDocs/totalDocs', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1', 'coll2'], 'Test Export')
      })

      // Simulate progress event with 500/1000 docs
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          database: 'testdb',
          collection: 'coll1',
          processedDocs: 500,
          totalDocs: 1000,
        })
      })

      // Progress should be 50%
      const progressEl = screen.getByTestId(`progress-${exportId}`)
      expect(progressEl).toHaveTextContent('50')
    })

    it('should calculate 100% progress when processedDocs equals totalDocs', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test Export')
      })

      // Simulate 100% progress
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'finalizing',
          database: 'testdb',
          processedDocs: 1000,
          totalDocs: 1000,
        })
      })

      const progressEl = screen.getByTestId(`progress-${exportId}`)
      expect(progressEl).toHaveTextContent('100')
    })

    it('should not allow progress to go backwards', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1', 'coll2'], 'Test')
      })

      // First progress: 60%
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          processedDocs: 600,
          totalDocs: 1000,
        })
      })

      expect(screen.getByTestId(`progress-${exportId}`)).toHaveTextContent('60')

      // Lower progress event (should be ignored)
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          processedDocs: 400,
          totalDocs: 1000,
        })
      })

      // Progress should still be 60%
      expect(screen.getByTestId(`progress-${exportId}`)).toHaveTextContent('60')
    })

    it('should cap progress at 100%', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
      })

      // Simulate more docs than expected (estimatedCount can be off)
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          processedDocs: 1200,
          totalDocs: 1000,
        })
      })

      // Progress should cap at 100%
      expect(screen.getByTestId(`progress-${exportId}`)).toHaveTextContent('100')
    })

    it('should handle smooth progress across collections', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1', 'coll2'], 'Test')
      })

      // Progress events simulating collection export sequence
      const progressSequence = [
        { processedDocs: 0, totalDocs: 1000 },     // Start
        { processedDocs: 100, totalDocs: 1000 },   // 10%
        { processedDocs: 200, totalDocs: 1000 },   // 20%
        { processedDocs: 250, totalDocs: 1000 },   // 25% - end of coll1
        { processedDocs: 500, totalDocs: 1000 },   // 50%
        { processedDocs: 750, totalDocs: 1000 },   // 75%
        { processedDocs: 1000, totalDocs: 1000 },  // 100% - end of coll2
      ]

      let prevProgress = -1
      for (const { processedDocs, totalDocs } of progressSequence) {
        act(() => {
          eventHandlers['export:progress']({
            exportId: 'backend-123',
            phase: 'exporting',
            processedDocs,
            totalDocs,
          })
        })

        const currentProgress = parseInt(screen.getByTestId(`progress-${exportId}`).textContent || '0')
        expect(currentProgress).toBeGreaterThanOrEqual(prevProgress)
        prevProgress = currentProgress
      }

      // Final progress should be 100%
      expect(screen.getByTestId(`progress-${exportId}`)).toHaveTextContent('100')
    })

    it('should fall back to database index when totalDocs is 0', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', null, 'Test')
      })

      // Progress without totalDocs, using database index
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          databaseIndex: 2,
          databaseTotal: 4,
          processedDocs: 0,
          totalDocs: 0,
        })
      })

      // Fallback calculation: ((2-1) / 4) * 100 = 25%
      expect(screen.getByTestId(`progress-${exportId}`)).toHaveTextContent('25')
    })
  })

  describe('concurrent exports', () => {
    it('should track multiple exports independently', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId1: string | undefined
      let exportId2: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId1 = contextRef!.trackZipExport('conn1', 'db1', ['coll1'], 'Export 1')
        exportId2 = contextRef!.trackZipExport('conn1', 'db2', ['coll2'], 'Export 2')
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('2')

      // Progress for export 1
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-1',
          phase: 'exporting',
          processedDocs: 300,
          totalDocs: 1000,
        })
      })

      // First export (without backendExportId yet) should receive the event
      expect(screen.getByTestId(`progress-${exportId1}`)).toHaveTextContent('30')

      // Now export 1 has backendExportId, progress for export 2 should go to export 2
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-2',
          phase: 'exporting',
          processedDocs: 500,
          totalDocs: 500,
        })
      })

      expect(screen.getByTestId(`progress-${exportId2}`)).toHaveTextContent('100')
      // Export 1 should remain at 30%
      expect(screen.getByTestId(`progress-${exportId1}`)).toHaveTextContent('30')
    })

    it('should match progress events by backendExportId', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId1: string | undefined
      let exportId2: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId1 = contextRef!.trackZipExport('conn1', 'db1', ['coll1'], 'Export 1')
        exportId2 = contextRef!.trackZipExport('conn1', 'db2', ['coll2'], 'Export 2')
      })

      // Initialize both with their backend IDs
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-1',
          phase: 'exporting',
          processedDocs: 100,
          totalDocs: 1000,
        })
      })

      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-2',
          phase: 'exporting',
          processedDocs: 50,
          totalDocs: 500,
        })
      })

      // Now send updates - they should go to the correct exports
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-2',
          phase: 'exporting',
          processedDocs: 250,
          totalDocs: 500,
        })
      })

      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-1',
          phase: 'exporting',
          processedDocs: 500,
          totalDocs: 1000,
        })
      })

      expect(screen.getByTestId(`progress-${exportId1}`)).toHaveTextContent('50')
      expect(screen.getByTestId(`progress-${exportId2}`)).toHaveTextContent('50')
    })
  })

  describe('export:complete event', () => {
    it('should remove export on complete', () => {
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
      })

      // Set backend ID first
      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          processedDocs: 500,
          totalDocs: 1000,
        })
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('1')

      // Complete the export
      act(() => {
        eventHandlers['export:complete']({
          exportId: 'backend-123',
          filePath: '/path/to/file.zip',
        })
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('0')
    })

    it('should add to completed history on complete', () => {
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
      })

      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          processedDocs: 1000,
          totalDocs: 1000,
        })
      })

      act(() => {
        eventHandlers['export:complete']({
          exportId: 'backend-123',
          filePath: '/path/to/file.zip',
        })
      })

      expect(contextRef!.completedExports.length).toBe(1)
      expect(contextRef!.completedExports[0].filePath).toBe('/path/to/file.zip')
    })
  })

  describe('export:cancelled event', () => {
    it('should remove export on cancel', () => {
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
      })

      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-123',
          phase: 'exporting',
          processedDocs: 500,
          totalDocs: 1000,
        })
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('1')

      act(() => {
        eventHandlers['export:cancelled']({
          exportId: 'backend-123',
        })
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('0')
    })
  })

  describe('CSV export progress', () => {
    it('should calculate CSV progress based on current/total', async () => {
      vi.useFakeTimers()
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        contextRef!.queueCSVExport('conn1', 'testdb', 'testcoll', {
          filePath: '/test/path.csv',
        })
      })

      // Verify export is queued
      expect(screen.getByTestId('export-count')).toHaveTextContent('1')

      // Get the export ID from the DOM
      const exportEl = screen.getByTestId('export-count').parentElement!
      const progressEls = exportEl.querySelectorAll('[data-testid^="progress-"]')
      const exportId = progressEls[0].getAttribute('data-testid')!.replace('progress-', '')

      // Advance timers to allow queue processing (50ms delay + processing)
      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      // CSV progress uses current/total (percentage * 100 format from backend)
      // The backend sends current as percentage * 100 (e.g., 5000 = 50.00%)
      act(() => {
        eventHandlers['export:progress']({
          phase: 'downloading',
          database: 'testdb',
          collection: 'testcoll',
          current: 5000,  // 50.00%
          total: 10000,   // 100.00%
        })
      })

      // For CSV, progress = (current / total) * 100 = 50%
      expect(screen.getByTestId(`progress-${exportId}`)).toHaveTextContent('50')

      vi.useRealTimers()
    })
  })

  describe('getLeadingExport', () => {
    it('should return export with highest progress', () => {
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        contextRef!.trackZipExport('conn1', 'db1', ['coll1'], 'Export 1')
        contextRef!.trackZipExport('conn1', 'db2', ['coll2'], 'Export 2')
      })

      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-1',
          processedDocs: 300,
          totalDocs: 1000,
        })
      })

      act(() => {
        eventHandlers['export:progress']({
          exportId: 'backend-2',
          processedDocs: 400,
          totalDocs: 500,
        })
      })

      const leading = contextRef!.getLeadingExport()
      // Export 2 has 80% (400/500), Export 1 has 30% (300/1000)
      expect(leading!.progress).toBe(80)
    })

    it('should return null when no exports', () => {
      let contextRef: ExportQueueContextValue | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      const leading = contextRef!.getLeadingExport()
      expect(leading).toBeNull()
    })
  })

  describe('cancelExport', () => {
    it('should remove queued export immediately', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      // Track (not queue) to keep it in queued state for testing
      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
        // Manually set to queued state
        contextRef!.updateTrackedExport(exportId!, { phase: 'queued' })
      })

      act(() => {
        contextRef!.cancelExport(exportId!)
      })

      expect(screen.getByTestId('export-count')).toHaveTextContent('0')
    })

    it('should call CancelExport for active export', () => {
      let contextRef: ExportQueueContextValue | undefined
      let exportId: string | undefined
      renderWithProviders(<TestConsumer onMount={ctx => { contextRef = ctx }} />)

      act(() => {
        exportId = contextRef!.trackZipExport('conn1', 'testdb', ['coll1'], 'Test')
      })

      act(() => {
        contextRef!.cancelExport(exportId!)
      })

      expect(window.go!.main!.App!.CancelExport).toHaveBeenCalled()
    })
  })
})
