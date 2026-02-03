import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import {
  getDocId,
  formatValue as formatValueUtil,
  getRawValue,
  getNestedValue,
  extractColumns,
  columnHasExpandableObjects,
  getDefaultColumnWidth,
} from '../utils/tableViewUtils'
import { loadSettings } from './Settings'

// Virtual scrolling constants
const ROW_HEIGHT = 37 // Height of each row in pixels
const BUFFER_ROWS = 10 // Number of rows to render above/below viewport

// localStorage key for frozen columns per collection
const FROZEN_COLUMNS_KEY = 'mongopal-frozen-columns'

// Load frozen columns from localStorage for a specific collection
function loadFrozenColumns(connectionId, database, collection) {
  try {
    const stored = localStorage.getItem(FROZEN_COLUMNS_KEY)
    if (stored) {
      const data = JSON.parse(stored)
      const key = `${connectionId}:${database}:${collection}`
      return new Set(data[key] || [])
    }
  } catch (err) {
    console.error('Failed to load frozen columns:', err)
  }
  return new Set()
}

// Save frozen columns to localStorage for a specific collection
function saveFrozenColumns(connectionId, database, collection, frozenColumns) {
  try {
    const stored = localStorage.getItem(FROZEN_COLUMNS_KEY)
    const data = stored ? JSON.parse(stored) : {}
    const key = `${connectionId}:${database}:${collection}`
    data[key] = Array.from(frozenColumns)
    localStorage.setItem(FROZEN_COLUMNS_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Failed to save frozen columns:', err)
  }
}

// JSX wrapper for formatValue utility - renders with appropriate styling
function formatValue(value) {
  const formatted = formatValueUtil(value)

  switch (formatted.type) {
    case 'null':
    case 'undefined':
      return <span className="text-zinc-400 italic">{formatted.display}</span>
    case 'boolean':
      return <span className={formatted.boolValue ? 'text-green-400' : 'text-red-400'}>{formatted.display}</span>
    case 'number':
    case 'numberLong':
    case 'numberInt':
    case 'numberDouble':
      return <span className="text-blue-400">{formatted.display}</span>
    case 'string':
      return formatted.display
    case 'array':
      return <span className="text-zinc-400">{formatted.display}</span>
    case 'date':
      return <span className="text-purple-400">{formatted.display}</span>
    case 'objectId':
      return <span className="text-amber-400">{formatted.display}</span>
    case 'binary':
    case 'uuid':
      return <span className="text-cyan-400">{formatted.display}</span>
    case 'object':
      return <span className="text-zinc-400">{formatted.display}</span>
    default:
      return formatted.display
  }
}

// Icons
const CopyIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const ExpandIcon = ({ className = "w-3 h-3" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const CollapseIcon = ({ className = "w-3 h-3" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const CompareIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
)

const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const FreezeIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v18m0-18l-3 3m3-3l3 3M15 3v18m0-18l-3 3m3-3l3 3" />
  </svg>
)

const UnfreezeIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
  </svg>
)

export default function TableView({
  documents,
  onEdit,
  onDelete,
  selectedIds = new Set(),
  onSelectionChange = () => {},
  onCompareSource,
  onCompareTo,
  compareSourceDoc,
  readOnly = false,
  connectionId = '',
  database = '',
  collection = '',
}) {
  const [expandedColumns, setExpandedColumns] = useState(new Set())
  const rawColumns = useMemo(() => extractColumns(documents, expandedColumns), [documents, expandedColumns])
  const [contextMenu, setContextMenu] = useState(null) // { x, y, doc, cellValue, cellKey }
  const [headerContextMenu, setHeaderContextMenu] = useState(null) // { x, y, column }
  const [copiedField, setCopiedField] = useState(null) // 'value' | 'json' - tracks which item was just copied
  const menuRef = useRef(null)
  const headerMenuRef = useRef(null)
  const headerCheckboxRef = useRef(null)
  const containerRef = useRef(null)

  // Settings for sticky column
  const [settings, setSettings] = useState(() => loadSettings())

  // Frozen columns state - per collection persistence
  const [frozenColumns, setFrozenColumns] = useState(() => {
    const loaded = loadFrozenColumns(connectionId, database, collection)
    // If settings say freeze _id and it's not already frozen, add it
    if (settings.freezeIdColumn && !loaded.has('_id')) {
      loaded.add('_id')
    }
    return loaded
  })

  // Reload frozen columns when collection changes
  useEffect(() => {
    const loaded = loadFrozenColumns(connectionId, database, collection)
    // If settings say freeze _id and it's not already frozen, add it
    if (settings.freezeIdColumn && !loaded.has('_id')) {
      loaded.add('_id')
    }
    setFrozenColumns(loaded)
  }, [connectionId, database, collection, settings.freezeIdColumn])

  // Reorder columns so frozen columns appear first (Issue #4)
  const columns = useMemo(() => {
    const frozen = rawColumns.filter(col => frozenColumns.has(col))
    const unfrozen = rawColumns.filter(col => !frozenColumns.has(col))
    return [...frozen, ...unfrozen]
  }, [rawColumns, frozenColumns])

  // Toggle freeze on a column
  const toggleFreezeColumn = useCallback((column) => {
    setFrozenColumns(prev => {
      const next = new Set(prev)
      if (next.has(column)) {
        next.delete(column)
      } else {
        next.add(column)
      }
      saveFrozenColumns(connectionId, database, collection, next)
      return next
    })
  }, [connectionId, database, collection])

  // Virtual scrolling state
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  // Column resizing state
  const [columnWidths, setColumnWidths] = useState({})
  const resizingRef = useRef(null) // { column, startX, startWidth }

  // Calculate virtual scrolling bounds
  const totalHeight = documents.length * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    documents.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS
  )
  const visibleDocuments = documents.slice(startIndex, endIndex)
  const offsetY = startIndex * ROW_HEIGHT

  // Update container height on mount and resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      setContainerHeight(container.clientHeight)
    }

    updateHeight()
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  // Handle scroll for virtual scrolling
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop)
  }, [])

  // Initialize column widths based on type and name
  useEffect(() => {
    const defaultWidths = {}
    columns.forEach(col => {
      if (!columnWidths[col]) {
        defaultWidths[col] = getDefaultColumnWidth(col, documents)
      }
    })
    if (Object.keys(defaultWidths).length > 0) {
      setColumnWidths(prev => ({ ...prev, ...defaultWidths }))
    }
  }, [columns, documents])

  // Handle column resize
  const handleResizeStart = useCallback((e, column) => {
    e.preventDefault()
    resizingRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column] || 150
    }
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
  }, [columnWidths])

  const handleResizeMove = useCallback((e) => {
    if (!resizingRef.current) return
    const { column, startX, startWidth } = resizingRef.current
    const diff = e.clientX - startX
    const newWidth = Math.max(60, startWidth + diff)
    setColumnWidths(prev => ({ ...prev, [column]: newWidth }))
  }, [])

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
  }, [handleResizeMove])

  // Cleanup resize listeners on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // If component unmounts during resize, clean up listeners
      if (resizingRef.current) {
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
        resizingRef.current = null
      }
    }
  }, [handleResizeMove, handleResizeEnd])

  // Toggle column expansion
  const toggleColumnExpansion = useCallback((columnPath) => {
    setExpandedColumns(prev => {
      const next = new Set(prev)
      if (next.has(columnPath)) {
        // Collapse: remove this column and all sub-columns
        next.delete(columnPath)
        // Also remove any sub-expanded columns
        for (const col of prev) {
          if (col.startsWith(columnPath + '.')) {
            next.delete(col)
          }
        }
      } else {
        next.add(columnPath)
      }
      return next
    })
  }, [])

  // Get the root column name (before any dots)
  const getRootColumn = (columnPath) => columnPath.split('.')[0]

  // Check if column is expanded
  const isColumnExpanded = (columnPath) => expandedColumns.has(columnPath)

  // Check if this is a sub-column (contains dots)
  const isSubColumn = (columnPath) => columnPath.includes('.')

  // Get parent column path
  const getParentColumn = (columnPath) => {
    const parts = columnPath.split('.')
    parts.pop()
    return parts.join('.')
  }

  // Calculate selection state for header checkbox
  const selectionState = useMemo(() => {
    if (selectedIds.size === 0) return 'none'
    const selectableCount = documents.filter(doc => getDocId(doc)).length
    if (selectedIds.size >= selectableCount && selectableCount > 0) return 'all'
    return 'some'
  }, [selectedIds, documents])

  // Update header checkbox indeterminate state
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = selectionState === 'some'
    }
  }, [selectionState])

  // Toggle single document selection
  const toggleSelection = useCallback((docId) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(docId)) {
      newSet.delete(docId)
    } else {
      newSet.add(docId)
    }
    onSelectionChange(newSet)
  }, [selectedIds, onSelectionChange])

  // Toggle all documents selection
  const toggleAllSelection = useCallback(() => {
    if (selectionState === 'all') {
      // Deselect all
      onSelectionChange(new Set())
    } else {
      // Select all
      const newSet = new Set()
      documents.forEach(doc => {
        const docId = getDocId(doc)
        if (docId) newSet.add(docId)
      })
      onSelectionChange(newSet)
    }
  }, [selectionState, documents, onSelectionChange])

  // Close context menu on click outside or scroll
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu(null)
      }
    }

    const handleScroll = () => setContextMenu(null)
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setContextMenu(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('scroll', handleScroll, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  // Close header context menu on click outside or scroll
  useEffect(() => {
    if (!headerContextMenu) return

    const handleClickOutside = (e) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setHeaderContextMenu(null)
      }
    }

    const handleScroll = () => setHeaderContextMenu(null)
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setHeaderContextMenu(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('scroll', handleScroll, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [headerContextMenu])

  // Handle header right-click
  const handleHeaderContextMenu = (e, column) => {
    e.preventDefault()
    e.stopPropagation()
    setHeaderContextMenu({
      x: e.clientX,
      y: e.clientY,
      column,
    })
  }

  const handleContextMenu = (e, doc, cellKey = null, cellValue = null) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      doc,
      cellKey,
      cellValue,
    })
  }

  const handleCopyValue = async () => {
    if (contextMenu?.cellValue !== undefined) {
      try {
        await navigator.clipboard.writeText(getRawValue(contextMenu.cellValue))
        setCopiedField('value')
        setTimeout(() => {
          setContextMenu(null)
          setCopiedField(null)
        }, 600)
        return
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
    setContextMenu(null)
  }

  const handleCopyDocumentJson = async () => {
    if (contextMenu?.doc) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(contextMenu.doc, null, 2))
        setCopiedField('json')
        setTimeout(() => {
          setContextMenu(null)
          setCopiedField(null)
        }, 600)
        return
      } catch (err) {
        console.error('Failed to copy document:', err)
      }
    }
    setContextMenu(null)
  }

  const handleEdit = () => {
    if (contextMenu?.doc && onEdit) {
      onEdit(contextMenu.doc)
    }
    setContextMenu(null)
  }

  const handleDelete = () => {
    if (contextMenu?.doc && onDelete) {
      onDelete(contextMenu.doc)
    }
    setContextMenu(null)
  }

  // Calculate frozen columns in display order (based on columns array order)
  const frozenColumnsList = useMemo(() => {
    return columns.filter(col => frozenColumns.has(col))
  }, [columns, frozenColumns])

  // Calculate left offsets for each frozen column (checkbox width + cumulative frozen column widths)
  const frozenColumnOffsets = useMemo(() => {
    const offsets = {}
    let currentOffset = 52 // Checkbox column width
    for (const col of frozenColumnsList) {
      offsets[col] = currentOffset
      currentOffset += columnWidths[col] || getDefaultColumnWidth(col, documents)
    }
    return offsets
  }, [frozenColumnsList, columnWidths, documents])

  // Check if any columns are frozen (for checkbox column sticky behavior)
  const hasFrozenColumns = frozenColumnsList.length > 0

  // Calculate total table width to ensure header and body tables match
  const totalTableWidth = useMemo(() => {
    let width = 52 // Checkbox column
    columns.forEach(col => {
      width += columnWidths[col] || getDefaultColumnWidth(col, documents)
    })
    return width
  }, [columns, columnWidths, documents])

  if (documents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        No documents to display
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto"
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <table
          className="text-sm table-fixed"
          role="grid"
          aria-label="Documents table"
          style={{ position: 'sticky', top: 0, zIndex: 20, width: totalTableWidth }}
        >
          {/* Colgroup to enforce column widths */}
          <colgroup>
            <col style={{ width: 52 }} />
            {columns.map(col => (
              <col key={col} style={{ width: columnWidths[col] || getDefaultColumnWidth(col, documents) }} />
            ))}
          </colgroup>
          <thead className="bg-surface-secondary">
            <tr role="row">
              {/* Checkbox column header */}
              <th
                scope="col"
                className={`px-3 py-2 text-left border-b border-border bg-surface-secondary ${hasFrozenColumns ? 'sticky left-0 z-30' : ''}`}
                style={{ width: 52, minWidth: 52 }}
              >
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={selectionState === 'all'}
                  onChange={toggleAllSelection}
                  aria-label={selectionState === 'all' ? 'Deselect all documents' : 'Select all documents'}
                  title={selectionState === 'all' ? 'Deselect all' : 'Select all'}
                />
              </th>
              {columns.map((col, colIndex) => {
                const canExpand = columnHasExpandableObjects(documents, col)
                const isExpanded = isColumnExpanded(col)
                const isSub = isSubColumn(col)
                const displayName = isSub ? col.split('.').pop() : col
                const parentCol = isSub ? getParentColumn(col) : null
                const isFrozen = frozenColumns.has(col)
                const frozenOffset = isFrozen ? frozenColumnOffsets[col] : undefined

                return (
                <th
                  key={col}
                  scope="col"
                  className={`px-3 py-2 text-left font-medium text-zinc-400 border-b border-border whitespace-nowrap relative group bg-surface-secondary ${isSub ? 'bg-zinc-800/30' : ''} ${isFrozen ? 'sticky z-30' : ''} ${isFrozen ? 'border-r-2 border-r-zinc-600' : ''}`}
                  style={{
                    width: columnWidths[col] || getDefaultColumnWidth(col, documents),
                    minWidth: 60,
                    left: frozenOffset,
                  }}
                  onContextMenu={(e) => handleHeaderContextMenu(e, col)}
                >
                  <div className="flex items-center gap-1">
                    {/* Collapse parent button for sub-columns */}
                    {isSub && parentCol && (
                      <button
                        onClick={() => toggleColumnExpansion(parentCol)}
                        className="icon-btn p-0.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-300"
                        title={`Collapse ${parentCol}`}
                      >
                        <CollapseIcon className="w-3 h-3" />
                      </button>
                    )}
                    {/* Column name */}
                    <span className={isSub ? 'text-zinc-400' : ''}>{isSub ? `↳ ${displayName}` : displayName}</span>
                    {/* Expand button for expandable columns */}
                    {canExpand && !isExpanded && (
                      <button
                        onClick={() => toggleColumnExpansion(col)}
                        className="icon-btn p-0.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-accent"
                        title={`Expand ${col}`}
                      >
                        <ExpandIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {/* Column resizer - 6px hit target with visible inner line */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize flex justify-center hover:bg-accent/30 group-hover:after:opacity-100 after:content-[''] after:w-0.5 after:h-full after:bg-zinc-500 after:opacity-0 after:transition-opacity hover:after:bg-accent hover:after:opacity-100"
                    onMouseDown={(e) => handleResizeStart(e, col)}
                  />
                </th>
                )
              })}
            </tr>
          </thead>
        </table>

        {/* Virtual scrolling body */}
        <div style={{ position: 'absolute', top: ROW_HEIGHT, left: 0, right: 0 }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            <table className="text-sm table-fixed" role="presentation" style={{ width: totalTableWidth }}>
              {/* Colgroup to match header column widths */}
              <colgroup>
                <col style={{ width: 52 }} />
                {columns.map(col => (
                  <col key={col} style={{ width: columnWidths[col] || getDefaultColumnWidth(col, documents) }} />
                ))}
              </colgroup>
              <tbody>
                {visibleDocuments.map((doc, idx) => {
                  const actualIndex = startIndex + idx
                  const docId = getDocId(doc)
                  const isSelected = docId && selectedIds.has(docId)
                  const isCompareSource = compareSourceDoc && getDocId(compareSourceDoc) === docId
                  return (
                    <tr
                      key={docId || actualIndex}
                      className={`table-row border-b border-zinc-800 ${
                        isSelected
                          ? 'bg-accent/10 hover:bg-accent/20'
                          : isCompareSource
                          ? 'bg-blue-900/20 hover:bg-blue-900/30'
                          : 'hover:bg-zinc-800/50'
                      }`}
                      style={{ height: ROW_HEIGHT }}
                      onContextMenu={(e) => handleContextMenu(e, doc)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (onEdit && !readOnly) onEdit(doc)
                        } else if (e.key === ' ') {
                          e.preventDefault()
                          if (docId) toggleSelection(docId)
                        }
                      }}
                    >
                      {/* Row checkbox */}
                      <td
                        className={`px-3 py-2 ${hasFrozenColumns ? 'sticky left-0 z-10 bg-surface' : ''}`}
                        style={{ width: 52, minWidth: 52 }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => docId && toggleSelection(docId)}
                          disabled={!docId}
                          aria-label={`Select document ${docId || actualIndex + 1}`}
                        />
                      </td>
                      {columns.map(col => {
                        const cellValue = getNestedValue(doc, col)
                        const isSub = isSubColumn(col)
                        const isFrozen = frozenColumns.has(col)
                        const frozenOffset = isFrozen ? frozenColumnOffsets[col] : undefined
                        return (
                        <td
                          key={col}
                          className={`px-3 py-2 whitespace-nowrap truncate cursor-context-menu ${isSub ? 'bg-zinc-800/20' : ''} ${isFrozen ? 'sticky z-10 bg-surface' : ''} ${isSelected && isFrozen ? '!bg-accent/10' : ''} ${isFrozen ? 'border-r-2 border-r-zinc-600' : ''}`}
                          style={{
                            width: columnWidths[col] || getDefaultColumnWidth(col, documents),
                            maxWidth: columnWidths[col] || getDefaultColumnWidth(col, documents),
                            left: frozenOffset,
                          }}
                          onContextMenu={(e) => handleContextMenu(e, doc, col, cellValue)}
                        >
                          {formatValue(cellValue)}
                        </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Document actions"
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {/* Cell-specific copy option */}
          {contextMenu.cellValue !== undefined && contextMenu.cellKey && (
            <button
              role="menuitem"
              className={`context-menu-item w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                copiedField === 'value' ? 'text-accent bg-accent/10' : 'text-zinc-200 hover:bg-zinc-700'
              }`}
              onClick={handleCopyValue}
              disabled={copiedField !== null}
            >
              {copiedField === 'value' ? (
                <>
                  <CheckIcon className="w-4 h-4 text-accent" />
                  Copied!
                </>
              ) : (
                <>
                  <CopyIcon className="w-4 h-4 text-zinc-400" />
                  Copy "{contextMenu.cellKey}" value
                </>
              )}
            </button>
          )}
          {/* Document-level copy options */}
          <button
            role="menuitem"
            className={`context-menu-item w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
              copiedField === 'json' ? 'text-accent bg-accent/10' : 'text-zinc-200 hover:bg-zinc-700'
            }`}
            onClick={handleCopyDocumentJson}
            disabled={copiedField !== null}
          >
            {copiedField === 'json' ? (
              <>
                <CheckIcon className="w-4 h-4 text-accent" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4 text-zinc-400" />
                Copy Document JSON
              </>
            )}
          </button>
          {/* Separator */}
          <div className="border-t border-zinc-700 my-1" />
          {/* Document comparison */}
          {onCompareSource && !compareSourceDoc && (
            <button
              role="menuitem"
              className="context-menu-item w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
              onClick={() => {
                onCompareSource(contextMenu.doc)
                setContextMenu(null)
              }}
            >
              <CompareIcon className="w-4 h-4 text-zinc-400" />
              Compare with...
            </button>
          )}
          {onCompareTo && compareSourceDoc && getDocId(compareSourceDoc) !== getDocId(contextMenu.doc) && (
            <button
              role="menuitem"
              className="context-menu-item w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
              onClick={() => {
                onCompareTo(contextMenu.doc)
                setContextMenu(null)
              }}
            >
              <CompareIcon className="w-4 h-4 text-zinc-400" />
              Compare to source
            </button>
          )}
          {compareSourceDoc && (
            <button
              role="menuitem"
              className="context-menu-item w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-700 flex items-center gap-2"
              onClick={() => {
                onCompareSource(null)
                setContextMenu(null)
              }}
            >
              <CloseIcon className="w-4 h-4" />
              Clear comparison source
            </button>
          )}
          {(onCompareSource || onCompareTo) && <div className="border-t border-zinc-700 my-1" />}
          {/* Document actions */}
          <button
            role="menuitem"
            className={`context-menu-item w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${readOnly ? 'text-zinc-500 cursor-not-allowed' : 'text-zinc-200 hover:bg-zinc-700'}`}
            onClick={handleEdit}
            disabled={readOnly}
          >
            <EditIcon className="w-4 h-4 text-zinc-400" />
            {readOnly ? 'View Document' : 'Edit Document'}
          </button>
          <button
            role="menuitem"
            className={`context-menu-item w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${readOnly ? 'text-zinc-500 cursor-not-allowed' : 'text-red-400 hover:bg-zinc-700'}`}
            onClick={handleDelete}
            disabled={readOnly}
          >
            <TrashIcon className="w-4 h-4" />
            Delete Document
          </button>
        </div>
      )}

      {/* Header Context Menu (Column Freeze) */}
      {headerContextMenu && (
        <div
          ref={headerMenuRef}
          role="menu"
          aria-label="Column actions"
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{
            left: headerContextMenu.x,
            top: headerContextMenu.y,
          }}
        >
          <button
            role="menuitem"
            className="context-menu-item w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
            onClick={() => {
              toggleFreezeColumn(headerContextMenu.column)
              setHeaderContextMenu(null)
            }}
          >
            {frozenColumns.has(headerContextMenu.column) ? (
              <>
                <UnfreezeIcon className="w-4 h-4 text-zinc-400" />
                Unfreeze Column
              </>
            ) : (
              <>
                <FreezeIcon className="w-4 h-4 text-zinc-400" />
                Freeze Column
              </>
            )}
          </button>
          {frozenColumnsList.length > 1 && (
            <>
              <div className="border-t border-zinc-700 my-1" />
              <button
                role="menuitem"
                className="context-menu-item w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-700 flex items-center gap-2"
                onClick={() => {
                  setFrozenColumns(new Set())
                  saveFrozenColumns(connectionId, database, collection, new Set())
                  setHeaderContextMenu(null)
                }}
              >
                <UnfreezeIcon className="w-4 h-4" />
                Unfreeze All Columns
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
