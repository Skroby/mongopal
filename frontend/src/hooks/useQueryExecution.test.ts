import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useQueryExecution } from './useQueryExecution'

// Mock all context hooks that useQueryExecution depends on
vi.mock('../components/NotificationContext', () => ({
  useNotification: () => ({
    notify: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }),
}))

vi.mock('../components/contexts/ConnectionContext', () => ({
  useConnection: () => ({
    getConnectionById: vi.fn(() => undefined),
    activeConnections: [],
    connectingIds: new Set(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connections: [],
  }),
  SavedConnection: {},
}))

vi.mock('../components/contexts/StatusContext', () => ({
  useStatus: () => ({
    updateDocumentStatus: vi.fn(),
    clearStatus: vi.fn(),
    documentCount: null,
    queryTime: null,
  }),
}))

vi.mock('../components/contexts/DebugContext', () => ({
  useDebugLog: () => ({
    log: vi.fn(),
  }),
  DEBUG_CATEGORIES: { QUERY: 'query' },
}))

vi.mock('../components/contexts/SchemaContext', () => ({
  useSchema: () => ({
    getCachedSchema: vi.fn(() => null),
    getFieldNames: vi.fn(() => null),
    prefetchSchema: vi.fn(),
    mergeFieldNames: vi.fn(),
    fetchCollectionProfile: vi.fn().mockResolvedValue(null),
    getCollectionProfile: vi.fn(() => null),
    isSchemaLoading: vi.fn(() => false),
  }),
}))

vi.mock('../components/Settings', () => ({
  loadSettings: () => ({
    queryTimeout: 30,
    ldhWarningThresholdKB: 100,
    ldhFieldCountThreshold: 50,
    ldhMaxVisibleColumns: 30,
    ldhMaxPagePayloadMB: 10,
    ldhResponseSizeWarningMB: 10,
  }),
  AppSettings: {},
}))

describe('useQueryExecution', () => {
  const defaultOptions = {
    connectionId: 'conn-1',
    database: 'testdb',
    collection: 'users',
    tabId: 'tab-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('initialization', () => {
    it('should initialize with default query', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.query).toContain('users')
      expect(result.current.query).toContain('find')
    })

    it('should start with empty documents', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.documents).toEqual([])
    })

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.loading).toBe(false)
    })

    it('should have no error initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.error).toBeNull()
    })

    it('should start on page 1', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.skip).toBe(0)
      expect(result.current.currentPage).toBe(1)
    })

    it('should default to 50 items per page', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.userLimit).toBe(50)
    })

    it('should start with no query time', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.queryTime).toBeNull()
    })

    it('should not be connected initially (mocked)', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isConnected).toBe(false)
    })

    it('should not be connecting initially (mocked)', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isConnecting).toBe(false)
    })
  })

  describe('restored tab', () => {
    it('should track restored state from prop', () => {
      const { result } = renderHook(() =>
        useQueryExecution({ ...defaultOptions, restored: true })
      )
      expect(result.current.isRestoredTab).toBe(true)
    })

    it('should default to not restored', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isRestoredTab).toBe(false)
    })
  })

  describe('pagination', () => {
    it('should compute totalPages correctly', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      // total=0, limit=50 => Math.ceil(0/50) = 0
      expect(result.current.totalPages).toBe(0)
    })
  })

  describe('health warnings', () => {
    it('should have no health warnings initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.healthWarnings).toEqual([])
    })

    it('should have no large doc warning initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.hasLargeDocWarning).toBe(false)
    })
  })

  describe('auto-projection', () => {
    it('should have no auto-projection info initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.autoProjectionInfo).toBeNull()
    })
  })

  describe('response size warning', () => {
    it('should have no response size warning initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.responseSizeWarning).toBeNull()
    })
  })

  describe('explain', () => {
    it('should not be explaining initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.explaining).toBe(false)
    })

    it('should have no explain result initially', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.explainResult).toBeNull()
    })
  })

  describe('isWriteQuery', () => {
    it('should detect insertOne as write query', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isWriteQuery('db.users.insertOne({ name: "test" })')).toBe(true)
    })

    it('should detect deleteMany as write query', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isWriteQuery('db.users.deleteMany({})')).toBe(true)
    })

    it('should detect updateOne as write query', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isWriteQuery('db.users.updateOne({}, { $set: {} })')).toBe(true)
    })

    it('should not detect find as write query', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isWriteQuery('db.users.find({})')).toBe(false)
    })

    it('should not detect aggregate as write query', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.isWriteQuery('db.users.aggregate([])')).toBe(false)
    })
  })

  describe('query history', () => {
    it('should initialize with empty query history', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.queryHistory).toEqual([])
    })

    it('should load existing query history from localStorage', () => {
      const items = [
        { query: '{ status: "active" }', collection: 'testdb.users', timestamp: 1000 },
      ]
      localStorage.setItem('mongopal_query_history', JSON.stringify(items))
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      expect(result.current.queryHistory).toEqual(items)
    })
  })

  describe('return shape', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useQueryExecution(defaultOptions))
      const value = result.current

      // Query state
      expect(value).toHaveProperty('query')
      expect(value).toHaveProperty('setQuery')
      expect(value).toHaveProperty('documents')
      expect(value).toHaveProperty('loading')
      expect(value).toHaveProperty('error')
      expect(value).toHaveProperty('rawOutput')
      expect(value).toHaveProperty('queryTime')

      // Pagination
      expect(value).toHaveProperty('skip')
      expect(value).toHaveProperty('setSkip')
      expect(value).toHaveProperty('userLimit')
      expect(value).toHaveProperty('setUserLimit')
      expect(value).toHaveProperty('limit')
      expect(value).toHaveProperty('total')
      expect(value).toHaveProperty('currentPage')
      expect(value).toHaveProperty('totalPages')

      // Actions
      expect(value).toHaveProperty('executeQuery')
      expect(value).toHaveProperty('cancelQuery')

      // Connection
      expect(value).toHaveProperty('isConnected')
      expect(value).toHaveProperty('isConnecting')
      expect(value).toHaveProperty('readOnly')

      // Health
      expect(value).toHaveProperty('healthWarnings')
      expect(value).toHaveProperty('hasLargeDocWarning')

      // Schema access
      expect(value).toHaveProperty('getCachedSchema')
      expect(value).toHaveProperty('getFieldNames')
    })
  })
})
