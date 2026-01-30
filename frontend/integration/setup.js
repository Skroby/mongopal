/**
 * Integration test setup
 *
 * Provides mock implementations of Wails Go bindings for testing
 * frontend components without the actual backend.
 */

import { vi } from 'vitest'

// Sample test data
export const mockDocuments = [
  {
    _id: { $oid: '507f1f77bcf86cd799439011' },
    name: 'Test User 1',
    email: 'user1@test.com',
    age: 25,
    active: true,
    address: { city: 'New York', zip: '10001' },
    createdAt: { $date: '2024-01-15T10:30:00.000Z' }
  },
  {
    _id: { $oid: '507f1f77bcf86cd799439012' },
    name: 'Test User 2',
    email: 'user2@test.com',
    age: 30,
    active: false,
    address: { city: 'Los Angeles', zip: '90001' },
    createdAt: { $date: '2024-02-20T14:45:00.000Z' }
  },
  {
    _id: { $oid: '507f1f77bcf86cd799439013' },
    name: 'Test User 3',
    email: 'user3@test.com',
    age: 35,
    active: true,
    address: { city: 'Chicago', zip: '60601' },
    tags: ['admin', 'verified'],
    createdAt: { $date: '2024-03-10T09:00:00.000Z' }
  }
]

export const mockSchema = {
  collection: 'users',
  sampleSize: 3,
  totalDocs: 100,
  fields: {
    _id: { type: 'ObjectId', occurrence: 100 },
    name: { type: 'String', occurrence: 100 },
    email: { type: 'String', occurrence: 100 },
    age: { type: 'Int32', occurrence: 100 },
    active: { type: 'Boolean', occurrence: 100 },
    address: {
      type: 'Object',
      occurrence: 100,
      fields: {
        city: { type: 'String', occurrence: 100 },
        zip: { type: 'String', occurrence: 100 }
      }
    },
    tags: { type: 'Array', occurrence: 33.3 },
    createdAt: { type: 'Date', occurrence: 100 }
  }
}

export const mockConnections = [
  { id: 'conn-1', name: 'Local Dev', uri: 'mongodb://localhost:27017', color: '#4CC38A' },
  { id: 'conn-2', name: 'Staging', uri: 'mongodb://staging.example.com:27017', color: '#3B82F6' }
]

export const mockDatabases = [
  { name: 'testdb', sizeOnDisk: 1024000, empty: false },
  { name: 'admin', sizeOnDisk: 32768, empty: false }
]

export const mockCollections = [
  { name: 'users', type: 'collection', count: 100 },
  { name: 'orders', type: 'collection', count: 50 },
  { name: 'products', type: 'collection', count: 25 }
]

/**
 * Create a mock Wails Go API
 * Each method can be overridden per-test
 */
export function createMockGoAPI(overrides = {}) {
  const defaultMocks = {
    // Connection methods
    ListSavedConnections: vi.fn().mockResolvedValue(mockConnections),
    Connect: vi.fn().mockResolvedValue(undefined),
    Disconnect: vi.fn().mockResolvedValue(undefined),
    TestConnection: vi.fn().mockResolvedValue(undefined),
    GetConnectionStatus: vi.fn().mockReturnValue({ connected: true }),

    // Database/Collection listing
    ListDatabases: vi.fn().mockResolvedValue(mockDatabases),
    ListCollections: vi.fn().mockResolvedValue(mockCollections),

    // Query methods
    FindDocuments: vi.fn().mockResolvedValue({
      documents: mockDocuments.map(d => JSON.stringify(d)),
      total: mockDocuments.length,
      hasMore: false,
      queryTimeMs: 15
    }),

    // Document CRUD
    GetDocument: vi.fn().mockImplementation((connId, db, coll, docId) => {
      const doc = mockDocuments.find(d => d._id.$oid === docId)
      return Promise.resolve(doc ? JSON.stringify(doc) : null)
    }),
    UpdateDocument: vi.fn().mockResolvedValue(undefined),
    InsertDocument: vi.fn().mockResolvedValue('507f1f77bcf86cd799439099'),
    DeleteDocument: vi.fn().mockResolvedValue(undefined),

    // Bulk operations
    DeleteDocuments: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    ExportDocumentsAsZip: vi.fn().mockResolvedValue('/tmp/export.zip'),

    // Schema
    InferCollectionSchema: vi.fn().mockResolvedValue(mockSchema),
    ExportSchemaAsJSON: vi.fn().mockResolvedValue(undefined),

    // Script execution (mongosh)
    ExecuteScript: vi.fn().mockResolvedValue('[]'),
    ExecuteScriptWithDatabase: vi.fn().mockResolvedValue('[]'),

    // Validation
    ValidateJSON: vi.fn().mockResolvedValue(null),

    // Folders
    ListFolders: vi.fn().mockResolvedValue([]),
    CreateFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'Test Folder' }),
    DeleteFolder: vi.fn().mockResolvedValue(undefined),
  }

  return { ...defaultMocks, ...overrides }
}

/**
 * Install mock Go API on window object
 */
export function installMockGoAPI(overrides = {}) {
  const mockAPI = createMockGoAPI(overrides)

  window.go = {
    main: {
      App: mockAPI
    }
  }

  return mockAPI
}

/**
 * Clean up mock Go API
 */
export function cleanupMockGoAPI() {
  delete window.go
}

// Default setup - install basic mocks before each test
beforeEach(() => {
  installMockGoAPI()
})

afterEach(() => {
  cleanupMockGoAPI()
  vi.clearAllMocks()
})
