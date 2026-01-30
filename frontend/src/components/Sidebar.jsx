import { useState, useEffect, useRef } from 'react'
import { useNotification } from './NotificationContext'

const go = window.go?.main?.App

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
            className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
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

// Confirmation Dialog Component
function ConfirmDialog({ title, message, confirmText, confirmStyle, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-surface-secondary border border-border rounded-lg p-4 max-w-md mx-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-zinc-100 mb-2">{title}</h3>
            <p className="text-sm text-zinc-400">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn ${confirmStyle === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
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
  onContextMenu,
  children,
  level = 0,
  color,
  connectionStatus // 'connected' | 'connecting' | 'disconnected' | undefined
}) {
  const hasChildren = children && children.length > 0

  // Determine status dot style
  const getStatusDot = () => {
    if (!connectionStatus) {
      // Not a connection node, just show color if provided
      if (color) {
        return (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        )
      }
      return null
    }

    // Connection node - show status indicator
    if (connectionStatus === 'connected') {
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500"
          title="Connected"
        />
      )
    } else if (connectionStatus === 'connecting') {
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500 animate-pulse"
          title="Connecting..."
        />
      )
    } else {
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 border border-zinc-500"
          title="Disconnected"
        />
      )
    }
  }

  return (
    <div>
      <div
        className={`tree-item ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-zinc-600 rounded"
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.()
            }}
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {getStatusDot()}
        <span className="text-zinc-400">{icon}</span>
        <span className="flex-1 truncate text-sm">{label}</span>
        {count !== undefined && (
          <span className="text-xs text-zinc-500">({count})</span>
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
  onConnect,
  onDisconnect,
  onDisconnectOthers,
  onSelectDatabase,
  onSelectCollection,
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
  onError,
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedDbs, setExpandedDbs] = useState({})
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
    setExpandedDbs(prev => {
      const { [dbName]: _, ...rest } = prev
      return rest
    })
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

  const loadDatabases = async () => {
    if (!go?.ListDatabases) return
    setLoading(true)
    try {
      await go.ListDatabases(connection.id)
    } catch (err) {
      console.error('Failed to load databases:', err)
      onError?.(`Failed to load databases: ${err.message || err}`)
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
    } catch (err) {
      console.error('Failed to load collections:', err)
      onError?.(`Failed to load collections: ${err.message || err}`)
    }
  }

  const toggleDatabase = (dbName) => {
    setExpandedDbs(prev => ({ ...prev, [dbName]: !prev[dbName] }))
    if (!expandedDbs[dbName]) {
      loadCollections(dbName)
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    const hasOtherConnections = activeConnections.length > 1

    const items = isConnected
      ? [
          { label: 'Refresh', onClick: onRefresh },
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
    onShowContextMenu(e.clientX, e.clientY, [
      { label: 'Refresh Collections', onClick: () => {
        loadCollections(dbName, true) // Force refresh
      }},
      { type: 'separator' },
      { label: 'Drop Database...', onClick: () => onDropDatabase(connection.id, dbName, removeDatabase), danger: true },
    ])
  }

  const handleCollectionContextMenu = (e, dbName, collName) => {
    e.preventDefault()
    e.stopPropagation()
    onShowContextMenu(e.clientX, e.clientY, [
      { label: 'Open Collection', onClick: () => onSelectCollection(connection.id, dbName, collName) },
      { label: 'View Schema...', onClick: () => onViewSchema(connection.id, dbName, collName) },
      { type: 'separator' },
      { label: 'Clear Collection...', onClick: () => onClearCollection(connection.id, dbName, collName), danger: true },
      { label: 'Drop Collection...', onClick: () => onDropCollection(connection.id, dbName, collName, removeCollection), danger: true },
    ])
  }

  const getLabel = () => {
    if (isConnecting) return `${connection.name} [connecting...]`
    if (isConnected) return `${connection.name} [connected]`
    return connection.name
  }

  const connectionStatus = isConnecting ? 'connecting' : isConnected ? 'connected' : 'disconnected'

  return (
    <TreeNode
      label={getLabel()}
      icon={<ServerIcon />}
      connectionStatus={connectionStatus}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      onClick={() => {
        if (!isConnected && !isConnecting) {
          onConnect(connection.id)
        }
        setExpanded(!expanded)
      }}
      onContextMenu={handleContextMenu}
    >
      {isConnected ? (
        databases.map(db => (
          <TreeNode
            key={db.name}
            label={db.name}
            icon={<DatabaseIcon />}
            level={1}
            expanded={expandedDbs[db.name]}
            onToggle={() => toggleDatabase(db.name)}
            onClick={() => {
              onSelectDatabase(db.name)
              toggleDatabase(db.name)
            }}
            onContextMenu={(e) => handleDatabaseContextMenu(e, db.name)}
          >
            {dbData[db.name]?.collections?.map(coll => (
              <TreeNode
                key={coll.name}
                label={coll.name}
                icon={<CollectionIcon />}
                count={coll.count}
                level={2}
                onClick={() => onSelectCollection(connection.id, db.name, coll.name)}
                onContextMenu={(e) => handleCollectionContextMenu(e, db.name, coll.name)}
              />
            ))}
          </TreeNode>
        ))
      ) : isConnecting ? (
        <div className="pl-8 py-1 text-xs text-zinc-500 italic">
          Connecting...
        </div>
      ) : (
        <div className="pl-8 py-1 text-xs text-zinc-500 italic">
          Right-click to connect
        </div>
      )}
    </TreeNode>
  )
}

export default function Sidebar({
  connections,
  folders = [],
  activeConnections,
  connectingId,
  selectedConnection,
  selectedDatabase,
  selectedCollection,
  onConnect,
  onDisconnect,
  onDisconnectAll,
  onDisconnectOthers,
  onSelectConnection,
  onSelectDatabase,
  onSelectCollection,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
  onDuplicateConnection,
  onRefreshConnection,
  onCreateFolder,
  onDeleteFolder,
  onDropDatabase,
  onDropCollection,
  onClearCollection,
  onViewSchema,
}) {
  const { notify } = useNotification()
  const [searchQuery, setSearchQuery] = useState('')
  const [databases, setDatabases] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState({})
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

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

  // Group connections by folder
  const rootConnections = filteredConnections.filter(c => !c.folderId)
  const connectionsByFolder = {}
  filteredConnections.forEach(conn => {
    if (conn.folderId) {
      if (!connectionsByFolder[conn.folderId]) {
        connectionsByFolder[conn.folderId] = []
      }
      connectionsByFolder[conn.folderId].push(conn)
    }
  })

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await onCreateFolder?.(newFolderName.trim())
      setNewFolderName('')
      setShowNewFolderInput(false)
      notify.success('Folder created')
    } catch (err) {
      notify.error(`Failed to create folder: ${err.message || err}`)
    }
  }

  const handleDeleteFolder = async (folderId) => {
    try {
      await onDeleteFolder?.(folderId)
      notify.success('Folder deleted')
    } catch (err) {
      notify.error(`Failed to delete folder: ${err.message || err}`)
    }
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

  const handleDropDatabase = (connId, dbName, removeFromState) => {
    setConfirmDialog({
      title: `Drop Database "${dbName}"?`,
      message: `This will permanently delete the database "${dbName}" and ALL its collections. This action cannot be undone.`,
      confirmText: 'Drop Database',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await onDropDatabase?.(connId, dbName)
          removeFromState?.(dbName) // Remove from ConnectionNode local state
          // Also remove from Sidebar's databases state
          setDatabases(prev => ({
            ...prev,
            [connId]: (prev[connId] || []).filter(db => db.name !== dbName)
          }))
          notify.success(`Database "${dbName}" dropped`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(`Failed to drop database: ${err.message || err}`)
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
          await onDropCollection?.(connId, dbName, collName)
          removeFromState?.(dbName, collName) // Remove from UI
          notify.success(`Collection "${collName}" dropped`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(`Failed to drop collection: ${err.message || err}`)
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
          await onClearCollection?.(connId, dbName, collName)
          notify.success(`Collection "${collName}" cleared`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(`Failed to clear collection: ${err.message || err}`)
        }
      },
    })
  }

  const renderConnectionNode = (conn) => (
    <ConnectionNode
      key={conn.id}
      connection={conn}
      isConnected={activeConnections.includes(conn.id)}
      isConnecting={connectingId === conn.id}
      databases={databases[conn.id] || []}
      activeConnections={activeConnections}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onDisconnectOthers={onDisconnectOthers}
      onSelectDatabase={onSelectDatabase}
      onSelectCollection={onSelectCollection}
      onEdit={() => onEditConnection(conn)}
      onDelete={() => onDeleteConnection(conn.id)}
      onDuplicate={() => onDuplicateConnection(conn.id)}
      onCopyURI={() => handleCopyURI(conn)}
      onRefresh={() => onRefreshConnection?.(conn.id)}
      onShowContextMenu={showContextMenu}
      onDropDatabase={handleDropDatabase}
      onDropCollection={handleDropCollection}
      onClearCollection={handleClearCollection}
      onViewSchema={onViewSchema}
      onError={(msg) => notify.error(msg)}
    />
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Search bar */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search connections..."
            className="input py-1.5 text-sm"
            style={{ paddingLeft: '2.5rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
          onClick={onAddConnection}
          title="Add Connection"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
          onClick={() => setShowNewFolderInput(true)}
          title="New Folder"
        >
          <FolderIcon className="w-4 h-4" />
        </button>
        {activeConnections.length > 0 && (
          <button
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 ml-auto"
            onClick={onDisconnectAll}
            title={`Disconnect All (${activeConnections.length})`}
          >
            <DisconnectIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New folder input (inline) */}
      {showNewFolderInput && (
        <div className="px-2 py-1.5 border-b border-border">
          <div className="flex gap-1">
            <input
              type="text"
              className="input py-1 px-2 flex-1 text-sm"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') {
                  setShowNewFolderInput(false)
                  setNewFolderName('')
                }
              }}
              autoFocus
            />
            <button className="btn btn-ghost p-1" onClick={handleCreateFolder}>
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Connection tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredConnections.length === 0 && folders.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm">
            {connections.length === 0 ? (
              <>
                <p className="mb-2">No connections yet</p>
                <button
                  className="btn btn-primary"
                  onClick={onAddConnection}
                >
                  Add Connection
                </button>
              </>
            ) : (
              <p>No matching connections</p>
            )}
          </div>
        ) : (
          <>
            {/* Folders */}
            {folders.map(folder => (
              <div key={folder.id}>
                <TreeNode
                  label={folder.name}
                  icon={<FolderIcon />}
                  expanded={expandedFolders[folder.id]}
                  onToggle={() => toggleFolder(folder.id)}
                  onClick={() => toggleFolder(folder.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    showContextMenu(e.clientX, e.clientY, [
                      { label: 'Delete Folder', onClick: () => handleDeleteFolder(folder.id), danger: true },
                    ])
                  }}
                >
                  {(connectionsByFolder[folder.id] || []).map(renderConnectionNode)}
                </TreeNode>
              </div>
            ))}

            {/* Root connections (no folder) */}
            {rootConnections.map(renderConnectionNode)}
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
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          confirmStyle={confirmDialog.confirmStyle}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
