import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import CSVExportButton, { CSVExportButtonProps } from './CSVExportButton'

// Mock EventsOn/EventsOff
vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(() => vi.fn()),
  EventsOff: vi.fn(),
}))

// Mock the go object
let mockExportCollectionAsCSV: Mock

beforeEach(() => {
  mockExportCollectionAsCSV = vi.fn()
  // Update the existing window.go from test setup
  if (window.go?.main?.App) {
    window.go.main.App.ExportCollectionAsCSV = mockExportCollectionAsCSV
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

const renderWithProviders = (component: React.ReactElement): ReturnType<typeof render> => {
  return render(
    <NotificationProvider>
      <ExportQueueProvider>
        {component}
      </ExportQueueProvider>
    </NotificationProvider>
  )
}

describe('CSVExportButton', () => {
  const defaultProps: CSVExportButtonProps = {
    connectionId: 'conn1',
    database: 'testdb',
    collection: 'testcoll',
    currentFilter: '{}',
  }

  it('renders CSV export icon button', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)
    expect(screen.getByTitle('Export as CSV')).toBeInTheDocument()
  })

  it('opens dialog when button is clicked', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Export as CSV')).toBeInTheDocument()
    expect(screen.getByText('Delimiter')).toBeInTheDocument()
  })

  it('shows collection info in dialog header', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
  })

  it('closes dialog when Cancel is clicked', async () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))
    expect(screen.getByText('Export as CSV')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Delimiter')).not.toBeInTheDocument()
    })
  })

  it('closes dialog when Escape is pressed', async () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))
    expect(screen.getByText('Export as CSV')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText('Delimiter')).not.toBeInTheDocument()
    })
  })

  it('shows filter option when currentFilter is present', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} currentFilter='{"status": "active"}' />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Apply current filter')).toBeInTheDocument()
  })

  it('does not show filter option when currentFilter is empty', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} currentFilter="{}" />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.queryByText('Apply current filter')).not.toBeInTheDocument()
  })

  it('shows delimiter options', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    const select = screen.getByDisplayValue('Comma (,)')
    expect(select).toBeInTheDocument()
  })

  it('shows include headers and flatten arrays options', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Include headers')).toBeInTheDocument()
    expect(screen.getByText('Flatten arrays')).toBeInTheDocument()
  })

  it('has Add to Queue button in dialog', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByRole('button', { name: 'Add to Queue' })).toBeInTheDocument()
  })

  it('shows Save to field with Browse button', () => {
    renderWithProviders(<CSVExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export as CSV'))

    expect(screen.getByText('Save to')).toBeInTheDocument()
    expect(screen.getByText('Browse...')).toBeInTheDocument()
    expect(screen.getByText('Choose location...')).toBeInTheDocument()
  })
})
