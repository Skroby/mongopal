import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import KeyboardShortcuts from './KeyboardShortcuts'

describe('KeyboardShortcuts', () => {
  it('should render the modal with title', () => {
    render(<KeyboardShortcuts onClose={() => {}} />)

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  it('should render all shortcut categories', () => {
    render(<KeyboardShortcuts onClose={() => {}} />)

    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Query Editor')).toBeInTheDocument()
    expect(screen.getByText('Document Editor')).toBeInTheDocument()
    expect(screen.getByText('Tabs')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })

  it('should render shortcut descriptions', () => {
    render(<KeyboardShortcuts onClose={() => {}} />)

    expect(screen.getByText('New document (insert)')).toBeInTheDocument()
    expect(screen.getByText('Execute query')).toBeInTheDocument()
    expect(screen.getByText('Save document')).toBeInTheDocument()
    expect(screen.getByText('Close current tab')).toBeInTheDocument()
  })

  it('should render keyboard shortcut keys', () => {
    const { container } = render(<KeyboardShortcuts onClose={() => {}} />)

    // These should exist as kbd elements
    const kbds = container.querySelectorAll('kbd')
    expect(kbds.length).toBeGreaterThan(0)
  })

  it('should call onClose when X button is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcuts onClose={onClose} />)

    // Find and click the X button (first button in header)
    const buttons = screen.getAllByRole('button')
    const closeButton = buttons[0] // X button is first
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when Done button is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcuts onClose={onClose} />)

    const doneButton = screen.getByText('Done')
    fireEvent.click(doneButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcuts onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should not call onClose for other keys', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcuts onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('should render with correct accessibility structure', () => {
    render(<KeyboardShortcuts onClose={() => {}} />)

    // Should have a modal backdrop
    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).toBeInTheDocument()

    // Should have visible heading
    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeInTheDocument()
  })

  it('should render platform-specific modifier key hint', () => {
    render(<KeyboardShortcuts onClose={() => {}} />)

    // Footer should mention the shortcut to open this modal
    const footer = screen.getByText(/anytime to show this reference/i)
    expect(footer).toBeInTheDocument()
  })
})
