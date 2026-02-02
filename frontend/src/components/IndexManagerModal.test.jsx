import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import IndexManagerModal from './IndexManagerModal'

// Mock the go object with dynamic implementation
let mockListIndexes = vi.fn()
let mockCreateIndex = vi.fn()
let mockDropIndex = vi.fn()

beforeEach(() => {
  mockListIndexes = vi.fn().mockResolvedValue([])
  mockCreateIndex = vi.fn().mockResolvedValue(undefined)
  mockDropIndex = vi.fn().mockResolvedValue(undefined)
  window.go = {
    main: {
      App: {
        ListIndexes: mockListIndexes,
        CreateIndex: mockCreateIndex,
        DropIndex: mockDropIndex,
      },
    },
  }
})

afterEach(() => {
  vi.clearAllMocks()
  delete window.go
})

const renderWithProvider = (component) => {
  return render(<NotificationProvider>{component}</NotificationProvider>)
}

describe('IndexManagerModal', () => {
  const defaultProps = {
    connectionId: 'conn1',
    database: 'testdb',
    collection: 'testcoll',
    onClose: vi.fn(),
  }

  it('displays modal header with collection name', () => {
    renderWithProvider(<IndexManagerModal {...defaultProps} />)

    expect(screen.getByText('Index Manager')).toBeInTheDocument()
    expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
  })

  it('shows create index form when Create New Index is clicked', async () => {
    renderWithProvider(<IndexManagerModal {...defaultProps} />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Create New Index')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Create New Index'))

    expect(screen.getByText('Index Keys')).toBeInTheDocument()
    expect(screen.getByText('Options')).toBeInTheDocument()
  })

  it('allows adding multiple index keys', async () => {
    renderWithProvider(<IndexManagerModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Create New Index')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Create New Index'))

    // Click add key button
    fireEvent.click(screen.getByText('Add key'))

    // Should now have 2 input fields
    const inputs = screen.getAllByPlaceholderText('field.path')
    expect(inputs.length).toBe(2)
  })

  it('displays empty state when no indexes', async () => {
    renderWithProvider(<IndexManagerModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('No indexes found')).toBeInTheDocument()
    })
  })

  it('calls onClose when Close button is clicked', async () => {
    const onClose = vi.fn()
    renderWithProvider(<IndexManagerModal {...defaultProps} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
