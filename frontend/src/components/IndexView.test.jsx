import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ConnectionProvider, useConnection } from './contexts/ConnectionContext'
import IndexView from './IndexView'

// Mock the ConnectionContext
vi.mock('./contexts/ConnectionContext', async () => {
  const actual = await vi.importActual('./contexts/ConnectionContext')
  return {
    ...actual,
    useConnection: vi.fn(),
  }
})

// Mock the go object with dynamic implementation
let mockListIndexes = vi.fn()
let mockCreateIndex = vi.fn()
let mockDropIndex = vi.fn()

const defaultConnectionContext = {
  activeConnections: ['conn1'],
  connectingIds: new Set(),
  connect: vi.fn(),
}

beforeEach(() => {
  mockListIndexes = vi.fn()
  mockCreateIndex = vi.fn()
  mockDropIndex = vi.fn()
  window.go = {
    main: {
      App: {
        ListIndexes: mockListIndexes,
        CreateIndex: mockCreateIndex,
        DropIndex: mockDropIndex,
      },
    },
  }
  useConnection.mockReturnValue(defaultConnectionContext)
})

afterEach(() => {
  vi.clearAllMocks()
  delete window.go
})

const renderWithProvider = (component) => {
  return render(<NotificationProvider>{component}</NotificationProvider>)
}

describe('IndexView', () => {
  const defaultProps = {
    connectionId: 'conn1',
    database: 'testdb',
    collection: 'testcoll',
  }

  const mockIndexes = [
    {
      name: '_id_',
      keys: { _id: 1 },
      unique: false,
      sparse: false,
      ttl: 0,
      size: 4096,
      usageCount: 100,
    },
    {
      name: 'email_1',
      keys: { email: 1 },
      unique: true,
      sparse: false,
      ttl: 0,
      size: 8192,
      usageCount: 50,
    },
    {
      name: 'createdAt_1',
      keys: { createdAt: -1 },
      unique: false,
      sparse: true,
      ttl: 3600,
      size: 2048,
      usageCount: 25,
    },
  ]

  describe('loading state', () => {
    it('displays loading spinner while loading indexes', () => {
      mockListIndexes.mockImplementation(() => new Promise(() => {})) // Never resolves
      renderWithProvider(<IndexView {...defaultProps} />)

      expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  describe('not connected state', () => {
    it('displays connect button when not connected', () => {
      useConnection.mockReturnValue({
        ...defaultConnectionContext,
        activeConnections: [],
      })
      renderWithProvider(<IndexView {...defaultProps} />)

      expect(screen.getByText('Not connected to database')).toBeInTheDocument()
      expect(screen.getByText('Connect')).toBeInTheDocument()
    })

    it('calls connect when Connect button is clicked', () => {
      const mockConnect = vi.fn()
      useConnection.mockReturnValue({
        ...defaultConnectionContext,
        activeConnections: [],
        connect: mockConnect,
      })
      renderWithProvider(<IndexView {...defaultProps} />)

      fireEvent.click(screen.getByText('Connect'))
      expect(mockConnect).toHaveBeenCalledWith('conn1')
    })
  })

  describe('connecting state', () => {
    it('displays connecting message', () => {
      useConnection.mockReturnValue({
        ...defaultConnectionContext,
        connectingIds: new Set(['conn1']),
      })
      renderWithProvider(<IndexView {...defaultProps} />)

      expect(screen.getByText('Connecting to database...')).toBeInTheDocument()
    })
  })

  describe('header', () => {
    it('displays Index Manager header', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      expect(screen.getByText('Index Manager')).toBeInTheDocument()
      expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
    })

    it('displays Create Index button', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Create Index')).toBeInTheDocument()
      })
    })

    it('displays Refresh button', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTitle('Refresh indexes')).toBeInTheDocument()
      })
    })
  })

  describe('index list', () => {
    it('displays all indexes', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('_id_')).toBeInTheDocument()
        expect(screen.getByText('email_1')).toBeInTheDocument()
        expect(screen.getByText('createdAt_1')).toBeInTheDocument()
      })
    })

    it('displays unique badge for unique indexes', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('unique')).toBeInTheDocument()
      })
    })

    it('displays sparse badge for sparse indexes', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('sparse')).toBeInTheDocument()
      })
    })

    it('displays TTL badge for TTL indexes', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('TTL: 3600s')).toBeInTheDocument()
      })
    })

    it('displays default badge for _id index', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('default')).toBeInTheDocument()
      })
    })

    it('displays empty state when no indexes', async () => {
      mockListIndexes.mockResolvedValue([])
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('No indexes found')).toBeInTheDocument()
      })
    })
  })

  describe('error handling', () => {
    it('displays error message when loading fails', async () => {
      mockListIndexes.mockRejectedValue(new Error('Connection failed'))
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument()
      })
    })

    it('displays retry button on error', async () => {
      mockListIndexes.mockRejectedValue(new Error('Failed'))
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })
    })

    it('retries loading when Retry button is clicked', async () => {
      mockListIndexes.mockRejectedValueOnce(new Error('Failed'))
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })

      mockListIndexes.mockResolvedValue(mockIndexes)
      fireEvent.click(screen.getByText('Retry'))

      await waitFor(() => {
        expect(screen.getByText('_id_')).toBeInTheDocument()
      })
    })
  })

  describe('expand/collapse', () => {
    it('expands index details when clicked', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('email_1')).toBeInTheDocument()
      })

      // Click to expand
      const indexCard = screen.getByText('email_1').closest('.cursor-pointer')
      fireEvent.click(indexCard)

      // Should show expanded details
      await waitFor(() => {
        expect(screen.getByText('Index Keys')).toBeInTheDocument()
        expect(screen.getByText('Configuration')).toBeInTheDocument()
        expect(screen.getByText('Statistics')).toBeInTheDocument()
      })
    })
  })

  describe('copy index details', () => {
    it('displays copy button for each index', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        const copyButtons = screen.getAllByTitle('Copy index details')
        expect(copyButtons).toHaveLength(3) // All 3 indexes
      })
    })

    it('copies index details to clipboard when copy button is clicked', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('email_1')).toBeInTheDocument()
      })

      // Click copy button for email_1 index
      const copyButtons = screen.getAllByTitle('Copy index details')
      fireEvent.click(copyButtons[1]) // email_1 is second index

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled()
      })

      // Verify the copied text includes index info
      const copiedText = writeTextMock.mock.calls[0][0]
      expect(copiedText).toContain('Index: email_1')
      expect(copiedText).toContain('testdb.testcoll')
      expect(copiedText).toContain('email: 1 (ASC)')
      expect(copiedText).toContain('Unique: Yes')
    })

    it('shows Copied! feedback after successful copy', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('email_1')).toBeInTheDocument()
      })

      const copyButtons = screen.getAllByTitle('Copy index details')
      fireEvent.click(copyButtons[1])

      await waitFor(() => {
        expect(screen.getByTitle('Copied!')).toBeInTheDocument()
      })
    })
  })

  describe('delete index', () => {
    it('does not show delete button for _id index', async () => {
      mockListIndexes.mockResolvedValue([mockIndexes[0]]) // Only _id_ index
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('_id_')).toBeInTheDocument()
      })

      expect(screen.queryByTitle('Drop index')).not.toBeInTheDocument()
    })

    it('shows delete button for non-default indexes', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('Drop index')
        expect(deleteButtons).toHaveLength(2) // email_1 and createdAt_1
      })
    })

    it('shows confirmation dialog when delete button is clicked', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('email_1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Drop index')
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Drop Index?')).toBeInTheDocument()
      })
      // Verify the confirmation message mentions the index name
      expect(screen.getByText(/Are you sure you want to drop the index "email_1"/)).toBeInTheDocument()
    })
  })

  describe('create index form', () => {
    it('shows create form when Create Index button is clicked', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Create Index')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Create Index'))

      await waitFor(() => {
        expect(screen.getByText('Index Keys')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('field.path')).toBeInTheDocument()
        expect(screen.getByText('Unique')).toBeInTheDocument()
        expect(screen.getByText('Sparse')).toBeInTheDocument()
        expect(screen.getByText('Background')).toBeInTheDocument()
      })
    })

    it('hides create form when Hide Form button is clicked', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Create Index')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Create Index'))

      await waitFor(() => {
        expect(screen.getByText('Hide Form')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Hide Form'))

      await waitFor(() => {
        expect(screen.getByText('Create Index')).toBeInTheDocument()
      })
    })

    it('hides create form when Cancel button is clicked', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Create Index')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Create Index'))

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Cancel'))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('field.path')).not.toBeInTheDocument()
      })
    })
  })

  describe('refresh', () => {
    it('reloads indexes when refresh button is clicked', async () => {
      mockListIndexes.mockResolvedValue(mockIndexes)
      renderWithProvider(<IndexView {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('_id_')).toBeInTheDocument()
      })

      expect(mockListIndexes).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByTitle('Refresh indexes'))

      await waitFor(() => {
        expect(mockListIndexes).toHaveBeenCalledTimes(2)
      })
    })
  })
})
