import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDialog, { ConfirmDialogProps } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps: ConfirmDialogProps = {
    open: true,
    title: 'Test Title',
    message: 'Test message',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when closed', () => {
      render(<ConfirmDialog {...defaultProps} open={false} />)
      expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
    })

    it('renders dialog when open', () => {
      render(<ConfirmDialog {...defaultProps} />)
      expect(screen.getByText('Test Title')).toBeInTheDocument()
      expect(screen.getByText('Test message')).toBeInTheDocument()
    })

    it('renders default button labels', () => {
      render(<ConfirmDialog {...defaultProps} />)
      expect(screen.getByText('Confirm')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('renders custom button labels', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="Delete"
          cancelLabel="Go Back"
        />
      )
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.getByText('Go Back')).toBeInTheDocument()
    })

    it('renders message as JSX when provided', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          message={<span data-testid="custom-message">Custom JSX</span>}
        />
      )
      expect(screen.getByTestId('custom-message')).toBeInTheDocument()
    })

    it('preserves whitespace in string messages', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          message={'Line 1\nLine 2'}
        />
      )
      const messageEl = screen.getByText(/Line 1/)
      expect(messageEl).toHaveClass('whitespace-pre-line')
    })
  })

  describe('danger mode', () => {
    it('applies danger styling to confirm button', () => {
      render(<ConfirmDialog {...defaultProps} danger={true} />)
      const confirmBtn = screen.getByText('Confirm')
      expect(confirmBtn).toHaveClass('btn-danger')
    })

    it('applies primary styling when not danger', () => {
      render(<ConfirmDialog {...defaultProps} danger={false} />)
      const confirmBtn = screen.getByText('Confirm')
      expect(confirmBtn).toHaveClass('btn-primary')
    })
  })

  describe('button interactions', () => {
    it('calls onConfirm when confirm button clicked', () => {
      render(<ConfirmDialog {...defaultProps} />)
      fireEvent.click(screen.getByText('Confirm'))
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when cancel button clicked', () => {
      render(<ConfirmDialog {...defaultProps} />)
      fireEvent.click(screen.getByText('Cancel'))
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard shortcuts', () => {
    it('calls onCancel when Escape is pressed', () => {
      render(<ConfirmDialog {...defaultProps} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
    })

    it('calls onConfirm when Enter is pressed', () => {
      render(<ConfirmDialog {...defaultProps} />)
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
    })

    it('does not respond to keyboard when closed', () => {
      render(<ConfirmDialog {...defaultProps} open={false} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(defaultProps.onCancel).not.toHaveBeenCalled()
      expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('focus management', () => {
    it('focuses confirm button when dialog opens', () => {
      render(<ConfirmDialog {...defaultProps} />)
      const confirmBtn = screen.getByText('Confirm')
      expect(document.activeElement).toBe(confirmBtn)
    })
  })
})
