import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TabProvider, useTab } from './TabContext'
import { ConnectionProvider } from './ConnectionContext'
import { NotificationProvider } from '../NotificationContext'

// Wrapper that provides all required contexts
function AllProviders({ children }) {
  return (
    <NotificationProvider>
      <ConnectionProvider>
        <TabProvider>
          {children}
        </TabProvider>
      </ConnectionProvider>
    </NotificationProvider>
  )
}

// Test component that exposes tab context
function TestConsumer({ onMount }) {
  const tabContext = useTab()

  if (onMount) {
    onMount(tabContext)
  }

  return (
    <div>
      <span data-testid="tab-count">{tabContext.tabs.length}</span>
      <span data-testid="active-tab">{tabContext.activeTab || 'none'}</span>
      <span data-testid="current-tab-label">{tabContext.currentTab?.label || 'none'}</span>
    </div>
  )
}

describe('TabContext', () => {
  describe('useTab hook', () => {
    it('throws error when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('useTab must be used within TabProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('initial state', () => {
    it('starts with no tabs', () => {
      render(
        <AllProviders>
          <TestConsumer />
        </AllProviders>
      )

      expect(screen.getByTestId('tab-count')).toHaveTextContent('0')
      expect(screen.getByTestId('active-tab')).toHaveTextContent('none')
    })
  })

  describe('openTab', () => {
    it('opens a new collection tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
      expect(screen.getByTestId('active-tab')).toHaveTextContent('conn-1.testdb.users')
    })

    it('activates existing tab instead of creating duplicate', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      // Each call needs separate act() so state updates are flushed between calls
      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })
      act(() => {
        ctx.openTab('conn-1', 'testdb', 'orders')
      })
      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users') // Should activate, not create
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('2')
      expect(screen.getByTestId('active-tab')).toHaveTextContent('conn-1.testdb.users')
    })

    it('sets correct tab properties', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      expect(ctx.tabs[0]).toMatchObject({
        type: 'collection',
        connectionId: 'conn-1',
        database: 'testdb',
        collection: 'users',
        label: 'users',
        pinned: false,
      })
    })
  })

  describe('openDocumentTab', () => {
    it('opens a document tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      const doc = { _id: '12345678abcd', name: 'Test' }
      act(() => {
        ctx.openDocumentTab('conn-1', 'testdb', 'users', doc, '12345678abcd')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
      expect(ctx.tabs[0].type).toBe('document')
      expect(ctx.tabs[0].label).toBe('12345678...')
    })

    it('activates existing document tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      const doc = { _id: '12345678abcd', name: 'Test' }
      act(() => {
        ctx.openDocumentTab('conn-1', 'testdb', 'users', doc, '12345678abcd')
      })
      act(() => {
        ctx.openDocumentTab('conn-1', 'testdb', 'users', doc, '12345678abcd')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
    })
  })

  describe('openInsertTab', () => {
    it('opens an insert tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openInsertTab('conn-1', 'testdb', 'users')
      })

      expect(ctx.tabs[0].type).toBe('insert')
      expect(ctx.tabs[0].label).toBe('New Document')
    })

    it('always creates new insert tab (no deduplication)', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openInsertTab('conn-1', 'testdb', 'users')
        ctx.openInsertTab('conn-1', 'testdb', 'users')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('2')
    })
  })

  describe('openSchemaTab', () => {
    it('opens a schema tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openSchemaTab('conn-1', 'testdb', 'users')
      })

      expect(ctx.tabs[0].type).toBe('schema')
      expect(ctx.tabs[0].label).toBe('Schema: users')
    })
  })

  describe('closeTab', () => {
    it('closes a tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      const tabId = ctx.tabs[0].id

      act(() => {
        ctx.closeTab(tabId)
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('0')
    })

    it('selects another tab when active tab is closed', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
        ctx.openTab('conn-1', 'testdb', 'orders')
      })

      // orders is now active
      const ordersTabId = ctx.tabs[1].id

      act(() => {
        ctx.closeTab(ordersTabId)
      })

      // users should now be active
      expect(screen.getByTestId('active-tab')).toHaveTextContent('conn-1.testdb.users')
    })

    it('sets activeTab to null when last tab is closed', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      act(() => {
        ctx.closeTab(ctx.tabs[0].id)
      })

      expect(screen.getByTestId('active-tab')).toHaveTextContent('none')
    })
  })

  describe('pinTab', () => {
    it('toggles pin state', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      expect(ctx.tabs[0].pinned).toBe(false)

      act(() => {
        ctx.pinTab(ctx.tabs[0].id)
      })

      expect(ctx.tabs[0].pinned).toBe(true)

      act(() => {
        ctx.pinTab(ctx.tabs[0].id)
      })

      expect(ctx.tabs[0].pinned).toBe(false)
    })
  })

  describe('renameTab', () => {
    it('updates tab label', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      act(() => {
        ctx.renameTab(ctx.tabs[0].id, 'My Query')
      })

      expect(ctx.tabs[0].label).toBe('My Query')
    })
  })

  describe('reorderTabs', () => {
    it('moves tab to new position', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
        ctx.openTab('conn-1', 'testdb', 'orders')
        ctx.openTab('conn-1', 'testdb', 'products')
      })

      // Order: users, orders, products
      const usersId = ctx.tabs[0].id
      const productsId = ctx.tabs[2].id

      act(() => {
        ctx.reorderTabs(productsId, usersId)
      })

      // Order should now be: products, users, orders
      expect(ctx.tabs[0].collection).toBe('products')
      expect(ctx.tabs[1].collection).toBe('users')
      expect(ctx.tabs[2].collection).toBe('orders')
    })
  })

  describe('convertInsertToDocumentTab', () => {
    it('converts insert tab to document tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openInsertTab('conn-1', 'testdb', 'users')
      })

      const insertTabId = ctx.tabs[0].id
      const newDoc = { _id: 'abc12345', name: 'New User' }

      act(() => {
        ctx.convertInsertToDocumentTab(insertTabId, newDoc, 'abc12345')
      })

      expect(ctx.tabs[0].type).toBe('document')
      expect(ctx.tabs[0].documentId).toBe('abc12345')
      expect(ctx.tabs[0].label).toBe('abc12345...')
    })
  })

  describe('bulk close operations', () => {
    it('closeTabsForConnection closes all tabs for a connection', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
        ctx.openTab('conn-1', 'testdb', 'orders')
        ctx.openTab('conn-2', 'otherdb', 'items')
      })

      act(() => {
        ctx.closeTabsForConnection('conn-1')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
      expect(ctx.tabs[0].connectionId).toBe('conn-2')
    })

    it('closeTabsForDatabase closes tabs for specific database', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'db1', 'users')
        ctx.openTab('conn-1', 'db2', 'orders')
      })

      act(() => {
        ctx.closeTabsForDatabase('conn-1', 'db1')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
      expect(ctx.tabs[0].database).toBe('db2')
    })

    it('closeTabsForCollection closes tabs for specific collection', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
        ctx.openTab('conn-1', 'testdb', 'orders')
      })

      act(() => {
        ctx.closeTabsForCollection('conn-1', 'testdb', 'users')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
      expect(ctx.tabs[0].collection).toBe('orders')
    })

    it('closeAllTabs closes all tabs', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
        ctx.openTab('conn-1', 'testdb', 'orders')
        ctx.openTab('conn-2', 'otherdb', 'items')
      })

      act(() => {
        ctx.closeAllTabs()
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('0')
      expect(screen.getByTestId('active-tab')).toHaveTextContent('none')
    })

    it('keepOnlyConnectionTabs keeps only tabs for specified connection', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
        ctx.openTab('conn-2', 'otherdb', 'items')
        ctx.openTab('conn-1', 'testdb', 'orders')
      })

      act(() => {
        ctx.keepOnlyConnectionTabs('conn-1')
      })

      expect(screen.getByTestId('tab-count')).toHaveTextContent('2')
      expect(ctx.tabs.every(t => t.connectionId === 'conn-1')).toBe(true)
    })
  })

  describe('currentTab', () => {
    it('returns the active tab object', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      act(() => {
        ctx.openTab('conn-1', 'testdb', 'users')
      })

      expect(screen.getByTestId('current-tab-label')).toHaveTextContent('users')
    })

    it('returns undefined when no active tab', () => {
      let ctx

      render(
        <AllProviders>
          <TestConsumer onMount={(c) => { ctx = c }} />
        </AllProviders>
      )

      expect(ctx.currentTab).toBeUndefined()
    })
  })
})
