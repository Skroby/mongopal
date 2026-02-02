import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNotification } from './NotificationContext'
import { useConnection } from './contexts/ConnectionContext'
import { useTab } from './contexts/TabContext'
import ConfirmDialog from './ConfirmDialog'
import { getErrorSummary } from '../utils/errorParser'

const go = window.go?.main?.App

// Hook for managing tree keyboard navigation
// Accepts external focusedNodeId for synchronization with click-based focus
function useTreeKeyboardNavigation(treeRef, visibleNodes, onNodeAction, externalFocusedNodeId, setExternalFocusedNodeId) {
  // Use external state if provided, otherwise use internal state
  const [internalFocusedNodeId, setInternalFocusedNodeId] = useState(null)
  const focusedNodeId = externalFocusedNodeId !== undefined ? externalFocusedNodeId : internalFocusedNodeId
  const setFocusedNodeId = setExternalFocusedNodeId || setInternalFocusedNodeId

  // Find index of currently focused node
  const focusedIndex = useMemo(() => {
    if (!focusedNodeId) return -1
    return visibleNodes.findIndex(n => n.id === focusedNodeId)
  }, [focusedNodeId, visibleNodes])

  // Focus a node by index
  const focusNodeByIndex = useCallback((index) => {
    if (index >= 0 && index < visibleNodes.length) {
      const node = visibleNodes[index]
      setFocusedNodeId(node.id)
      // Focus the DOM element
      const element = treeRef.current?.querySelector(`[data-node-id="${node.id}"]`)
      element?.focus()
    }
  }, [visibleNodes, treeRef])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (visibleNodes.length === 0) return

    const currentIndex = focusedIndex >= 0 ? focusedIndex : 0
    const currentNode = visibleNodes[currentIndex]

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focusNodeByIndex(Math.min(currentIndex + 1, visibleNodes.length - 1))
        break

      case 'ArrowUp':
        e.preventDefault()
        focusNodeByIndex(Math.max(currentIndex - 1, 0))
        break

      case 'ArrowRight':
        e.preventDefault()
        if (currentNode) {
          if (currentNode.hasChildren && !currentNode.expanded) {
            // Expand the node
            onNodeAction(currentNode, 'expand')
          } else if (currentNode.hasChildren && currentNode.expanded) {
            // Move to first child
            focusNodeByIndex(currentIndex + 1)
          }
        }
        break

      case 'ArrowLeft':
        e.preventDefault()
        if (currentNode) {
          if (currentNode.hasChildren && currentNode.expanded) {
            // Collapse the node
            onNodeAction(currentNode, 'collapse')
          } else if (currentNode.parentId) {
            // Move to parent
            const parentIndex = visibleNodes.findIndex(n => n.id === currentNode.parentId)
            if (parentIndex >= 0) {
              focusNodeByIndex(parentIndex)
            }
          }
        }
        break

      case 'Enter':
      case ' ':
        e.preventDefault()
        if (currentNode) {
          onNodeAction(currentNode, 'activate')
        }
        break

      case 'Home':
        e.preventDefault()
        focusNodeByIndex(0)
        break

      case 'End':
        e.preventDefault()
        focusNodeByIndex(visibleNodes.length - 1)
        break

      default:
        break
    }
  }, [focusedIndex, visibleNodes, focusNodeByIndex, onNodeAction])

  return {
    focusedNodeId,
    setFocusedNodeId,
    handleKeyDown,
  }
}

// Icons as simple SVG components
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

const DatabaseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
)

const CollectionIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
)

const ServerIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
)

const LockIcon = ({ className = "w-3 h-3" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
)

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const FolderIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const SearchIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const DisconnectIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
  </svg>
)

// Context Menu Component
function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedStyle = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  }

  return (
    <div
      ref={menuRef}
      className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={adjustedStyle}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={idx} className="border-t border-zinc-700 my-1" />
        }
        return (
          <button
            key={idx}
            className={`context-menu-item w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
              ${item.danger ? 'text-red-400 hover:bg-red-900/30' : ''}
              ${item.disabled
                ? 'text-zinc-600 cursor-not-allowed'
                : item.danger ? '' : 'text-zinc-200 hover:bg-zinc-700'}`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.()
                onClose()
              }
            }}
            disabled={item.disabled}
          >
            {item.label}
            {item.shortcut && (
              <span className="ml-auto text-xs text-zinc-500">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function TreeNode({
  label,
  icon,
  count,
  expanded,
  onToggle,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
  children,
  level = 0,
  color,
  connectionStatus, // 'connected' | 'connecting' | 'disconnected' | undefined
  statusTooltip, // Custom tooltip text for status indicator
  // Keyboard navigation props
  nodeId,
  isFocused,
  onFocus,
  setSize,
  posInSet,
  // Drag props - the row itself can be draggable
  draggable,
  onDragStart,
  onDragEnd,
  // Drop target props - the row can be a drop target
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
}) {
  const nodeRef = useRef(null)
  // Check for children - handle arrays, fragments, and single elements
  const hasChildren = children && (Array.isArray(children) ? children.length > 0 : React.Children.count(children) > 0)
  // Show chevron if there are children OR if onToggle is provided (for folders that render children externally)
  const showChevron = hasChildren || onToggle

  // Determine status dot style - only for connection nodes
  const getStatusDot = () => {
    // Only show status dot for connection nodes
    if (!connectionStatus) {
      return null
    }

    // Connection node - show status indicator with helpful tooltips
    if (connectionStatus === 'connected') {
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500"
          title={statusTooltip || "Connected - Right-click for options"}
        />
      )
    } else if (connectionStatus === 'connecting') {
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500 animate-pulse"
          title={statusTooltip || "Connecting... Please wait"}
        />
      )
    } else {
      // Disconnected - show empty circle
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 border border-zinc-500"
          title={statusTooltip || "Disconnected - Click to connect"}
        />
      )
    }
  }

  const handleClick = (e) => {
    onFocus?.()
    onClick?.(e)
  }

  const handleKeyDown = (e) => {
    // Prevent default for navigation keys - let parent tree handle them
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
      // Don't call stopPropagation - let it bubble to tree container
      return
    }
  }

  // Drop target handlers - only add if this is a drop target
  const dropProps = isDropTarget ? {
    onDragOver,
    onDragLeave,
    onDrop,
  } : {}

  return (
    <div>
      <div
        ref={nodeRef}
        tabIndex={isFocused ? 0 : -1}
        data-node-id={nodeId}
        data-expanded={hasChildren ? expanded : undefined}
        data-selected={selected}
        data-level={level + 1}
        className={`tree-item ${selected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocus?.()}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        {...dropProps}
      >
        {showChevron ? (
          <button
            className="icon-btn p-0.5 hover:bg-zinc-600 rounded flex-shrink-0"
            tabIndex={-1}
            aria-hidden="true"
            draggable="false"
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.()
            }}
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" aria-hidden="true" />
        )}
        {getStatusDot()}
        <span
          className="flex-shrink-0"
          style={{ color: color || '#a1a1aa' }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="flex-1 truncate text-sm">{label}</span>
        {count !== undefined && (
          <span className="text-xs text-zinc-400 flex-shrink-0" aria-label={`${count} documents`}>({count})</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>{children}</div>
      )}
    </div>
  )
}

function ConnectionNode({
  connection,
  isConnected,
  isConnecting,
  databases,
  activeConnections,
  selectedItem,
  onConnect,
  onDisconnect,
  onDisconnectOthers,
  onSelectDatabase,
  onSelectCollection,
  onOpenCollection,
  onEdit,
  onDelete,
  onDuplicate,
  onCopyURI,
  onRefresh,
  onShowContextMenu,
  onDropDatabase,
  onDropCollection,
  onClearCollection,
  onViewSchema,
  onShowStats,
  onManageIndexes,
  onExportDatabases,
  onImportDatabases,
  onExportCollections,
  onImportCollections,
  onError,
  // Keyboard navigation props
  focusedNodeId,
  onNodeFocus,
  setSize,
  posInSet,
  // Expansion state lifted to Sidebar for keyboard nav
  expandedConnections,
  setExpandedConnections,
  expandedDatabases,
  setExpandedDatabases,
  onCollectionsLoaded,
  // Drag and drop
  onDragStart,
  onDragEnd,
  // Indentation level (0 for root, 1 for inside folder)
  level = 0,
}) {
  // Use parent-controlled expansion state for keyboard navigation synchronization
  const expanded = expandedConnections?.[connection.id] ?? false
  const setExpanded = (value) => {
    const newValue = typeof value === 'function' ? value(expanded) : value
    setExpandedConnections?.(prev => ({ ...prev, [connection.id]: newValue }))
  }

  // Database expansion uses parent state with connection-scoped keys
  const getDbExpanded = (dbName) => expandedDatabases?.[`${connection.id}:${dbName}`] ?? false
  const setDbExpanded = (dbName, value) => {
    const key = `${connection.id}:${dbName}`
    const newValue = typeof value === 'function' ? value(getDbExpanded(dbName)) : value
    setExpandedDatabases?.(prev => ({ ...prev, [key]: newValue }))
  }

  const [dbData, setDbData] = useState({})
  const [loading, setLoading] = useState(false)

  // Helper to remove a collection from local state
  const removeCollection = (dbName, collName) => {
    setDbData(prev => {
      const dbEntry = prev[dbName]
      if (!dbEntry?.collections) return prev
      return {
        ...prev,
        [dbName]: {
          ...dbEntry,
          collections: dbEntry.collections.filter(c => c.name !== collName)
        }
      }
    })
  }

  // Helper to remove a database from local state
  const removeDatabase = (dbName) => {
    setDbExpanded(dbName, false)
    setDbData(prev => {
      const { [dbName]: _, ...rest } = prev
      return rest
    })
  }

  useEffect(() => {
    if (expanded && isConnected && databases.length === 0) {
      loadDatabases()
    }
  }, [expanded, isConnected])

  // Auto-collapse when disconnected
  useEffect(() => {
    if (!isConnected && expanded) {
      setExpanded(false)
    }
  }, [isConnected])

  const loadDatabases = async () => {
    if (!go?.ListDatabases) return
    setLoading(true)
    try {
      await go.ListDatabases(connection.id)
    } catch (err) {
      console.error('Failed to load databases:', err)
      onError?.(`Failed to load databases: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const loadCollections = async (dbName, forceRefresh = false) => {
    if (!go?.ListCollections) return
    if (!forceRefresh && dbData[dbName]?.collections) return
    try {
      const collections = await go.ListCollections(connection.id, dbName)
      setDbData(prev => ({
        ...prev,
        [dbName]: { ...prev[dbName], collections }
      }))
      // Notify parent for keyboard navigation
      onCollectionsLoaded?.(dbName, collections)
    } catch (err) {
      console.error('Failed to load collections:', err)
      onError?.(`Failed to load collections: ${err?.message || String(err)}`)
    }
  }

  const toggleDatabase = (dbName) => {
    const wasExpanded = getDbExpanded(dbName)
    setDbExpanded(dbName, !wasExpanded)
    if (!wasExpanded) {
      loadCollections(dbName)
    }
  }

  // Load collections when a database is expanded externally (e.g., via keyboard navigation)
  useEffect(() => {
    if (!isConnected) return
    databases.forEach(db => {
      const isExpanded = getDbExpanded(db.name)
      const hasCollections = dbData[db.name]?.collections
      if (isExpanded && !hasCollections) {
        loadCollections(db.name)
      }
    })
  }, [expandedDatabases, isConnected, databases])

  const handleContextMenu = (e) => {
    e.preventDefault()
    const hasOtherConnections = activeConnections.length > 1

    const items = isConnected
      ? [
          { label: 'Refresh', onClick: onRefresh },
          { type: 'separator' },
          { label: 'Export Databases...', onClick: onExportDatabases },
          { label: 'Import Databases...', onClick: onImportDatabases },
          { type: 'separator' },
          { label: 'Copy Connection URI', onClick: onCopyURI },
          { label: 'Edit Connection...', onClick: onEdit },
          { label: 'Duplicate Connection', onClick: onDuplicate },
          { type: 'separator' },
          { label: 'Disconnect', onClick: () => onDisconnect(connection.id) },
          ...(hasOtherConnections ? [{ label: 'Disconnect Others', onClick: () => onDisconnectOthers(connection.id) }] : []),
          { type: 'separator' },
          { label: 'Delete Connection', onClick: onDelete, danger: true },
        ]
      : isConnecting
      ? [
          { label: 'Connecting...', disabled: true },
          { type: 'separator' },
          { label: 'Copy Connection URI', onClick: onCopyURI },
          { label: 'Edit Connection...', onClick: onEdit, disabled: true },
        ]
      : [
          { label: 'Connect', onClick: () => onConnect(connection.id) },
          { type: 'separator' },
          { label: 'Copy Connection URI', onClick: onCopyURI },
          { label: 'Edit Connection...', onClick: onEdit },
          { label: 'Duplicate Connection', onClick: onDuplicate },
          { type: 'separator' },
          { label: 'Delete Connection', onClick: onDelete, danger: true },
        ]
    onShowContextMenu(e.clientX, e.clientY, items)
  }

  const handleDatabaseContextMenu = (e, dbName) => {
    e.preventDefault()
    e.stopPropagation()
    const isReadOnly = connection.readOnly
    const items = [
      { label: 'Refresh Collections', onClick: () => {
        loadCollections(dbName, true) // Force refresh
      }},
      { type: 'separator' },
      { label: 'Export Collections...', onClick: () => onExportCollections?.(dbName) },
    ]
    // Only show import and drop options for non-read-only connections
    if (!isReadOnly) {
      items.push(
        { label: 'Import Collections...', onClick: () => onImportCollections?.(dbName) },
        { type: 'separator' },
        { label: 'Drop Database...', onClick: () => onDropDatabase(connection.id, dbName, removeDatabase), danger: true },
      )
    }
    onShowContextMenu(e.clientX, e.clientY, items)
  }

  const handleCollectionContextMenu = (e, dbName, collName) => {
    e.preventDefault()
    e.stopPropagation()
    const isReadOnly = connection.readOnly
    const items = [
      { label: 'Open Collection', onClick: () => onOpenCollection(connection.id, dbName, collName) },
      { label: 'View Schema...', onClick: () => onViewSchema(connection.id, dbName, collName) },
      { type: 'separator' },
      { label: 'Show Stats...', onClick: () => onShowStats?.(connection.id, dbName, collName) },
      { label: 'Manage Indexes...', onClick: () => onManageIndexes?.(connection.id, dbName, collName) },
    ]
    // Only show destructive options for non-read-only connections
    if (!isReadOnly) {
      items.push(
        { type: 'separator' },
        { label: 'Clear Collection...', onClick: () => onClearCollection(connection.id, dbName, collName), danger: true },
        { label: 'Drop Collection...', onClick: () => onDropCollection(connection.id, dbName, collName, removeCollection), danger: true },
      )
    }
    onShowContextMenu(e.clientX, e.clientY, items)
  }

  const getLabel = () => {
    const ReadOnlyBadge = connection.readOnly ? (
      <span className="inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-900/40 text-amber-400 border border-amber-800/50" title="Read-only connection - write operations disabled">
        <LockIcon className="w-2.5 h-2.5" />
        <span>Read-Only</span>
      </span>
    ) : null
    if (isConnecting) return <>{connection.name}{ReadOnlyBadge} <span className="text-zinc-500">[connecting...]</span></>
    if (isConnected) return <>{connection.name}{ReadOnlyBadge}</>
    return <>{connection.name}{ReadOnlyBadge}</>
  }

  const connectionStatus = isConnecting ? 'connecting' : isConnected ? 'connected' : 'disconnected'

  // Generate helpful tooltip based on connection status
  const getStatusTooltip = () => {
    if (isConnecting) {
      return `Connecting to ${connection.name}... Please wait`
    }
    if (isConnected) {
      const dbCount = databases.length
      if (dbCount > 0) {
        return `Connected to ${connection.name} (${dbCount} database${dbCount !== 1 ? 's' : ''}) - Right-click for options`
      }
      return `Connected to ${connection.name} - Right-click for options`
    }
    return `Disconnected - Click to connect to ${connection.name}`
  }

  // Node IDs for keyboard navigation
  const connectionNodeId = `conn:${connection.id}`

  // Drag handlers for connection row
  const handleRowDragStart = (e) => {
    e.dataTransfer.setData('application/x-mongopal-connection', connection.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(connection.id)
  }

  const handleRowDragEnd = () => {
    onDragEnd?.()
  }

  return (
    <TreeNode
      label={getLabel()}
      icon={<ServerIcon />}
      color={connection.color}
      connectionStatus={connectionStatus}
      statusTooltip={getStatusTooltip()}
      level={level}
      expanded={expanded}
      onToggle={() => {
        // Auto-connect when expanding via chevron if not connected
        if (!expanded && !isConnected && !isConnecting) {
          onConnect(connection.id)
        }
        setExpanded(!expanded)
      }}
      onClick={() => {
        if (!isConnected && !isConnecting) {
          onConnect(connection.id)
        }
        setExpanded(!expanded)
      }}
      onContextMenu={handleContextMenu}
      nodeId={connectionNodeId}
      isFocused={focusedNodeId === connectionNodeId}
      onFocus={() => onNodeFocus?.(connectionNodeId)}
      setSize={setSize}
      posInSet={posInSet}
      draggable={true}
      onDragStart={handleRowDragStart}
      onDragEnd={handleRowDragEnd}
    >
      {isConnected ? (
        databases.map((db, dbIndex) => {
          const dbNodeId = `db:${connection.id}:${db.name}`
          const collections = dbData[db.name]?.collections || []
          return (
            <TreeNode
              key={db.name}
              label={db.name}
              icon={<DatabaseIcon />}
              color={connection.color}
              level={level + 1}
              expanded={getDbExpanded(db.name)}
              onToggle={() => toggleDatabase(db.name)}
              onClick={() => {
                onSelectDatabase(db.name)
                toggleDatabase(db.name)
              }}
              onContextMenu={(e) => handleDatabaseContextMenu(e, db.name)}
              nodeId={dbNodeId}
              isFocused={focusedNodeId === dbNodeId}
              onFocus={() => onNodeFocus?.(dbNodeId)}
              setSize={databases.length}
              posInSet={dbIndex + 1}
            >
              {collections.map((coll, collIndex) => {
                const itemKey = `${connection.id}:${db.name}:${coll.name}`
                const collNodeId = `coll:${connection.id}:${db.name}:${coll.name}`
                return (
                  <TreeNode
                    key={coll.name}
                    label={coll.name}
                    icon={<CollectionIcon />}
                    color={connection.color}
                    count={coll.count}
                    level={level + 2}
                    selected={selectedItem === itemKey}
                    onClick={() => onSelectCollection(connection.id, db.name, coll.name)}
                    onDoubleClick={() => onOpenCollection(connection.id, db.name, coll.name)}
                    onContextMenu={(e) => handleCollectionContextMenu(e, db.name, coll.name)}
                    nodeId={collNodeId}
                    isFocused={focusedNodeId === collNodeId}
                    onFocus={() => onNodeFocus?.(collNodeId)}
                    setSize={collections.length}
                    posInSet={collIndex + 1}
                  />
                )
              })}
            </TreeNode>
          )
        })
      ) : null}
    </TreeNode>
  )
}

// FolderNode component - matches ConnectionNode structure to ensure consistent drag behavior
function FolderNode({
  folder,
  level = 0,
  childFolders,
  folderConnections,
  expanded,
  onToggle,
  onContextMenu,
  // Keyboard navigation
  focusedNodeId,
  onNodeFocus,
  setSize,
  posInSet,
  // Drag source (for dragging this folder)
  onDragStart,
  onDragEnd,
  // Drop target (for dropping items INTO this folder)
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  // Render functions for children
  renderFolderNode,
  renderConnectionNode,
}) {
  const folderNodeId = `folder:${folder.id}`

  // Drag handlers for folder row
  // NOTE: State update is deferred to avoid React re-render during drag initiation (WebKit quirk)
  const handleRowDragStart = (e) => {
    e.dataTransfer.setData('application/x-mongopal-folder', folder.id)
    e.dataTransfer.effectAllowed = 'move'
    // Defer state update to next tick so drag can start before re-render
    setTimeout(() => onDragStart?.(folder.id), 0)
  }

  const handleRowDragEnd = () => {
    onDragEnd?.()
  }

  return (
    <TreeNode
      label={folder.name}
      icon={<FolderIcon />}
      level={level}
      expanded={expanded}
      onToggle={onToggle}
      onContextMenu={onContextMenu}
      nodeId={folderNodeId}
      isFocused={focusedNodeId === folderNodeId}
      onFocus={() => onNodeFocus?.(folderNodeId)}
      setSize={setSize}
      posInSet={posInSet}
      draggable={true}
      onDragStart={handleRowDragStart}
      onDragEnd={handleRowDragEnd}
      isDropTarget={true}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      isDragOver={isDragOver}
    >
      {expanded && (childFolders.length > 0 || folderConnections.length > 0) && (
        <>
          {childFolders.map((childFolder, childIndex) =>
            renderFolderNode(childFolder, childIndex, childFolders.length + folderConnections.length, level + 1)
          )}
          {folderConnections.map((conn, connIndex) =>
            renderConnectionNode(conn, childFolders.length + connIndex, childFolders.length + folderConnections.length, level + 1)
          )}
        </>
      )}
    </TreeNode>
  )
}

export default function Sidebar({
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
  onExportDatabases,
  onImportDatabases,
  onExportCollections,
  onImportCollections,
  onShowStats,
  onManageIndexes,
}) {
  const { notify } = useNotification()
  const {
    connections,
    folders,
    activeConnections,
    isConnecting,
    connect,
    disconnect,
    disconnectAll,
    disconnectOthers,
    setSelectedDatabase,
    setSelectedCollection,
    duplicateConnection,
    refreshConnection,
    dropDatabase,
    dropCollection,
    clearCollection,
    createFolder,
    deleteFolder,
    moveConnectionToFolder,
    moveFolderToFolder,
    loadConnections,
  } = useConnection()

  const {
    openTab,
    openSchemaTab,
    closeTabsForConnection,
    closeTabsForDatabase,
    closeTabsForCollection,
    closeAllTabs,
    keepOnlyConnectionTabs,
  } = useTab()

  const [searchQuery, setSearchQuery] = useState('')
  const [databases, setDatabases] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState({})
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')
  const [selectedItem, setSelectedItem] = useState(null) // Track selected sidebar item
  const [draggingConnectionId, setDraggingConnectionId] = useState(null)
  const [draggingFolderId, setDraggingFolderId] = useState(null)
  const draggingFolderIdRef = useRef(null) // Ref for synchronous access in drag handlers
  const [dragOverFolderId, setDragOverFolderId] = useState(null) // null means root, 'root' used for indication
  const [newSubfolderParentId, setNewSubfolderParentId] = useState(null) // For creating subfolder

  // State for keyboard navigation - track expanded state at Sidebar level
  const [expandedConnections, setExpandedConnections] = useState({})
  const [expandedDatabases, setExpandedDatabases] = useState({})
  const [focusedNodeId, setFocusedNodeId] = useState(null)
  const treeRef = useRef(null)

  // Track collections for keyboard navigation (keyed by "connId:dbName")
  const [collectionsMap, setCollectionsMap] = useState({})

  // Build folder tree structure and helpers
  const folderHelpers = useMemo(() => {
    // Sort folders alphabetically (case-insensitive)
    const sortFolders = (folderList) =>
      [...folderList].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    // Get root folders (no parent), sorted alphabetically
    const rootFolders = sortFolders(folders.filter(f => !f.parentId))

    // Get child folders for a given parent, sorted alphabetically
    const getChildFolders = (parentId) => sortFolders(folders.filter(f => f.parentId === parentId))

    // Get all descendant folder IDs (for preventing circular drops)
    const getDescendantIds = (folderId, visited = new Set()) => {
      if (visited.has(folderId)) return []
      visited.add(folderId)
      const children = getChildFolders(folderId)
      let descendants = children.map(c => c.id)
      children.forEach(child => {
        descendants = [...descendants, ...getDescendantIds(child.id, visited)]
      })
      return descendants
    }

    // Calculate folder depth
    const getFolderDepth = (folderId, depth = 0) => {
      const folder = folders.find(f => f.id === folderId)
      if (!folder || !folder.parentId) return depth
      return getFolderDepth(folder.parentId, depth + 1)
    }

    return { rootFolders, getChildFolders, getDescendantIds, getFolderDepth }
  }, [folders])

  useEffect(() => {
    activeConnections.forEach(connId => {
      if (!databases[connId] && go?.ListDatabases) {
        go.ListDatabases(connId).then(dbs => {
          setDatabases(prev => ({ ...prev, [connId]: dbs }))
        }).catch(console.error)
      }
    })
  }, [activeConnections])


  const filteredConnections = connections.filter(conn =>
    conn.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort connections by last accessed date (most recent first), then by name
  const sortConnections = (connList) =>
    [...connList].sort((a, b) => {
      // Most recently accessed first
      const aTime = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
      const bTime = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
      if (aTime !== bTime) return bTime - aTime
      // Fall back to alphabetical by name
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

  // Group connections by folder - must be before visibleNodes useMemo
  const rootConnections = sortConnections(filteredConnections.filter(c => !c.folderId))
  const connectionsByFolder = useMemo(() => {
    const byFolder = {}
    filteredConnections.forEach(conn => {
      if (conn.folderId) {
        if (!byFolder[conn.folderId]) {
          byFolder[conn.folderId] = []
        }
        byFolder[conn.folderId].push(conn)
      }
    })
    // Sort connections within each folder
    Object.keys(byFolder).forEach(folderId => {
      byFolder[folderId] = sortConnections(byFolder[folderId])
    })
    return byFolder
  }, [filteredConnections])

  // Build flat list of visible nodes for keyboard navigation
  const visibleNodes = useMemo(() => {
    const nodes = []

    // Get child folders for a parent, sorted alphabetically
    const getChildFolders = (parentId) =>
      folders.filter(f => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    // Helper to add folder nodes (recursive)
    const addFolder = (folder, index, totalSiblings, parentNodeId = null) => {
      const folderNodeId = `folder:${folder.id}`
      const isExpanded = expandedFolders[folder.id]
      const folderConnections = connectionsByFolder[folder.id] || []
      const childFolders = getChildFolders(folder.id)
      const hasChildren = folderConnections.length > 0 || childFolders.length > 0

      nodes.push({
        id: folderNodeId,
        type: 'folder',
        folderId: folder.id,
        folderName: folder.name,
        hasChildren,
        expanded: isExpanded,
        parentId: parentNodeId,
      })

      if (isExpanded) {
        // Add child folders first
        childFolders.forEach((childFolder, childIndex) => {
          addFolder(childFolder, childIndex, childFolders.length + folderConnections.length, folderNodeId)
        })
        // Then add connections
        folderConnections.forEach((conn, connIndex) => {
          addConnection(conn, childFolders.length + connIndex, childFolders.length + folderConnections.length, folderNodeId)
        })
      }
    }

    // Helper to add connection nodes and their children
    const addConnection = (conn, index, totalConnections, parentId = null) => {
      const connNodeId = `conn:${conn.id}`
      const isConnected = activeConnections.includes(conn.id)
      const connDatabases = databases[conn.id] || []
      const isExpanded = expandedConnections[conn.id]

      nodes.push({
        id: connNodeId,
        type: 'connection',
        connectionId: conn.id,
        connectionName: conn.name,
        hasChildren: isConnected && connDatabases.length > 0,
        expanded: isExpanded,
        parentId,
        isConnected,
      })

      if (isExpanded && isConnected) {
        connDatabases.forEach((db, dbIndex) => {
          addDatabase(conn.id, db, dbIndex, connDatabases.length, connNodeId)
        })
      }
    }

    // Helper to add database nodes and their children
    const addDatabase = (connId, db, index, totalDbs, parentId) => {
      const dbNodeId = `db:${connId}:${db.name}`
      const dbExpandKey = `${connId}:${db.name}`
      const isExpanded = expandedDatabases[dbExpandKey]
      const collections = collectionsMap[dbExpandKey] || []
      const hasCollections = collections.length > 0

      nodes.push({
        id: dbNodeId,
        type: 'database',
        connectionId: connId,
        databaseName: db.name,
        hasChildren: hasCollections || true, // Assume it could have collections even if not loaded
        expanded: isExpanded,
        parentId,
      })

      // Add collection nodes when database is expanded
      if (isExpanded && collections.length > 0) {
        collections.forEach((coll) => {
          const collNodeId = `coll:${connId}:${db.name}:${coll.name}`
          nodes.push({
            id: collNodeId,
            type: 'collection',
            connectionId: connId,
            databaseName: db.name,
            collectionName: coll.name,
            hasChildren: false,
            expanded: false,
            parentId: dbNodeId,
          })
        })
      }
    }

    // Process only root folders (those without parentId)
    const rootFolders = folders.filter(f => !f.parentId)
    rootFolders.forEach((folder, idx) => addFolder(folder, idx, rootFolders.length + rootConnections.length))

    // Process root connections
    rootConnections.forEach((conn, idx) => addConnection(conn, rootFolders.length + idx, rootFolders.length + rootConnections.length))

    return nodes
  }, [
    folders,
    rootConnections,
    connectionsByFolder,
    activeConnections,
    databases,
    expandedFolders,
    expandedConnections,
    expandedDatabases,
    collectionsMap,
  ])

  // Handle keyboard navigation actions
  const handleNodeAction = useCallback((node, action) => {
    if (!node) return

    switch (action) {
      case 'expand':
        if (node.type === 'folder') {
          setExpandedFolders(prev => ({ ...prev, [node.folderId]: true }))
        } else if (node.type === 'connection') {
          setExpandedConnections(prev => ({ ...prev, [node.connectionId]: true }))
          if (!node.isConnected) {
            connect(node.connectionId)
          }
        } else if (node.type === 'database') {
          setExpandedDatabases(prev => ({ ...prev, [`${node.connectionId}:${node.databaseName}`]: true }))
        }
        break

      case 'collapse':
        if (node.type === 'folder') {
          setExpandedFolders(prev => ({ ...prev, [node.folderId]: false }))
        } else if (node.type === 'connection') {
          setExpandedConnections(prev => ({ ...prev, [node.connectionId]: false }))
        } else if (node.type === 'database') {
          setExpandedDatabases(prev => ({ ...prev, [`${node.connectionId}:${node.databaseName}`]: false }))
        }
        break

      case 'activate':
        if (node.type === 'folder') {
          setExpandedFolders(prev => ({ ...prev, [node.folderId]: !prev[node.folderId] }))
        } else if (node.type === 'connection') {
          if (!node.isConnected) {
            connect(node.connectionId)
          }
          setExpandedConnections(prev => ({ ...prev, [node.connectionId]: !prev[node.connectionId] }))
        } else if (node.type === 'database') {
          setExpandedDatabases(prev => ({ ...prev, [`${node.connectionId}:${node.databaseName}`]: !prev[`${node.connectionId}:${node.databaseName}`] }))
        } else if (node.type === 'collection') {
          // Open collection in tab
          openTab(node.connectionId, node.databaseName, node.collectionName)
        }
        break
    }
  }, [connect, openTab])

  // Use the keyboard navigation hook with external focus state for click synchronization
  const { handleKeyDown: handleTreeKeyDown } = useTreeKeyboardNavigation(
    treeRef,
    visibleNodes,
    handleNodeAction,
    focusedNodeId,
    setFocusedNodeId
  )

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  const handleCreateFolder = async (parentId = '') => {
    if (!newFolderName.trim()) return
    try {
      await createFolder(newFolderName.trim(), parentId)
      setNewFolderName('')
      setShowNewFolderInput(false)
      setNewSubfolderParentId(null)
      notify.success('Folder created')
      // Auto-expand parent folder if creating subfolder
      if (parentId) {
        setExpandedFolders(prev => ({ ...prev, [parentId]: true }))
      }
    } catch (err) {
      notify.error(getErrorSummary(err?.message || String(err)))
    }
  }

  const handleDeleteFolder = async (folderId) => {
    try {
      await deleteFolder(folderId)
      notify.success('Folder deleted')
    } catch (err) {
      notify.error(getErrorSummary(err?.message || String(err)))
    }
  }

  const handleRenameFolder = async (folderId, newName) => {
    if (!newName.trim()) return
    try {
      const folder = folders.find(f => f.id === folderId)
      if (go?.UpdateFolder) {
        await go.UpdateFolder(folderId, newName.trim(), folder?.parentId || '')
        await loadConnections()
        notify.success('Folder renamed')
      }
    } catch (err) {
      notify.error(getErrorSummary(err?.message || String(err)))
    } finally {
      setRenamingFolderId(null)
      setRenameFolderValue('')
    }
  }

  // Drag and drop handlers - using drag handle approach
  // Only the grip icon is draggable, the row itself is just a drop target
  const handleConnectionDragStart = (connId) => {
    setDraggingConnectionId(connId)
  }

  const handleConnectionDragEnd = () => {
    setDraggingConnectionId(null)
    setDragOverFolderId(null)
  }

  const handleFolderDragStart = (folderId) => {
    draggingFolderIdRef.current = folderId
    setDraggingFolderId(folderId)
  }

  const handleFolderDragEnd = () => {
    draggingFolderIdRef.current = null
    setDraggingFolderId(null)
    setDragOverFolderId(null)
  }

  const handleFolderDragOver = (e, folderId) => {
    // CRITICAL: Always call preventDefault() first to keep drag operation alive in WebKit
    // NOT calling preventDefault() can silently cancel the entire drag operation
    e.preventDefault()
    e.stopPropagation()

    // Don't show drop indicator when dragging a folder over itself
    if (draggingFolderIdRef.current === folderId) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    // Can drop connection or folder onto this target
    if (draggingConnectionId || draggingFolderIdRef.current) {
      // Prevent dropping folder into itself or its descendants
      if (draggingFolderIdRef.current) {
        const descendants = folderHelpers.getDescendantIds(draggingFolderIdRef.current)
        if (descendants.includes(folderId)) {
          e.dataTransfer.dropEffect = 'none'
          return
        }
      }
      e.dataTransfer.dropEffect = 'move'
      setDragOverFolderId(folderId)
    }
  }

  const handleFolderDragLeave = (e) => {
    e.preventDefault()
    // Only clear if we're leaving the folder element entirely
    // (not just entering a child element)
    const relatedTarget = e.relatedTarget
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverFolderId(null)
    }
  }

  const handleFolderDrop = async (e, targetFolderId) => {
    e.preventDefault()
    e.stopPropagation()

    // Handle connection drop
    const connId = e.dataTransfer.getData('application/x-mongopal-connection')
    if (connId && connId !== '') {
      const conn = connections.find(c => c.id === connId)
      const targetId = targetFolderId || ''
      const currentFolderId = conn?.folderId || ''
      if (conn && currentFolderId !== targetId) {
        try {
          await moveConnectionToFolder(connId, targetId)
          const folderName = targetFolderId
            ? folders.find(f => f.id === targetFolderId)?.name || 'folder'
            : 'root'
          notify.success(`Moved connection to ${folderName}`)
        } catch (err) {
          notify.error(`Failed to move connection: ${err?.message || String(err)}`)
        }
      }
    }

    // Handle folder drop
    const sourceFolderId = e.dataTransfer.getData('application/x-mongopal-folder')
    if (sourceFolderId && sourceFolderId !== '') {
      const sourceFolder = folders.find(f => f.id === sourceFolderId)
      const targetId = targetFolderId || ''
      const currentParentId = sourceFolder?.parentId || ''

      // Prevent circular reference
      if (sourceFolderId === targetFolderId) {
        draggingFolderIdRef.current = null
        setDraggingFolderId(null)
        setDragOverFolderId(null)
        return
      }
      const descendants = folderHelpers.getDescendantIds(sourceFolderId)
      if (descendants.includes(targetFolderId)) {
        notify.warning('Cannot move folder into its own subfolder')
        draggingFolderIdRef.current = null
        setDraggingFolderId(null)
        setDragOverFolderId(null)
        return
      }

      if (sourceFolder && currentParentId !== targetId) {
        try {
          await moveFolderToFolder(sourceFolderId, targetId)
          const folderName = targetFolderId
            ? folders.find(f => f.id === targetFolderId)?.name || 'folder'
            : 'root'
          notify.success(`Moved folder to ${folderName}`)
        } catch (err) {
          notify.error(`Failed to move folder: ${err?.message || String(err)}`)
        }
      }
    }

    setDraggingConnectionId(null)
    draggingFolderIdRef.current = null
    setDraggingFolderId(null)
    setDragOverFolderId(null)
  }

  const showContextMenu = (x, y, items) => {
    setContextMenu({ x, y, items })
  }

  const handleCopyURI = async (conn) => {
    try {
      await navigator.clipboard.writeText(conn.uri)
      notify.success('Connection URI copied to clipboard')
    } catch (err) {
      console.error('Failed to copy URI:', err)
      notify.error('Failed to copy URI to clipboard')
    }
  }

  const handleDisconnect = async (connId) => {
    await disconnect(connId, closeTabsForConnection)
  }

  const handleDisconnectAll = async () => {
    await disconnectAll(closeAllTabs)
  }

  const handleDisconnectOthers = async (keepConnId) => {
    await disconnectOthers(keepConnId, keepOnlyConnectionTabs)
  }

  const handleDropDatabase = (connId, dbName, removeFromState) => {
    setConfirmDialog({
      title: `Drop Database "${dbName}"?`,
      message: `This will permanently delete the database "${dbName}" and ALL its collections. This action cannot be undone.`,
      confirmText: 'Drop Database',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await dropDatabase(connId, dbName)
          closeTabsForDatabase(connId, dbName)
          removeFromState?.(dbName) // Remove from ConnectionNode local state
          // Also remove from Sidebar's databases state
          setDatabases(prev => ({
            ...prev,
            [connId]: (prev[connId] || []).filter(db => db.name !== dbName)
          }))
          notify.success(`Database "${dbName}" dropped`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(getErrorSummary(err?.message || String(err)))
        }
      },
    })
  }

  const handleDropCollection = (connId, dbName, collName, removeFromState) => {
    setConfirmDialog({
      title: `Drop Collection "${collName}"?`,
      message: `This will permanently delete the collection "${collName}" and ALL its documents. This action cannot be undone.`,
      confirmText: 'Drop Collection',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await dropCollection(connId, dbName, collName)
          closeTabsForCollection(connId, dbName, collName)
          removeFromState?.(dbName, collName) // Remove from UI
          notify.success(`Collection "${collName}" dropped`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(getErrorSummary(err?.message || String(err)))
        }
      },
    })
  }

  const handleClearCollection = (connId, dbName, collName) => {
    setConfirmDialog({
      title: `Clear Collection "${collName}"?`,
      message: `This will delete ALL documents in the collection "${collName}". The collection structure will be preserved. This action cannot be undone.`,
      confirmText: 'Clear Collection',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await clearCollection(connId, dbName, collName)
          notify.success(`Collection "${collName}" cleared`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(getErrorSummary(err?.message || String(err)))
        }
      },
    })
  }

  const handleSelectCollection = (connId, dbName, collName) => {
    // Single-click: only select/highlight in sidebar
    setSelectedItem(`${connId}:${dbName}:${collName}`)
    setSelectedCollection(collName)
  }

  const handleOpenCollection = (connId, dbName, collName) => {
    // Double-click: open in tab
    setSelectedCollection(collName)
    openTab(connId, dbName, collName)
  }

  // Recursive folder rendering - uses FolderNode component for proper React component lifecycle
  const renderFolderNode = (folder, index, siblings, level = 0) => {
    const folderConnections = connectionsByFolder[folder.id] || []
    const childFolders = folderHelpers.getChildFolders(folder.id)

    // Show inline rename input if this folder is being renamed
    if (renamingFolderId === folder.id) {
      return (
        <div key={folder.id} className="px-2 py-1" style={{ paddingLeft: `${level * 12 + 8}px` }}>
          <div className="flex items-center gap-1">
            <span className="text-zinc-400"><FolderIcon /></span>
            <input
              type="text"
              className="input py-0.5 px-2 text-sm flex-1"
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder(folder.id, renameFolderValue)
                if (e.key === 'Escape') {
                  setRenamingFolderId(null)
                  setRenameFolderValue('')
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onBlur={() => {
                if (renameFolderValue.trim() && renameFolderValue !== folder.name) {
                  handleRenameFolder(folder.id, renameFolderValue)
                } else {
                  setRenamingFolderId(null)
                  setRenameFolderValue('')
                }
              }}
              autoFocus
            />
          </div>
        </div>
      )
    }

    // Build context menu handler
    const handleContextMenu = (e) => {
      e.preventDefault()
      const menuItems = [
        { label: 'Rename', onClick: () => {
          setRenamingFolderId(folder.id)
          setRenameFolderValue(folder.name)
        }},
        { label: 'New Subfolder', onClick: () => {
          setNewSubfolderParentId(folder.id)
          setNewFolderName('')
          setShowNewFolderInput(true)
          setExpandedFolders(prev => ({ ...prev, [folder.id]: true }))
        }},
      ]
      // Add "Move to Root" option if folder has a parent
      if (folder.parentId) {
        menuItems.push({ label: 'Move to Root', onClick: async () => {
          try {
            await moveFolderToFolder(folder.id, '')
            notify.success('Moved folder to root')
          } catch (err) {
            notify.error(`Failed to move folder: ${err?.message || String(err)}`)
          }
        }})
      }
      menuItems.push({ type: 'separator' })
      menuItems.push({ label: 'Delete Folder', onClick: () => handleDeleteFolder(folder.id), danger: true })
      showContextMenu(e.clientX, e.clientY, menuItems)
    }

    // Use FolderNode component - matches ConnectionNode structure
    return (
      <FolderNode
        key={folder.id}
        folder={folder}
        level={level}
        childFolders={childFolders}
        folderConnections={folderConnections}
        expanded={expandedFolders[folder.id]}
        onToggle={() => toggleFolder(folder.id)}
        onContextMenu={handleContextMenu}
        focusedNodeId={focusedNodeId}
        onNodeFocus={setFocusedNodeId}
        setSize={siblings}
        posInSet={index + 1}
        onDragStart={handleFolderDragStart}
        onDragEnd={handleFolderDragEnd}
        onDragOver={(e) => handleFolderDragOver(e, folder.id)}
        onDragLeave={handleFolderDragLeave}
        onDrop={(e) => handleFolderDrop(e, folder.id)}
        isDragOver={dragOverFolderId === folder.id}
        renderFolderNode={renderFolderNode}
        renderConnectionNode={renderConnectionNode}
      />
    )
  }

  const renderConnectionNode = (conn, index, totalConnections, level = 0) => (
    <ConnectionNode
      key={conn.id}
      connection={conn}
      isConnected={activeConnections.includes(conn.id)}
      isConnecting={isConnecting(conn.id)}
      databases={databases[conn.id] || []}
      activeConnections={activeConnections}
      selectedItem={selectedItem}
      onConnect={connect}
      onDisconnect={handleDisconnect}
      onDisconnectOthers={handleDisconnectOthers}
      onSelectDatabase={setSelectedDatabase}
      onSelectCollection={handleSelectCollection}
      onOpenCollection={handleOpenCollection}
      onEdit={() => onEditConnection(conn)}
      onDelete={() => onDeleteConnection(conn.id)}
      onDuplicate={() => duplicateConnection(conn.id)}
      onCopyURI={() => handleCopyURI(conn)}
      onRefresh={() => refreshConnection(conn.id)}
      onShowContextMenu={showContextMenu}
      onDropDatabase={handleDropDatabase}
      onDropCollection={handleDropCollection}
      onClearCollection={handleClearCollection}
      onViewSchema={openSchemaTab}
      onShowStats={onShowStats}
      onManageIndexes={onManageIndexes}
      onExportDatabases={() => onExportDatabases?.(conn.id, conn.name)}
      onImportDatabases={() => onImportDatabases?.(conn.id, conn.name)}
      onExportCollections={(dbName) => onExportCollections?.(conn.id, conn.name, dbName)}
      onImportCollections={(dbName) => onImportCollections?.(conn.id, conn.name, dbName)}
      onError={(msg) => notify.error(msg)}
      focusedNodeId={focusedNodeId}
      onNodeFocus={setFocusedNodeId}
      setSize={totalConnections}
      posInSet={index + 1}
      expandedConnections={expandedConnections}
      setExpandedConnections={setExpandedConnections}
      expandedDatabases={expandedDatabases}
      setExpandedDatabases={setExpandedDatabases}
      onCollectionsLoaded={(dbName, collections) => {
        const key = `${conn.id}:${dbName}`
        setCollectionsMap(prev => ({ ...prev, [key]: collections }))
      }}
      onDragStart={handleConnectionDragStart}
      onDragEnd={handleConnectionDragEnd}
      level={level}
    />
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Search bar - draggable header area */}
      <div className="p-2 border-b border-border titlebar-drag">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search connections..."
            className="input py-1.5 text-sm titlebar-no-drag"
            style={{ paddingLeft: '2.5rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Action buttons - draggable with no-drag on buttons */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border titlebar-drag">
        <button
          className="icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 titlebar-no-drag"
          onClick={onAddConnection}
          title="Add Connection"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        <button
          className="icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 titlebar-no-drag"
          onClick={() => setShowNewFolderInput(true)}
          title="New Folder"
        >
          <FolderIcon className="w-4 h-4" />
        </button>
        {activeConnections.length > 0 && (
          <button
            className="icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 ml-auto titlebar-no-drag"
            onClick={handleDisconnectAll}
            title={`Disconnect All (${activeConnections.length})`}
          >
            <DisconnectIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New folder input (inline) */}
      {showNewFolderInput && (
        <div className="px-2 py-1.5 border-b border-border">
          {newSubfolderParentId && (
            <div className="text-xs text-zinc-400 mb-1">
              New subfolder in: {folders.find(f => f.id === newSubfolderParentId)?.name}
            </div>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              className="input py-1 px-2 flex-1 text-sm"
              placeholder={newSubfolderParentId ? "Subfolder name" : "Folder name"}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(newSubfolderParentId || '')
                if (e.key === 'Escape') {
                  setShowNewFolderInput(false)
                  setNewFolderName('')
                  setNewSubfolderParentId(null)
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
            />
            <button className="btn btn-ghost p-1" onClick={() => handleCreateFolder(newSubfolderParentId || '')}>
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Connection tree */}
      <div
        ref={treeRef}
        className="flex-1 overflow-y-auto py-1"
        tabIndex={visibleNodes.length > 0 ? 0 : -1}
        onKeyDown={handleTreeKeyDown}
        onFocus={(e) => {
          // When tree container gets focus, focus the first node if none focused
          if (e.target === treeRef.current && visibleNodes.length > 0 && !focusedNodeId) {
            setFocusedNodeId(visibleNodes[0].id)
            const firstNode = treeRef.current.querySelector(`[data-node-id="${visibleNodes[0].id}"]`)
            firstNode?.focus()
          }
        }}
      >
        {filteredConnections.length === 0 && folders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm">
            {connections.length === 0 ? (
              <div className="space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
                  <ServerIcon className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-zinc-200 font-medium mb-1">Welcome to MongoPal</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    Get started by adding your first MongoDB connection to explore databases and collections.
                  </p>
                </div>
                <button
                  className="btn btn-primary w-full"
                  onClick={onAddConnection}
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Your First Connection
                </button>
                <p className="text-zinc-600 text-xs">
                  Tip: You can also press Ctrl+N to add a connection
                </p>
              </div>
            ) : (
              <p className="text-zinc-400">No matching connections</p>
            )}
          </div>
        ) : (
          <>
            {/* Folders (only root folders, children rendered recursively) */}
            {folderHelpers.rootFolders.map((folder, folderIndex) =>
              renderFolderNode(folder, folderIndex, folderHelpers.rootFolders.length + rootConnections.length, 0)
            )}

            {/* Root connections (no folder) - also a drop zone */}
            <div
              className={`root-drop-zone ${dragOverFolderId === 'root' ? 'drag-over' : ''}`}
              onDragOver={(e) => handleFolderDragOver(e, 'root')}
              onDragLeave={handleFolderDragLeave}
              onDrop={(e) => handleFolderDrop(e, null)}
            >
              {rootConnections.map((conn, connIndex) =>
                renderConnectionNode(conn, folderHelpers.rootFolders.length + connIndex, folderHelpers.rootFolders.length + rootConnections.length)
              )}
              {/* Show drop indicator when dragging something from inside a folder */}
              {((draggingConnectionId && connections.find(c => c.id === draggingConnectionId)?.folderId) ||
                (draggingFolderId && folders.find(f => f.id === draggingFolderId)?.parentId)) && (
                <div
                  className={`px-4 py-2 text-xs text-zinc-400 italic border border-dashed rounded mx-2 my-1 transition-colors ${
                    dragOverFolderId === 'root'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-zinc-600'
                  }`}
                >
                  Drop here to move to root
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmText}
          danger={confirmDialog.confirmStyle === 'danger'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
