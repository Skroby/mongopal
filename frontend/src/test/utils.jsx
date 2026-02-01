import { render } from '@testing-library/react'
import { NotificationProvider } from '../components/NotificationContext'
import { ConnectionProvider } from '../components/contexts/ConnectionContext'
import { TabProvider } from '../components/contexts/TabContext'

/**
 * Render a component wrapped with all application providers.
 * Use this for components that depend on context.
 */
export function renderWithProviders(ui, options = {}) {
  const {
    withNotifications = true,
    withConnection = false,
    withTabs = false,
    ...renderOptions
  } = options

  function Wrapper({ children }) {
    let wrapped = children

    // Build provider stack from inside out
    if (withTabs) {
      wrapped = <TabProvider>{wrapped}</TabProvider>
    }
    if (withConnection) {
      wrapped = <ConnectionProvider>{wrapped}</ConnectionProvider>
    }
    if (withNotifications) {
      wrapped = <NotificationProvider>{wrapped}</NotificationProvider>
    }

    return wrapped
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Render with all providers enabled.
 */
export function renderWithAllProviders(ui, options = {}) {
  return renderWithProviders(ui, {
    withNotifications: true,
    withConnection: true,
    withTabs: true,
    ...options,
  })
}

/**
 * Factory for creating mock saved connection objects.
 */
export function createMockConnection(overrides = {}) {
  return {
    id: 'conn-1',
    name: 'Test Connection',
    uri: 'mongodb://localhost:27017',
    color: '#4CC38A',
    folderId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory for creating mock tab objects.
 */
export function createMockTab(overrides = {}) {
  const connectionId = overrides.connectionId || 'conn-1'
  const database = overrides.database || 'testdb'
  const collection = overrides.collection || 'testcoll'

  return {
    id: `${connectionId}.${database}.${collection}`,
    type: 'collection',
    connectionId,
    database,
    collection,
    label: collection,
    color: '#4CC38A',
    pinned: false,
    ...overrides,
  }
}

/**
 * Factory for creating mock document objects.
 */
export function createMockDocument(overrides = {}) {
  return {
    _id: { $oid: '507f1f77bcf86cd799439011' },
    name: 'Test Document',
    createdAt: { $date: new Date().toISOString() },
    ...overrides,
  }
}

/**
 * Factory for creating mock folder objects.
 */
export function createMockFolder(overrides = {}) {
  return {
    id: 'folder-1',
    name: 'Test Folder',
    ...overrides,
  }
}

/**
 * Helper to simulate keyboard events.
 */
export function fireKeyDown(key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...options,
  })
  window.dispatchEvent(event)
  return event
}

// Re-export everything from @testing-library/react for convenience
export * from '@testing-library/react'
