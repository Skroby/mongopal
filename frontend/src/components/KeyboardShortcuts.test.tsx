import { describe, it, expect, vi, Mock } from 'vitest'
import { render, screen, fireEvent, RenderResult } from '@testing-library/react'
import KeyboardShortcuts, { KeyboardShortcutsProps } from './KeyboardShortcuts'

describe('KeyboardShortcuts', () => {
  const renderComponent = (props: Partial<KeyboardShortcutsProps> = {}): RenderResult => {
    const defaultProps: KeyboardShortcutsProps = {
      onClose: vi.fn(),
      ...props,
    }
    return render(<KeyboardShortcuts {...defaultProps} />)
  }

  it('should render the modal with title', () => {
    renderComponent()

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  it('should render all shortcut categories', () => {
    renderComponent()

    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Query Editor')).toBeInTheDocument()
    expect(screen.getByText('Document Editor')).toBeInTheDocument()
    expect(screen.getByText('Tabs')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })

  it('should render shortcut descriptions', () => {
    renderComponent()

    expect(screen.getByText('New document (insert)')).toBeInTheDocument()
    expect(screen.getByText('Execute query')).toBeInTheDocument()
    expect(screen.getByText('Save document')).toBeInTheDocument()
    expect(screen.getByText('Close current tab')).toBeInTheDocument()
  })

  it('should render keyboard shortcut keys', () => {
    const { container } = renderComponent()

    // These should exist as kbd elements
    const kbds = container.querySelectorAll('kbd')
    expect(kbds.length).toBeGreaterThan(0)
  })

  it('should call onClose when X button is clicked', () => {
    const onClose: Mock = vi.fn()
    renderComponent({ onClose })

    // Find and click the X button (first button in header)
    const buttons = screen.getAllByRole('button')
    const closeButton = buttons[0] // X button is first
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when Done button is clicked', () => {
    const onClose: Mock = vi.fn()
    renderComponent({ onClose })

    const doneButton = screen.getByText('Done')
    fireEvent.click(doneButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when Escape key is pressed', () => {
    const onClose: Mock = vi.fn()
    renderComponent({ onClose })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should not call onClose for other keys', () => {
    const onClose: Mock = vi.fn()
    renderComponent({ onClose })

    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('should render with correct accessibility structure', () => {
    renderComponent()

    // Should have a modal backdrop
    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).toBeInTheDocument()

    // Should have visible heading
    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeInTheDocument()
  })

  it('should render platform-specific modifier key hint', () => {
    renderComponent()

    // Footer should mention the shortcut to open this modal
    const footer = screen.getByText(/anytime to show this reference/i)
    expect(footer).toBeInTheDocument()
  })
})
