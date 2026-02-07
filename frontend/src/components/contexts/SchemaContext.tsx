import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Represents a field in the inferred schema (matches Go types.SchemaField)
 */
export interface SchemaField {
  type: string
  occurrence: number
  fields?: Record<string, SchemaField>
  arrayType?: SchemaField
}

/**
 * Represents the inferred schema of a collection (matches Go types.SchemaResult)
 */
export interface SchemaResult {
  collection: string
  sampleSize: number
  totalDocs: number
  fields: Record<string, SchemaField>
}

/**
 * Cached schema entry with metadata
 */
interface SchemaCacheEntry {
  schema: SchemaResult | null
  fieldNames: Set<string>
  timestamp: number
}

/**
 * Return type for fetchSchema
 */
export interface FetchSchemaResult {
  schema: SchemaResult
  fieldNames: Set<string>
}

/**
 * Context value interface - exported for type consumers
 */
export interface SchemaContextValue {
  // Cache access
  getCachedSchema: (connectionId: string, database: string, collection: string) => SchemaResult | null
  getFieldNames: (connectionId: string, database: string, collection: string) => Set<string> | null
  isSchemaLoading: (connectionId: string, database: string, collection: string) => boolean

  // Fetch methods
  fetchSchema: (
    connectionId: string,
    database: string,
    collection: string,
    forceRefresh?: boolean
  ) => Promise<FetchSchemaResult | null>
  prefetchSchema: (connectionId: string, database: string, collection: string) => void

  // Cache management
  invalidateSchema: (connectionId: string, database: string, collection: string) => void
  invalidateConnection: (connectionId: string) => void
  clearCache: () => void
  mergeFieldNames: (
    connectionId: string,
    database: string,
    collection: string,
    newFields: Set<string> | string[]
  ) => void
}

/**
 * Provider props interface
 */
interface SchemaProviderProps {
  children: ReactNode
}

/**
 * Go bindings interface for schema operations (local partial type)
 */
interface SchemaAppBindings {
  InferCollectionSchema?: (
    connectionId: string,
    database: string,
    collection: string,
    sampleSize: number
  ) => Promise<SchemaResult>
}

// =============================================================================
// Helper Functions
// =============================================================================

// Get go bindings at runtime (for testability)
const getGo = (): SchemaAppBindings | undefined => window.go?.main?.App as SchemaAppBindings | undefined

/**
 * Extracts field names from a schema result
 * @param schema - Schema result with fields property
 * @returns Set of field names including nested paths
 */
function extractFieldNames(schema: SchemaResult | null): Set<string> {
  const fieldNames = new Set<string>()

  function traverse(fields: Record<string, SchemaField> | undefined, prefix: string = ''): void {
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

// =============================================================================
// Context and Provider
// =============================================================================

const SchemaContext = createContext<SchemaContextValue | undefined>(undefined)

// Default sample size for field validation (small for performance)
const VALIDATION_SAMPLE_SIZE = 10

/**
 * Provider component for schema caching and retrieval
 */
export function SchemaProvider({ children }: SchemaProviderProps): JSX.Element {
  // Cache: Map of "connId:db:coll" -> { schema, fieldNames, timestamp }
  const [schemaCache, setSchemaCache] = useState<Map<string, SchemaCacheEntry>>(new Map())
  const [loadingSchemas, setLoadingSchemas] = useState<Set<string>>(new Set())

  /**
   * Generate cache key from connection, database, and collection
   */
  const getCacheKey = useCallback(
    (connectionId: string, database: string, collection: string): string => {
      return `${connectionId}:${database}:${collection}`
    },
    []
  )

  /**
   * Get cached schema for a collection
   * @returns Cached schema result or null if not cached
   */
  const getCachedSchema = useCallback(
    (connectionId: string, database: string, collection: string): SchemaResult | null => {
      const key = getCacheKey(connectionId, database, collection)
      const cached = schemaCache.get(key)
      return cached?.schema || null
    },
    [schemaCache, getCacheKey]
  )

  /**
   * Get field names for a collection (from cache)
   * @returns Set of field names or null if not cached
   */
  const getFieldNames = useCallback(
    (connectionId: string, database: string, collection: string): Set<string> | null => {
      const key = getCacheKey(connectionId, database, collection)
      const cached = schemaCache.get(key)
      return cached?.fieldNames || null
    },
    [schemaCache, getCacheKey]
  )

  /**
   * Check if schema is currently loading
   */
  const isSchemaLoading = useCallback(
    (connectionId: string, database: string, collection: string): boolean => {
      const key = getCacheKey(connectionId, database, collection)
      return loadingSchemas.has(key)
    },
    [loadingSchemas, getCacheKey]
  )

  /**
   * Fetch schema for a collection (or return from cache)
   * @param connectionId
   * @param database
   * @param collection
   * @param forceRefresh - If true, bypass cache
   * @returns Schema result with field names or null if loading/failed
   */
  const fetchSchema = useCallback(
    async (
      connectionId: string,
      database: string,
      collection: string,
      forceRefresh: boolean = false
    ): Promise<FetchSchemaResult | null> => {
      const key = getCacheKey(connectionId, database, collection)

      // Return cached if available and not forcing refresh
      if (!forceRefresh) {
        const cached = schemaCache.get(key)
        if (cached && cached.schema) {
          return { schema: cached.schema, fieldNames: cached.fieldNames }
        }
      }

      // Check if already loading
      if (loadingSchemas.has(key)) {
        return null // Loading in progress
      }

      // Start loading
      setLoadingSchemas((prev) => new Set(prev).add(key))

      try {
        const go = getGo()
        if (go?.InferCollectionSchema) {
          const schema = await go.InferCollectionSchema(
            connectionId,
            database,
            collection,
            VALIDATION_SAMPLE_SIZE
          )
          const fieldNames = extractFieldNames(schema)

          // Cache the result
          setSchemaCache((prev) => {
            const next = new Map(prev)
            next.set(key, {
              schema,
              fieldNames,
              timestamp: Date.now(),
            })
            return next
          })

          return { schema, fieldNames }
        }
      } catch (err) {
        console.error('Failed to fetch schema for field validation:', err)
        return null
      } finally {
        setLoadingSchemas((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }

      return null
    },
    [schemaCache, loadingSchemas, getCacheKey]
  )

  /**
   * Prefetch schema in background (non-blocking)
   */
  const prefetchSchema = useCallback(
    (connectionId: string, database: string, collection: string): void => {
      const key = getCacheKey(connectionId, database, collection)

      // Skip if already cached or loading
      if (schemaCache.has(key) || loadingSchemas.has(key)) {
        return
      }

      // Fetch in background
      fetchSchema(connectionId, database, collection).catch(() => {
        // Silently ignore prefetch errors
      })
    },
    [schemaCache, loadingSchemas, getCacheKey, fetchSchema]
  )

  /**
   * Clear schema cache for a specific collection
   */
  const invalidateSchema = useCallback(
    (connectionId: string, database: string, collection: string): void => {
      const key = getCacheKey(connectionId, database, collection)
      setSchemaCache((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    },
    [getCacheKey]
  )

  /**
   * Clear all cached schemas for a connection
   */
  const invalidateConnection = useCallback((connectionId: string): void => {
    setSchemaCache((prev) => {
      const next = new Map<string, SchemaCacheEntry>()
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
  const clearCache = useCallback((): void => {
    setSchemaCache(new Map())
  }, [])

  /**
   * Merge new field names into the cached schema for a collection.
   * Used to progressively enrich schema from query results.
   * @param connectionId
   * @param database
   * @param collection
   * @param newFields - New field names to add
   */
  const mergeFieldNames = useCallback(
    (
      connectionId: string,
      database: string,
      collection: string,
      newFields: Set<string> | string[]
    ): void => {
      const key = getCacheKey(connectionId, database, collection)

      setSchemaCache((prev) => {
        const cached = prev.get(key)
        if (!cached) {
          // No existing cache - create new entry with just field names
          const fieldNames = new Set(newFields)
          const next = new Map(prev)
          next.set(key, {
            schema: null, // No full schema, just field names
            fieldNames,
            timestamp: Date.now(),
          })
          return next
        }

        // Merge with existing field names
        const existingFields = cached.fieldNames || new Set<string>()
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
          timestamp: Date.now(),
        })
        return next
      })
    },
    [getCacheKey]
  )

  const value: SchemaContextValue = {
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

  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>
}

/**
 * Hook to access schema context
 */
export function useSchema(): SchemaContextValue {
  const context = useContext(SchemaContext)
  if (!context) {
    throw new Error('useSchema must be used within SchemaProvider')
  }
  return context
}

export default SchemaContext
