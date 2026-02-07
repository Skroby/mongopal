import '@testing-library/jest-dom'
import { vi, type Mock, beforeEach } from 'vitest'
import type { WailsAppBindings } from '../types/wails'

// Type for event callback
type EventCallback = (...args: unknown[]) => void

// Mock Wails runtime events
export const mockEventsOn: Mock = vi.fn((_event: string, _callback: EventCallback) => {
  // Return unsubscribe function
  return () => {}
})

export const mockEventsOff: Mock = vi.fn()
export const mockEventsEmit: Mock = vi.fn()

// Mock Wails runtime module
vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: (...args: [string, EventCallback]) => mockEventsOn(...args),
  EventsOff: (...args: [string]) => mockEventsOff(...args),
  EventsEmit: (...args: [string, ...unknown[]]) => mockEventsEmit(...args),
}))

// Create mock app bindings that satisfy the WailsAppBindings interface
// Using type assertion to allow mock functions to satisfy the interface
const createMockApp = (): Partial<WailsAppBindings> => ({
  // Connection methods
  Connect: vi.fn(),
  Disconnect: vi.fn(),
  DisconnectAll: vi.fn(),
  TestConnection: vi.fn(),

  // Storage methods
  ListSavedConnections: vi.fn().mockResolvedValue([]),
  DeleteSavedConnection: vi.fn().mockResolvedValue(undefined),
  DuplicateConnection: vi.fn(),
  ConnectionFromURI: vi.fn(),
  ConnectionToURI: vi.fn(),
  MoveConnectionToFolder: vi.fn(),

  // Folder methods
  ListFolders: vi.fn().mockResolvedValue([]),
  CreateFolder: vi.fn(),
  UpdateFolder: vi.fn(),
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

  // Index methods
  ListIndexes: vi.fn().mockResolvedValue([]),
  CreateIndex: vi.fn().mockResolvedValue(undefined),
  DropIndex: vi.fn().mockResolvedValue(undefined),

  // Validation
  ValidateJSON: vi.fn(),

  // Schema methods
  InferCollectionSchema: vi.fn(),
  ExportSchemaAsJSON: vi.fn(),

  // Export CSV methods
  ExportCollectionAsCSV: vi.fn().mockResolvedValue(undefined),
  CancelExport: vi.fn().mockResolvedValue(undefined),

  // Saved queries
  ListSavedQueries: vi.fn(),
  SaveQuery: vi.fn(),
  DeleteSavedQuery: vi.fn(),
  UpdateSavedQuery: vi.fn(),

  // Favorites
  GetFavorites: vi.fn().mockResolvedValue([]),
  AddFavorite: vi.fn().mockResolvedValue(undefined),
  RemoveFavorite: vi.fn().mockResolvedValue(undefined),
  IsFavorite: vi.fn().mockResolvedValue(false),
  ListFavorites: vi.fn().mockResolvedValue([]),
  ListDatabaseFavorites: vi.fn().mockResolvedValue([]),
  AddDatabaseFavorite: vi.fn().mockResolvedValue(undefined),
  RemoveDatabaseFavorite: vi.fn().mockResolvedValue(undefined),

  // Database tracking
  UpdateDatabaseAccessed: vi.fn(),

  // Aggregation
  RunAggregation: vi.fn(),
  ExplainAggregation: vi.fn(),
  ExplainQuery: vi.fn(),

  // Script methods
  ExecuteScriptWithDatabase: vi.fn(),
  CheckMongoshAvailable: vi.fn().mockResolvedValue([true, '']),

  // Document export
  ExportDocumentsAsZip: vi.fn(),
})

// Mock window.go for Wails bindings
window.go = {
  main: {
    App: createMockApp() as WailsAppBindings,
  },
}

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
  mockEventsOn.mockClear()
  mockEventsOff.mockClear()
  mockEventsEmit.mockClear()
})
