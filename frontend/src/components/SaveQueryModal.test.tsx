import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaveQueryModal, { SaveQueryModalProps, ExistingQuery } from './SaveQueryModal'
import { NotificationProvider } from './NotificationContext'
import { ReactElement } from 'react'

const renderWithProvider = (ui: ReactElement): ReturnType<typeof render> => {
  return render(<NotificationProvider>{ui}</NotificationProvider>)
}

describe('SaveQueryModal', () => {
  const defaultProps: SaveQueryModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    connectionId: 'conn-123',
    database: 'testdb',
    collection: 'users',
    query: '{"active": true}',
    onSaved: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when isOpen is true', () => {
    renderWithProvider(<SaveQueryModal {...defaultProps} />)
    expect(screen.getByText('Save Query')).toBeInTheDocument()
    expect(screen.getByText('testdb > users')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderWithProvider(<SaveQueryModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Save Query')).not.toBeInTheDocument()
  })

  it('displays query preview', () => {
    renderWithProvider(<SaveQueryModal {...defaultProps} />)
    expect(screen.getByText('{"active": true}')).toBeInTheDocument()
  })

  it('validates name is required', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SaveQueryModal {...defaultProps} />)

    // Try to save without name
    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).toBeDisabled()

    // Type a name
    const nameInput = screen.getByPlaceholderText(/active users/i)
    await user.type(nameInput, 'My Query')

    expect(saveButton).toBeEnabled()
  })

  it('shows Update button when editing existing query', () => {
    const existingQuery: ExistingQuery = {
      id: 'existing-id',
      name: 'Existing Query',
      description: 'Existing description',
    }

    renderWithProvider(
      <SaveQueryModal {...defaultProps} existingQuery={existingQuery} />
    )

    expect(screen.getByText('Edit Saved Query')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing Query')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProvider(<SaveQueryModal {...defaultProps} onClose={onClose} />)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(onClose).toHaveBeenCalled()
  })

  it('shows correct form labels', () => {
    renderWithProvider(<SaveQueryModal {...defaultProps} />)

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('has correct input maxlength', () => {
    renderWithProvider(<SaveQueryModal {...defaultProps} />)

    const nameInput = screen.getByPlaceholderText(/active users/i)
    expect(nameInput).toHaveAttribute('maxlength', '100')

    const descInput = screen.getByPlaceholderText(/users who logged in/i)
    expect(descInput).toHaveAttribute('maxlength', '500')
  })
})
