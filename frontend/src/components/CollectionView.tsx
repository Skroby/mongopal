import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  LegacyRef,
} from 'react'
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react'
import type { editor as MonacoEditor, editor } from 'monaco-editor'
import TableView from './TableView'
import BulkActionBar from './BulkActionBar'
import ActionableError from './ActionableError'
import DocumentDiffView from './DocumentDiffView'
import ExplainPanel, { ExplainResult } from './ExplainPanel'
import CSVExportButton from './CSVExportButton'
import MonacoErrorBoundary from './MonacoErrorBoundary'
import SavedQueriesDropdown from './SavedQueriesDropdown'
import SaveQueryModal from './SaveQueryModal'
import SavedQueriesManager from './SavedQueriesManager'
import ColumnVisibilityDropdown from './ColumnVisibilityDropdown'
import { loadSettings, AppSettings } from './Settings'
import { useNotification } from './NotificationContext'
import { useConnection, SavedConnection } from './contexts/ConnectionContext'
import { useTab } from './contexts/TabContext'
import { useStatus } from './contexts/StatusContext'
import { useOperation, OperationInput } from './contexts/OperationContext'
import { useDebugLog, DEBUG_CATEGORIES, DebugCategory } from './contexts/DebugContext'
import { useSchema } from './contexts/SchemaContext'
import {
  parseFilterFromQuery,
  parseProjectionFromQuery,
  buildFullQuery,
  isSimpleFindQuery,
  wrapScriptForOutput,
} from '../utils/queryParser'
import { loadHiddenColumns, saveHiddenColumns, MongoDocument } from '../utils/tableViewUtils'
import { extractFieldPathsFromDocs } from '../utils/schemaUtils'
import { parseMongoshOutput, MongoshParseResult } from '../utils/mongoshParser'
import { getErrorSummary } from '../utils/errorParser'
import { validateQuery, toMonacoMarkers, QueryDiagnostic, MonacoInstance } from '../utils/queryValidator'
import { validateFilter, fieldWarningsToMonacoDiagnostics, FieldWarning, MonacoDiagnostic } from '../utils/fieldValidator'
import type { WailsAppBindings, ExportEntry } from '../types/wails.d'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Props for CollectionView component
 */
export interface CollectionViewProps {
  /** Connection ID this view is associated with */
  connectionId: string
  /** Database name */
  database: string
  /** Collection name */
  collection: string
  /** Tab ID for this view */
  tabId: string
  /** Whether this tab was restored from session */
  restored?: boolean
}

/**
 * Query history item stored in localStorage
 */
interface QueryHistoryItem {
  query: string
  collection: string
  timestamp: number
}

/**
 * View mode options for document display
 */
type ViewMode = 'table' | 'json' | 'raw'

/**
 * Bulk delete progress tracking
 */
interface BulkDeleteProgress {
  done: number
  total: number
}

/**
 * Props for icon components
 */
interface IconProps {
  className?: string
}

/**
 * Props for QueryHistoryDropdown component
 */
interface QueryHistoryDropdownProps {
  queryHistory: QueryHistoryItem[]
  onSelect: (query: string) => void
  onClose: () => void
  historyRef: LegacyRef<HTMLDivElement>
}

/**
 * Monaco language info interface for type safety
 */
interface MonacoLanguageInfo {
  id: string
}

// =============================================================================
// Constants
// =============================================================================

const QUERY_HISTORY_KEY = 'mongopal_query_history'
const MAX_HISTORY_ITEMS = 20

// Get go bindings at runtime
const getGo = (): WailsAppBindings | undefined => window.go?.main?.App

// =============================================================================
// Icon Components
// =============================================================================

const PlayIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

const StopIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
    />
  </svg>
)

const HistoryIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

const PlusIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const ExplainIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
    />
  </svg>
)

const SaveIcon = ({ className = 'w-4 h-4' }: IconProps): ReactNode => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
    />
  </svg>
)

// =============================================================================
// Helper Functions
// =============================================================================

function loadQueryHistory(): QueryHistoryItem[] {
  try {
    const stored = localStorage.getItem(QUERY_HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveQueryHistory(history: QueryHistoryItem[]): void {
  try {
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)))
  } catch {
    // Ignore storage errors
  }
}

function addToQueryHistory(
  currentHistory: QueryHistoryItem[],
  query: string,
  database: string,
  collection: string
): QueryHistoryItem[] {
  return [
    { query, collection: `${database}.${collection}`, timestamp: Date.now() },
    ...currentHistory.filter((h) => h.query !== query),
  ].slice(0, MAX_HISTORY_ITEMS)
}

// =============================================================================
// QueryHistoryDropdown Component
// =============================================================================

function QueryHistoryDropdown({
  queryHistory,
  onSelect,
  onClose,
  historyRef,
}: QueryHistoryDropdownProps): ReactNode {
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [filterText, setFilterText] = useState<string>('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter history based on search text
  const filteredHistory = useMemo(() => {
    if (!filterText.trim()) return queryHistory
    const lowerFilter = filterText.toLowerCase()
    return queryHistory.filter(
      (item) =>
        item.query.toLowerCase().includes(lowerFilter) ||
        item.collection.toLowerCase().includes(lowerFilter)
    )
  }, [queryHistory, filterText])

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightedIndex(filteredHistory.length > 0 ? 0 : -1)
  }, [filterText, filteredHistory.length])

  // Focus filter input when dropdown opens
  useEffect(() => {
    if (filterInputRef.current) {
      filterInputRef.current.focus()
    }
  }, [])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-history-item]')
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < filteredHistory.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredHistory.length) {
          onSelect(filteredHistory[highlightedIndex].query)
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  return (
    <div
      ref={historyRef}
      className="absolute right-0 top-full mt-1 w-[500px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-[100] flex flex-col max-h-72 isolate"
      onKeyDown={handleKeyDown}
    >
      {/* Filter input */}
      <div className="flex-shrink-0 p-2 border-b border-zinc-700">
        <input
          ref={filterInputRef}
          type="text"
          className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          placeholder="Type to filter history..."
          value={filterText}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterText(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      {/* History list */}
      <div ref={listRef} className="flex-1 overflow-auto">
        {filteredHistory.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-500">
            {queryHistory.length === 0 ? 'No query history' : 'No matching queries'}
          </div>
        ) : (
          filteredHistory.map((item, idx) => (
            <button
              key={idx}
              data-history-item
              className={`w-full px-3 py-2 text-left border-b border-zinc-700 last:border-0 transition-colors ${
                idx === highlightedIndex ? 'bg-zinc-600' : 'hover:bg-zinc-700'
              }`}
              onClick={() => {
                onSelect(item.query)
                onClose()
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              <div className="font-mono text-sm text-zinc-200 truncate">{item.query}</div>
              <div className="text-xs text-zinc-500">{item.collection}</div>
            </button>
          ))
        )}
      </div>
      {/* Keyboard hints */}
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-zinc-700 text-xs text-zinc-500 flex gap-3">
        <span>
          <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-400">up/down</kbd> navigate
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-400">Enter</kbd> select
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-400">Esc</kbd> close
        </span>
      </div>
    </div>
  )
}

// =============================================================================
// Main CollectionView Component
// =============================================================================

export default function CollectionView({
  connectionId,
  database,
  collection,
  tabId,
  restored,
}: CollectionViewProps): ReactNode {
  const { notify } = useNotification()
  const { getConnectionById, activeConnections, connectingIds, connect } = useConnection()
  const { openDocumentTab, openInsertTab, markTabActivated } = useTab()
  const { updateDocumentStatus, clearStatus } = useStatus()
  const { startOperation, updateOperation, completeOperation } = useOperation()
  const { log: logQuery } = useDebugLog(DEBUG_CATEGORIES.QUERY as DebugCategory)
  const { getFieldNames, prefetchSchema, mergeFieldNames } = useSchema()

  // Get connection status
  const connection = getConnectionById(connectionId)
  const readOnly = (connection as SavedConnection & { readOnly?: boolean })?.readOnly || false
  const isConnected = activeConnections.includes(connectionId)
  const isConnecting = connectingIds.has(connectionId)
  // Track restored state locally - starts with prop value, clears when user runs query
  const [isRestoredTab, setIsRestoredTab] = useState<boolean>(restored === true)

  const [query, setQuery] = useState<string>(() => buildFullQuery(collection, '{}'))
  const [documents, setDocuments] = useState<MongoDocument[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [rawOutput, setRawOutput] = useState<string>('')
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>(() => loadQueryHistory())
  const [showHistory, setShowHistory] = useState<boolean>(false)
  const historyRef = useRef<HTMLDivElement>(null)
  const queryIdRef = useRef<number>(0)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resizable editor height
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    const saved = localStorage.getItem('mongopal_editor_height')
    return saved ? parseInt(saved, 10) : 120
  })
  const resizingRef = useRef<boolean>(false)
  const startYRef = useRef<number>(0)
  const startHeightRef = useRef<number>(0)

  // Delete dialog state
  const [deleteDoc, setDeleteDoc] = useState<MongoDocument | null>(null)
  const [deleting, setDeleting] = useState<boolean>(false)

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false)
  const [bulkDeleting, setBulkDeleting] = useState<boolean>(false)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<BulkDeleteProgress>({
    done: 0,
    total: 0,
  })
  const [exporting, setExporting] = useState<boolean>(false)

  // Document comparison state
  const [compareSourceDoc, setCompareSourceDoc] = useState<MongoDocument | null>(null)
  const [showDiffView, setShowDiffView] = useState<boolean>(false)
  const [diffTargetDoc, setDiffTargetDoc] = useState<MongoDocument | null>(null)

  // Explain plan state
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null)
  const [explaining, setExplaining] = useState<boolean>(false)

  // Saved queries state
  const [showSaveQueryModal, setShowSaveQueryModal] = useState<boolean>(false)
  const [showSavedQueriesManager, setShowSavedQueriesManager] = useState<boolean>(false)
  const [savedQueriesRefreshKey, setSavedQueriesRefreshKey] = useState<number>(0)

  // Hidden columns state - persisted per collection
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
    loadHiddenColumns(connectionId, database, collection)
  )
  // Track all available columns (for showing in visibility dropdown even when hidden)
  const [allAvailableColumns, setAllAvailableColumns] = useState<string[]>([])

  // Update hidden columns when collection changes
  useEffect(() => {
    setHiddenColumns(loadHiddenColumns(connectionId, database, collection))
  }, [connectionId, database, collection])

  // Handle hidden columns change
  const handleHiddenColumnsChange = useCallback(
    (newHiddenColumns: Set<string>) => {
      setHiddenColumns(newHiddenColumns)
      saveHiddenColumns(connectionId, database, collection, newHiddenColumns)
    },
    [connectionId, database, collection]
  )

  // Toggle single column visibility (for dropdown)
  const handleToggleColumn = useCallback(
    (column: string) => {
      const newHidden = new Set(hiddenColumns)
      if (newHidden.has(column)) {
        newHidden.delete(column)
      } else {
        newHidden.add(column)
      }
      handleHiddenColumnsChange(newHidden)
    },
    [hiddenColumns, handleHiddenColumnsChange]
  )

  // Show all columns (for dropdown "Show All" button)
  const handleShowAllColumns = useCallback(() => {
    handleHiddenColumnsChange(new Set())
  }, [handleHiddenColumnsChange])

  // Memoize JSON stringified documents for JSON view (expensive for large datasets)
  const documentsJson = useMemo(() => JSON.stringify(documents, null, 2), [documents])

  // Field validation warnings (computed from query and schema)
  const fieldWarnings = useMemo<FieldWarning[]>(() => {
    if (!isSimpleFindQuery(query)) return []
    const schemaFields = getFieldNames(connectionId, database, collection)
    if (!schemaFields || schemaFields.size === 0) return []
    const filter = parseFilterFromQuery(query)
    return validateFilter(filter, schemaFields)
  }, [query, connectionId, database, collection, getFieldNames])

  // Close history dropdown on click outside
  useEffect(() => {
    if (!showHistory) return
    const handleClickOutside = (e: Event): void => {
      const mouseEvent = e as globalThis.MouseEvent
      if (historyRef.current && !historyRef.current.contains(mouseEvent.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showHistory])

  // Pagination state
  const [skip, setSkip] = useState<number>(0)
  const [limit, setLimit] = useState<number>(50)
  const [total, setTotal] = useState<number>(0)
  const [queryTime, setQueryTime] = useState<number | null>(null)
  const [goToPage, setGoToPage] = useState<string>('')
  const [paginationResetHighlight, setPaginationResetHighlight] = useState<boolean>(false)
  const prevSkipRef = useRef<number>(skip)

  // Reset query when collection changes
  useEffect(() => {
    setQuery(buildFullQuery(collection, '{}'))
  }, [collection])

  // Detect pagination reset and trigger highlight animation
  useEffect(() => {
    if (prevSkipRef.current > 0 && skip === 0) {
      setPaginationResetHighlight(true)
      const timer = setTimeout(() => setPaginationResetHighlight(false), 600)
      return () => clearTimeout(timer)
    }
    prevSkipRef.current = skip
  }, [skip])

  // Prefetch schema for field validation when connected
  useEffect(() => {
    if (isConnected && !isConnecting) {
      prefetchSchema(connectionId, database, collection)
    }
  }, [connectionId, database, collection, isConnected, isConnecting, prefetchSchema])

  // Load documents on mount and when collection/pagination changes
  // Skip auto-execute if: not connected, connecting, or tab was restored from session
  useEffect(() => {
    if (!isConnected || isConnecting || isRestoredTab) return
    executeQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, collection, skip, limit, isConnected, isConnecting, isRestoredTab])

  // Clear selection when query/pagination/collection changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [connectionId, database, collection, skip, limit, query])

  // Debounced query validation for Monaco editor
  useEffect(() => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    if (!monacoRef.current || !editorRef.current) {
      return
    }

    validationTimeoutRef.current = setTimeout(() => {
      const model = editorRef.current?.getModel()
      if (!model || !monacoRef.current) return

      const syntaxDiagnostics = validateQuery(query)
      const fieldDiagnostics = fieldWarningsToMonacoDiagnostics(query, fieldWarnings)
      // Combine diagnostics - MonacoDiagnostic and QueryDiagnostic have compatible structures
      const allDiagnostics: (QueryDiagnostic | MonacoDiagnostic)[] = [...syntaxDiagnostics, ...fieldDiagnostics]
      const markers = toMonacoMarkers(monacoRef.current, allDiagnostics as QueryDiagnostic[])

      ;(monacoRef.current as unknown as { editor: typeof MonacoEditor }).editor.setModelMarkers(
        model,
        'queryValidator',
        markers
      )
    }, 300)

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }
    }
  }, [query, fieldWarnings])

  // Update status bar with document count
  useEffect(() => {
    updateDocumentStatus(total, queryTime)
    return () => clearStatus()
  }, [total, queryTime, updateDocumentStatus, clearStatus])

  // Helper to open insert tab
  const handleInsertDocument = useCallback((): void => {
    openInsertTab(connectionId, database, collection)
  }, [openInsertTab, connectionId, database, collection])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
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
  }, [
    showBulkDeleteModal,
    bulkDeleting,
    deleteDoc,
    deleting,
    handleInsertDocument,
  ])

  const cancelQuery = useCallback((): void => {
    queryIdRef.current++
    setLoading(false)
    notify.info('Query cancelled')
  }, [notify])

  // Check if query contains write operations (for read-only mode protection)
  const isWriteQuery = useCallback((queryText: string): boolean => {
    const writePatterns: RegExp[] = [
      /\.insert(?:One|Many)?\s*\(/i,
      /\.update(?:One|Many)?\s*\(/i,
      /\.delete(?:One|Many)?\s*\(/i,
      /\.remove\s*\(/i,
      /\.drop\s*\(/i,
      /\.createIndex\s*\(/i,
      /\.dropIndex\s*\(/i,
      /\.replaceOne\s*\(/i,
      /\.findOneAndUpdate\s*\(/i,
      /\.findOneAndReplace\s*\(/i,
      /\.findOneAndDelete\s*\(/i,
      /\.bulkWrite\s*\(/i,
      /\.save\s*\(/i,
    ]
    return writePatterns.some((pattern) => pattern.test(queryText))
  }, [])

  const executeQuery = useCallback(async (): Promise<void> => {
    const currentQueryId = ++queryIdRef.current
    const startTime = performance.now()
    const isSimple = isSimpleFindQuery(query)

    if (readOnly && isWriteQuery(query)) {
      notify.error('Write operation blocked - connection is in read-only mode')
      return
    }

    logQuery(`Executing ${isSimple ? 'find' : 'mongosh'} query`, {
      database,
      collection,
      queryType: isSimple ? 'find' : 'mongosh',
      query: query.length > 200 ? query.slice(0, 200) + '...' : query,
    })

    setLoading(true)
    setError(null)

    const settings: AppSettings = loadSettings()
    const timeoutMs = settings.queryTimeout ? settings.queryTimeout * 1000 : 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (currentQueryId === queryIdRef.current) {
          queryIdRef.current++
          setLoading(false)
          const timeoutSec = settings.queryTimeout
          logQuery(`Query timed out after ${timeoutSec}s`, { database, collection })
          setError(
            `Query timed out after ${timeoutSec} seconds. You can increase the timeout in Settings.`
          )
          notify.error(`Query timed out after ${timeoutSec}s`)
        }
      }, timeoutMs)
    }

    const go = getGo()

    try {
      if (isSimple) {
        const filter = parseFilterFromQuery(query)
        const queryProjection = parseProjectionFromQuery(query)
        if (go?.FindDocuments) {
          // Cast to any to include projection which may not be in auto-generated types
          const result = await go.FindDocuments(connectionId, database, collection, filter, {
            skip,
            limit,
            sort: '',
            projection: queryProjection || '',
          } as Parameters<typeof go.FindDocuments>[4])
          if (currentQueryId !== queryIdRef.current) return
          if (!result || !result.documents) {
            setDocuments([])
            setTotal(0)
            setQueryTime(null)
            setRawOutput('')
            return
          }
          const docCount = result.documents.length
          const duration = Math.round(performance.now() - startTime)
          logQuery(`Query returned ${docCount} docs (${result.queryTimeMs || duration}ms)`, {
            database,
            collection,
            count: docCount,
            total: result.total,
            queryTimeMs: result.queryTimeMs,
            clientDuration: duration,
          })
          const parsedDocs: MongoDocument[] = result.documents.map((d: string) => JSON.parse(d))
          setDocuments(parsedDocs)
          setTotal(result.total || 0)
          setQueryTime(result.queryTimeMs ?? null)
          setRawOutput('')

          // Update available columns list (merge with existing + hidden)
          const columnsFromDocs = new Set<string>()
          parsedDocs.forEach((doc) => {
            Object.keys(doc).forEach((key) => columnsFromDocs.add(key))
          })
          hiddenColumns.forEach((col) => columnsFromDocs.add(col))
          const sortedColumns = Array.from(columnsFromDocs).sort((a, b) => {
            if (a === '_id') return -1
            if (b === '_id') return 1
            return a.localeCompare(b)
          })
          setAllAvailableColumns(sortedColumns)

          // Enrich schema cache with field names from results (skip if projection used)
          if (!queryProjection && parsedDocs.length > 0) {
            const fieldPaths = extractFieldPathsFromDocs(parsedDocs)
            mergeFieldNames(connectionId, database, collection, fieldPaths)
          }

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
          const wrappedQuery = wrapScriptForOutput(query)
          const result = await go.ExecuteScriptWithDatabase(connectionId, database, wrappedQuery)
          if (currentQueryId !== queryIdRef.current) return
          if (result.exitCode !== 0 || result.error) {
            throw new Error(result.error || result.output || 'Script execution failed')
          }
          const output = result.output.trim()
          setRawOutput(output)
          const duration = Math.round(performance.now() - startTime)
          if (!output) {
            logQuery(`Mongosh query completed (${duration}ms, no output)`, {
              database,
              collection,
              duration,
            })
            setDocuments([])
            setTotal(0)
          } else {
            const parseResult: MongoshParseResult = parseMongoshOutput(output)

            if (parseResult.success && parseResult.data.length > 0) {
              logQuery(`Mongosh query returned ${parseResult.data.length} results (${duration}ms)`, {
                database,
                collection,
                count: parseResult.data.length,
                duration,
              })
              setDocuments(parseResult.data as MongoDocument[])
              setTotal(parseResult.data.length)

              const fieldPaths = extractFieldPathsFromDocs(parseResult.data as MongoDocument[])
              mergeFieldNames(connectionId, database, collection, fieldPaths)
            } else {
              logQuery(`Mongosh query completed with raw output (${duration}ms)`, {
                database,
                collection,
                duration,
              })
              setDocuments([{ _result: output }])
              setTotal(1)
            }
          }
          setQueryTime(null)

          const newHistory = addToQueryHistory(queryHistory, query, database, collection)
          setQueryHistory(newHistory)
          saveQueryHistory(newHistory)
        } else if (go?.CheckMongoshAvailable) {
          const [available] = await go.CheckMongoshAvailable()
          if (currentQueryId !== queryIdRef.current) return
          if (!available) {
            throw new Error(
              'Invalid query syntax. For complex queries (aggregations, scripts), install mongosh: https://www.mongodb.com/try/download/shell'
            )
          }
        } else {
          throw new Error(
            'Invalid query syntax. Expected: db.getCollection("name").find({...}) or a filter like { field: "value" }'
          )
        }
      }
    } catch (err) {
      if (currentQueryId !== queryIdRef.current) return
      const errorMsg = err instanceof Error ? err.message : 'Failed to execute query'
      const duration = Math.round(performance.now() - startTime)
      logQuery(`Query failed (${duration}ms): ${getErrorSummary(errorMsg)}`, {
        database,
        collection,
        error: errorMsg,
        duration,
      })
      setError(errorMsg)
      notify.error(getErrorSummary(errorMsg))
      setDocuments([])
      setTotal(0)
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (currentQueryId === queryIdRef.current) {
        setLoading(false)
      }
    }
  }, [
    query,
    readOnly,
    isWriteQuery,
    notify,
    logQuery,
    database,
    collection,
    connectionId,
    skip,
    limit,
    hiddenColumns,
    queryHistory,
    mergeFieldNames,
  ])

  // Explain the current query
  const explainQuery = useCallback(async (): Promise<void> => {
    if (!isSimpleFindQuery(query)) {
      notify.warning('Explain is only available for simple find queries')
      return
    }

    setExplaining(true)
    setExplainResult(null)

    try {
      const filter = parseFilterFromQuery(query)
      const go = getGo()
      if (go?.ExplainQuery) {
        const result = await go.ExplainQuery(connectionId, database, collection, filter)
        // Cast the result to the ExplainResult type expected by ExplainPanel
        setExplainResult(result as unknown as ExplainResult)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to explain query'
      notify.error(getErrorSummary(errorMsg))
    } finally {
      setExplaining(false)
    }
  }, [query, notify, connectionId, database, collection])

  // Get document ID as string for API calls
  const getDocIdForApi = useCallback((doc: MongoDocument): string | null => {
    if (!doc._id) return null
    if (typeof doc._id === 'string') return doc._id
    if (typeof doc._id === 'object' && doc._id !== null && '$oid' in doc._id) {
      return (doc._id as { $oid: string }).$oid
    }
    return JSON.stringify(doc._id)
  }, [])

  // Format ID for shell-style display
  const formatIdForShell = useCallback((idString: string): string => {
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
    if (/^[a-f0-9]{24}$/i.test(idString)) {
      return `ObjectId("${idString}")`
    }
    return `"${idString}"`
  }, [])

  // Open document in a new tab
  const handleEdit = useCallback(
    (doc: MongoDocument): void => {
      const docId = getDocIdForApi(doc)
      if (docId) {
        openDocumentTab(connectionId, database, collection, doc, docId)
      }
    },
    [getDocIdForApi, openDocumentTab, connectionId, database, collection]
  )

  // Open delete confirmation
  const handleDelete = useCallback((doc: MongoDocument): void => {
    setDeleteDoc(doc)
  }, [])

  // Execute delete
  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!deleteDoc) return
    setDeleting(true)
    try {
      const go = getGo()
      if (go?.DeleteDocument) {
        const docId = getDocIdForApi(deleteDoc)
        if (docId) {
          await go.DeleteDocument(connectionId, database, collection, docId)
          notify.success('Document deleted')
          setDeleteDoc(null)
          executeQuery()
        }
      }
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    } finally {
      setDeleting(false)
    }
  }, [deleteDoc, getDocIdForApi, connectionId, database, collection, notify, executeQuery])

  // Bulk delete - delete all selected documents sequentially
  const handleBulkDelete = useCallback(async (): Promise<void> => {
    setBulkDeleting(true)
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteProgress({ done: 0, total: idsToDelete.length })

    const opInput: OperationInput = {
      type: 'bulk-delete',
      label: `Deleting ${idsToDelete.length} docs...`,
      progress: 0,
      destructive: true,
    }
    const opId = startOperation(opInput)

    let successCount = 0
    let failCount = 0

    const go = getGo()
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
      const progress = Math.round(((i + 1) / idsToDelete.length) * 100)
      setBulkDeleteProgress({ done: i + 1, total: idsToDelete.length })
      updateOperation(opId, { progress, label: `Deleting ${i + 1}/${idsToDelete.length}...` })
    }

    completeOperation(opId)
    setBulkDeleting(false)
    setShowBulkDeleteModal(false)
    setSelectedIds(new Set())

    if (failCount === 0) {
      notify.success(`Deleted ${successCount} document${successCount !== 1 ? 's' : ''}`)
    } else {
      notify.warning(`Deleted ${successCount}, failed ${failCount}`)
    }

    executeQuery()
  }, [
    selectedIds,
    startOperation,
    connectionId,
    database,
    collection,
    updateOperation,
    completeOperation,
    notify,
    executeQuery,
  ])

  // Export selected documents as ZIP
  const handleExport = useCallback(async (): Promise<void> => {
    setExporting(true)
    try {
      const entries: ExportEntry[] = []
      const idsToExport = Array.from(selectedIds)

      const go = getGo()
      for (const docId of idsToExport) {
        try {
          if (go?.GetDocument) {
            const jsonStr = await go.GetDocument(connectionId, database, collection, docId)
            entries.push({
              database,
              collection,
              docId,
              json: jsonStr,
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

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultFilename = `${collection}-export-${timestamp}.zip`

      if (go?.ExportDocumentsAsZip) {
        await go.ExportDocumentsAsZip(entries, defaultFilename)
        notify.success(`Exported ${entries.length} document${entries.length !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    } finally {
      setExporting(false)
    }
  }, [selectedIds, connectionId, database, collection, notify])

  const currentPage = Math.floor(skip / limit) + 1
  const totalPages = Math.ceil(total / limit)

  // Monaco editor mount handlers
  const handleEditorBeforeMount: BeforeMount = useCallback((monaco) => {
    if (!monaco.languages.getLanguages().some((lang: MonacoLanguageInfo) => lang.id === 'mongoquery')) {
      monaco.languages.register({ id: 'mongoquery' })

      monaco.languages.setMonarchTokensProvider('mongoquery', {
        defaultToken: '',
        tokenPostfix: '.mongoquery',
        keywords: ['db', 'true', 'false', 'null'],
        operators: [
          '=',
          '>',
          '<',
          '!',
          '~',
          '?',
          ':',
          '==',
          '<=',
          '>=',
          '!=',
          '&&',
          '||',
          '+',
          '-',
          '*',
          '/',
          '&',
          '|',
          '^',
          '%',
        ],
        symbols: /[=><!~?:&|+\-*/^%]+/,
        escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
        tokenizer: {
          root: [
            [/\$[a-zA-Z_][a-zA-Z0-9_]*/, 'keyword.operator'],
            [
              /[a-zA-Z_][a-zA-Z0-9_]*/,
              {
                cases: {
                  '@keywords': 'keyword',
                  '@default': 'identifier',
                },
              },
            ],
            { include: '@whitespace' },
            [/[{}()[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [
              /@symbols/,
              {
                cases: {
                  '@operators': 'operator',
                  '@default': '',
                },
              },
            ],
            [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/\d+/, 'number'],
            [/[;,.]/, 'delimiter'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string_double' }],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/'/, { token: 'string.quote', bracket: '@open', next: '@string_single' }],
          ],
          string_double: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
          ],
          string_single: [
            [/[^\\']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
          ],
          whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
          ],
          comment: [
            [/[^/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            ['\\*/', 'comment', '@pop'],
            [/[/*]/, 'comment'],
          ],
        },
      })
    }
  }, [])

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco as unknown as MonacoInstance

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => executeQuery())

      const model = editor.getModel()
      if (model && monacoRef.current) {
        const syntaxDiagnostics = validateQuery(query)
        const fieldDiagnostics = fieldWarningsToMonacoDiagnostics(query, fieldWarnings)
        // Combine diagnostics - MonacoDiagnostic and QueryDiagnostic have compatible structures
        const allDiagnostics: (QueryDiagnostic | MonacoDiagnostic)[] = [...syntaxDiagnostics, ...fieldDiagnostics]
        const markers = toMonacoMarkers(monacoRef.current, allDiagnostics as QueryDiagnostic[])
        monaco.editor.setModelMarkers(model, 'queryValidator', markers)
      }
    },
    [executeQuery, query, fieldWarnings]
  )

  return (
    <div className="h-full flex flex-col">
      {/* Query bar - overflow-visible for dropdown */}
      <div className="flex-shrink-0 p-2 border-b border-border bg-surface-secondary overflow-visible">
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
                  className={`btn btn-primary flex items-center gap-1.5 ${
                    !isConnected ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  onClick={() => {
                    if (!isConnected) return
                    if (isRestoredTab) {
                      markTabActivated(tabId)
                      setIsRestoredTab(false)
                    } else {
                      executeQuery()
                    }
                  }}
                  disabled={!isConnected}
                  title={!isConnected ? 'Connect to database first' : 'Run query (Cmd+Enter)'}
                >
                  <PlayIcon className="w-4 h-4" />
                  <span>Run</span>
                </button>
              )}
              <button
                className={`btn btn-secondary flex items-center gap-1.5 ${
                  readOnly || !isConnected ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                onClick={handleInsertDocument}
                disabled={readOnly || !isConnected}
                title={readOnly ? 'Read-only mode' : 'Insert new document (Cmd+N)'}
              >
                <PlusIcon className="w-4 h-4" />
                <span>Insert</span>
              </button>
            </div>
            <div className="flex items-center gap-1 overflow-visible">
              <SavedQueriesDropdown
                connectionId={connectionId}
                database={database}
                collection={collection}
                onSelectQuery={(q: string) => setQuery(buildFullQuery(collection, q))}
                onManageQueries={() => setShowSavedQueriesManager(true)}
                refreshTrigger={savedQueriesRefreshKey}
              />
              <button
                className="icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-accent"
                onClick={() => setShowSaveQueryModal(true)}
                title="Save current query"
              >
                <SaveIcon className="w-4 h-4" />
              </button>
              <div className="relative z-40">
                <button
                  className="icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                  onClick={() => setShowHistory(!showHistory)}
                  title="Query history"
                >
                  <HistoryIcon className="w-4 h-4" />
                </button>
                {showHistory && (
                  <QueryHistoryDropdown
                    queryHistory={queryHistory}
                    onSelect={setQuery}
                    onClose={() => setShowHistory(false)}
                    historyRef={historyRef}
                  />
                )}
              </div>
              <button
                className={`icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 ${
                  explaining ? 'animate-pulse' : ''
                } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={explainQuery}
                disabled={explaining || loading || !isConnected}
                title={!isConnected ? 'Connect to database first' : 'Explain query plan'}
              >
                <ExplainIcon className="w-4 h-4" />
              </button>
              <CSVExportButton
                connectionId={connectionId}
                database={database}
                collection={collection}
                currentFilter={parseFilterFromQuery(query)}
                disabled={!isConnected}
              />
            </div>
          </div>
          {/* Monaco Editor with resizable height */}
          <div className="border border-zinc-700 rounded overflow-visible">
            <Editor
              height={`${editorHeight}px`}
              defaultLanguage="mongoquery"
              theme="vs-dark"
              value={query}
              onChange={(value) => setQuery(value || '')}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                glyphMargin: true,
                folding: false,
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 2,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                fontSize: 13,
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                padding: { top: 8, bottom: 8 },
                overviewRulerLanes: 1,
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false,
                fixedOverflowWidgets: true,
                hover: { enabled: true, delay: 300 },
                quickSuggestions: false,
                parameterHints: { enabled: false },
                suggestOnTriggerCharacters: false,
                codeLens: false,
                lightbulb: { enabled: 'off' as unknown as editor.ShowLightbulbIconMode },
                inlayHints: { enabled: 'off' as 'off' | 'on' | 'offUnlessPressed' | 'onUnlessPressed' },
                links: false,
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'hidden',
                  verticalScrollbarSize: 8,
                },
              }}
              beforeMount={handleEditorBeforeMount}
              onMount={handleEditorMount}
            />
          </div>
          {/* Resize handle */}
          <div
            className="h-1.5 cursor-ns-resize bg-transparent hover:bg-zinc-600 transition-colors -mt-1 rounded-b"
            onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
              e.preventDefault()
              resizingRef.current = true
              startYRef.current = e.clientY
              startHeightRef.current = editorHeight

              const onMouseMove = (moveEvent: globalThis.MouseEvent): void => {
                if (!resizingRef.current) return
                const deltaY = moveEvent.clientY - startYRef.current
                const newHeight = Math.max(60, Math.min(500, startHeightRef.current + deltaY))
                setEditorHeight(newHeight)
              }

              const onMouseUp = (): void => {
                resizingRef.current = false
                localStorage.setItem('mongopal_editor_height', String(editorHeight))
                document.removeEventListener('mousemove', onMouseMove)
                document.removeEventListener('mouseup', onMouseUp)
              }

              document.addEventListener('mousemove', onMouseMove)
              document.addEventListener('mouseup', onMouseUp)
            }}
            title="Drag to resize editor"
          />
        </div>
      </div>

      {/* Read-only indicator */}
      {readOnly && (
        <div className="flex-shrink-0 px-3 py-1 bg-amber-900/20 border-b border-amber-800 text-amber-400 text-xs flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M5 8h14M5 8a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V10a2 2 0 00-2-2M5 8V6a2 2 0 012-2h2"
            />
          </svg>
          Read-only mode - Write operations are disabled for this connection
        </div>
      )}

      {/* View mode tabs and info */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface text-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1" role="tablist" aria-label="View mode">
            {(['table', 'json', 'raw'] as ViewMode[]).map((mode) => (
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
                {mode}
              </button>
            ))}
          </div>

          {queryTime !== null && (
            <span className="text-zinc-400 text-xs">Query: {queryTime}ms</span>
          )}
        </div>

        {/* Pagination controls */}
        <div
          className={`flex items-center gap-2 text-zinc-400 text-xs ${
            paginationResetHighlight ? 'pagination-reset-highlight' : ''
          }`}
        >
          {/* Page size selector */}
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300"
            value={limit}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const newLimit = parseInt(e.target.value, 10)
              setLimit(newLimit)
              setSkip(0)
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
              className="pagination-btn px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip(0)}
              disabled={skip === 0}
              title="First page"
            >
              &#xAB;&#xAB;
            </button>
            <button
              className="pagination-btn px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              title="Previous page"
            >
              &#xAB;
            </button>

            {/* Page number input */}
            <div className="flex items-center gap-1 mx-1">
              <input
                type="text"
                className="w-10 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-center text-xs"
                value={goToPage || currentPage}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setGoToPage(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    const page = parseInt(goToPage, 10)
                    if (page >= 1 && page <= totalPages) {
                      setSkip((page - 1) * limit)
                    }
                    setGoToPage('')
                  }
                }}
                onBlur={() => setGoToPage('')}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <span>/ {totalPages || 1}</span>
            </div>

            <button
              className="pagination-btn px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip(skip + limit)}
              disabled={skip + limit >= total}
              title="Next page"
            >
              &#xBB;
            </button>
            <button
              className="pagination-btn px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setSkip((totalPages - 1) * limit)}
              disabled={skip + limit >= total}
              title="Last page"
            >
              &#xBB;&#xBB;
            </button>
          </div>

          {/* Column visibility toggle - only in table view */}
          {viewMode === 'table' && (
            <>
              <span className="mx-1 text-zinc-600">|</span>
              <ColumnVisibilityDropdown
                allColumns={allAvailableColumns}
                hiddenColumns={hiddenColumns}
                onToggleColumn={handleToggleColumn}
                onShowAll={handleShowAllColumns}
              />
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex-shrink-0 px-3 py-2 border-b border-red-800">
          <ActionableError error={error} onDismiss={() => setError(null)} compact />
        </div>
      )}

      {/* Explain panel */}
      {explainResult && (
        <ExplainPanel result={explainResult} onClose={() => setExplainResult(null)} />
      )}

      {/* Document list with bulk action bar overlay */}
      <div className="flex-1 overflow-auto relative">
        {/* Connection states */}
        {!isConnected && !isConnecting ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
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
        ) : isConnecting ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3">
            <div className="spinner" />
            <span>Connecting to database...</span>
          </div>
        ) : isRestoredTab && documents.length === 0 && !loading && !error ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
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
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
              />
            </svg>
            <span>Session restored</span>
            <p className="text-sm text-zinc-500">Click Run to execute query</p>
            <button
              onClick={() => {
                markTabActivated(tabId)
                setIsRestoredTab(false)
              }}
              className="px-4 py-2 bg-accent hover:bg-accent/90 text-zinc-900 rounded-lg font-medium flex items-center gap-2"
            >
              <PlayIcon className="w-4 h-4" />
              Run Query
            </button>
          </div>
        ) : loading ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3">
            <div className="spinner" />
            <span>Loading documents...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-400">
            <span>No documents found</span>
          </div>
        ) : viewMode === 'table' ? (
          <TableView
            documents={documents}
            onEdit={handleEdit}
            onDelete={handleDelete}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onCompareSource={setCompareSourceDoc}
            onCompareTo={(doc: MongoDocument) => {
              setDiffTargetDoc(doc)
              setShowDiffView(true)
            }}
            compareSourceDoc={compareSourceDoc}
            readOnly={readOnly}
            connectionId={connectionId}
            database={database}
            collection={collection}
            hiddenColumns={hiddenColumns}
            onHiddenColumnsChange={handleHiddenColumnsChange}
            allAvailableColumns={allAvailableColumns}
          />
        ) : viewMode === 'json' ? (
          <MonacoErrorBoundary>
            <Editor
              height="100%"
              language="json"
              theme="vs-dark"
              value={documentsJson}
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
          </MonacoErrorBoundary>
        ) : (
          /* Raw view - unmodified mongosh output */
          <MonacoErrorBoundary>
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
          </MonacoErrorBoundary>
        )}

        {/* Bulk Action Bar - positioned at bottom of scroll container */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 left-0 right-0 z-20">
            <BulkActionBar
              selectedCount={selectedIds.size}
              onClear={() => setSelectedIds(new Set())}
              onDelete={() => setShowBulkDeleteModal(true)}
              onExport={handleExport}
              isDeleting={bulkDeleting}
              isExporting={exporting}
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteDoc && (
        <div className="fixed inset-0 bg-black/70 z-50 p-[5%]">
          <div className="h-full w-full bg-surface border border-border rounded-lg flex flex-col shadow-2xl">
            <div className="flex-shrink-0 px-4 py-3 border-b border-border">
              <h3 className="text-lg font-medium text-zinc-100">Delete Document</h3>
              <p className="text-sm text-zinc-400">
                {database} &gt; {collection}
              </p>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <div className="mb-4">
                <p className="text-zinc-300 mb-2">
                  This will execute the following delete operation:
                </p>
                <div className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-sm">
                  <span className="text-zinc-500">db.</span>
                  <span className="text-amber-400">{collection}</span>
                  <span className="text-zinc-500">.deleteOne(</span>
                  <span className="text-green-400">{'{ "_id": '}</span>
                  <span className="text-purple-400">
                    {formatIdForShell(getDocIdForApi(deleteDoc) || '')}
                  </span>
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
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
              <h3 className="text-lg font-medium text-zinc-100">
                Delete {selectedIds.size} Document{selectedIds.size !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-zinc-400">
                {database} &gt; {collection}
              </p>
            </div>
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <p className="text-zinc-300 mb-2 flex-shrink-0">
                This will execute the following delete operation:
              </p>
              <div className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-sm flex-1 overflow-auto mb-4">
                <span className="text-zinc-500">db.</span>
                <span className="text-amber-400">{collection}</span>
                <span className="text-zinc-500">.deleteMany(</span>
                <span className="text-green-400">{'{ "_id": { "$in": ['}</span>
                <br />
                {Array.from(selectedIds).map((id, idx) => (
                  <span key={id}>
                    <span className="text-zinc-500"> </span>
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
                    <span>
                      {bulkDeleteProgress.done} / {bulkDeleteProgress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-200"
                      style={{
                        width: `${(bulkDeleteProgress.done / bulkDeleteProgress.total) * 100}%`,
                      }}
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
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting
                  ? `Deleting ${bulkDeleteProgress.done}/${bulkDeleteProgress.total}...`
                  : `Delete ${selectedIds.size} Document${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Diff View */}
      {showDiffView && compareSourceDoc && diffTargetDoc && (
        <DocumentDiffView
          sourceDocument={compareSourceDoc}
          targetDocument={diffTargetDoc}
          onClose={() => {
            setShowDiffView(false)
            setDiffTargetDoc(null)
          }}
          onSwap={() => {
            const temp = compareSourceDoc
            setCompareSourceDoc(diffTargetDoc)
            setDiffTargetDoc(temp)
          }}
        />
      )}

      {/* Save Query Modal */}
      <SaveQueryModal
        isOpen={showSaveQueryModal}
        onClose={() => setShowSaveQueryModal(false)}
        connectionId={connectionId}
        database={database}
        collection={collection}
        query={parseFilterFromQuery(query)}
        onSaved={() => setSavedQueriesRefreshKey((k) => k + 1)}
      />

      {/* Saved Queries Manager Modal */}
      <SavedQueriesManager
        isOpen={showSavedQueriesManager}
        onClose={() => setShowSavedQueriesManager(false)}
        connectionId={connectionId}
        database={database}
        collection={collection}
        onQuerySelected={(savedQuery: { collection: string; query: string }) => {
          setQuery(buildFullQuery(savedQuery.collection, savedQuery.query))
        }}
        onQueriesChanged={() => setSavedQueriesRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
