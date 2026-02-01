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

export default function TableView({
  documents,
  onEdit,
  onDelete,
  selectedIds = new Set(),
  onSelectionChange = () => {}
}) {
  const [expandedColumns, setExpandedColumns] = useState(new Set())
  const columns = useMemo(() => extractColumns(documents, expandedColumns), [documents, expandedColumns])
  const [contextMenu, setContextMenu] = useState(null) // { x, y, doc, cellValue, cellKey }
  const [copiedField, setCopiedField] = useState(null) // 'value' | 'json' - tracks which item was just copied
  const menuRef = useRef(null)
  const headerCheckboxRef = useRef(null)

  // Column resizing state
  const [columnWidths, setColumnWidths] = useState({})
  const resizingRef = useRef(null) // { column, startX, startWidth }

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

  if (documents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        No documents to display
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="text-sm table-fixed" role="grid" aria-label="Documents table">
        <thead className="bg-surface-secondary sticky top-0 z-10">
          <tr role="row">
            {/* Checkbox column header */}
            <th scope="col" className="px-3 py-2 w-10 border-b border-border">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={selectionState === 'all'}
                onChange={toggleAllSelection}
                aria-label={selectionState === 'all' ? 'Deselect all documents' : 'Select all documents'}
                title={selectionState === 'all' ? 'Deselect all' : 'Select all'}
              />
            </th>
            {columns.map(col => {
              const canExpand = columnHasExpandableObjects(documents, col)
              const isExpanded = isColumnExpanded(col)
              const isSub = isSubColumn(col)
              const displayName = isSub ? col.split('.').pop() : col
              const parentCol = isSub ? getParentColumn(col) : null

              return (
              <th
                key={col}
                scope="col"
                className={`px-3 py-2 text-left font-medium text-zinc-400 border-b border-border whitespace-nowrap relative group ${isSub ? 'bg-zinc-800/30' : ''}`}
                style={{ width: columnWidths[col] || 150, minWidth: 60 }}
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
        <tbody>
          {documents.map((doc, idx) => {
            const docId = getDocId(doc)
            const isSelected = docId && selectedIds.has(docId)
            return (
              <tr
                key={docId || idx}
                className={`table-row border-b border-zinc-800 ${
                  isSelected
                    ? 'bg-accent/10 hover:bg-accent/20'
                    : 'hover:bg-zinc-800/50'
                }`}
                onContextMenu={(e) => handleContextMenu(e, doc)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (onEdit) onEdit(doc)
                  } else if (e.key === ' ') {
                    e.preventDefault()
                    if (docId) toggleSelection(docId)
                  }
                }}
              >
                {/* Row checkbox */}
                <td className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => docId && toggleSelection(docId)}
                    disabled={!docId}
                    aria-label={`Select document ${docId || idx + 1}`}
                  />
                </td>
                {columns.map(col => {
                  const cellValue = getNestedValue(doc, col)
                  const isSub = isSubColumn(col)
                  return (
                  <td
                    key={col}
                    className={`px-3 py-2 whitespace-nowrap truncate cursor-context-menu ${isSub ? 'bg-zinc-800/20' : ''}`}
                    style={{ width: columnWidths[col] || 150, maxWidth: columnWidths[col] || 150 }}
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
          {/* Document actions */}
          <button
            role="menuitem"
            className="context-menu-item w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
            onClick={handleEdit}
          >
            <EditIcon className="w-4 h-4 text-zinc-400" />
            Edit Document
          </button>
          <button
            role="menuitem"
            className="context-menu-item w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-700 flex items-center gap-2"
            onClick={handleDelete}
          >
            <TrashIcon className="w-4 h-4" />
            Delete Document
          </button>
        </div>
      )}
    </div>
  )
}
