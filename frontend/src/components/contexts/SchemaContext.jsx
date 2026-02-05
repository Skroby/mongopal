import { createContext, useContext, useState, useCallback } from 'react'

const SchemaContext = createContext(null)

// Get go bindings at runtime (for testability)
const getGo = () => window.go?.main?.App

/**
 * Extracts field names from a schema result
 * @param {Object} schema - Schema result with fields property
 * @returns {Set<string>} Set of field names including nested paths
 */
function extractFieldNames(schema) {
  const fieldNames = new Set()

  function traverse(fields, prefix = '') {
    if (!fields || typeof fields !== 'object') return

    for (const [name, field] of Object.entries(fields)) {
      const fullPath = prefix ? `${prefix}.${name}` : name
      fieldNames.add(fullPath)

      // Handle nested objects
      if (field.fields) {
        traverse(field.fields, fullPath)
      }

      // Handle array element types
      if (field.arrayType?.fields) {
        traverse(field.arrayType.fields, fullPath)
      }
    }
  }

  if (schema?.fields) {
    traverse(schema.fields)
  }

  return fieldNames
}

/**
 * Provider component for schema caching and retrieval
 */
export function SchemaProvider({ children }) {
  // Cache: Map of "connId:db:coll" -> { schema, fieldNames, timestamp }
  const [schemaCache, setSchemaCache] = useState(new Map())
  const [loadingSchemas, setLoadingSchemas] = useState(new Set())

  // Default sample size for field validation (small for performance)
  const VALIDATION_SAMPLE_SIZE = 10

  /**
   * Generate cache key from connection, database, and collection
   */
  const getCacheKey = useCallback((connectionId, database, collection) => {
    return `${connectionId}:${database}:${collection}`
  }, [])

  /**
   * Get cached schema for a collection
   * @returns {Object|null} Cached schema result or null if not cached
   */
  const getCachedSchema = useCallback((connectionId, database, collection) => {
    const key = getCacheKey(connectionId, database, collection)
    const cached = schemaCache.get(key)
    return cached?.schema || null
  }, [schemaCache, getCacheKey])

  /**
   * Get field names for a collection (from cache)
   * @returns {Set<string>|null} Set of field names or null if not cached
   */
  const getFieldNames = useCallback((connectionId, database, collection) => {
    const key = getCacheKey(connectionId, database, collection)
    const cached = schemaCache.get(key)
    return cached?.fieldNames || null
  }, [schemaCache, getCacheKey])

  /**
   * Check if schema is currently loading
   */
  const isSchemaLoading = useCallback((connectionId, database, collection) => {
    const key = getCacheKey(connectionId, database, collection)
    return loadingSchemas.has(key)
  }, [loadingSchemas, getCacheKey])

  /**
   * Fetch schema for a collection (or return from cache)
   * @param {string} connectionId
   * @param {string} database
   * @param {string} collection
   * @param {boolean} forceRefresh - If true, bypass cache
   * @returns {Promise<{schema: Object, fieldNames: Set<string>}|null>}
   */
  const fetchSchema = useCallback(async (connectionId, database, collection, forceRefresh = false) => {
    const key = getCacheKey(connectionId, database, collection)

    // Return cached if available and not forcing refresh
    if (!forceRefresh) {
      const cached = schemaCache.get(key)
      if (cached) {
        return { schema: cached.schema, fieldNames: cached.fieldNames }
      }
    }

    // Check if already loading
    if (loadingSchemas.has(key)) {
      return null // Loading in progress
    }

    // Start loading
    setLoadingSchemas(prev => new Set(prev).add(key))

    try {
      const go = getGo()
      if (go?.InferCollectionSchema) {
        const schema = await go.InferCollectionSchema(connectionId, database, collection, VALIDATION_SAMPLE_SIZE)
        const fieldNames = extractFieldNames(schema)

        // Cache the result
        setSchemaCache(prev => {
          const next = new Map(prev)
          next.set(key, {
            schema,
            fieldNames,
            timestamp: Date.now()
          })
          return next
        })

        return { schema, fieldNames }
      }
    } catch (err) {
      console.error('Failed to fetch schema for field validation:', err)
      return null
    } finally {
      setLoadingSchemas(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }

    return null
  }, [schemaCache, loadingSchemas, getCacheKey])

  /**
   * Prefetch schema in background (non-blocking)
   */
  const prefetchSchema = useCallback((connectionId, database, collection) => {
    const key = getCacheKey(connectionId, database, collection)

    // Skip if already cached or loading
    if (schemaCache.has(key) || loadingSchemas.has(key)) {
      return
    }

    // Fetch in background
    fetchSchema(connectionId, database, collection).catch(() => {
      // Silently ignore prefetch errors
    })
  }, [schemaCache, loadingSchemas, getCacheKey, fetchSchema])

  /**
   * Clear schema cache for a specific collection
   */
  const invalidateSchema = useCallback((connectionId, database, collection) => {
    const key = getCacheKey(connectionId, database, collection)
    setSchemaCache(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [getCacheKey])

  /**
   * Clear all cached schemas for a connection
   */
  const invalidateConnection = useCallback((connectionId) => {
    setSchemaCache(prev => {
      const next = new Map()
      for (const [key, value] of prev) {
        if (!key.startsWith(`${connectionId}:`)) {
          next.set(key, value)
        }
      }
      return next
    })
  }, [])

  /**
   * Clear entire schema cache
   */
  const clearCache = useCallback(() => {
    setSchemaCache(new Map())
  }, [])

  /**
   * Merge new field names into the cached schema for a collection.
   * Used to progressively enrich schema from query results.
   * @param {string} connectionId
   * @param {string} database
   * @param {string} collection
   * @param {Set<string>|Array<string>} newFields - New field names to add
   */
  const mergeFieldNames = useCallback((connectionId, database, collection, newFields) => {
    const key = getCacheKey(connectionId, database, collection)

    setSchemaCache(prev => {
      const cached = prev.get(key)
      if (!cached) {
        // No existing cache - create new entry with just field names
        const fieldNames = new Set(newFields)
        const next = new Map(prev)
        next.set(key, {
          schema: null, // No full schema, just field names
          fieldNames,
          timestamp: Date.now()
        })
        return next
      }

      // Merge with existing field names
      const existingFields = cached.fieldNames || new Set()
      let hasNewFields = false

      for (const field of newFields) {
        if (!existingFields.has(field)) {
          hasNewFields = true
          break
        }
      }

      // Skip update if no new fields
      if (!hasNewFields) {
        return prev
      }

      const mergedFields = new Set([...existingFields, ...newFields])
      const next = new Map(prev)
      next.set(key, {
        ...cached,
        fieldNames: mergedFields,
        timestamp: Date.now()
      })
      return next
    })
  }, [getCacheKey])

  const value = {
    // Cache access
    getCachedSchema,
    getFieldNames,
    isSchemaLoading,

    // Fetch methods
    fetchSchema,
    prefetchSchema,

    // Cache management
    invalidateSchema,
    invalidateConnection,
    clearCache,
    mergeFieldNames,
  }

  return (
    <SchemaContext.Provider value={value}>
      {children}
    </SchemaContext.Provider>
  )
}

/**
 * Hook to access schema context
 */
export function useSchema() {
  const context = useContext(SchemaContext)
  if (!context) {
    throw new Error('useSchema must be used within SchemaProvider')
  }
  return context
}

export default SchemaContext
