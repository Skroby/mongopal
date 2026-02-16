import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBulkActions } from './useBulkActions'

// Mock contexts
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

vi.mock('../components/contexts/OperationContext', () => ({
  useOperation: () => ({
    startOperation: vi.fn(() => 'op-1'),
    updateOperation: vi.fn(),
    completeOperation: vi.fn(),
    activeOperations: [],
    hasDestructiveOperation: false,
  }),
}))

describe('useBulkActions', () => {
  const defaultOptions = {
    connectionId: 'conn-1',
    database: 'testdb',
    collection: 'users',
    documents: [],
    onRefresh: vi.fn(),
    query: '{}',
    skip: 0,
    limit: 50,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should start with empty selection', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.selectedIds.size).toBe(0)
    })

    it('should start with no delete dialog', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.deleteDoc).toBeNull()
      expect(result.current.deleting).toBe(false)
    })

    it('should start with no bulk delete modal', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.showBulkDeleteModal).toBe(false)
      expect(result.current.bulkDeleting).toBe(false)
    })

    it('should start with no export in progress', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.exporting).toBe(false)
    })

    it('should start with no comparison docs', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.compareSourceDoc).toBeNull()
      expect(result.current.showDiffView).toBe(false)
      expect(result.current.diffTargetDoc).toBeNull()
    })
  })

  describe('selection', () => {
    it('should update selected IDs', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))

      act(() => {
        result.current.setSelectedIds(new Set(['id-1', 'id-2']))
      })
      expect(result.current.selectedIds.size).toBe(2)
    })

    it('should clear selection when query changes', () => {
      const { result, rerender } = renderHook(
        (props) => useBulkActions(props),
        { initialProps: defaultOptions }
      )

      act(() => {
        result.current.setSelectedIds(new Set(['id-1', 'id-2']))
      })
      expect(result.current.selectedIds.size).toBe(2)

      // Change query
      rerender({ ...defaultOptions, query: '{ status: "active" }' })
      expect(result.current.selectedIds.size).toBe(0)
    })

    it('should clear selection when collection changes', () => {
      const { result, rerender } = renderHook(
        (props) => useBulkActions(props),
        { initialProps: defaultOptions }
      )

      act(() => {
        result.current.setSelectedIds(new Set(['id-1']))
      })
      expect(result.current.selectedIds.size).toBe(1)

      rerender({ ...defaultOptions, collection: 'orders' })
      expect(result.current.selectedIds.size).toBe(0)
    })
  })

  describe('single document delete', () => {
    it('should set delete doc on handleDelete', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: 'doc-1', name: 'Test' }

      act(() => {
        result.current.handleDelete(doc)
      })
      expect(result.current.deleteDoc).toEqual(doc)
    })

    it('should clear delete doc', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: 'doc-1', name: 'Test' }

      act(() => {
        result.current.handleDelete(doc)
      })
      expect(result.current.deleteDoc).not.toBeNull()

      act(() => {
        result.current.setDeleteDoc(null)
      })
      expect(result.current.deleteDoc).toBeNull()
    })
  })

  describe('bulk delete modal', () => {
    it('should toggle bulk delete modal', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))

      act(() => {
        result.current.setShowBulkDeleteModal(true)
      })
      expect(result.current.showBulkDeleteModal).toBe(true)

      act(() => {
        result.current.setShowBulkDeleteModal(false)
      })
      expect(result.current.showBulkDeleteModal).toBe(false)
    })
  })

  describe('document comparison', () => {
    it('should set compare source doc', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: 'doc-1', name: 'Source' }

      act(() => {
        result.current.setCompareSourceDoc(doc)
      })
      expect(result.current.compareSourceDoc).toEqual(doc)
    })

    it('should set diff target doc and show diff view', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: 'doc-2', name: 'Target' }

      act(() => {
        result.current.setDiffTargetDoc(doc)
        result.current.setShowDiffView(true)
      })
      expect(result.current.diffTargetDoc).toEqual(doc)
      expect(result.current.showDiffView).toBe(true)
    })
  })

  describe('getDocIdForApi', () => {
    it('should return string ID directly', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: 'simple-string-id' }
      expect(result.current.getDocIdForApi(doc)).toBe('simple-string-id')
    })

    it('should extract $oid from ObjectId', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: { $oid: '507f1f77bcf86cd799439011' } }
      expect(result.current.getDocIdForApi(doc)).toBe('507f1f77bcf86cd799439011')
    })

    it('should JSON.stringify complex IDs', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { _id: { $binary: { base64: 'abc', subType: '03' } } }
      expect(result.current.getDocIdForApi(doc)).toBe(
        JSON.stringify({ $binary: { base64: 'abc', subType: '03' } })
      )
    })

    it('should return null for documents without _id', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      const doc = { name: 'no id' }
      expect(result.current.getDocIdForApi(doc)).toBeNull()
    })
  })

  describe('formatIdForShell', () => {
    it('should format ObjectId strings', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.formatIdForShell('507f1f77bcf86cd799439011')).toBe(
        'ObjectId("507f1f77bcf86cd799439011")'
      )
    })

    it('should format $oid JSON', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.formatIdForShell('{"$oid":"507f1f77bcf86cd799439011"}')).toBe(
        'ObjectId("507f1f77bcf86cd799439011")'
      )
    })

    it('should format UUID JSON', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(
        result.current.formatIdForShell('{"$uuid":"550e8400-e29b-41d4-a716-446655440000"}')
      ).toBe('UUID("550e8400-e29b-41d4-a716-446655440000")')
    })

    it('should format plain strings with quotes', () => {
      const { result } = renderHook(() => useBulkActions(defaultOptions))
      expect(result.current.formatIdForShell('my-id')).toBe('"my-id"')
    })
  })
})
