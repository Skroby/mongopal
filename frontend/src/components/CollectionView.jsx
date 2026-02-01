import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import TableView from './TableView'
import BulkActionBar from './BulkActionBar'
import { useNotification } from './NotificationContext'
import { useTab } from './contexts/TabContext'
import { parseFilterFromQuery, parseProjectionFromQuery, buildFullQuery, isSimpleFindQuery, wrapScriptForOutput } from '../utils/queryParser'
import { parseMongoshOutput } from '../utils/mongoshParser'

const go = window.go?.main?.App

const PlayIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const StopIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
)

const HistoryIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// Query history storage key
const QUERY_HISTORY_KEY = 'mongopal_query_history'
const MAX_HISTORY_ITEMS = 20

function loadQueryHistory() {
  try {
    const stored = localStorage.getItem(QUERY_HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveQueryHistory(history) {
  try {
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)))
  } catch {
    // Ignore storage errors
  }
}

// Add query to history, removing duplicates and limiting size
function addToQueryHistory(currentHistory, query, database, collection) {
  return [
    { query, collection: `${database}.${collection}`, timestamp: Date.now() },
    ...currentHistory.filter(h => h.query !== query)
  ].slice(0, MAX_HISTORY_ITEMS)
}

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const ExpandIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
)

const CollapseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
  </svg>
)

export default function CollectionView({ connectionId, database, collection }) {
  const { notify } = useNotification()
  const { openDocumentTab, openInsertTab } = useTab()
  const [query, setQuery] = useState(() => buildFullQuery(collection, '{}'))
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('table') // 'table' | 'json' | 'raw'
  const [rawOutput, setRawOutput] = useState('') // Raw mongosh output for 'raw' view
  const [queryHistory, setQueryHistory] = useState(() => loadQueryHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [expandedQuery, setExpandedQuery] = useState(false)
  const historyRef = useRef(null)
  const queryIdRef = useRef(0) // Track current query to handle cancellation

  // Delete dialog state
  const [deleteDoc, setDeleteDoc] = useState(null) // document to delete
  const [deleting, setDeleting] = useState(false)

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ done: 0, total: 0 })
  const [exporting, setExporting] = useState(false)

  // Close history dropdown on click outside
  useEffect(() => {
    if (!showHistory) return
    const handleClickOutside = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showHistory])

  // Pagination state
  const [skip, setSkip] = useState(0)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [queryTime, setQueryTime] = useState(null)
  const [goToPage, setGoToPage] = useState('')

  // Reset query when collection changes
  useEffect(() => {
    setQuery(buildFullQuery(collection, '{}'))
  }, [collection])

  // Load documents on mount and when collection/pagination changes
  useEffect(() => {
    executeQuery()
  }, [connectionId, database, collection, skip, limit])

  // Clear selection when query/pagination/collection changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [connectionId, database, collection, skip, limit, query])

  // Helper to open insert tab
  const handleInsertDocument = () => {
    openInsertTab(connectionId, database, collection)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+N: Open insert tab
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleInsertDocument()
      }
      // Escape: Close modals
      if (e.key === 'Escape') {
        if (showBulkDeleteModal && !bulkDeleting) {
          setShowBulkDeleteModal(false)
        } else if (deleteDoc && !deleting) {
          setDeleteDoc(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showBulkDeleteModal, bulkDeleting, deleteDoc, deleting, connectionId, database, collection])

  const cancelQuery = () => {
    queryIdRef.current++ // Invalidate current query
    setLoading(false)
    notify.info('Query cancelled')
  }

  const executeQuery = async () => {
    const currentQueryId = ++queryIdRef.current
    setLoading(true)
    setError(null)
    try {
      // Check if this is a simple find query we can handle with Go driver
      if (isSimpleFindQuery(query)) {
        const filter = parseFilterFromQuery(query)
        const projection = parseProjectionFromQuery(query)
        if (go?.FindDocuments) {
          const result = await go.FindDocuments(connectionId, database, collection, filter, {
            skip,
            limit,
            sort: '',
            projection: projection || '',
          })
          // Check if cancelled
          if (currentQueryId !== queryIdRef.current) return
          if (!result || !result.documents) {
            setDocuments([])
            setTotal(0)
            setQueryTime(null)
            setRawOutput('')
            return
          }
          setDocuments(result.documents.map(d => JSON.parse(d)))
          setTotal(result.total || 0)
          setQueryTime(result.queryTimeMs)
          setRawOutput('') // Clear raw output for regular queries

          // Add to query history (if not default and not duplicate)
          if (filter !== '{}' && filter.trim() !== '') {
            const newHistory = addToQueryHistory(queryHistory, query, database, collection)
            setQueryHistory(newHistory)
            saveQueryHistory(newHistory)
          }
        }
      } else {
        // Complex query - try mongosh execution
        if (go?.ExecuteScriptWithDatabase) {
          // Wrap script with printjson for write operations that don't produce output
          const wrappedQuery = wrapScriptForOutput(query)
          const result = await go.ExecuteScriptWithDatabase(connectionId, database, wrappedQuery)
          // Check if cancelled
          if (currentQueryId !== queryIdRef.current) return
          if (result.exitCode !== 0 || result.error) {
            throw new Error(result.error || result.output || 'Script execution failed')
          }
          // Parse mongosh output (handles JSON, NDJSON, and mongosh JS format)
          const output = result.output.trim()
          setRawOutput(output) // Store raw output for 'raw' view
          if (!output) {
            setDocuments([])
            setTotal(0)
          } else {
            const parseResult = parseMongoshOutput(output)

            if (parseResult.success && parseResult.data.length > 0) {
              setDocuments(parseResult.data)
              setTotal(parseResult.data.length)
            } else {
              // Couldn't parse - show as raw result
              setDocuments([{ _result: output }])
              setTotal(1)
            }
          }
          setQueryTime(null)

          // Add to history
          const newHistory = addToQueryHistory(queryHistory, query, database, collection)
          setQueryHistory(newHistory)
          saveQueryHistory(newHistory)
        } else if (go?.CheckMongoshAvailable) {
          // Check if mongosh is available
          const [available] = await go.CheckMongoshAvailable()
          // Check if cancelled
          if (currentQueryId !== queryIdRef.current) return
          if (!available) {
            throw new Error('Invalid query syntax. For complex queries (aggregations, scripts), install mongosh: https://www.mongodb.com/try/download/shell')
          }
        } else {
          throw new Error('Invalid query syntax. Expected: db.getCollection("name").find({...}) or a filter like { field: "value" }')
        }
      }
    } catch (err) {
      // Don't show error if cancelled
      if (currentQueryId !== queryIdRef.current) return
      const errorMsg = err.message || 'Failed to execute query'
      setError(errorMsg)
      notify.error(errorMsg)
      setDocuments([])
      setTotal(0)
    } finally {
      // Only update loading if this is still the current query
      if (currentQueryId === queryIdRef.current) {
        setLoading(false)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      executeQuery()
    }
  }

  // Open document in a new tab
  const handleEdit = (doc) => {
    const docId = getDocIdForApi(doc)
    openDocumentTab(connectionId, database, collection, doc, docId)
  }

  // Open delete confirmation
  const handleDelete = (doc) => {
    setDeleteDoc(doc)
  }

  // Get document ID for display (handles ObjectId, Binary, UUID, etc.)
  const getDocIdDisplay = (doc) => {
    if (!doc._id) return 'unknown'
    if (typeof doc._id === 'string') return doc._id
    if (doc._id.$oid) return doc._id.$oid
    if (doc._id.$binary) return `Binary(${doc._id.$binary.base64?.slice(0, 16) || '...'})`
    if (doc._id.$uuid) return doc._id.$uuid
    return JSON.stringify(doc._id)
  }

  // Get document ID for API calls (returns Extended JSON for complex types)
  const getDocIdForApi = (doc) => {
    if (!doc._id) return null
    if (typeof doc._id === 'string') return doc._id
    // For ObjectId, we can pass just the hex string (backend handles it)
    if (doc._id.$oid) return doc._id.$oid
    // For Binary, UUID, and other complex types, pass Extended JSON
    return JSON.stringify(doc._id)
  }

  // Format ID for shell-style display (e.g., ObjectId("...") or BinData(...))
  const formatIdForShell = (idString) => {
    // If it's Extended JSON, parse and format appropriately
    if (idString.startsWith('{')) {
      try {
        const parsed = JSON.parse(idString)
        if (parsed.$binary) {
          return `BinData(${parseInt(parsed.$binary.subType, 16) || 0}, "${parsed.$binary.base64}")`
        }
        if (parsed.$uuid) {
          return `UUID("${parsed.$uuid}")`
        }
        if (parsed.$oid) {
          return `ObjectId("${parsed.$oid}")`
        }
        return idString
      } catch {
        return idString
      }
    }
    // Looks like ObjectId hex string
    if (/^[a-f0-9]{24}$/i.test(idString)) {
      return `ObjectId("${idString}")`
    }
    // Plain string
    return `"${idString}"`
  }

  // Execute delete
  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      if (go?.DeleteDocument) {
        const docId = getDocIdForApi(deleteDoc)
        await go.DeleteDocument(connectionId, database, collection, docId)
        notify.success('Document deleted')
        setDeleteDoc(null)
        executeQuery() // Refresh the list
      }
    } catch (err) {
      notify.error(`Failed to delete: ${err?.message || String(err)}`)
    } finally {
      setDeleting(false)
    }
  }

  // Bulk delete - delete all selected documents sequentially
  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteProgress({ done: 0, total: idsToDelete.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < idsToDelete.length; i++) {
      try {
        if (go?.DeleteDocument) {
          await go.DeleteDocument(connectionId, database, collection, idsToDelete[i])
          successCount++
        }
      } catch (err) {
        failCount++
        console.error(`Failed to delete ${idsToDelete[i]}:`, err)
      }
      setBulkDeleteProgress({ done: i + 1, total: idsToDelete.length })
    }

    setBulkDeleting(false)
    setShowBulkDeleteModal(false)
    setSelectedIds(new Set())

    // Show result notification
    if (failCount === 0) {
      notify.success(`Deleted ${successCount} document${successCount !== 1 ? 's' : ''}`)
    } else {
      notify.warning(`Deleted ${successCount}, failed ${failCount}`)
    }

    executeQuery() // Refresh the list
  }

  // Export selected documents as ZIP
  const handleExport = async () => {
    setExporting(true)
    try {
      const entries = []
      const idsToExport = Array.from(selectedIds)

      // Fetch full document for each selected ID
      for (const docId of idsToExport) {
        try {
          if (go?.GetDocument) {
            const jsonStr = await go.GetDocument(connectionId, database, collection, docId)
            entries.push({
              database,
              collection,
              docId,
              json: jsonStr
            })
          }
        } catch (err) {
          console.error(`Failed to fetch document ${docId}:`, err)
        }
      }

      if (entries.length === 0) {
        notify.error('No documents to export')
        return
      }

      // Call backend to create and save ZIP
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultFilename = `${collection}-export-${timestamp}.zip`

      if (go?.ExportDocumentsAsZip) {
        await go.ExportDocumentsAsZip(entries, defaultFilename)
        notify.success(`Exported ${entries.length} document${entries.length !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      notify.error(`Export failed: ${err?.message || String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  // Get selected documents from current page for preview
  const selectedDocuments = documents.filter(doc => {
    const docId = getDocIdForApi(doc)
    return docId && selectedIds.has(docId)
  })

  const currentPage = Math.floor(skip / limit) + 1
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="h-full flex flex-col">
      {/* Query bar */}
      <div className="flex-shrink-0 p-2 border-b border-border bg-surface-secondary">
        {expandedQuery ? (
          /* Expanded multiline mode */
          <div className="flex flex-col gap-2">
            {/* Buttons row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {loading ? (
                  <button
                    className="btn btn-secondary flex items-center gap-1.5 text-red-400 hover:text-red-300"
                    onClick={cancelQuery}
                  >
                    <StopIcon className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                ) : (
                  <button
                    className="btn btn-primary flex items-center gap-1.5"
                    onClick={executeQuery}
                  >
                    <PlayIcon className="w-4 h-4" />
                    <span>Run</span>
                  </button>
                )}
                <button
                  className="btn btn-secondary flex items-center gap-1.5"
                  onClick={handleInsertDocument}
                  title="Insert new document (Cmd+N)"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>Insert</span>
                </button>
              </div>
              <div className="flex items-center gap-1">
                <div ref={historyRef} className="relative">
                  <button
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                    onClick={() => setShowHistory(!showHistory)}
                    title="Query history"
                  >
                    <HistoryIcon className="w-4 h-4" />
                  </button>
                  {showHistory && (
                    <div className="absolute right-0 top-full mt-1 w-[500px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-auto">
                      {queryHistory.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-500">No query history</div>
                      ) : (
                        queryHistory.map((item, idx) => (
                          <button
                            key={idx}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-700 border-b border-zinc-700 last:border-0"
                            onClick={() => {
                              setQuery(item.query)
                              setShowHistory(false)
                            }}
                          >
                            <div className="font-mono text-sm text-zinc-200 truncate">{item.query}</div>
                            <div className="text-xs text-zinc-500">{item.collection}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                  onClick={() => setExpandedQuery(false)}
                  title="Collapse to single line"
                >
                  <CollapseIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Monaco Editor */}
            <div className="border border-zinc-700 rounded overflow-hidden">
              <Editor
                height="180px"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={query}
                onChange={(value) => setQuery(value || '')}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'off',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 0,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  fontSize: 13,
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                  padding: { top: 8, bottom: 8 },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'hidden',
                    verticalScrollbarSize: 8,
                  },
                }}
                onMount={(editor, monaco) => {
                  // Add Cmd/Ctrl+Enter shortcut to run query
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    () => executeQuery()
                  )
                }}
              />
            </div>
          </div>
        ) : (
          /* Compact one-liner mode */
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                className="input pr-16 pl-3 font-mono text-sm !bg-zinc-900"
                placeholder={`db.getCollection("${collection}").find({})`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const pastedText = e.clipboardData.getData('text')
                  if (pastedText.includes('\n')) {
                    e.preventDefault()
                    const input = e.target
                    const start = input.selectionStart
                    const end = input.selectionEnd
                    const newQuery = query.slice(0, start) + pastedText + query.slice(end)
                    setQuery(newQuery)
                    setExpandedQuery(true)
                  }
                }}
              />
              {/* History and expand buttons */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <div ref={historyRef} className="relative">
                  <button
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                    onClick={() => setShowHistory(!showHistory)}
                    title="Query history"
                  >
                    <HistoryIcon className="w-4 h-4" />
                  </button>
                  {showHistory && (
                    <div className="absolute right-0 top-full mt-1 w-[500px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-auto">
                      {queryHistory.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-500">No query history</div>
                      ) : (
                        queryHistory.map((item, idx) => (
                          <button
                            key={idx}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-700 border-b border-zinc-700 last:border-0"
                            onClick={() => {
                              setQuery(item.query)
                              setShowHistory(false)
                            }}
                          >
                            <div className="font-mono text-sm text-zinc-200 truncate">{item.query}</div>
                            <div className="text-xs text-zinc-500">{item.collection}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                  onClick={() => setExpandedQuery(true)}
                  title="Expand to multiline"
                >
                  <ExpandIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {loading ? (
              <button
                className="btn btn-secondary flex items-center gap-1.5 text-red-400 hover:text-red-300"
                onClick={cancelQuery}
              >
                <StopIcon className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            ) : (
              <button
                className="btn btn-primary flex items-center gap-1.5"
                onClick={executeQuery}
              >
                <PlayIcon className="w-4 h-4" />
                <span>Run</span>
              </button>
            )}
            <button
              className="btn btn-secondary flex items-center gap-1.5"
              onClick={handleInsertDocument}
              title="Insert new document (Cmd+N)"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Insert</span>
            </button>
          </div>
        )}
      </div>

      {/* View mode tabs and info */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface text-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {['table', 'json', 'raw'].map(mode => (
              <button
                key={mode}
                className={`px-2 py-1 rounded text-xs capitalize ${
                  viewMode === mode
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          {queryTime !== null && (
            <span className="text-zinc-500 text-xs">Query: {queryTime}ms</span>
          )}
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2 text-zinc-500 text-xs">
          {/* Page size selector */}
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300"
            value={limit}
            onChange={(e) => {
              const newLimit = parseInt(e.target.value, 10)
              setLimit(newLimit)
              setSkip(0) // Reset to first page when changing page size
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>per page</span>

          <span className="mx-1 text-zinc-600">|</span>

          <span>
            {total > 0 ? `${skip + 1}-${Math.min(skip + limit, total)}` : '0'} of {total}
          </span>

          <span className="mx-1 text-zinc-600">|</span>

          {/* Navigation buttons */}
          <div className="flex gap-0.5">
            <button
              className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip(0)}
              disabled={skip === 0}
              title="First page"
            >
              ««
            </button>
            <button
              className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              title="Previous page"
            >
              «
            </button>

            {/* Page number input */}
            <div className="flex items-center gap-1 mx-1">
              <input
                type="text"
                className="w-10 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-center text-xs"
                value={goToPage || currentPage}
                onChange={(e) => setGoToPage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const page = parseInt(goToPage, 10)
                    if (page >= 1 && page <= totalPages) {
                      setSkip((page - 1) * limit)
                    }
                    setGoToPage('')
                  }
                }}
                onBlur={() => setGoToPage('')}
              />
              <span>/ {totalPages || 1}</span>
            </div>

            <button
              className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip(skip + limit)}
              disabled={skip + limit >= total}
              title="Next page"
            >
              »
            </button>
            <button
              className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip((totalPages - 1) * limit)}
              disabled={skip + limit >= total}
              title="Last page"
            >
              »»
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex-shrink-0 px-3 py-2 bg-red-900/30 text-red-400 text-sm border-b border-red-800 flex items-start justify-between gap-2">
          <span className="flex-1">{error}</span>
          <button
            className="flex-shrink-0 p-1 rounded hover:bg-red-800/50 text-red-400 hover:text-red-300"
            onClick={() => {
              navigator.clipboard.writeText(error)
              notify.success('Error copied to clipboard')
            }}
            title="Copy error"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-zinc-500">
            <span>Loading...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500">
            <span>No documents found</span>
          </div>
        ) : viewMode === 'table' ? (
          <TableView
            documents={documents}
            onEdit={handleEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        ) : viewMode === 'json' ? (
          <Editor
            height="100%"
            language="json"
            theme="vs-dark"
            value={JSON.stringify(documents, null, 2)}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        ) : (
          /* Raw view - unmodified mongosh output */
          <Editor
            height="100%"
            language="javascript"
            theme="vs-dark"
            value={rawOutput || JSON.stringify(documents, null, 2)}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onDelete={() => setShowBulkDeleteModal(true)}
          onExport={handleExport}
          isDeleting={bulkDeleting}
          isExporting={exporting}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteDoc && (
        <div className="fixed inset-0 bg-black/70 z-50 p-[5%]">
          <div className="h-full w-full bg-surface border border-border rounded-lg flex flex-col shadow-2xl">
            <div className="flex-shrink-0 px-4 py-3 border-b border-border">
              <h3 className="text-lg font-medium text-zinc-100">Delete Document</h3>
              <p className="text-sm text-zinc-400">{database} &gt; {collection}</p>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <div className="mb-4">
                <p className="text-zinc-300 mb-2">This will execute the following delete operation:</p>
                <div className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-sm">
                  <span className="text-zinc-500">db.</span>
                  <span className="text-amber-400">{collection}</span>
                  <span className="text-zinc-500">.deleteOne(</span>
                  <span className="text-green-400">{'{ "_id": '}</span>
                  <span className="text-purple-400">{formatIdForShell(getDocIdForApi(deleteDoc))}</span>
                  <span className="text-green-400">{' }'}</span>
                  <span className="text-zinc-500">)</span>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-zinc-400 mb-2 text-sm">Document to delete:</p>
                <pre className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-sm text-zinc-300 overflow-auto max-h-[50vh]">
                  {JSON.stringify(deleteDoc, null, 2)}
                </pre>
              </div>
            </div>
            <div className="flex-shrink-0 px-4 py-3 border-t border-border flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteDoc(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/70 z-50 p-[5%]">
          <div className="h-full w-full bg-surface border border-border rounded-lg flex flex-col shadow-2xl">
            <div className="flex-shrink-0 px-4 py-3 border-b border-border">
              <h3 className="text-lg font-medium text-zinc-100">Delete {selectedIds.size} Document{selectedIds.size !== 1 ? 's' : ''}</h3>
              <p className="text-sm text-zinc-400">{database} &gt; {collection}</p>
            </div>
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <p className="text-zinc-300 mb-2 flex-shrink-0">This will execute the following delete operation:</p>
              <div className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-sm flex-1 overflow-auto mb-4">
                <span className="text-zinc-500">db.</span>
                <span className="text-amber-400">{collection}</span>
                <span className="text-zinc-500">.deleteMany(</span>
                <span className="text-green-400">{'{ "_id": { "$in": ['}</span>
                <br />
                {Array.from(selectedIds).map((id, idx) => (
                  <span key={id}>
                    <span className="text-zinc-500">    </span>
                    <span className="text-purple-400">{formatIdForShell(id)}</span>
                    {idx < selectedIds.size - 1 && <span className="text-zinc-500">,</span>}
                    <br />
                  </span>
                ))}
                <span className="text-green-400">{'] } }'}</span>
                <span className="text-zinc-500">)</span>
              </div>

              {/* Progress indicator during deletion */}
              {bulkDeleting && (
                <div className="mb-4 flex-shrink-0">
                  <div className="flex items-center justify-between text-sm text-zinc-400 mb-2">
                    <span>Deleting documents...</span>
                    <span>{bulkDeleteProgress.done} / {bulkDeleteProgress.total}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-200"
                      style={{ width: `${(bulkDeleteProgress.done / bulkDeleteProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="bg-red-900/20 border border-red-800 rounded p-3 text-red-400 text-sm flex-shrink-0">
                This action cannot be undone. All selected documents will be permanently deleted.
              </div>
            </div>
            <div className="flex-shrink-0 px-4 py-3 border-t border-border flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? `Deleting ${bulkDeleteProgress.done}/${bulkDeleteProgress.total}...` : `Delete ${selectedIds.size} Document${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
