import { useState, useEffect } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { toJsonSchema, getTypeColor, getOccurrenceColor } from '../utils/schemaUtils'

const go = window.go?.main?.App

const DownloadIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const RefreshIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const ChevronRight = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const ChevronDown = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

// Map color names to Tailwind CSS classes (static for Tailwind purge)
const typeColorMap = {
  'green': 'text-green-400',
  'blue': 'text-blue-400',
  'yellow': 'text-yellow-400',
  'purple': 'text-purple-400',
  'orange': 'text-orange-400',
  'cyan': 'text-cyan-400',
  'pink': 'text-pink-400',
  'red': 'text-red-400',
  'zinc': 'text-zinc-400',
  'default': 'text-zinc-300',
}

// Map occurrence color values to Tailwind CSS classes (static for Tailwind purge)
const occurrenceColorMap = {
  'green-500': 'text-green-500',
  'green-400': 'text-green-400',
  'yellow-400': 'text-yellow-400',
  'orange-400': 'text-orange-400',
  'red-400': 'text-red-400',
}

// Recursive component to render schema fields as a tree
function SchemaFieldNode({ name, field, level = 0, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasChildren = field.fields && Object.keys(field.fields).length > 0
  const hasArrayType = field.arrayType && field.arrayType.fields && Object.keys(field.arrayType.fields).length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1 px-2 hover:bg-zinc-800 rounded cursor-pointer`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => (hasChildren || hasArrayType) && setExpanded(!expanded)}
      >
        {(hasChildren || hasArrayType) ? (
          <span className="text-zinc-400">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="font-mono text-sm text-zinc-200">{name}</span>
        <span className={`font-mono text-xs ${typeColorMap[getTypeColor(field.type)]}`}>{field.type}</span>
        <span className={`text-xs ml-auto ${occurrenceColorMap[getOccurrenceColor(field.occurrence)] || 'text-zinc-400'}`}>
          {field.occurrence.toFixed(0)}%
        </span>
      </div>

      {expanded && hasChildren && (
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

      {expanded && hasArrayType && (
        <div>
          <div
            className="flex items-center gap-2 py-1 px-2 text-zinc-400 text-xs italic"
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

export default function SchemaView({ connectionId, database, collection }) {
  const { notify } = useNotification()
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sampleSize, setSampleSize] = useState(10)
  const [viewMode, setViewMode] = useState('tree') // 'tree' | 'json' | 'jsonschema'
  const [progress, setProgress] = useState(null) // { current, total, phase }

  const loadSchema = async () => {
    setLoading(true)
    setError(null)
    setProgress(null)
    try {
      if (go?.InferCollectionSchema) {
        const result = await go.InferCollectionSchema(connectionId, database, collection, sampleSize)
        setSchema(result)
      }
    } catch (err) {
      setError(err.message || 'Failed to infer schema')
      notify.error(`Failed to infer schema: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  // Listen for schema progress events
  useEffect(() => {
    const unsub = EventsOn('schema:progress', (data) => {
      setProgress(data)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    loadSchema()
  }, [connectionId, database, collection])

  const handleExport = async () => {
    if (!schema) return

    try {
      const jsonSchema = toJsonSchema(schema)
      const jsonContent = JSON.stringify(jsonSchema, null, 2)
      const defaultFilename = `${collection}-schema.json`

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
      notify.error(`Export failed: ${err?.message || String(err)}`)
    }
  }

  const handleRefresh = () => {
    loadSchema()
  }

  if (loading) {
    const progressPercent = progress?.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-600 border-t-accent"></div>
          <span>Analyzing schema...</span>
        </div>
        {progress && progress.total > 0 && (
          <div className="w-48">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Sampling documents</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-150"
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
      <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
        <span className="text-red-400">{error}</span>
        <button className="btn btn-primary" onClick={handleRefresh}>
          Retry
        </button>
      </div>
    )
  }

  if (!schema || Object.keys(schema.fields).length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
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
            <h2 className="text-lg font-medium text-zinc-100">Schema: {collection}</h2>
            <span className="text-sm text-zinc-400">
              Sampled {schema.sampleSize} of {schema.totalDocs.toLocaleString()} documents
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Sample size selector */}
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300"
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
            <button
              className="btn btn-primary flex items-center gap-1.5"
              onClick={handleExport}
            >
              <DownloadIcon className="w-4 h-4" />
              <span>Export JSON Schema</span>
            </button>
          </div>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-border bg-surface text-sm">
        <div className="flex gap-1" role="tablist" aria-label="Schema view mode">
          {['tree', 'json', 'jsonschema'].map(mode => (
            <button
              key={mode}
              className={`view-mode-btn px-2 py-1 rounded text-xs capitalize ${
                viewMode === mode
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              onClick={() => setViewMode(mode)}
              role="tab"
              aria-selected={viewMode === mode}
            >
              {mode === 'jsonschema' ? 'JSON Schema' : mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs text-zinc-400">
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
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap">
            {JSON.stringify(schema, null, 2)}
          </pre>
        ) : (
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap">
            {JSON.stringify(toJsonSchema(schema), null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
