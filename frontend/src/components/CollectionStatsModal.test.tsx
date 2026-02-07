import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import CollectionStatsModal, { type CollectionStatsModalProps, type CollectionStats } from './CollectionStatsModal'

// Mock the go object with dynamic implementation
let mockGetCollectionStats: Mock<(connectionId: string, database: string, collection: string) => Promise<CollectionStats>>

beforeEach(() => {
  mockGetCollectionStats = vi.fn()
  ;(window as unknown as Record<string, unknown>).go = {
    main: {
      App: {
        GetCollectionStats: mockGetCollectionStats,
      },
    },
  }
})

afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as Record<string, unknown>).go
})

const renderWithProvider = (component: React.ReactElement): ReturnType<typeof render> => {
  return render(<NotificationProvider>{component}</NotificationProvider>)
}

describe('CollectionStatsModal', () => {
  const defaultProps: CollectionStatsModalProps = {
    connectionId: 'conn1',
    database: 'testdb',
    collection: 'testcoll',
    onClose: vi.fn(),
  }

  const mockStats: CollectionStats = {
    namespace: 'testdb.testcoll',
    count: 1000,
    size: 512000,
    storageSize: 256000,
    avgObjSize: 512,
    indexCount: 3,
    totalIndexSize: 32768,
    capped: false,
  }

  it('displays collection stats header', async () => {
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    expect(screen.getByText('Collection Statistics')).toBeInTheDocument()
    expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
  })

  it('displays document count', async () => {
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      // 1000 formatted with toLocaleString
      expect(screen.getByText('1,000')).toBeInTheDocument()
    })
  })

  it('displays storage sizes', async () => {
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Data Size')).toBeInTheDocument()
      expect(screen.getByText('Storage Size')).toBeInTheDocument()
    })
  })

  it('displays index stats', async () => {
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Index Count')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('shows capped collection indicator when capped', async () => {
    mockGetCollectionStats.mockResolvedValue({ ...mockStats, capped: true })
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('This is a capped collection')).toBeInTheDocument()
    })
  })

  it('does not show capped indicator when not capped', async () => {
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('1,000')).toBeInTheDocument()
    })
    expect(screen.queryByText('This is a capped collection')).not.toBeInTheDocument()
  })

  it('calls onClose when Close button is clicked', async () => {
    const onClose = vi.fn()
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    mockGetCollectionStats.mockResolvedValue(mockStats)
    renderWithProvider(<CollectionStatsModal {...defaultProps} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('1,000')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('displays error state when stats fail to load', async () => {
    mockGetCollectionStats.mockRejectedValue(new Error('Connection failed'))
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
  })

  it('provides retry button on error', async () => {
    mockGetCollectionStats.mockRejectedValueOnce(new Error('Failed'))
    renderWithProvider(<CollectionStatsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    mockGetCollectionStats.mockResolvedValue(mockStats)

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getByText('1,000')).toBeInTheDocument()
    })
  })

  describe('copy stats functionality', () => {
    it('displays Copy Stats button when stats are loaded', async () => {
      mockGetCollectionStats.mockResolvedValue(mockStats)
      renderWithProvider(<CollectionStatsModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Copy Stats')).toBeInTheDocument()
      })
    })

    it('does not display Copy Stats button when loading', () => {
      mockGetCollectionStats.mockImplementation(() => new Promise(() => {})) // Never resolves
      renderWithProvider(<CollectionStatsModal {...defaultProps} />)

      expect(screen.queryByText('Copy Stats')).not.toBeInTheDocument()
    })

    it('does not display Copy Stats button on error', async () => {
      mockGetCollectionStats.mockRejectedValue(new Error('Failed'))
      renderWithProvider(<CollectionStatsModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
      expect(screen.queryByText('Copy Stats')).not.toBeInTheDocument()
    })

    it('copies stats to clipboard when Copy Stats button is clicked', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      mockGetCollectionStats.mockResolvedValue(mockStats)
      renderWithProvider(<CollectionStatsModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Copy Stats')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Copy Stats'))

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled()
      })

      // Verify the copied text includes collection info
      const copiedText = writeTextMock.mock.calls[0][0] as string
      expect(copiedText).toContain('testdb.testcoll')
      expect(copiedText).toContain('Documents: 1,000')
      expect(copiedText).toContain('Index Count: 3')
    })

    it('shows Copied! feedback after successful copy', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      mockGetCollectionStats.mockResolvedValue(mockStats)
      renderWithProvider(<CollectionStatsModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Copy Stats')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Copy Stats'))

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument()
      })
    })

    it('includes capped status in copied text when collection is capped', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      mockGetCollectionStats.mockResolvedValue({ ...mockStats, capped: true })
      renderWithProvider(<CollectionStatsModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Copy Stats')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Copy Stats'))

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled()
      })

      const copiedText = writeTextMock.mock.calls[0][0] as string
      expect(copiedText).toContain('Capped: Yes')
    })
  })
})
