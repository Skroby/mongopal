import { useState, useEffect, ReactNode, FormEvent, ChangeEvent } from 'react'
import { useNotification } from './NotificationContext'
import { useConnection } from './contexts/ConnectionContext'
import ConfirmDialog from './ConfirmDialog'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Props for the IndexView component
 */
export interface IndexViewProps {
  /** Connection identifier */
  connectionId: string
  /** Database name */
  database: string
  /** Collection name */
  collection: string
}

/**
 * Represents a MongoDB index
 */
export interface MongoIndex {
  /** Index name */
  name: string
  /** Index key specification (field -> direction) */
  keys: Record<string, number>
  /** Whether the index enforces uniqueness */
  unique: boolean
  /** Whether the index is sparse */
  sparse: boolean
  /** TTL in seconds (0 if not a TTL index) */
  ttl: number
  /** Index size in bytes */
  size: number
  /** Number of operations using this index */
  usageCount: number
  /** Index version */
  version?: number
  /** Partial filter expression for partial indexes */
  partialFilterExpression?: Record<string, unknown>
}

/**
 * Options for creating an index
 */
export interface CreateIndexOptions {
  unique: boolean
  sparse: boolean
  background: boolean
  name: string
  expireAfterSeconds: number
}

/**
 * Index key definition (field and direction)
 */
interface IndexKey {
  field: string
  direction: 1 | -1
}

/**
 * State for index creation form options
 */
interface FormOptions {
  unique: boolean
  sparse: boolean
  background: boolean
  name: string
  expireAfterSeconds: string
}

/**
 * Props for icon components
 */
interface IconProps {
  className?: string
}

/**
 * Props for CreateIndexForm component
 */
interface CreateIndexFormProps {
  onSubmit: (keys: Record<string, number>, options: CreateIndexOptions) => void
  onCancel: () => void
  creating: boolean
}

/**
 * Go bindings interface for index operations (component-specific)
 */
interface IndexGoBindings {
  ListIndexes?: (
    connectionId: string,
    database: string,
    collection: string
  ) => Promise<MongoIndex[]>
  CreateIndex?: (
    connectionId: string,
    database: string,
    collection: string,
    keys: Record<string, number>,
    options: CreateIndexOptions
  ) => Promise<void>
  DropIndex?: (
    connectionId: string,
    database: string,
    collection: string,
    indexName: string
  ) => Promise<void>
}

// Access window.go dynamically for testability
const getGo = (): IndexGoBindings | undefined => window.go?.main?.App as IndexGoBindings | undefined

// =============================================================================
// Icon Components
// =============================================================================

const PlusIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const TrashIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
)

const MinusIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
  </svg>
)

const RefreshIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
)

const ChevronUpIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
)

const ChevronRightIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const CopyIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
)

const CheckIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

// =============================================================================
// Helper Functions
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatKeys(keys: Record<string, number>): string {
  return Object.entries(keys)
    .map(([field, direction]) => `${field}: ${direction === 1 ? '1' : '-1'}`)
    .join(', ')
}

// =============================================================================
// CreateIndexForm Component
// =============================================================================

function CreateIndexForm({ onSubmit, onCancel, creating }: CreateIndexFormProps): ReactNode {
  const [keys, setKeys] = useState<IndexKey[]>([{ field: '', direction: 1 }])
  const [options, setOptions] = useState<FormOptions>({
    unique: false,
    sparse: false,
    background: true,
    name: '',
    expireAfterSeconds: '',
  })

  const addKey = (): void => {
    setKeys([...keys, { field: '', direction: 1 }])
  }

  const removeKey = (index: number): void => {
    if (keys.length > 1) {
      setKeys(keys.filter((_, i) => i !== index))
    }
  }

  const updateKey = (index: number, field: keyof IndexKey, value: string | number): void => {
    const newKeys = [...keys]
    if (field === 'field') {
      newKeys[index].field = value as string
    } else {
      newKeys[index].direction = value as 1 | -1
    }
    setKeys(newKeys)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()

    // Build keys object
    const keysObj: Record<string, number> = {}
    for (const key of keys) {
      if (key.field.trim()) {
        keysObj[key.field.trim()] = key.direction
      }
    }

    if (Object.keys(keysObj).length === 0) {
      return
    }

    // Build options
    const opts: CreateIndexOptions = {
      unique: options.unique,
      sparse: options.sparse,
      background: options.background,
      name: options.name.trim() || '',
      expireAfterSeconds: options.expireAfterSeconds
        ? parseInt(options.expireAfterSeconds, 10)
        : 0,
    }

    onSubmit(keysObj, opts)
  }

  const isValid = keys.some((k) => k.field.trim())

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Index Keys */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Index Keys
        </label>
        <div className="space-y-2">
          {keys.map((key, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 input py-1.5 px-2 text-sm font-mono"
                placeholder="field.path"
                value={key.field}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateKey(index, 'field', e.target.value)
                }
                autoFocus={index === 0}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <select
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
                value={key.direction}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  updateKey(index, 'direction', parseInt(e.target.value, 10))
                }
              >
                <option value={1}>Ascending (1)</option>
                <option value={-1}>Descending (-1)</option>
              </select>
              {keys.length > 1 && (
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
                  onClick={() => removeKey(index)}
                  title="Remove key"
                >
                  <MinusIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 text-xs text-accent hover:text-accent/80 flex items-center gap-1"
          onClick={addKey}
        >
          <PlusIcon className="w-3 h-3" />
          Add key
        </button>
      </div>

      {/* Options */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Options
        </label>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                checked={options.unique}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOptions({ ...options, unique: e.target.checked })
                }
              />
              Unique
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                checked={options.sparse}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOptions({ ...options, sparse: e.target.checked })
                }
              />
              Sparse
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                checked={options.background}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOptions({ ...options, background: e.target.checked })
                }
              />
              Background
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Index Name (optional)</label>
              <input
                type="text"
                className="w-full input py-1.5 px-2 text-sm"
                placeholder="Auto-generated if empty"
                value={options.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOptions({ ...options, name: e.target.value })
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div className="w-40">
              <label className="block text-xs text-zinc-400 mb-1">TTL (seconds)</label>
              <input
                type="number"
                className="w-full input py-1.5 px-2 text-sm"
                placeholder="0 = disabled"
                value={options.expireAfterSeconds}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOptions({ ...options, expireAfterSeconds: e.target.value })
                }
                min="0"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={creating}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!isValid || creating}>
          {creating ? 'Creating...' : 'Create Index'}
        </button>
      </div>
    </form>
  )
}

// =============================================================================
// IndexView Component
// =============================================================================

export default function IndexView({
  connectionId,
  database,
  collection,
}: IndexViewProps): ReactNode {
  const { notify } = useNotification()
  const { activeConnections, connectingIds, connect } = useConnection()
  const [indexes, setIndexes] = useState<MongoIndex[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false)
  const [creating, setCreating] = useState<boolean>(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<boolean>(false)
  const [expandedIndexes, setExpandedIndexes] = useState<Set<string>>(new Set())
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)

  // Connection state
  const isConnected = activeConnections.includes(connectionId)
  const isConnecting = connectingIds.has(connectionId)

  const toggleIndexExpanded = (indexName: string): void => {
    setExpandedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(indexName)) {
        next.delete(indexName)
      } else {
        next.add(indexName)
      }
      return next
    })
  }

  const copyIndexDetails = async (index: MongoIndex): Promise<void> => {
    const keysStr = Object.entries(index.keys)
      .map(([field, dir]) => `  ${field}: ${dir === 1 ? '1 (ASC)' : '-1 (DESC)'}`)
      .join('\n')
    const text = `Index: ${index.name}
Collection: ${database}.${collection}

Keys:
${keysStr}

Options:
  Unique: ${index.unique ? 'Yes' : 'No'}
  Sparse: ${index.sparse ? 'Yes' : 'No'}
  TTL: ${index.ttl > 0 ? `${index.ttl} seconds` : 'None'}${index.partialFilterExpression ? `\n  Partial Filter: ${JSON.stringify(index.partialFilterExpression)}` : ''}

Statistics:
  Size: ${formatBytes(index.size)}
  Usage: ${index.usageCount > 0 ? `${index.usageCount.toLocaleString()} ops` : 'No usage data'}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index.name)
      setTimeout(() => setCopiedIndex(null), 1500)
    } catch {
      notify.error('Failed to copy to clipboard')
    }
  }

  // Auto-load indexes when connected
  useEffect(() => {
    if (isConnected && !isConnecting) {
      loadIndexes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, collection, isConnected, isConnecting])

  const loadIndexes = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const go = getGo()
      if (go?.ListIndexes) {
        const result = await go.ListIndexes(connectionId, database, collection)
        setIndexes(result || [])
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      notify.error(`Failed to load indexes: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateIndex = async (
    keys: Record<string, number>,
    opts: CreateIndexOptions
  ): Promise<void> => {
    setCreating(true)
    try {
      const go = getGo()
      if (go?.CreateIndex) {
        await go.CreateIndex(connectionId, database, collection, keys, opts)
        notify.success('Index created successfully')
        setShowCreateForm(false)
        await loadIndexes()
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      notify.error(`Failed to create index: ${errorMsg}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDropIndex = async (indexName: string): Promise<void> => {
    setDeleting(true)
    try {
      const go = getGo()
      if (go?.DropIndex) {
        await go.DropIndex(connectionId, database, collection, indexName)
        notify.success(`Index "${indexName}" dropped`)
        setConfirmDelete(null)
        await loadIndexes()
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      notify.error(`Failed to drop index: ${errorMsg}`)
    } finally {
      setDeleting(false)
    }
  }

  // Not connected state
  if (!isConnected && !isConnecting) {
    return (
      <div className="h-full flex flex-col bg-surface">
        {/* Header */}
        <div className="flex-shrink-0 p-3 border-b border-border bg-surface-secondary">
          <div>
            <h2 className="text-lg font-medium text-zinc-100">Index Manager</h2>
            <p className="text-sm text-zinc-400 font-mono">
              {database}.{collection}
            </p>
          </div>
        </div>
        {/* Not connected message */}
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-4">
          <svg
            className="w-12 h-12 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <span>Not connected to database</span>
          <button
            onClick={() => connect(connectionId)}
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-zinc-900 rounded-lg font-medium"
          >
            Connect
          </button>
        </div>
      </div>
    )
  }

  // Connecting state
  if (isConnecting) {
    return (
      <div className="h-full flex flex-col bg-surface">
        {/* Header */}
        <div className="flex-shrink-0 p-3 border-b border-border bg-surface-secondary">
          <div>
            <h2 className="text-lg font-medium text-zinc-100">Index Manager</h2>
            <p className="text-sm text-zinc-400 font-mono">
              {database}.{collection}
            </p>
          </div>
        </div>
        {/* Connecting message */}
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          <span>Connecting to database...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-border bg-surface-secondary">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-zinc-100">Index Manager</h2>
            <p className="text-sm text-zinc-400 font-mono">
              {database}.{collection}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
              onClick={loadIndexes}
              disabled={loading}
              title="Refresh indexes"
            >
              <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="btn btn-primary flex items-center gap-1.5"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? (
                <>
                  <ChevronUpIcon className="w-4 h-4" />
                  <span>Hide Form</span>
                </>
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" />
                  <span>Create Index</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Create form - collapsible panel */}
      {showCreateForm && (
        <div className="flex-shrink-0 border-b border-border p-4 bg-zinc-800/50">
          <CreateIndexForm
            onSubmit={handleCreateIndex}
            onCancel={() => setShowCreateForm(false)}
            creating={creating}
          />
        </div>
      )}

      {/* Index list - scrollable */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button className="btn btn-secondary text-sm" onClick={loadIndexes}>
              Retry
            </button>
          </div>
        ) : indexes.length === 0 ? (
          <div className="py-12 text-center text-zinc-400">
            <p className="mb-2">No indexes found</p>
            <p className="text-sm text-zinc-500">Click "Create Index" to add one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {indexes.map((index) => {
              const isDefaultId = index.name === '_id_'
              const isExpanded = expandedIndexes.has(index.name)
              return (
                <div key={index.name} className="bg-zinc-800 rounded-lg overflow-hidden">
                  {/* Index header - always visible */}
                  <div
                    className="p-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-zinc-700/50 transition-colors"
                    onClick={() => toggleIndexExpanded(index.name)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-zinc-400 transition-transform duration-200"
                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-zinc-100">{index.name}</span>
                          {index.unique && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-900/50 text-blue-400 rounded">
                              unique
                            </span>
                          )}
                          {index.sparse && (
                            <span className="px-1.5 py-0.5 text-xs bg-purple-900/50 text-purple-400 rounded">
                              sparse
                            </span>
                          )}
                          {index.ttl > 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-amber-900/50 text-amber-400 rounded">
                              TTL: {index.ttl}s
                            </span>
                          )}
                          {isDefaultId && (
                            <span className="px-1.5 py-0.5 text-xs bg-zinc-700 text-zinc-400 rounded">
                              default
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-zinc-400 font-mono">
                          {`{ ${formatKeys(index.keys)} }`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className={`p-2 rounded hover:bg-zinc-600 ${copiedIndex === index.name ? 'text-accent' : 'text-zinc-400 hover:text-zinc-200'}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          copyIndexDetails(index)
                        }}
                        title={copiedIndex === index.name ? 'Copied!' : 'Copy index details'}
                      >
                        {copiedIndex === index.name ? (
                          <CheckIcon className="w-4 h-4" />
                        ) : (
                          <CopyIcon className="w-4 h-4" />
                        )}
                      </button>
                      {!isDefaultId && (
                        <button
                          className="p-2 rounded hover:bg-zinc-600 text-zinc-400 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDelete(index.name)
                          }}
                          title="Drop index"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded configuration details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-zinc-700/50">
                      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        {/* Keys section */}
                        <div className="col-span-2 mb-2">
                          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
                            Index Keys
                          </div>
                          <div className="bg-zinc-900 rounded p-2 font-mono text-xs">
                            {Object.entries(index.keys).map(([field, direction]) => (
                              <div key={field} className="flex justify-between py-0.5">
                                <span className="text-zinc-300">{field}</span>
                                <span className={direction === 1 ? 'text-green-400' : 'text-amber-400'}>
                                  {direction === 1 ? 'ASC (1)' : 'DESC (-1)'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Configuration options */}
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
                            Configuration
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Unique</span>
                              <span className={index.unique ? 'text-green-400' : 'text-zinc-500'}>
                                {index.unique ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Sparse</span>
                              <span className={index.sparse ? 'text-green-400' : 'text-zinc-500'}>
                                {index.sparse ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-400">TTL</span>
                              <span className={index.ttl > 0 ? 'text-amber-400' : 'text-zinc-500'}>
                                {index.ttl > 0 ? `${index.ttl} seconds` : 'None'}
                              </span>
                            </div>
                            {index.partialFilterExpression && (
                              <div className="flex justify-between">
                                <span className="text-zinc-400">Partial Filter</span>
                                <span className="text-purple-400">Yes</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Statistics */}
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
                            Statistics
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Size</span>
                              <span className="text-zinc-200">{formatBytes(index.size)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Usage</span>
                              <span className="text-zinc-200">
                                {index.usageCount > 0
                                  ? `${index.usageCount.toLocaleString()} ops`
                                  : 'No usage data'}
                              </span>
                            </div>
                            {index.version && (
                              <div className="flex justify-between">
                                <span className="text-zinc-400">Version</span>
                                <span className="text-zinc-200">{index.version}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Partial filter expression if present */}
                        {index.partialFilterExpression && (
                          <div className="col-span-2 mt-2">
                            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
                              Partial Filter Expression
                            </div>
                            <pre className="bg-zinc-900 rounded p-2 font-mono text-xs text-zinc-300 overflow-auto">
                              {JSON.stringify(index.partialFilterExpression, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <ConfirmDialog
          open={true}
          title="Drop Index?"
          message={`Are you sure you want to drop the index "${confirmDelete}"? This action cannot be undone.`}
          confirmLabel={deleting ? 'Dropping...' : 'Drop Index'}
          danger={true}
          onConfirm={() => handleDropIndex(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
