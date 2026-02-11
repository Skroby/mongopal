import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import ImportDialog from './ImportDialog'

// Event handlers storage
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
let mockGetImportFilePath: Mock
let mockDetectFileFormat: Mock
let mockPreviewJSONFile: Mock
let mockPreviewCSVFile: Mock
let mockImportJSON: Mock
let mockDryRunImportJSON: Mock
let mockImportCSV: Mock
let mockDryRunImportCSV: Mock
let mockCancelImport: Mock
let mockPauseImport: Mock
let mockResumeImport: Mock
let mockListDatabases: Mock
let mockListCollections: Mock
let mockCheckToolAvailability: Mock
let mockImportWithMongorestore: Mock
let mockGetBSONImportDirPath: Mock
let mockScanImportDir: Mock
let mockPreviewArchive: Mock

const makeArchivePreview = () => ({
  databases: [
    {
      name: 'testdb',
      collections: [
        { name: 'users', documents: 1000 },
        { name: 'orders', documents: 500 },
      ],
    },
    {
      name: 'analytics',
      collections: [
        { name: 'events', documents: 2000 },
      ],
    },
  ],
})

const makeImportResult = (overrides = {}) => ({
  databases: [{ name: 'testdb', collections: [{ name: 'users', documentsInserted: 1000, documentsSkipped: 0 }] }],
  documentsInserted: 1000,
  documentsSkipped: 0,
  documentsFailed: 0,
  errors: [],
  ...overrides,
})

const makeJSONPreview = () => ({
  filePath: '/tmp/data.json',
  format: 'jsonarray' as const,
  documentCount: 100,
  fileSize: 5000,
  sampleDoc: '{"_id": "1", "name": "test"}',
})

const makeCSVPreview = () => ({
  filePath: '/tmp/data.csv',
  headers: ['name', 'email'],
  sampleRows: [['Alice', 'alice@test.com'], ['Bob', 'bob@test.com']],
  totalRows: 50,
  fileSize: 2000,
  delimiter: ',',
})

beforeEach(() => {
  Object.keys(eventHandlerMap).forEach(key => delete eventHandlerMap[key])

  mockGetImportFilePath = vi.fn().mockResolvedValue('/tmp/data.json')
  mockDetectFileFormat = vi.fn().mockResolvedValue('ndjson')
  mockPreviewJSONFile = vi.fn().mockResolvedValue(makeJSONPreview())
  mockPreviewCSVFile = vi.fn().mockResolvedValue(makeCSVPreview())
  mockImportJSON = vi.fn().mockResolvedValue(makeImportResult())
  mockDryRunImportJSON = vi.fn().mockResolvedValue(makeImportResult())
  mockImportCSV = vi.fn().mockResolvedValue(makeImportResult())
  mockDryRunImportCSV = vi.fn().mockResolvedValue(makeImportResult())
  mockCancelImport = vi.fn()
  mockPauseImport = vi.fn()
  mockResumeImport = vi.fn()
  mockListDatabases = vi.fn().mockResolvedValue([{ name: 'testdb' }, { name: 'other' }])
  mockListCollections = vi.fn().mockResolvedValue([{ name: 'users', count: 100 }, { name: 'orders', count: 50 }])
  mockCheckToolAvailability = vi.fn().mockResolvedValue({ mongodump: true, mongorestore: true })
  mockImportWithMongorestore = vi.fn().mockResolvedValue(makeImportResult())
  mockGetBSONImportDirPath = vi.fn().mockResolvedValue('/tmp/dump')
  mockScanImportDir = vi.fn().mockResolvedValue([
    { name: 'testdb.archive', size: 1024000 },
    { name: 'analytics.archive', size: 512000 },
  ])
  mockPreviewArchive = vi.fn().mockImplementation((_connId: string, path: string) => {
    if (path.includes('testdb')) {
      return Promise.resolve({
        databases: [{ name: 'testdb', collections: [{ name: 'users', documents: 1000 }, { name: 'orders', documents: 500 }] }],
      })
    }
    if (path.includes('analytics')) {
      return Promise.resolve({
        databases: [{ name: 'analytics', collections: [{ name: 'events', documents: 2000 }] }],
      })
    }
    return Promise.resolve(makeArchivePreview())
  })

  ;(window as unknown as { go: unknown }).go = {
    main: {
      App: {
        GetImportFilePath: mockGetImportFilePath,
        DetectFileFormat: mockDetectFileFormat,
        PreviewJSONFile: mockPreviewJSONFile,
        PreviewCSVFile: mockPreviewCSVFile,
        ImportJSON: mockImportJSON,
        DryRunImportJSON: mockDryRunImportJSON,
        ImportCSV: mockImportCSV,
        DryRunImportCSV: mockDryRunImportCSV,
        CancelImport: mockCancelImport,
        PauseImport: mockPauseImport,
        ResumeImport: mockResumeImport,
        ListDatabases: mockListDatabases,
        ListCollections: mockListCollections,
        CheckToolAvailability: mockCheckToolAvailability,
        ImportWithMongorestore: mockImportWithMongorestore,
        GetBSONImportDirPath: mockGetBSONImportDirPath,
        ScanImportDir: mockScanImportDir,
        PreviewArchive: mockPreviewArchive,
      },
    },
  }
})

afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as { go?: unknown }).go
})

interface RenderProps {
  open?: boolean
  connectionId?: string
  connectionName?: string
  databaseName?: string
  onClose?: Mock
  onHide?: Mock
  onComplete?: Mock
  onZipDetected?: Mock
}

const renderDialog = (props: RenderProps = {}) => {
  const defaultProps = {
    open: true,
    connectionId: 'conn1',
    connectionName: 'Test Connection',
    onClose: vi.fn(),
    ...props,
  }

  return {
    ...render(
      <NotificationProvider>
        <ExportQueueProvider>
          <ImportDialog {...defaultProps} />
        </ExportQueueProvider>
      </NotificationProvider>
    ),
    onClose: defaultProps.onClose,
  }
}

describe('ImportDialog', () => {
  describe('initial state', () => {
    it('renders the select step with file selection options', () => {
      renderDialog()
      expect(screen.getByText('Import')).toBeInTheDocument()
      expect(screen.getByText('Choose File...')).toBeInTheDocument()
    })

    it('shows mongorestore folder option when tools available', async () => {
      renderDialog()
      await waitFor(() => {
        expect(screen.getByText('Select Folder...')).toBeInTheDocument()
      })
    })

    it('does not show folder option when mongorestore unavailable', async () => {
      mockCheckToolAvailability.mockResolvedValue({ mongodump: false, mongorestore: false })
      renderDialog()
      // Wait for tool check to complete
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
      expect(screen.queryByText('Select Folder...')).not.toBeInTheDocument()
    })

    it('closes on Cancel click', () => {
      const { onClose } = renderDialog()
      fireEvent.click(screen.getByText('Cancel'))
      expect(onClose).toHaveBeenCalled()
    })

    it('closes on Escape key', () => {
      const { onClose } = renderDialog()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('JSON import flow', () => {
    it('detects JSON and moves to configure step', async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/data.json')
      mockDetectFileFormat.mockResolvedValue('ndjson')
      renderDialog()

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })

      await waitFor(() => {
        expect(screen.getByText('Target Database')).toBeInTheDocument()
        expect(screen.getByText('Target Collection')).toBeInTheDocument()
      })
    })

    it('delegates ZIP files to onZipDetected', async () => {
      const onZipDetected = vi.fn()
      const onClose = vi.fn()
      mockGetImportFilePath.mockResolvedValue('/tmp/export.zip')
      mockDetectFileFormat.mockResolvedValue('zip')
      renderDialog({ onZipDetected, onClose })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })

      await waitFor(() => {
        expect(onZipDetected).toHaveBeenCalledWith('/tmp/export.zip')
        expect(onClose).toHaveBeenCalled()
      })
    })
  })

  describe('BSON single archive flow', () => {
    const selectArchiveFile = async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())

      renderDialog()
      // Wait for tool availability check
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })

      // Wait for archive preview to load
      await waitFor(() => {
        expect(mockPreviewArchive).toHaveBeenCalledWith('conn1', '/tmp/dump.archive')
      })
      // Let the preview resolve
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }

    it('loads archive preview and shows Next button', async () => {
      await selectArchiveFile()

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument()
      })
    })

    it('navigates to bsonConfigure step on Next click', async () => {
      await selectArchiveFile()

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Should show tree view with Select All / Deselect All
      expect(screen.getByText('Select All')).toBeInTheDocument()
      expect(screen.getByText('Deselect All')).toBeInTheDocument()
    })

    it('shows databases and collections in tree view', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Should show database names
      expect(screen.getByText('testdb')).toBeInTheDocument()
      expect(screen.getByText('analytics')).toBeInTheDocument()
    })

    it('pre-selects all databases and collections', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Should show full selection count
      expect(screen.getByText('3 collections in 2 databases')).toBeInTheDocument()
    })

    it('expands database to show collections', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Click on database name to expand
      fireEvent.click(screen.getByText('testdb'))

      // Should show collections
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('orders')).toBeInTheDocument()
    })

    it('deselects collection and updates count', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Expand testdb
      fireEvent.click(screen.getByText('testdb'))

      // Find and uncheck 'users' collection
      const usersCheckbox = screen.getByText('users').closest('label')?.querySelector('input[type="checkbox"]')
      expect(usersCheckbox).toBeTruthy()
      fireEvent.click(usersCheckbox!)

      // Count should update
      expect(screen.getByText('2 collections in 2 databases')).toBeInTheDocument()
    })

    it('deselects all collections in a database via database checkbox', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Find the testdb row's checkbox (the one next to the database name)
      const testdbRow = screen.getByText('testdb').closest('div[class*="flex items-center"]')
      const dbCheckbox = testdbRow?.querySelector('input[type="checkbox"]')
      expect(dbCheckbox).toBeTruthy()

      // Click to deselect entire database
      fireEvent.click(dbCheckbox!)

      // Count should update to only analytics
      expect(screen.getByText('1 collection in 1 database')).toBeInTheDocument()
    })

    it('Deselect All clears selection', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      fireEvent.click(screen.getByText('Deselect All'))
      expect(screen.getByText('0 collections in 0 databases')).toBeInTheDocument()

      // Import button should be disabled
      const importBtn = screen.getByRole('button', { name: 'Import' })
      expect(importBtn).toBeDisabled()
    })

    it('Select All restores full selection', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      fireEvent.click(screen.getByText('Deselect All'))
      fireEvent.click(screen.getByText('Select All'))
      expect(screen.getByText('3 collections in 2 databases')).toBeInTheDocument()
    })

    it('imports all selected with no nsInclude when fully selected', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      expect(mockImportWithMongorestore).toHaveBeenCalledWith('conn1', {
        inputPath: '/tmp/dump.archive',
        drop: false,
      })
    })

    it('passes nsInclude when partially selected', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Expand testdb and deselect 'orders'
      fireEvent.click(screen.getByText('testdb'))
      const ordersCheckbox = screen.getByText('orders').closest('label')?.querySelector('input[type="checkbox"]')
      fireEvent.click(ordersCheckbox!)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      expect(mockImportWithMongorestore).toHaveBeenCalledWith('conn1', {
        inputPath: '/tmp/dump.archive',
        drop: false,
        nsInclude: expect.arrayContaining(['testdb.users', 'analytics.events']),
      })
      // Should NOT include testdb.orders
      const call = mockImportWithMongorestore.mock.calls[0][1]
      expect(call.nsInclude).not.toContain('testdb.orders')
    })

    it('Back button returns to select step', async () => {
      await selectArchiveFile()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      expect(screen.getByText('Select All')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Back'))

      // Should be back on select step
      expect(screen.getByText('Choose File...')).toBeInTheDocument()
    })
  })

  describe('BSON drop mode', () => {
    const goToBsonConfigure = async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())

      renderDialog()
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })
    }

    it('shows drop checkbox in bsonConfigure step', async () => {
      await goToBsonConfigure()
      expect(screen.getByText('Drop existing collections before import')).toBeInTheDocument()
    })

    it('shows confirmation dialog when drop is checked', async () => {
      await goToBsonConfigure()

      // Check the drop checkbox
      const dropCheckbox = screen.getByText('Drop existing collections before import').closest('label')?.querySelector('input[type="checkbox"]')
      fireEvent.click(dropCheckbox!)

      // Button should change to "Drop & Import"
      const importBtn = screen.getByRole('button', { name: 'Drop & Import' })
      expect(importBtn).toBeInTheDocument()

      // Click "Drop & Import" should show confirmation
      await act(async () => {
        fireEvent.click(importBtn)
      })

      expect(screen.getByText(/Selected collections will be/)).toBeInTheDocument()
    })

    it('confirms drop and starts import', async () => {
      await goToBsonConfigure()

      // Check drop
      const dropCheckbox = screen.getByText('Drop existing collections before import').closest('label')?.querySelector('input[type="checkbox"]')
      fireEvent.click(dropCheckbox!)

      // Click "Drop & Import"
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Drop & Import' }))
      })

      // Confirm in dialog — find the confirm button inside the ConfirmDialog
      const confirmButtons = screen.getAllByRole('button', { name: 'Drop & Import' })
      const dialogConfirm = confirmButtons[confirmButtons.length - 1]

      await act(async () => {
        fireEvent.click(dialogConfirm)
      })

      expect(mockImportWithMongorestore).toHaveBeenCalledWith('conn1', expect.objectContaining({
        drop: true,
      }))
    })

    it('shows warning text when drop is enabled', async () => {
      await goToBsonConfigure()

      const dropCheckbox = screen.getByText('Drop existing collections before import').closest('label')?.querySelector('input[type="checkbox"]')
      fireEvent.click(dropCheckbox!)

      expect(screen.getByText(/Target collections will be permanently deleted/)).toBeInTheDocument()
    })
  })

  describe('BSON directory flow', () => {
    const selectArchiveDirectory = async () => {
      renderDialog()
      // Wait for tool availability check
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Select Folder...'))
      })

      // Wait for scan and previews to resolve
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    }

    it('shows archive files with checkboxes after folder selection', async () => {
      await selectArchiveDirectory()

      expect(screen.getByText('testdb.archive')).toBeInTheDocument()
      expect(screen.getByText('analytics.archive')).toBeInTheDocument()
    })

    it('pre-selects all archive files', async () => {
      await selectArchiveDirectory()

      expect(screen.getByText(/2 of 2 archive/)).toBeInTheDocument()
    })

    it('shows Next button for directory with archives', async () => {
      await selectArchiveDirectory()

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument()
      })
    })

    it('aggregates tree from multiple archives', async () => {
      await selectArchiveDirectory()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Should show both databases from different archives
      expect(screen.getByText('testdb')).toBeInTheDocument()
      expect(screen.getByText('analytics')).toBeInTheDocument()
      expect(screen.getByText('3 collections in 2 databases')).toBeInTheDocument()
    })

    it('deselecting an archive file updates tree on Next', async () => {
      await selectArchiveDirectory()

      // Deselect analytics.archive
      const analyticsCheckbox = screen.getByText('analytics.archive').closest('label')?.querySelector('input[type="checkbox"]')
      fireEvent.click(analyticsCheckbox!)

      expect(screen.getByText(/1 of 2 archive/)).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      // Should only show testdb
      expect(screen.getByText('testdb')).toBeInTheDocument()
      expect(screen.queryByText('analytics')).not.toBeInTheDocument()
      expect(screen.getByText('2 collections in 1 database')).toBeInTheDocument()
    })

    it('passes files list when importing from directory', async () => {
      await selectArchiveDirectory()

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      expect(mockImportWithMongorestore).toHaveBeenCalledWith('conn1', expect.objectContaining({
        inputPath: '/tmp/dump',
        files: expect.arrayContaining(['testdb.archive', 'analytics.archive']),
      }))
    })

    it('Select All / Deselect All toggle archive files', async () => {
      await selectArchiveDirectory()

      // Click Deselect All for files
      const deselectButtons = screen.getAllByText('Deselect All')
      fireEvent.click(deselectButtons[0])

      expect(screen.getByText(/0 of 2 archive/)).toBeInTheDocument()

      // Click Select All for files
      const selectButtons = screen.getAllByText('Select All')
      fireEvent.click(selectButtons[0])

      expect(screen.getByText(/2 of 2 archive/)).toBeInTheDocument()
    })

    it('disables Next when no files selected', async () => {
      await selectArchiveDirectory()

      // Deselect all files
      const deselectButtons = screen.getAllByText('Deselect All')
      fireEvent.click(deselectButtons[0])

      const nextBtn = screen.getByText('Next')
      expect(nextBtn).toBeDisabled()
    })
  })

  describe('import progress and results', () => {
    const startBsonImport = async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())
      mockImportWithMongorestore.mockImplementation(() => new Promise(() => {})) // Never resolves

      renderDialog()
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })
    }

    it('shows importing step with progress', async () => {
      await startBsonImport()

      expect(screen.getByText(/Restoring from/)).toBeInTheDocument()
    })

    it('updates progress from events', async () => {
      await startBsonImport()

      act(() => {
        emitEvent('import:progress', { current: 500, total: 1000, collection: 'users', phase: 'importing' })
      })

      expect(screen.getByText('500 / 1,000 documents')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('shows done step on completion', async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())
      mockImportWithMongorestore.mockResolvedValue(makeImportResult({ documentsInserted: 1500 }))

      renderDialog()
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      await waitFor(() => {
        expect(screen.getByText('Import Complete')).toBeInTheDocument()
        expect(screen.getByText('1,500')).toBeInTheDocument()
      })
    })

    it('shows error step on failure and retries to bsonConfigure', async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())
      mockImportWithMongorestore.mockRejectedValue(new Error('Connection lost'))

      renderDialog()
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      await waitFor(() => {
        expect(screen.getByText('Import Failed')).toBeInTheDocument()
        expect(screen.getByText('Connection lost')).toBeInTheDocument()
      })

      // Retry should go to bsonConfigure
      fireEvent.click(screen.getByText('Retry'))
      expect(screen.getByText('Select All')).toBeInTheDocument()
    })

    it('handles cancellation', async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())
      mockImportWithMongorestore.mockRejectedValue(new Error('import cancelled'))

      renderDialog()
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      await waitFor(() => {
        expect(screen.getByText('Import Cancelled')).toBeInTheDocument()
      })
    })
  })

  describe('CSV import flow', () => {
    it('detects CSV and moves to configure step', async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/data.csv')
      mockDetectFileFormat.mockResolvedValue('csv')
      renderDialog()

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })

      await waitFor(() => {
        expect(screen.getByText('CSV')).toBeInTheDocument()
        expect(screen.getByText('Target Database')).toBeInTheDocument()
      })
    })
  })

  describe('does not close during active operations', () => {
    it('Escape does not close during importing', async () => {
      mockGetImportFilePath.mockResolvedValue('/tmp/dump.archive')
      mockDetectFileFormat.mockResolvedValue('archive')
      mockPreviewArchive.mockResolvedValue(makeArchivePreview())
      mockImportWithMongorestore.mockImplementation(() => new Promise(() => {}))

      const { onClose } = renderDialog()
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Choose File...'))
      })
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })

      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      })

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
