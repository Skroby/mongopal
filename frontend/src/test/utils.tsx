import { render, RenderOptions, RenderResult } from '@testing-library/react'
import { ReactElement, ReactNode } from 'react'
import { NotificationProvider } from '../components/NotificationContext'
import { ConnectionProvider } from '../components/contexts/ConnectionContext'
import { TabProvider } from '../components/contexts/TabContext'
import { SavedConnection } from '../components/contexts/ConnectionContext'
import { Folder } from '../components/contexts/ConnectionContext'
import { Tab, TabType } from '../components/contexts/TabContext'

/**
 * Options for renderWithProviders
 */
export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  withNotifications?: boolean
  withConnection?: boolean
  withTabs?: boolean
}

/**
 * Wrapper component props
 */
interface WrapperProps {
  children: ReactNode
}

/**
 * Render a component wrapped with all application providers.
 * Use this for components that depend on context.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderResult {
  const {
    withNotifications = true,
    withConnection = false,
    withTabs = false,
    ...renderOptions
  } = options

  function Wrapper({ children }: WrapperProps): ReactElement {
    let wrapped: ReactNode = children

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

    return <>{wrapped}</>
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Render with all providers enabled.
 */
export function renderWithAllProviders(
  ui: ReactElement,
  options: Omit<RenderWithProvidersOptions, 'withNotifications' | 'withConnection' | 'withTabs'> = {}
): RenderResult {
  return renderWithProviders(ui, {
    withNotifications: true,
    withConnection: true,
    withTabs: true,
    ...options,
  })
}

/**
 * Mock saved connection type
 */
export interface MockConnection extends Partial<SavedConnection> {
  id: string
  name: string
  uri: string
  color: string
  folderId?: string
  createdAt: string
}

/**
 * Factory for creating mock saved connection objects.
 */
export function createMockConnection(overrides: Partial<MockConnection> = {}): MockConnection {
  return {
    id: 'conn-1',
    name: 'Test Connection',
    uri: 'mongodb://localhost:27017',
    color: '#4CC38A',
    folderId: undefined,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mock tab type
 */
export interface MockTab extends Partial<Tab> {
  id: string
  type: TabType
  connectionId: string
  database: string
  collection: string
  label: string
  color: string
  pinned: boolean
}

/**
 * Factory for creating mock tab objects.
 */
export function createMockTab(overrides: Partial<MockTab> = {}): MockTab {
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
 * Mock document type
 */
export interface MockDocument {
  _id: { $oid: string } | string
  name?: string
  createdAt?: { $date: string }
  [key: string]: unknown
}

/**
 * Factory for creating mock document objects.
 */
export function createMockDocument(overrides: Partial<MockDocument> = {}): MockDocument {
  return {
    _id: { $oid: '507f1f77bcf86cd799439011' },
    name: 'Test Document',
    createdAt: { $date: new Date().toISOString() },
    ...overrides,
  }
}

/**
 * Mock folder type
 */
export interface MockFolder extends Partial<Folder> {
  id: string
  name: string
}

/**
 * Factory for creating mock folder objects.
 */
export function createMockFolder(overrides: Partial<MockFolder> = {}): MockFolder {
  return {
    id: 'folder-1',
    name: 'Test Folder',
    ...overrides,
  }
}

/**
 * Helper to simulate keyboard events.
 */
export function fireKeyDown(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
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
