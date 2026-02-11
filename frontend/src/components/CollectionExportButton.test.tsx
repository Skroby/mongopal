import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationProvider } from './NotificationContext'
import { ExportQueueProvider } from './contexts/ExportQueueContext'
import CollectionExportButton, { CollectionExportButtonProps } from './CollectionExportButton'

// Mock EventsOn/EventsOff
vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(() => vi.fn()),
  EventsOff: vi.fn(),
}))

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

describe('CollectionExportButton', () => {
  const defaultProps: CollectionExportButtonProps = {
    connectionId: 'conn1',
    database: 'testdb',
    collection: 'testcoll',
    currentFilter: '{}',
  }

  it('renders export button with dropdown trigger', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)
    expect(screen.getByTitle('Export collection')).toBeInTheDocument()
  })

  it('shows dropdown with CSV and JSON options on click', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))

    expect(screen.getByText('Export as CSV')).toBeInTheDocument()
    expect(screen.getByText('Export as JSON')).toBeInTheDocument()
  })

  it('opens CSV dialog when "Export as CSV" is clicked', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))
    fireEvent.click(screen.getByText('Export as CSV'))

    // CSV dialog should be open — look for its specific content
    expect(screen.getByText('Delimiter')).toBeInTheDocument()
  })

  it('opens JSON dialog when "Export as JSON" is clicked', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))
    fireEvent.click(screen.getByText('Export as JSON'))

    // JSON dialog should be open — look for its specific content
    expect(screen.getByText('Format')).toBeInTheDocument()
    // Pretty-print only shown for JSON Array mode, not NDJSON (default)
    expect(screen.queryByText('Pretty-print')).not.toBeInTheDocument()
  })

  it('closes dropdown on Escape', async () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))
    expect(screen.getByText('Export as CSV')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText('Export as CSV')).not.toBeInTheDocument()
    })
  })

  it('closes dropdown on outside click', async () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))
    expect(screen.getByText('Export as CSV')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    await waitFor(() => {
      expect(screen.queryByText('Export as CSV')).not.toBeInTheDocument()
    })
  })

  it('is disabled when disabled prop is true', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} disabled />)

    const button = screen.getByTitle('Connect to database first')
    expect(button).toBeDisabled()
  })

  it('does not open dropdown when disabled', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} disabled />)

    fireEvent.click(screen.getByTitle('Connect to database first'))

    expect(screen.queryByText('Export as CSV')).not.toBeInTheDocument()
    expect(screen.queryByText('Export as JSON')).not.toBeInTheDocument()
  })

  it('shows collection info in JSON dialog header', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))
    fireEvent.click(screen.getByText('Export as JSON'))

    expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
  })

  it('shows JSON format options in dialog', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} />)

    fireEvent.click(screen.getByTitle('Export collection'))
    fireEvent.click(screen.getByText('Export as JSON'))

    expect(screen.getByDisplayValue('NDJSON (one document per line)')).toBeInTheDocument()
  })

  it('shows filter option in JSON dialog when filter is present', () => {
    renderWithProviders(<CollectionExportButton {...defaultProps} currentFilter='{"status": "active"}' />)

    fireEvent.click(screen.getByTitle('Export collection'))
    fireEvent.click(screen.getByText('Export as JSON'))

    expect(screen.getByText('Apply current filter')).toBeInTheDocument()
  })
})
