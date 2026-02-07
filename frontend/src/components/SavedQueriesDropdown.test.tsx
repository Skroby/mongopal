import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SavedQueriesDropdown, { SavedQueriesDropdownProps } from './SavedQueriesDropdown'
import { NotificationProvider } from './NotificationContext'
import { ReactElement } from 'react'

const renderWithProvider = (ui: ReactElement): ReturnType<typeof render> => {
  return render(<NotificationProvider>{ui}</NotificationProvider>)
}

describe('SavedQueriesDropdown', () => {
  const defaultProps: SavedQueriesDropdownProps = {
    connectionId: 'conn-123',
    database: 'testdb',
    collection: 'users',
    onSelectQuery: vi.fn(),
    onManageQueries: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Saved button', () => {
    renderWithProvider(<SavedQueriesDropdown {...defaultProps} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('has bookmark icon', () => {
    renderWithProvider(<SavedQueriesDropdown {...defaultProps} />)
    // Check SVG is present
    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toBeInTheDocument()
  })

  it('opens dropdown when clicked', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SavedQueriesDropdown {...defaultProps} />)

    const button = screen.getByRole('button')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText('Saved Queries')).toBeInTheDocument()
    })
  })

  it('shows Manage All link in dropdown', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SavedQueriesDropdown {...defaultProps} />)

    const button = screen.getByRole('button')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText('Manage All')).toBeInTheDocument()
    })
  })

  it('calls onManageQueries when Manage All is clicked', async () => {
    const user = userEvent.setup()
    const onManageQueries = vi.fn()
    renderWithProvider(
      <SavedQueriesDropdown {...defaultProps} onManageQueries={onManageQueries} />
    )

    const button = screen.getByRole('button')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText('Manage All')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Manage All'))

    expect(onManageQueries).toHaveBeenCalled()
  })

  it('shows help text in dropdown footer', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SavedQueriesDropdown {...defaultProps} />)

    const button = screen.getByRole('button')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText('Click to load query into filter')).toBeInTheDocument()
    })
  })

  it('closes dropdown when toggle button is clicked again', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SavedQueriesDropdown {...defaultProps} />)

    const button = screen.getByRole('button')

    // Open
    await user.click(button)
    await waitFor(() => {
      expect(screen.getByText('Saved Queries')).toBeInTheDocument()
    })

    // Close
    await user.click(button)
    await waitFor(() => {
      expect(screen.queryByText('Saved Queries')).not.toBeInTheDocument()
    })
  })

  it('closes dropdown on click outside', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <div>
        <div data-testid="outside">Outside</div>
        <SavedQueriesDropdown {...defaultProps} />
      </div>
    )

    // Open dropdown
    const button = screen.getByRole('button')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText('Saved Queries')).toBeInTheDocument()
    })

    // Click outside
    await user.click(screen.getByTestId('outside'))

    await waitFor(() => {
      expect(screen.queryByText('Saved Queries')).not.toBeInTheDocument()
    })
  })
})
