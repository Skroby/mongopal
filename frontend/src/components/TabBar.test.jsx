import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TabBar from './TabBar'
import { TabProvider, useTab } from './contexts/TabContext'
import { ConnectionProvider } from './contexts/ConnectionContext'
import { NotificationProvider } from './NotificationContext'

// Mock the TabContext to control tab state
vi.mock('./contexts/TabContext', async () => {
  const actual = await vi.importActual('./contexts/TabContext')
  return {
    ...actual,
    useTab: vi.fn(),
  }
})

describe('TabBar', () => {
  const mockSetActiveTab = vi.fn()
  const mockCloseTab = vi.fn()
  const mockOpenNewQueryTab = vi.fn()
  const mockPinTab = vi.fn()
  const mockRenameTab = vi.fn()
  const mockReorderTabs = vi.fn()

  const defaultMockContext = {
    tabs: [],
    activeTab: null,
    setActiveTab: mockSetActiveTab,
    closeTab: mockCloseTab,
    openNewQueryTab: mockOpenNewQueryTab,
    pinTab: mockPinTab,
    renameTab: mockRenameTab,
    reorderTabs: mockReorderTabs,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useTab.mockReturnValue(defaultMockContext)
  })

  describe('empty state', () => {
    it('displays "No open tabs" when no tabs exist', () => {
      render(<TabBar />)
      expect(screen.getByText('No open tabs')).toBeInTheDocument()
    })

    it('does not show add tab button when no tabs', () => {
      render(<TabBar />)
      expect(screen.queryByTitle('New Query Tab')).not.toBeInTheDocument()
    })
  })

  describe('tab rendering', () => {
    it('renders collection tabs with correct label', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false }
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      expect(screen.getByText('users')).toBeInTheDocument()
    })

    it('renders document tabs with document icon', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'document', label: 'abc123...', pinned: false }
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      expect(screen.getByText('abc123...')).toBeInTheDocument()
    })

    it('renders insert tabs with plus icon label', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'insert', label: 'New Document', pinned: false }
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      expect(screen.getByText('New Document')).toBeInTheDocument()
    })

    it('renders schema tabs', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'schema', label: 'Schema: users', pinned: false }
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      expect(screen.getByText('Schema: users')).toBeInTheDocument()
    })

    it('renders multiple tabs', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
          { id: 'tab-2', type: 'collection', label: 'orders', pinned: false },
          { id: 'tab-3', type: 'document', label: 'doc123...', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('orders')).toBeInTheDocument()
      expect(screen.getByText('doc123...')).toBeInTheDocument()
    })
  })

  describe('tab selection', () => {
    it('calls setActiveTab when tab is clicked', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
          { id: 'tab-2', type: 'collection', label: 'orders', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      fireEvent.click(screen.getByText('orders'))
      expect(mockSetActiveTab).toHaveBeenCalledWith('tab-2')
    })

    it('applies active styling to selected tab', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      expect(tab).toHaveClass('active')
    })
  })

  describe('close button', () => {
    it('closes tab when close button is clicked', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      const closeBtn = tab.querySelector('button')
      fireEvent.click(closeBtn)
      expect(mockCloseTab).toHaveBeenCalledWith('tab-1')
    })

    it('does not show close button for pinned tabs', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: true },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      // Pinned tabs shouldn't have close button (only pin icon)
      expect(tab.querySelector('button')).not.toBeInTheDocument()
    })
  })

  describe('pinned tabs', () => {
    it('sorts pinned tabs first', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'unpinned', pinned: false },
          { id: 'tab-2', type: 'collection', label: 'pinned', pinned: true },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tabs = screen.getAllByText(/pinned|unpinned/)
      expect(tabs[0]).toHaveTextContent('pinned')
      expect(tabs[1]).toHaveTextContent('unpinned')
    })
  })

  describe('new query tab button', () => {
    it('renders add tab button when tabs exist', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      expect(screen.getByTitle('New Query Tab')).toBeInTheDocument()
    })

    it('calls openNewQueryTab when add button clicked', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      fireEvent.click(screen.getByTitle('New Query Tab'))
      expect(mockOpenNewQueryTab).toHaveBeenCalled()
    })
  })

  describe('tab editing', () => {
    it('enters edit mode on double click', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      fireEvent.doubleClick(screen.getByText('users'))

      // Should show input field
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('users')
    })

    it('calls renameTab on Enter', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      fireEvent.doubleClick(screen.getByText('users'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'renamed' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(mockRenameTab).toHaveBeenCalledWith('tab-1', 'renamed')
    })

    it('cancels edit on Escape', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      fireEvent.doubleClick(screen.getByText('users'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'renamed' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(mockRenameTab).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('saves on blur', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      fireEvent.doubleClick(screen.getByText('users'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'new-name' } })
      fireEvent.blur(input)

      expect(mockRenameTab).toHaveBeenCalledWith('tab-1', 'new-name')
    })
  })

  describe('context menu', () => {
    it('shows context menu on right click', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      fireEvent.contextMenu(tab)

      expect(screen.getByText('Rename')).toBeInTheDocument()
      expect(screen.getByText('Pin')).toBeInTheDocument()
      expect(screen.getByText('Close Tab')).toBeInTheDocument()
    })

    it('shows Unpin option for pinned tabs', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: true },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      fireEvent.contextMenu(tab)

      expect(screen.getByText('Unpin')).toBeInTheDocument()
    })

    it('calls pinTab when Pin is clicked', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      fireEvent.contextMenu(tab)
      fireEvent.click(screen.getByText('Pin'))

      expect(mockPinTab).toHaveBeenCalledWith('tab-1')
    })

    it('calls closeTab when Close Tab is clicked', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')
      fireEvent.contextMenu(tab)
      fireEvent.click(screen.getByText('Close Tab'))

      expect(mockCloseTab).toHaveBeenCalledWith('tab-1')
    })
  })

  describe('drag and drop', () => {
    it('sets dragged tab on drag start', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
          { id: 'tab-2', type: 'collection', label: 'orders', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const tab = screen.getByText('users').closest('.tab')

      const dataTransfer = { effectAllowed: '', setData: vi.fn() }
      fireEvent.dragStart(tab, { dataTransfer })

      expect(dataTransfer.effectAllowed).toBe('move')
      expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'tab-1')
    })

    it('calls reorderTabs on drop', () => {
      useTab.mockReturnValue({
        ...defaultMockContext,
        tabs: [
          { id: 'tab-1', type: 'collection', label: 'users', pinned: false },
          { id: 'tab-2', type: 'collection', label: 'orders', pinned: false },
        ],
        activeTab: 'tab-1',
      })

      render(<TabBar />)
      const usersTab = screen.getByText('users').closest('.tab')
      const ordersTab = screen.getByText('orders').closest('.tab')

      // Start drag
      const dataTransfer = { effectAllowed: '', setData: vi.fn() }
      fireEvent.dragStart(usersTab, { dataTransfer })

      // Drop on orders tab
      fireEvent.dragOver(ordersTab)
      fireEvent.drop(ordersTab)

      expect(mockReorderTabs).toHaveBeenCalledWith('tab-1', 'tab-2')
    })
  })
})
