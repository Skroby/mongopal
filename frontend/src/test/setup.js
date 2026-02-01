import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Wails runtime events
export const mockEventsOn = vi.fn((event, callback) => {
  // Return unsubscribe function
  return () => {}
})

export const mockEventsOff = vi.fn()
export const mockEventsEmit = vi.fn()

// Mock Wails runtime module
vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: (...args) => mockEventsOn(...args),
  EventsOff: (...args) => mockEventsOff(...args),
  EventsEmit: (...args) => mockEventsEmit(...args),
}))

// Mock window.go for Wails bindings
window.go = {
  main: {
    App: {
      // Connection methods
      Connect: vi.fn(),
      Disconnect: vi.fn(),
      DisconnectAll: vi.fn(),
      TestConnection: vi.fn(),

      // Storage methods
      ListSavedConnections: vi.fn().mockResolvedValue([]),
      SaveConnection: vi.fn().mockResolvedValue(undefined),
      DeleteSavedConnection: vi.fn().mockResolvedValue(undefined),
      DuplicateConnection: vi.fn(),

      // Folder methods
      ListFolders: vi.fn().mockResolvedValue([]),
      CreateFolder: vi.fn(),
      DeleteFolder: vi.fn(),

      // Database methods
      ListDatabases: vi.fn().mockResolvedValue([]),
      ListCollections: vi.fn().mockResolvedValue([]),
      DropDatabase: vi.fn(),
      DropCollection: vi.fn(),
      ClearCollection: vi.fn(),

      // Document methods
      FindDocuments: vi.fn().mockResolvedValue({ documents: [], total: 0 }),
      GetDocument: vi.fn(),
      InsertDocument: vi.fn(),
      UpdateDocument: vi.fn(),
      DeleteDocument: vi.fn(),

      // Schema methods
      InferCollectionSchema: vi.fn(),
      ExportSchemaAsJSON: vi.fn(),

      // Export/Import methods
      ExportDatabases: vi.fn(),
      ImportDatabases: vi.fn(),
      ExportCollections: vi.fn(),
      ImportCollections: vi.fn(),
      ExportDocumentsAsZip: vi.fn(),

      // Script methods
      ExecuteScript: vi.fn(),
      ExecuteScriptWithDatabase: vi.fn(),
      CheckMongoshAvailable: vi.fn().mockResolvedValue([true]),
    }
  }
}

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
  mockEventsOn.mockClear()
  mockEventsOff.mockClear()
  mockEventsEmit.mockClear()
})
