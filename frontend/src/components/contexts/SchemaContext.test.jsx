import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { SchemaProvider, useSchema } from './SchemaContext'

// Mock the go bindings
const mockInferCollectionSchema = vi.fn()

beforeEach(() => {
  window.go = {
    main: {
      App: {
        InferCollectionSchema: mockInferCollectionSchema
      }
    }
  }
})

afterEach(() => {
  vi.clearAllMocks()
  delete window.go
})

const wrapper = ({ children }) => <SchemaProvider>{children}</SchemaProvider>

describe('SchemaContext', () => {
  describe('useSchema hook', () => {
    it('throws error when used outside provider', () => {
      expect(() => {
        renderHook(() => useSchema())
      }).toThrow('useSchema must be used within SchemaProvider')
    })

    it('provides schema methods', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      expect(result.current.getCachedSchema).toBeInstanceOf(Function)
      expect(result.current.getFieldNames).toBeInstanceOf(Function)
      expect(result.current.isSchemaLoading).toBeInstanceOf(Function)
      expect(result.current.fetchSchema).toBeInstanceOf(Function)
      expect(result.current.prefetchSchema).toBeInstanceOf(Function)
      expect(result.current.invalidateSchema).toBeInstanceOf(Function)
      expect(result.current.invalidateConnection).toBeInstanceOf(Function)
      expect(result.current.clearCache).toBeInstanceOf(Function)
    })
  })

  describe('getCachedSchema', () => {
    it('returns null when schema is not cached', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      const schema = result.current.getCachedSchema('conn1', 'db1', 'coll1')
      expect(schema).toBeNull()
    })
  })

  describe('getFieldNames', () => {
    it('returns null when schema is not cached', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'coll1')
      expect(fieldNames).toBeNull()
    })
  })

  describe('fetchSchema', () => {
    it('fetches and caches schema', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: {
          name: { type: 'String', occurrence: 100 },
          age: { type: 'Int32', occurrence: 100 },
          address: {
            type: 'Object',
            occurrence: 80,
            fields: {
              city: { type: 'String', occurrence: 100 },
              zip: { type: 'String', occurrence: 90 }
            }
          }
        }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      let fetchResult
      await act(async () => {
        fetchResult = await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      expect(mockInferCollectionSchema).toHaveBeenCalledWith('conn1', 'db1', 'testColl', 10)
      expect(fetchResult).not.toBeNull()
      expect(fetchResult.schema).toEqual(mockSchema)
      expect(fetchResult.fieldNames).toBeInstanceOf(Set)
      expect(fetchResult.fieldNames.has('name')).toBe(true)
      expect(fetchResult.fieldNames.has('age')).toBe(true)
      expect(fetchResult.fieldNames.has('address')).toBe(true)
      expect(fetchResult.fieldNames.has('address.city')).toBe(true)
      expect(fetchResult.fieldNames.has('address.zip')).toBe(true)
    })

    it('returns cached schema on subsequent calls', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // First fetch
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      // Second fetch should use cache
      let fetchResult
      await act(async () => {
        fetchResult = await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      expect(mockInferCollectionSchema).toHaveBeenCalledTimes(1)
      expect(fetchResult.schema).toEqual(mockSchema)
    })

    it('bypasses cache when forceRefresh is true', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // First fetch
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      // Second fetch with forceRefresh
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl', true)
      })

      expect(mockInferCollectionSchema).toHaveBeenCalledTimes(2)
    })

    it('handles fetch errors gracefully', async () => {
      mockInferCollectionSchema.mockRejectedValue(new Error('Connection failed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useSchema(), { wrapper })

      let fetchResult
      await act(async () => {
        fetchResult = await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      expect(fetchResult).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('isSchemaLoading', () => {
    it('returns true while schema is loading', async () => {
      let resolvePromise
      mockInferCollectionSchema.mockImplementation(() => new Promise(resolve => {
        resolvePromise = resolve
      }))

      const { result } = renderHook(() => useSchema(), { wrapper })

      // Start fetch but don't await
      act(() => {
        result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      // Should be loading
      expect(result.current.isSchemaLoading('conn1', 'db1', 'testColl')).toBe(true)

      // Resolve the promise
      await act(async () => {
        resolvePromise({ fields: {} })
      })

      // Should no longer be loading
      expect(result.current.isSchemaLoading('conn1', 'db1', 'testColl')).toBe(false)
    })
  })

  describe('prefetchSchema', () => {
    it('fetches schema in background', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      act(() => {
        result.current.prefetchSchema('conn1', 'db1', 'testColl')
      })

      await waitFor(() => {
        expect(mockInferCollectionSchema).toHaveBeenCalled()
      })
    })

    it('skips if already cached', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // First fetch
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      // Prefetch should not call again
      act(() => {
        result.current.prefetchSchema('conn1', 'db1', 'testColl')
      })

      expect(mockInferCollectionSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('invalidateSchema', () => {
    it('removes specific schema from cache', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // Cache a schema
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      expect(result.current.getCachedSchema('conn1', 'db1', 'testColl')).not.toBeNull()

      // Invalidate
      act(() => {
        result.current.invalidateSchema('conn1', 'db1', 'testColl')
      })

      expect(result.current.getCachedSchema('conn1', 'db1', 'testColl')).toBeNull()
    })
  })

  describe('invalidateConnection', () => {
    it('removes all schemas for a connection', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // Cache schemas for two collections
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'coll1')
        await result.current.fetchSchema('conn1', 'db1', 'coll2')
        await result.current.fetchSchema('conn2', 'db1', 'coll1')
      })

      // Invalidate connection 1
      act(() => {
        result.current.invalidateConnection('conn1')
      })

      // conn1 schemas should be gone
      expect(result.current.getCachedSchema('conn1', 'db1', 'coll1')).toBeNull()
      expect(result.current.getCachedSchema('conn1', 'db1', 'coll2')).toBeNull()
      // conn2 schema should remain
      expect(result.current.getCachedSchema('conn2', 'db1', 'coll1')).not.toBeNull()
    })
  })

  describe('clearCache', () => {
    it('removes all cached schemas', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: { name: { type: 'String', occurrence: 100 } }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // Cache multiple schemas
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'coll1')
        await result.current.fetchSchema('conn2', 'db2', 'coll2')
      })

      // Clear all
      act(() => {
        result.current.clearCache()
      })

      expect(result.current.getCachedSchema('conn1', 'db1', 'coll1')).toBeNull()
      expect(result.current.getCachedSchema('conn2', 'db2', 'coll2')).toBeNull()
    })
  })

  describe('mergeFieldNames', () => {
    it('creates new cache entry when no existing cache', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      act(() => {
        result.current.mergeFieldNames('conn1', 'db1', 'coll1', ['name', 'age', 'email'])
      })

      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'coll1')
      expect(fieldNames).not.toBeNull()
      expect(fieldNames.has('name')).toBe(true)
      expect(fieldNames.has('age')).toBe(true)
      expect(fieldNames.has('email')).toBe(true)
    })

    it('accepts Set as input', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      act(() => {
        result.current.mergeFieldNames('conn1', 'db1', 'coll1', new Set(['field1', 'field2']))
      })

      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'coll1')
      expect(fieldNames.has('field1')).toBe(true)
      expect(fieldNames.has('field2')).toBe(true)
    })

    it('merges new fields with existing cache', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: {
          existingField: { type: 'String', occurrence: 100 }
        }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      // First, fetch schema to populate cache
      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      // Now merge new fields
      act(() => {
        result.current.mergeFieldNames('conn1', 'db1', 'testColl', ['newField1', 'newField2'])
      })

      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'testColl')
      expect(fieldNames.has('existingField')).toBe(true)
      expect(fieldNames.has('newField1')).toBe(true)
      expect(fieldNames.has('newField2')).toBe(true)
    })

    it('does not update cache if no new fields', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: {
          field1: { type: 'String', occurrence: 100 },
          field2: { type: 'String', occurrence: 100 }
        }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      // Get initial field names reference
      const initialFieldNames = result.current.getFieldNames('conn1', 'db1', 'testColl')

      // Try to merge fields that already exist
      act(() => {
        result.current.mergeFieldNames('conn1', 'db1', 'testColl', ['field1', 'field2'])
      })

      // Should be the same Set (no update)
      const afterMergeFieldNames = result.current.getFieldNames('conn1', 'db1', 'testColl')
      expect(afterMergeFieldNames).toBe(initialFieldNames)
    })

    it('handles nested field paths', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      act(() => {
        result.current.mergeFieldNames('conn1', 'db1', 'coll1', [
          'user',
          'user.name',
          'user.address',
          'user.address.city',
          'user.address.zip'
        ])
      })

      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'coll1')
      expect(fieldNames.has('user')).toBe(true)
      expect(fieldNames.has('user.name')).toBe(true)
      expect(fieldNames.has('user.address')).toBe(true)
      expect(fieldNames.has('user.address.city')).toBe(true)
      expect(fieldNames.has('user.address.zip')).toBe(true)
    })

    it('creates cache without schema when merging to empty cache', () => {
      const { result } = renderHook(() => useSchema(), { wrapper })

      act(() => {
        result.current.mergeFieldNames('conn1', 'db1', 'coll1', ['field1'])
      })

      // Schema should be null (only field names were added)
      const schema = result.current.getCachedSchema('conn1', 'db1', 'coll1')
      expect(schema).toBeNull()

      // But field names should exist
      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'coll1')
      expect(fieldNames).not.toBeNull()
      expect(fieldNames.has('field1')).toBe(true)
    })
  })

  describe('field name extraction', () => {
    it('extracts nested field names from schema', async () => {
      const mockSchema = {
        collection: 'testColl',
        fields: {
          simple: { type: 'String', occurrence: 100 },
          nested: {
            type: 'Object',
            occurrence: 100,
            fields: {
              level1: {
                type: 'Object',
                occurrence: 100,
                fields: {
                  level2: { type: 'String', occurrence: 100 }
                }
              }
            }
          },
          arr: {
            type: 'Array',
            occurrence: 90,
            arrayType: {
              fields: {
                item: { type: 'String', occurrence: 100 }
              }
            }
          }
        }
      }
      mockInferCollectionSchema.mockResolvedValue(mockSchema)

      const { result } = renderHook(() => useSchema(), { wrapper })

      await act(async () => {
        await result.current.fetchSchema('conn1', 'db1', 'testColl')
      })

      const fieldNames = result.current.getFieldNames('conn1', 'db1', 'testColl')

      expect(fieldNames.has('simple')).toBe(true)
      expect(fieldNames.has('nested')).toBe(true)
      expect(fieldNames.has('nested.level1')).toBe(true)
      expect(fieldNames.has('nested.level1.level2')).toBe(true)
      expect(fieldNames.has('arr')).toBe(true)
      expect(fieldNames.has('arr.item')).toBe(true)
    })
  })
})
