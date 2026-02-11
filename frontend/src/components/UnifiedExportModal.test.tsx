import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import UnifiedExportModal from './UnifiedExportModal'

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
let mockGetDatabasesForExport: Mock
let mockGetCollectionsForExport: Mock
let mockExportDatabases: Mock
let mockExportSelectiveDatabases: Mock
let mockExportCollections: Mock
let mockCancelExport: Mock
let mockGetZipSavePath: Mock

beforeEach(() => {
  Object.keys(eventHandlerMap).forEach(key => delete eventHandlerMap[key])
  mockGetDatabasesForExport = vi.fn().mockResolvedValue([
    { name: 'db1', sizeOnDisk: 1024 },
    { name: 'db2', sizeOnDisk: 2048 },
    { name: 'db3', sizeOnDisk: 4096 },
  ])
  mockGetCollectionsForExport = vi.fn().mockResolvedValue([
    { name: 'users', count: 1000, sizeOnDisk: 1024 },
    { name: 'orders', count: 5000, sizeOnDisk: 2048 },
    { name: 'products', count: 500, sizeOnDisk: 512 },
  ])
  mockExportDatabases = vi.fn().mockResolvedValue(undefined)
  mockExportSelectiveDatabases = vi.fn().mockResolvedValue(undefined)
  mockExportCollections = vi.fn().mockResolvedValue(undefined)
  mockCancelExport = vi.fn()
  mockGetZipSavePath = vi.fn().mockResolvedValue('/tmp/test-export.zip')

  ;(window as unknown as { go: unknown }).go = {
    main: {
      App: {
        GetDatabasesForExport: mockGetDatabasesForExport,
        GetCollectionsForExport: mockGetCollectionsForExport,
        ExportDatabases: mockExportDatabases,
        ExportSelectiveDatabases: mockExportSelectiveDatabases,
        ExportCollections: mockExportCollections,
        CancelExport: mockCancelExport,
        GetZipSavePath: mockGetZipSavePath,
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
  collectionName?: string
  onClose?: Mock
}

const selectSavePath = async (): Promise<void> => {
  const browseButton = screen.getByText('Browse...')
  await act(async () => {
    fireEvent.click(browseButton)
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  await waitFor(() => {
    expect(screen.getByText('test-export.zip')).toBeInTheDocument()
  })
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
        <UnifiedExportModal {...defaultProps} {...props} />
      </ExportQueueProvider>
    </NotificationProvider>
  )
}

describe('UnifiedExportModal', () => {
  describe('connection scope (no databaseName)', () => {
    it('should render with Export Databases title', async () => {
      renderModal()
      expect(screen.getByText('Export Databases')).toBeInTheDocument()
    })

    it('should show connection name in subtitle', async () => {
      renderModal()
      expect(screen.getByText('Test Connection')).toBeInTheDocument()
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

    it('should pre-select non-system databases', async () => {
      renderModal()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      // 3 databases, all non-system, should show 3 selected (counted as __ALL__ placeholder)
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

    it('should expand database to show collections', async () => {
      renderModal()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Click expand arrow on db1
      const expandButtons = screen.getAllByRole('button').filter(btn =>
        btn.querySelector('svg')?.classList.contains('transition-transform')
      )
      expect(expandButtons.length).toBeGreaterThan(0)

      await act(async () => {
        fireEvent.click(expandButtons[0])
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockGetCollectionsForExport).toHaveBeenCalledWith('conn1', 'db1')
    })

    it('should show preparing state when export starts', async () => {
      renderModal()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })
      expect(screen.getByText('Preparing export...')).toBeInTheDocument()
    })

    it('should register event handlers on mount', async () => {
      renderModal()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
      })
      expect(eventHandlerMap['export:progress']?.length).toBeGreaterThan(0)
      expect(eventHandlerMap['export:complete']?.length).toBeGreaterThan(0)
      expect(eventHandlerMap['export:cancelled']?.length).toBeGreaterThan(0)
    })

    it('should calculate progress based on processedDocs/totalDocs', async () => {
      renderModal()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
        await new Promise(resolve => setTimeout(resolve, 10))
      })

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
        await new Promise(resolve => setTimeout(resolve, 50))
      })

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
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

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

      await act(async () => {
        emitEvent('export:progress', {
          databaseIndex: 2,
          databaseTotal: 3,
          processedDocs: 1200,
          totalDocs: 3000,
        })
      })

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '60%' })
      })
    })

    it('should close modal on export complete', async () => {
      const onClose = vi.fn()
      renderModal({ onClose })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      await waitFor(() => {
        expect(screen.getByText('Preparing export...')).toBeInTheDocument()
      })

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

  describe('database scope (databaseName present)', () => {
    it('should render with Export Collections title', async () => {
      renderModal({ databaseName: 'testdb' })
      expect(screen.getByText('Export Collections')).toBeInTheDocument()
    })

    it('should show database name in subtitle', async () => {
      renderModal({ databaseName: 'testdb' })
      expect(screen.getByText('Test Connection / testdb')).toBeInTheDocument()
    })

    it('should load and display collections', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      expect(mockGetCollectionsForExport).toHaveBeenCalledWith('conn1', 'testdb')
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('orders')).toBeInTheDocument()
      expect(screen.getByText('products')).toBeInTheDocument()
    })

    it('should show document counts for collections', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      expect(screen.getByText('1.0K docs')).toBeInTheDocument()
      expect(screen.getByText('5.0K docs')).toBeInTheDocument()
      expect(screen.getByText('500 docs')).toBeInTheDocument()
    })

    it('should pre-select all collections', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      expect(screen.getByText('3 selected')).toBeInTheDocument()
    })

    it('should allow deselecting all', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      fireEvent.click(screen.getByText('Deselect All'))
      expect(screen.getByText('0 selected')).toBeInTheDocument()
    })

    it('should disable Export button when nothing selected', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      fireEvent.click(screen.getByText('Deselect All'))
      expect(screen.getByText('Export')).toBeDisabled()
    })

    it('should show preparing state when export starts', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })
      expect(screen.getByText('Preparing export...')).toBeInTheDocument()
    })

    it('should calculate progress based on processedDocs/totalDocs', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

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

      // The overall progress bar (54%) is within the "Overall Progress" section
      await waitFor(() => {
        const progressBars = document.querySelectorAll('[style*="width"]')
        // Find the overall progress bar (last one, after the collection mini bar)
        const overallBar = progressBars[progressBars.length - 1]
        expect(overallBar).toHaveStyle({ width: '54%' })
      })
    })

    it('should close modal on export complete', async () => {
      const onClose = vi.fn()
      renderModal({ databaseName: 'testdb', onClose })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      await waitFor(() => {
        expect(screen.getByText('Preparing export...')).toBeInTheDocument()
      })

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

  describe('collection scope (databaseName + collectionName)', () => {
    it('should pre-select only the specified collection', async () => {
      renderModal({ databaseName: 'testdb', collectionName: 'users' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })

    it('should render with Export Collections title', async () => {
      renderModal({ databaseName: 'testdb', collectionName: 'users' })
      expect(screen.getByText('Export Collections')).toBeInTheDocument()
    })
  })

  describe('export cancellation', () => {
    it('should show confirmation dialog when cancel clicked during export', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.getByText('Cancel Export?')).toBeInTheDocument()
    })

    it('should call CancelExport when confirmed', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })
      fireEvent.click(screen.getByText('Cancel'))
      fireEvent.click(screen.getByText('Yes, Cancel Export'))
      expect(mockCancelExport).toHaveBeenCalled()
    })

    it('should reset state on cancelled event', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })

      await waitFor(() => {
        expect(screen.getByText('Preparing export...')).toBeInTheDocument()
      })

      await act(async () => {
        emitEvent('export:cancelled', {})
      })

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument()
      })
    })
  })

  describe('hide functionality', () => {
    it('should show Hide button during export', async () => {
      renderModal({ databaseName: 'testdb' })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })
      expect(screen.getByText('Hide')).toBeInTheDocument()
    })

    it('should call onClose when Hide is clicked', async () => {
      const onClose = vi.fn()
      renderModal({ databaseName: 'testdb', onClose })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await selectSavePath()
      await act(async () => {
        fireEvent.click(screen.getByText('Export'))
      })
      fireEvent.click(screen.getByText('Hide'))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
