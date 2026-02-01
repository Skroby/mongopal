import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BulkActionBar from './BulkActionBar'

describe('BulkActionBar', () => {
  const defaultProps = {
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

    it('renders clear button', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByTitle('Clear selection')).toBeInTheDocument()
    })

    it('renders export button', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByText('Export')).toBeInTheDocument()
    })

    it('renders delete button', () => {
      render(<BulkActionBar {...defaultProps} />)
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })

  describe('button interactions', () => {
    it('calls onClear when clear button clicked', () => {
      render(<BulkActionBar {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Clear selection'))
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
