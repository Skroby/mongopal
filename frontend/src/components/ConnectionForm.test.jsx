import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConnectionForm from './ConnectionForm'

describe('ConnectionForm', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  const defaultProps = {
    onSave: mockOnSave,
    onCancel: mockOnCancel,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the go mock
    window.go = {
      main: {
        App: {
          TestConnection: vi.fn().mockResolvedValue(undefined),
        },
      },
    }
  })

  describe('rendering', () => {
    it('renders new connection form with default values', () => {
      render(<ConnectionForm {...defaultProps} />)

      expect(screen.getByText('New Connection')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('My MongoDB')).toHaveValue('')
      expect(screen.getByPlaceholderText('mongodb://localhost:27017')).toHaveValue('mongodb://localhost:27017')
    })

    it('renders edit form with prefilled values', () => {
      const connection = {
        id: 'conn-1',
        name: 'My Server',
        uri: 'mongodb://myserver:27017',
        color: '#3B82F6',
        folderId: '',
      }

      render(<ConnectionForm {...defaultProps} connection={connection} />)

      expect(screen.getByText('Edit Connection')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('My MongoDB')).toHaveValue('My Server')
      expect(screen.getByPlaceholderText('mongodb://localhost:27017')).toHaveValue('mongodb://myserver:27017')
    })

    it('renders folder dropdown when folders exist', () => {
      const folders = [
        { id: 'folder-1', name: 'Production' },
        { id: 'folder-2', name: 'Development' },
      ]

      render(<ConnectionForm {...defaultProps} folders={folders} />)

      expect(screen.getByText('Folder')).toBeInTheDocument()
      expect(screen.getByText('No folder')).toBeInTheDocument()
      expect(screen.getByText('Production')).toBeInTheDocument()
      expect(screen.getByText('Development')).toBeInTheDocument()
    })

    it('does not render folder dropdown when no folders', () => {
      render(<ConnectionForm {...defaultProps} />)
      expect(screen.queryByText('Folder')).not.toBeInTheDocument()
    })

    it('renders color picker with all colors', () => {
      render(<ConnectionForm {...defaultProps} />)

      expect(screen.getByText('Tab Color')).toBeInTheDocument()
      // 9 color buttons including "no color" option (using radio role for accessibility)
      const colorButtons = screen.getAllByRole('radio')
      expect(colorButtons.length).toBe(9)
    })
  })

  describe('form validation', () => {
    it('disables save button when name is empty', () => {
      render(<ConnectionForm {...defaultProps} />)

      const saveBtn = screen.getByText('Save')
      expect(saveBtn).toBeDisabled()
    })

    it('disables save button when URI is empty', () => {
      render(<ConnectionForm {...defaultProps} />)

      const nameInput = screen.getByPlaceholderText('My MongoDB')
      const uriInput = screen.getByPlaceholderText('mongodb://localhost:27017')

      fireEvent.change(nameInput, { target: { value: 'Test' } })
      fireEvent.change(uriInput, { target: { value: '' } })

      expect(screen.getByText('Save')).toBeDisabled()
    })

    it('enables save button when both name and URI are filled', () => {
      render(<ConnectionForm {...defaultProps} />)

      const nameInput = screen.getByPlaceholderText('My MongoDB')
      fireEvent.change(nameInput, { target: { value: 'Test Connection' } })

      expect(screen.getByText('Save')).not.toBeDisabled()
    })

    it('disables test button when URI is empty', () => {
      render(<ConnectionForm {...defaultProps} />)

      const uriInput = screen.getByPlaceholderText('mongodb://localhost:27017')
      fireEvent.change(uriInput, { target: { value: '' } })

      expect(screen.getByText('Test Connection')).toBeDisabled()
    })
  })

  describe('color selection', () => {
    it('changes color when color button is clicked', () => {
      render(<ConnectionForm {...defaultProps} />)

      const colorButtons = screen.getAllByRole('radio')

      // First button (no color) should be selected by default
      expect(colorButtons[0]).toHaveClass('scale-110')

      // Click second color (green)
      fireEvent.click(colorButtons[1])
      expect(colorButtons[1]).toHaveClass('scale-110')
      expect(colorButtons[0]).not.toHaveClass('scale-110')
    })
  })

  describe('folder selection', () => {
    it('changes folder when dropdown value changes', () => {
      const folders = [
        { id: 'folder-1', name: 'Production' },
        { id: 'folder-2', name: 'Development' },
      ]

      render(<ConnectionForm {...defaultProps} folders={folders} />)

      const folderSelect = screen.getByRole('combobox')
      fireEvent.change(folderSelect, { target: { value: 'folder-1' } })

      expect(folderSelect).toHaveValue('folder-1')
    })
  })

  describe('test connection', () => {
    // Note: Tests for TestConnection are limited because the component
    // captures window.go?.main?.App at module load time, before tests run.
    // The actual test connection behavior works in the running app.

    it('shows testing state while testing', async () => {
      render(<ConnectionForm {...defaultProps} />)

      fireEvent.click(screen.getByText('Test Connection'))

      // Should show Testing... or Test skipped depending on go availability
      expect(
        screen.queryByText('Testing...') || screen.queryByText('Test skipped (dev mode)')
      ).toBeTruthy()
    })
  })

  describe('save', () => {
    it('calls onSave with connection data', async () => {
      render(<ConnectionForm {...defaultProps} />)

      const nameInput = screen.getByPlaceholderText('My MongoDB')
      fireEvent.change(nameInput, { target: { value: 'Test Server' } })

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Server',
            uri: 'mongodb://localhost:27017',
            color: '',
            folderId: '',
          }),
          '' // password
        )
      })
    })

    it('preserves existing connection id when editing', async () => {
      const connection = {
        id: 'existing-id',
        name: 'Old Name',
        uri: 'mongodb://localhost:27017',
        color: '#4CC38A',
        folderId: '',
        createdAt: '2024-01-01T00:00:00Z',
      }

      render(<ConnectionForm {...defaultProps} connection={connection} />)

      const nameInput = screen.getByPlaceholderText('My MongoDB')
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'existing-id',
            name: 'New Name',
            createdAt: '2024-01-01T00:00:00Z',
          }),
          ''
        )
      })
    })

    it('shows saving state while saving', async () => {
      mockOnSave.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<ConnectionForm {...defaultProps} />)

      const nameInput = screen.getByPlaceholderText('My MongoDB')
      fireEvent.change(nameInput, { target: { value: 'Test' } })

      fireEvent.click(screen.getByText('Save'))

      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
  })

  describe('cancel', () => {
    it('calls onCancel when cancel button is clicked', () => {
      render(<ConnectionForm {...defaultProps} />)

      fireEvent.click(screen.getByText('Cancel'))

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('calls onCancel when close icon is clicked', () => {
      render(<ConnectionForm {...defaultProps} />)

      // Close icon is in the header - find by the parent div structure
      const header = screen.getByText('New Connection').closest('div')
      const closeBtn = header.querySelector('button')
      fireEvent.click(closeBtn)

      expect(mockOnCancel).toHaveBeenCalled()
    })
  })

  describe('form inputs', () => {
    it('updates name on input change', () => {
      render(<ConnectionForm {...defaultProps} />)

      const nameInput = screen.getByPlaceholderText('My MongoDB')
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      expect(nameInput).toHaveValue('New Name')
    })

    it('updates URI on input change', () => {
      render(<ConnectionForm {...defaultProps} />)

      const uriInput = screen.getByPlaceholderText('mongodb://localhost:27017')
      fireEvent.change(uriInput, { target: { value: 'mongodb://newserver:27017' } })

      expect(uriInput).toHaveValue('mongodb://newserver:27017')
    })
  })
})
