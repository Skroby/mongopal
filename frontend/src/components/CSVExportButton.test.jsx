import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import CSVExportButton from './CSVExportButton'

// Mock the go object with dynamic implementation
let mockExportCollectionAsCSV = vi.fn()

beforeEach(() => {
  mockExportCollectionAsCSV = vi.fn()
  window.go = {
    main: {
      App: {
        ExportCollectionAsCSV: mockExportCollectionAsCSV,
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

describe('CSVExportButton', () => {
  const defaultProps = {
    connectionId: 'conn1',
    database: 'testdb',
    collection: 'testcoll',
    currentFilter: '{}',
  }

  it('renders CSV export icon button', () => {
    renderWithProvider(<CSVExportButton {...defaultProps} />)
    expect(screen.getByTitle('Export as CSV')).toBeInTheDocument()
  })

  it('shows options popover when button is clicked', () => {
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Click the icon button to open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Export Now')).toBeInTheDocument()
    expect(screen.getByText('Export Options')).toBeInTheDocument()
    expect(screen.getByText('Delimiter')).toBeInTheDocument()
    expect(screen.getByText('Include column headers')).toBeInTheDocument()
    expect(screen.getByText('Flatten arrays (join with ;)')).toBeInTheDocument()
  })

  it('exports CSV with default options on Export Now click', async () => {
    mockExportCollectionAsCSV.mockResolvedValue(undefined)
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Open popup
    fireEvent.click(screen.getByTitle('Export as CSV'))

    // Click Export Now
    await act(async () => {
      fireEvent.click(screen.getByText('Export Now'))
    })

    await waitFor(() => {
      expect(mockExportCollectionAsCSV).toHaveBeenCalledWith(
        'conn1',
        'testdb',
        'testcoll',
        expect.stringContaining('testcoll-'),
        expect.objectContaining({
          delimiter: ',',
          includeHeaders: true,
          flattenArrays: true,
          filter: '',
        })
      )
    })
  })

  it('allows changing delimiter option', async () => {
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    // Change delimiter
    const select = screen.getByDisplayValue('Comma (,)')
    fireEvent.change(select, { target: { value: ';' } })

    // Export with options
    mockExportCollectionAsCSV.mockResolvedValue(undefined)
    await act(async () => {
      fireEvent.click(screen.getByText('Export with Options'))
    })

    await waitFor(() => {
      expect(mockExportCollectionAsCSV).toHaveBeenCalledWith(
        'conn1',
        'testdb',
        'testcoll',
        expect.any(String),
        expect.objectContaining({
          delimiter: ';',
        })
      )
    })
  })

  it('allows toggling headers option', async () => {
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    // Toggle headers off
    fireEvent.click(screen.getByText('Include column headers'))

    // Export with options
    mockExportCollectionAsCSV.mockResolvedValue(undefined)
    await act(async () => {
      fireEvent.click(screen.getByText('Export with Options'))
    })

    await waitFor(() => {
      expect(mockExportCollectionAsCSV).toHaveBeenCalledWith(
        'conn1',
        'testdb',
        'testcoll',
        expect.any(String),
        expect.objectContaining({
          includeHeaders: false,
        })
      )
    })
  })

  it('shows filter option when currentFilter is present', () => {
    renderWithProvider(<CSVExportButton {...defaultProps} currentFilter='{"status": "active"}' />)

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Apply current filter')).toBeInTheDocument()
  })

  it('does not show filter option when currentFilter is empty', () => {
    renderWithProvider(<CSVExportButton {...defaultProps} currentFilter="{}" />)

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.queryByText('Apply current filter')).not.toBeInTheDocument()
  })

  it('applies filter when option is checked', async () => {
    const filter = '{"status": "active"}'
    renderWithProvider(<CSVExportButton {...defaultProps} currentFilter={filter} />)

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    // Enable filter
    fireEvent.click(screen.getByText('Apply current filter'))

    // Export with options
    mockExportCollectionAsCSV.mockResolvedValue(undefined)
    await act(async () => {
      fireEvent.click(screen.getByText('Export with Options'))
    })

    await waitFor(() => {
      expect(mockExportCollectionAsCSV).toHaveBeenCalledWith(
        'conn1',
        'testdb',
        'testcoll',
        expect.any(String),
        expect.objectContaining({
          filter: filter,
        })
      )
    })
  })

  it('closes popover when clicking outside', async () => {
    renderWithProvider(
      <div>
        <CSVExportButton {...defaultProps} />
        <div data-testid="outside">Outside</div>
      </div>
    )

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Delimiter')).toBeInTheDocument()

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside'))

    await waitFor(() => {
      expect(screen.queryByText('Delimiter')).not.toBeInTheDocument()
    })
  })

  it('closes popover when Escape is pressed', async () => {
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Open options
    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Delimiter')).toBeInTheDocument()

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText('Delimiter')).not.toBeInTheDocument()
    })
  })

  it('shows exporting state during export', async () => {
    let resolveExport
    mockExportCollectionAsCSV.mockImplementation(() => new Promise(resolve => { resolveExport = resolve }))
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Open popup and click Export Now
    fireEvent.click(screen.getByTitle('Export as CSV'))

    await act(async () => {
      fireEvent.click(screen.getByText('Export Now'))
    })

    // Button should have animate-pulse class during export
    const button = screen.getByTitle('Export as CSV')
    expect(button.className).toContain('animate-pulse')

    // Cleanup
    await act(async () => {
      resolveExport()
    })
  })

  it('disables main button during export', async () => {
    let resolveExport
    mockExportCollectionAsCSV.mockImplementation(() => new Promise(resolve => { resolveExport = resolve }))
    renderWithProvider(<CSVExportButton {...defaultProps} />)

    // Open popup and click Export Now
    fireEvent.click(screen.getByTitle('Export as CSV'))

    await act(async () => {
      fireEvent.click(screen.getByText('Export Now'))
    })

    // Main button should be disabled
    expect(screen.getByTitle('Export as CSV')).toBeDisabled()

    // Cleanup
    await act(async () => {
      resolveExport()
    })
  })
})
