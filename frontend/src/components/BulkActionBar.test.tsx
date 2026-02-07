import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BulkActionBar, { BulkActionBarProps } from './BulkActionBar'

describe('BulkActionBar', () => {
  const defaultProps: BulkActionBarProps = {
    selectedCount: 5,
    onClear: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('displays correct count for multiple documents', () => {
      render(<BulkActionBar {...defaultProps} selectedCount={5} />)
      expect(screen.getByText('5 documents selected')).toBeInTheDocument()
    })

    it('displays singular form for single document', () => {
      render(<BulkActionBar {...defaultProps} selectedCount={1} />)
      expect(screen.getByText('1 document selected')).toBeInTheDocument()
    })

    it('renders clear button with keyboard shortcut hint', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByTitle('Clear selection (Escape)')).toBeInTheDocument()
    })

    it('renders export button', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByText('Export')).toBeInTheDocument()
    })

    it('renders delete button', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('has role="toolbar" on container', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByRole('toolbar')).toBeInTheDocument()
    })

    it('has proper aria-label on toolbar', () => {
      render(<BulkActionBar {...defaultProps} selectedCount={3} />)
      expect(screen.getByRole('toolbar')).toHaveAttribute(
        'aria-label',
        'Bulk actions for 3 selected documents'
      )
    })

    it('has proper aria-labels on buttons', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByLabelText('Clear selection (Escape)')).toBeInTheDocument()
      expect(screen.getByLabelText(/Delete 5 documents/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Export 5 documents/)).toBeInTheDocument()
    })
  })

  describe('button interactions', () => {
    it('calls onClear when clear button clicked', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Clear selection (Escape)'))
      expect(defaultProps.onClear).toHaveBeenCalledTimes(1)
    })

    it('calls onExport when export button clicked', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.click(screen.getByText('Export'))
      expect(defaultProps.onExport).toHaveBeenCalledTimes(1)
    })

    it('calls onDelete when delete button clicked', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.click(screen.getByText('Delete'))
      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard shortcuts', () => {
    it('calls onClear when Escape is pressed', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(defaultProps.onClear).toHaveBeenCalledTimes(1)
    })

    it('calls onDelete when Delete key is pressed', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Delete' })
      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('calls onDelete when Backspace key is pressed', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Backspace' })
      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('calls onExport when Ctrl+E is pressed', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'e', ctrlKey: true })
      expect(defaultProps.onExport).toHaveBeenCalledTimes(1)
    })

    it('calls onExport when Cmd+E is pressed (Mac)', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'e', metaKey: true })
      expect(defaultProps.onExport).toHaveBeenCalledTimes(1)
    })

    it('does not trigger shortcuts when typing in input', () => {
      render(
        <div>
          <input data-testid="test-input" />
          <BulkActionBar {...defaultProps} />
        </div>
      )
      const input = screen.getByTestId('test-input')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(defaultProps.onClear).not.toHaveBeenCalled()
    })

    it('does not call onDelete when isDeleting is true', () => {
      render(<BulkActionBar {...defaultProps} isDeleting={true} />)
      fireEvent.keyDown(document, { key: 'Delete' })
      expect(defaultProps.onDelete).not.toHaveBeenCalled()
    })

    it('does not call onExport when isExporting is true', () => {
      render(<BulkActionBar {...defaultProps} isExporting={true} />)
      fireEvent.keyDown(document, { key: 'e', ctrlKey: true })
      expect(defaultProps.onExport).not.toHaveBeenCalled()
    })
  })

  describe('loading states', () => {
    it('shows exporting state and disables button', () => {
      render(<BulkActionBar {...defaultProps} isExporting={true} />)
      const exportBtn = screen.getByText('Exporting...')
      expect(exportBtn).toBeInTheDocument()
      expect(exportBtn.closest('button')).toBeDisabled()
    })

    it('shows deleting state and disables button', () => {
      render(<BulkActionBar {...defaultProps} isDeleting={true} />)
      const deleteBtn = screen.getByText('Deleting...')
      expect(deleteBtn).toBeInTheDocument()
      expect(deleteBtn.closest('button')).toBeDisabled()
    })

    it('does not disable export when not exporting', () => {
      render(<BulkActionBar {...defaultProps} isExporting={false} />)
      const exportBtn = screen.getByText('Export')
      expect(exportBtn.closest('button')).not.toBeDisabled()
    })

    it('does not disable delete when not deleting', () => {
      render(<BulkActionBar {...defaultProps} isDeleting={false} />)
      const deleteBtn = screen.getByText('Delete')
      expect(deleteBtn.closest('button')).not.toBeDisabled()
    })
  })

  describe('default props', () => {
    it('defaults isDeleting to false', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.queryByText('Deleting...')).not.toBeInTheDocument()
    })

    it('defaults isExporting to false', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByText('Export')).toBeInTheDocument()
      expect(screen.queryByText('Exporting...')).not.toBeInTheDocument()
    })
  })
})
