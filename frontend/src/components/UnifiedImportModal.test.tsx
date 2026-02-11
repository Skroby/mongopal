import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import UnifiedImportModal from './UnifiedImportModal'

// Event handlers storage - supports multiple handlers per event
const eventHandlerMap: Record<string, ((data: unknown) => void)[]> = {}

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

const emitEvent = (eventName: string, data: unknown): void => {
  const handlers = eventHandlerMap[eventName] || []
  handlers.forEach(handler => handler(data))
}

// Mock Go bindings
let mockPreviewCollectionsImportFile: Mock
let mockPreviewCollectionsImportFilePath: Mock
let mockImportDatabases: Mock
let mockImportSelectiveDatabases: Mock
let mockDryRunImport: Mock
let mockDryRunSelectiveImport: Mock
let mockImportCollections: Mock
let mockDryRunImportCollections: Mock
let mockCancelImport: Mock
let mockPauseImport: Mock
let mockResumeImport: Mock

const makePreviewData = () => ({
  filePath: '/tmp/test-export.zip',
  exportedAt: '2024-01-15 10:00:00',
  databases: [
    {
      name: 'db1',
      collections: [
        { name: 'users', docCount: 1000 },
        { name: 'orders', docCount: 5000 },
      ],
    },
    {
      name: 'db2',
      collections: [
        { name: 'products', docCount: 500 },
        { name: 'categories', docCount: 50 },
      ],
    },
  ],
})

beforeEach(() => {
  Object.keys(eventHandlerMap).forEach(key => delete eventHandlerMap[key])
  mockPreviewCollectionsImportFile = vi.fn().mockResolvedValue(makePreviewData())
  mockPreviewCollectionsImportFilePath = vi.fn().mockResolvedValue(makePreviewData())
  mockImportDatabases = vi.fn().mockResolvedValue(undefined)
  mockImportSelectiveDatabases = vi.fn().mockResolvedValue(undefined)
  mockDryRunImport = vi.fn().mockResolvedValue(undefined)
  mockDryRunSelectiveImport = vi.fn().mockResolvedValue(undefined)
  mockImportCollections = vi.fn().mockResolvedValue(undefined)
  mockDryRunImportCollections = vi.fn().mockResolvedValue({
    databases: [{ name: 'db1', collections: [{ name: 'users', documentsInserted: 1000, documentsSkipped: 0 }] }],
    documentsInserted: 1000,
    documentsSkipped: 0,
    errors: [],
  })
  mockCancelImport = vi.fn()
  mockPauseImport = vi.fn()
  mockResumeImport = vi.fn()

  ;(window as unknown as { go: unknown }).go = {
    main: {
      App: {
        PreviewCollectionsImportFile: mockPreviewCollectionsImportFile,
        PreviewCollectionsImportFilePath: mockPreviewCollectionsImportFilePath,
        ImportDatabases: mockImportDatabases,
        ImportSelectiveDatabases: mockImportSelectiveDatabases,
        DryRunImport: mockDryRunImport,
        DryRunSelectiveImport: mockDryRunSelectiveImport,
        ImportCollections: mockImportCollections,
        DryRunImportCollections: mockDryRunImportCollections,
        CancelImport: mockCancelImport,
        PauseImport: mockPauseImport,
        ResumeImport: mockResumeImport,
      },
    },
  }
})

afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as { go?: unknown }).go
})

interface RenderProps {
  connectionId?: string
  connectionName?: string
  databaseName?: string
  initialFilePath?: string
  onClose?: Mock
  onHide?: Mock
  onShow?: Mock
  onComplete?: Mock
}

const renderModal = (props: RenderProps = {}) => {
  const defaultProps = {
    connectionId: 'conn1',
    connectionName: 'Test Connection',
    onClose: vi.fn(),
  }
  return render(
    <NotificationProvider>
      <ExportQueueProvider>
        <UnifiedImportModal {...defaultProps} {...props} />
      </ExportQueueProvider>
    </NotificationProvider>
  )
}

describe('UnifiedImportModal', () => {
  describe('connection scope (no databaseName)', () => {
    it('should render with Import Databases title', () => {
      renderModal()
      expect(screen.getByText('Import Databases')).toBeInTheDocument()
    })

    it('should show connection name in subtitle', () => {
      renderModal()
      expect(screen.getByText('Test Connection')).toBeInTheDocument()
    })

    it('should show file selection step initially', () => {
      renderModal()
      expect(screen.getByText('Select File')).toBeInTheDocument()
    })

    it('should show configure step after selecting file', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Exported: 2024-01-15 10:00:00')).toBeInTheDocument()
      })
    })

    it('should show databases with expandable collections', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('db1')).toBeInTheDocument()
        expect(screen.getByText('db2')).toBeInTheDocument()
      })
    })

    it('should pre-select all databases and collections', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        // Should show total selection count (specific text in the selection counter)
        expect(screen.getByText('4 collections in 2 databases')).toBeInTheDocument()
      })
    })

    it('should show collection checkboxes when database is expanded', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('db1')).toBeInTheDocument()
      })

      // Databases auto-expand when <= 5, so collections should be visible
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('orders')).toBeInTheDocument()
    })

    it('should toggle individual collection selection', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Find the checkbox for 'users' collection (it's in a label)
      const usersLabel = screen.getByText('users').closest('label')!
      const usersCheckbox = usersLabel.querySelector('input[type="checkbox"]')!

      await act(async () => {
        fireEvent.click(usersCheckbox)
      })

      // Should now show 3 collections selected
      expect(screen.getByText(/3 collection/)).toBeInTheDocument()
    })

    it('should deselect all with Deselect All button', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Deselect All')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Deselect All'))
      })

      expect(screen.getByText(/0 collection/)).toBeInTheDocument()
    })

    it('should disable Preview Changes when nothing selected', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Deselect All')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Deselect All'))
      })

      const previewButton = screen.getByText('Preview Changes')
      expect(previewButton).toBeDisabled()
    })

    it('should call DryRunImport when all databases fully selected', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockDryRunImport).toHaveBeenCalledWith('conn1', {
        filePath: '/tmp/test-export.zip',
        databases: expect.arrayContaining(['db1', 'db2']),
        mode: 'skip',
      })
    })

    it('should call DryRunSelectiveImport when partially selected', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Deselect one collection to make partial selection
      const usersLabel = screen.getByText('users').closest('label')!
      const usersCheckbox = usersLabel.querySelector('input[type="checkbox"]')!
      await act(async () => {
        fireEvent.click(usersCheckbox)
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockDryRunSelectiveImport).toHaveBeenCalledWith(
        'conn1',
        expect.objectContaining({
          db1: ['orders'],
          db2: expect.arrayContaining(['products', 'categories']),
        }),
        'skip',
        '/tmp/test-export.zip'
      )
    })

    it('should show preview step when dry-run completes', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Emit dry-run complete event
      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [
            { name: 'db1', collections: [{ name: 'users', documentsInserted: 1000, documentsSkipped: 0 }, { name: 'orders', documentsInserted: 5000, documentsSkipped: 0 }] },
            { name: 'db2', collections: [{ name: 'products', documentsInserted: 500, documentsSkipped: 0 }] },
          ],
          documentsInserted: 6500,
          documentsSkipped: 0,
          errors: [],
        })
      })

      expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      expect(screen.getByText(/6,500/)).toBeInTheDocument()
    })

    it('should show import mode options', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Keep Existing (Skip)')).toBeInTheDocument()
        expect(screen.getByText('Override (Drop & Replace)')).toBeInTheDocument()
      })
    })

    it('should call ImportDatabases when all fully selected on import', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Emit dry-run complete
      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }, { name: 'db2', collections: [] }],
          documentsInserted: 100,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockImportDatabases).toHaveBeenCalledWith('conn1', {
        filePath: '/tmp/test-export.zip',
        databases: expect.arrayContaining(['db1', 'db2']),
        mode: 'skip',
      })
    })

    it('should show done step when import completes', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 100,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('import:complete', {
          databases: [{ name: 'db1', collections: [{ name: 'users', documentsInserted: 100, documentsSkipped: 0 }] }],
          documentsInserted: 100,
          documentsSkipped: 0,
          errors: [],
        })
      })

      expect(screen.getByText('Import Complete')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('should auto-preview when initialFilePath is provided', async () => {
      renderModal({ initialFilePath: '/tmp/pre-selected.zip' })

      await waitFor(() => {
        expect(mockPreviewCollectionsImportFilePath).toHaveBeenCalledWith('/tmp/pre-selected.zip')
      })

      await waitFor(() => {
        expect(screen.getByText('Exported: 2024-01-15 10:00:00')).toBeInTheDocument()
      })
    })

    it('should show error step with skip & continue option', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }, { name: 'db2', collections: [] }],
          documentsInserted: 100,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('import:error', {
          error: 'Connection timeout',
          partialResult: { databases: [], documentsInserted: 50, documentsSkipped: 0, errors: [] },
          failedDatabase: 'db1',
          failedCollection: 'users',
          remainingDatabases: ['db1', 'db2'],
        })
      })

      expect(screen.getByText('Import Failed')).toBeInTheDocument()
      expect(screen.getByText('Skip & Continue')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('should call CancelImport on cancel button during import', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 100,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      fireEvent.click(screen.getByText('Cancel'))
      expect(mockCancelImport).toHaveBeenCalled()
    })

    it('should show override confirmation for override mode', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Override (Drop & Replace)')).toBeInTheDocument()
      })

      // Select override mode
      fireEvent.click(screen.getByText('Override (Drop & Replace)'))

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [{ name: 'users', documentsInserted: 1000, documentsSkipped: 0 }] }],
          documentsInserted: 1000,
          documentsDropped: 500,
          documentsSkipped: 0,
          errors: [],
        })
      })

      // Should show Drop & Import button instead of Import
      expect(screen.getByText('Drop & Import')).toBeInTheDocument()
    })
  })

  describe('database scope (with databaseName)', () => {
    it('should render with Import Collections title', () => {
      renderModal({ databaseName: 'testdb' })
      expect(screen.getByText('Import Collections')).toBeInTheDocument()
    })

    it('should show database name in subtitle', () => {
      renderModal({ databaseName: 'testdb' })
      expect(screen.getByText(/Test Connection \/ testdb/)).toBeInTheDocument()
    })

    it('should show source database dropdown after file selection', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Import from database')).toBeInTheDocument()
      })
    })

    it('should auto-select matching database from archive', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        // Should show flat collection list from db1
        expect(screen.getByText('users')).toBeInTheDocument()
        expect(screen.getByText('orders')).toBeInTheDocument()
      })
    })

    it('should show flat collection list (not expandable tree)', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Should show simple count (not "X collections in Y databases")
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('should toggle individual collection', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      const usersLabel = screen.getByText('users').closest('label')!
      const usersCheckbox = usersLabel.querySelector('input[type="checkbox"]')!

      await act(async () => {
        fireEvent.click(usersCheckbox)
      })

      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })

    it('should call DryRunImportCollections for database scope preview', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockDryRunImportCollections).toHaveBeenCalledWith('conn1', 'db1', {
        filePath: '/tmp/test-export.zip',
        sourceDatabase: 'db1',
        collections: expect.arrayContaining(['users', 'orders']),
        mode: 'skip',
      })
    })

    it('should call ImportCollections on import start', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // DryRunImportCollections returns result synchronously (Promise-based, not event-based)
      await waitFor(() => {
        expect(screen.getByText('Import')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockImportCollections).toHaveBeenCalledWith('conn1', 'db1', {
        filePath: '/tmp/test-export.zip',
        sourceDatabase: 'db1',
        collections: expect.arrayContaining(['users', 'orders']),
        mode: 'skip',
      })
    })

    it('should show cross-database warning', async () => {
      renderModal({ databaseName: 'other_db' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // No matching database, so first one is selected (db1)
      await waitFor(() => {
        expect(screen.getByText(/will be imported into "other_db"/)).toBeInTheDocument()
      })
    })

    it('should show "Select a source database" when none selected', async () => {
      // Use a preview with no matching database and override auto-select
      mockPreviewCollectionsImportFile.mockResolvedValue({
        filePath: '/tmp/test.zip',
        exportedAt: '2024-01-15 10:00:00',
        databases: [],
      })

      renderModal({ databaseName: 'testdb' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Select a source database to view its collections')).toBeInTheDocument()
      })
    })

    it('should not show skip & continue in error state (database scope)', async () => {
      renderModal({ databaseName: 'db1' })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Import')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('import:error', {
          error: 'Connection timeout',
          partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
          failedDatabase: 'db1',
          failedCollection: 'users',
        })
      })

      expect(screen.getByText('Import Failed')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
      // No Skip & Continue for database scope
      expect(screen.queryByText('Skip & Continue')).not.toBeInTheDocument()
    })
  })

  describe('shared behavior', () => {
    it('should handle pause and resume', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 0,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Click pause
      fireEvent.click(screen.getByText('Pause'))
      expect(mockPauseImport).toHaveBeenCalled()

      // Simulate pause event
      await act(async () => {
        emitEvent('import:paused', null)
      })
      expect(screen.getByText('Import paused')).toBeInTheDocument()
      expect(screen.getByText('Resume')).toBeInTheDocument()

      // Click resume
      fireEvent.click(screen.getByText('Resume'))
      expect(mockResumeImport).toHaveBeenCalled()
    })

    it('should handle cancellation result', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 0,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('import:cancelled', {
          databases: [{ name: 'db1', collections: [{ name: 'users', documentsInserted: 50, documentsSkipped: 0 }] }],
          documentsInserted: 50,
          documentsSkipped: 0,
          errors: [],
        })
      })

      expect(screen.getByText('Import Cancelled')).toBeInTheDocument()
    })

    it('should close on Escape in select step', () => {
      const onClose = vi.fn()
      renderModal({ onClose })

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()
    })

    it('should cancel import on Escape during importing', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 0,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(mockCancelImport).toHaveBeenCalled()
    })

    it('should go back to configure from preview', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 0,
          documentsSkipped: 0,
          errors: [],
        })
      })

      fireEvent.click(screen.getByText('Back'))
      // Should be back in configure step
      expect(screen.getByText('Import Mode')).toBeInTheDocument()
    })

    it('should handle cancel analysis during previewing', async () => {
      renderModal()

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Should be in previewing step
      expect(screen.getByText('Analyzing changes...')).toBeInTheDocument()
      expect(screen.getByText('Cancel Analysis')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Cancel Analysis'))
      // Should be back in configure step
      expect(screen.getByText('Import Mode')).toBeInTheDocument()
    })

    it('should call onComplete when done and results exist', async () => {
      const onComplete = vi.fn()
      const onClose = vi.fn()
      renderModal({ onComplete, onClose })

      await act(async () => {
        fireEvent.click(screen.getByText('Select File'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await waitFor(() => {
        expect(screen.getByText('Preview Changes')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Preview Changes'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('dryrun:complete', {
          databases: [{ name: 'db1', collections: [] }],
          documentsInserted: 0,
          documentsSkipped: 0,
          errors: [],
        })
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Import'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        emitEvent('import:complete', {
          databases: [{ name: 'db1', collections: [{ name: 'users', documentsInserted: 100, documentsSkipped: 0 }] }],
          documentsInserted: 100,
          documentsSkipped: 0,
          errors: [],
        })
      })

      fireEvent.click(screen.getByText('Done'))
      expect(onComplete).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })
})
