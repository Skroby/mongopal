import { useState, useEffect, ReactNode } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useConnection } from './contexts/ConnectionContext'
import { useTab, Tab } from './contexts/TabContext'
import {
  toJsonSchema,
  getTypeColor,
  getOccurrenceColor,
  SchemaField,
  TypeColor,
  OccurrenceColor,
} from '../utils/schemaUtils'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Props for the SchemaView component
 */
export interface SchemaViewProps {
  /** Connection identifier */
  connectionId: string
  /** Database name */
  database: string
  /** Collection name */
  collection: string
}

/**
 * Schema result from the backend (matches Go types.SchemaResult)
 */
interface SchemaViewResult {
  collection: string
  sampleSize: number
  totalDocs: number
  fields: Record<string, SchemaField>
}

/**
 * Progress event data for schema analysis
 */
interface SchemaProgress {
  current: number
  total: number
  phase?: string
}

/**
 * View mode for schema display
 */
type ViewMode = 'tree' | 'json' | 'jsonschema'

/**
 * Props for icon components
 */
interface IconProps {
  className?: string
}

/**
 * Props for the SchemaFieldNode component
 */
interface SchemaFieldNodeProps {
  /** Field name */
  name: string
  /** Field definition */
  field: SchemaField
  /** Nesting level for indentation */
  level?: number
  /** Whether to expand children by default */
  defaultExpanded?: boolean
}

/**
 * Go bindings interface for schema operations (component-specific)
 */
interface SchemaGoBindings {
  InferCollectionSchema?: (
    connectionId: string,
    database: string,
    collection: string,
    sampleSize: number
  ) => Promise<SchemaViewResult>
  ExportSchemaAsJSON?: (content: string, filename: string) => Promise<void>
}

// Get go bindings at runtime (for testability)
const getGo = (): SchemaGoBindings | undefined => window.go?.main?.App as SchemaGoBindings | undefined

// =============================================================================
// Icon Components
// =============================================================================

const DownloadIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
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

const ChevronRight = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const ChevronDown = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

// =============================================================================
// Color Maps
// =============================================================================

// Map color names to Tailwind CSS classes (static for Tailwind purge)
const typeColorMap: Record<TypeColor, string> = {
  green: 'text-success',
  blue: 'text-info',
  yellow: 'text-yellow-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  cyan: 'text-cyan-400',
  pink: 'text-pink-400',
  red: 'text-error',
  zinc: 'text-text-muted',
  default: 'text-text-secondary',
}

// Map occurrence color values to Tailwind CSS classes (static for Tailwind purge)
const occurrenceColorMap: Record<OccurrenceColor, string> = {
  'green-500': 'text-green-500',
  'green-400': 'text-success',
  'yellow-400': 'text-yellow-400',
  'orange-400': 'text-orange-400',
  'red-400': 'text-error',
}

// =============================================================================
// SchemaFieldNode Component
// =============================================================================

/**
 * Recursive component to render schema fields as a tree
 */
function SchemaFieldNode({
  name,
  field,
  level = 0,
  defaultExpanded = true,
}: SchemaFieldNodeProps): ReactNode {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded)
  const hasChildren = field.fields && Object.keys(field.fields).length > 0
  const hasArrayType =
    field.arrayType && field.arrayType.fields && Object.keys(field.arrayType.fields).length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-surface rounded cursor-pointer"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => (hasChildren || hasArrayType) && setExpanded(!expanded)}
      >
        {hasChildren || hasArrayType ? (
          <span className="text-text-muted">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="font-mono text-sm text-text-light">{name}</span>
        <span className={`font-mono text-xs ${typeColorMap[getTypeColor(field.type)]}`}>
          {field.type}
        </span>
        <span
          className={`text-xs ml-auto ${occurrenceColorMap[getOccurrenceColor(field.occurrence ?? 0)] || 'text-text-muted'}`}
        >
          {(field.occurrence ?? 0).toFixed(0)}%
        </span>
      </div>

      {expanded && hasChildren && field.fields && (
        <div>
          {Object.entries(field.fields).map(([childName, childField]) => (
            <SchemaFieldNode
              key={childName}
              name={childName}
              field={childField}
              level={level + 1}
              defaultExpanded={level < 1}
            />
          ))}
        </div>
      )}

      {expanded && hasArrayType && field.arrayType?.fields && (
        <div>
          <div
            className="flex items-center gap-2 py-1 px-2 text-text-muted text-xs italic"
            style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
          >
            Array element structure:
          </div>
          {Object.entries(field.arrayType.fields).map(([childName, childField]) => (
            <SchemaFieldNode
              key={childName}
              name={childName}
              field={childField}
              level={level + 1}
              defaultExpanded={level < 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SchemaView Component
// =============================================================================

export default function SchemaView({
  connectionId,
  database,
  collection,
}: SchemaViewProps): ReactNode {
  const { notify } = useNotification()
  const { activeConnections, connect, connectingIds } = useConnection()
  const { currentTab, markTabActivated } = useTab()

  const isConnected = activeConnections.includes(connectionId)
  const isConnecting = connectingIds.has(connectionId)
  const isRestoredTab = (currentTab as Tab | undefined)?.restored === true

  const [schema, setSchema] = useState<SchemaViewResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [sampleSize, setSampleSize] = useState<number>(10)
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [progress, setProgress] = useState<SchemaProgress | null>(null)

  const loadSchema = async (): Promise<void> => {
    if (!isConnected) return

    setLoading(true)
    setError(null)
    setProgress(null)
    try {
      const go = getGo()
      if (go?.InferCollectionSchema) {
        const result = await go.InferCollectionSchema(connectionId, database, collection, sampleSize)
        setSchema(result)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage || 'Failed to infer schema')
      notify.error(`Failed to infer schema: ${errorMessage}`)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  // Listen for schema progress events
  useEffect(() => {
    const unsub = EventsOn('schema:progress', (data: SchemaProgress) => {
      setProgress(data)
    })
    return () => {
      unsub?.()
    }
  }, [])

  // Load schema on mount, but skip if not connected or restored tab
  useEffect(() => {
    if (!isConnected || isConnecting || isRestoredTab) return
    loadSchema()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, collection, isConnected, isConnecting, isRestoredTab])

  const handleExport = async (): Promise<void> => {
    if (!schema) return

    try {
      const jsonSchema = toJsonSchema({
        collection: schema.collection,
        fields: schema.fields,
      })
      const jsonContent = JSON.stringify(jsonSchema, null, 2)
      const defaultFilename = `${collection}-schema.json`

      const go = getGo()
      if (go?.ExportSchemaAsJSON) {
        await go.ExportSchemaAsJSON(jsonContent, defaultFilename)
        notify.success('Schema exported')
      } else {
        // Fallback for dev mode
        const blob = new Blob([jsonContent], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = defaultFilename
        a.click()
        URL.revokeObjectURL(url)
        notify.success('Schema exported')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      notify.error(`Export failed: ${errorMessage}`)
    }
  }

  const handleRefresh = (): void => {
    loadSchema()
  }

  // Connection states
  if (!isConnected && !isConnecting) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted gap-4">
        <svg
          className="w-12 h-12 text-text-dim"
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
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-background rounded-lg font-medium"
        >
          Connect
        </button>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-border-light border-t-primary"></div>
        <span>Connecting to database...</span>
      </div>
    )
  }

  // Restored tab - prompt to analyze
  if (isRestoredTab && !schema && !loading && !error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted gap-4">
        <svg
          className="w-12 h-12 text-text-dim"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <span>Session restored</span>
        <p className="text-sm text-text-dim">Click to analyze collection schema</p>
        <button
          onClick={() => {
            if (currentTab?.id) {
              markTabActivated(currentTab.id)
            }
            loadSchema()
          }}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-background rounded-lg font-medium"
        >
          Analyze Schema
        </button>
      </div>
    )
  }

  if (loading) {
    const progressPercent =
      progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted gap-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-border-light border-t-primary"></div>
          <span>Analyzing schema...</span>
        </div>
        {progress && progress.total > 0 && (
          <div className="w-48">
            <div className="flex items-center justify-between text-xs text-text-dim mb-1">
              <span>Sampling documents</span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted gap-4">
        <span className="text-error">{error}</span>
        <button className="btn btn-primary" onClick={handleRefresh}>
          Retry
        </button>
      </div>
    )
  }

  if (!schema || Object.keys(schema.fields).length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        <span>No schema found (collection may be empty)</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-border bg-surface-secondary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-text">Schema: {collection}</h2>
            <span className="text-sm text-text-muted">
              Sampled {schema.sampleSize} of {schema.totalDocs.toLocaleString()} documents
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Sample size selector */}
            <select
              className="bg-surface border border-border rounded px-2 py-1 text-sm text-text-secondary"
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value, 10))}
            >
              <option value={5}>5 samples</option>
              <option value={10}>10 samples</option>
              <option value={25}>25 samples</option>
              <option value={50}>50 samples</option>
              <option value={100}>100 samples</option>
            </select>
            <button
              className="btn btn-secondary flex items-center gap-1.5"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button className="btn btn-primary flex items-center gap-1.5" onClick={handleExport}>
              <DownloadIcon className="w-4 h-4" />
              <span>Export JSON Schema</span>
            </button>
          </div>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-border bg-surface text-sm">
        <div className="flex gap-1" role="tablist" aria-label="Schema view mode">
          {(['tree', 'json', 'jsonschema'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={`view-mode-btn px-2 py-1 rounded text-xs capitalize ${
                viewMode === mode
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text-light hover:bg-surface'
              }`}
              onClick={() => setViewMode(mode)}
              role="tab"
              aria-selected={viewMode === mode}
            >
              {mode === 'jsonschema' ? 'JSON Schema' : mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" /> 100%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400" /> 50%+
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" /> &lt;20%
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {viewMode === 'tree' ? (
          <div className="font-mono">
            {Object.entries(schema.fields).map(([name, field]) => (
              <SchemaFieldNode key={name} name={name} field={field} />
            ))}
          </div>
        ) : viewMode === 'json' ? (
          <pre className="text-sm text-text-secondary whitespace-pre-wrap">
            {JSON.stringify(schema, null, 2)}
          </pre>
        ) : (
          <pre className="text-sm text-text-secondary whitespace-pre-wrap">
            {JSON.stringify(
              toJsonSchema({
                collection: schema.collection,
                fields: schema.fields,
              }),
              null,
              2
            )}
          </pre>
        )}
      </div>
    </div>
  )
}
