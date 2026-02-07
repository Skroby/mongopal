import React, { useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react'
import { useConnection, SavedConnection, Folder } from './contexts/ConnectionContext'
import { useNotification } from './NotificationContext'
import ConfirmDialog from './ConfirmDialog'
import ConnectionShareOverlay from './connection-form/components/ConnectionShareOverlay'

// =============================================================================
// Types
// =============================================================================

interface ConnectionManagerProps {
  onAddConnection: () => void
  onEditConnection: (conn: SavedConnection) => void
  onClose: () => void
}

interface ContextMenuItem {
  type?: 'separator'
  label?: string
  onClick?: () => void
  danger?: boolean
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

interface ShareOverlayState {
  mode: 'export' | 'import' | 'bulk-export'
  connectionId?: string
  connectionName?: string
}

// =============================================================================
// Icons
// =============================================================================

interface IconProps {
  className?: string
}

const CloseIcon = ({ className = 'w-4 h-4' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const PlusIcon = ({ className = 'w-4 h-4' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const FolderIcon = ({ className = 'w-4 h-4' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const ServerIcon = ({ className = 'w-4 h-4' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
    <circle cx="8" cy="16" r="1" fill="currentColor" />
  </svg>
)

const ChevronIcon = ({ className = 'w-3 h-3' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const ImportIcon = ({ className = 'w-4 h-4' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const ExportIcon = ({ className = 'w-4 h-4' }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
)

// =============================================================================
// Context Menu Component
// =============================================================================

function ContextMenu({ x, y, items, onClose }: ContextMenuState & { onClose: () => void }): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={idx} className="border-t border-zinc-700 my-1" />
        }
        return (
          <button
            key={idx}
            className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
              ${item.danger ? 'text-red-400 hover:bg-red-900/30' : 'text-zinc-200 hover:bg-zinc-700'}`}
            onClick={() => { item.onClick?.(); onClose() }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// =============================================================================
// ConnectionManager Component
// =============================================================================

export default function ConnectionManager({
  onAddConnection,
  onEditConnection,
  onClose,
}: ConnectionManagerProps): React.ReactElement {
  const { notify } = useNotification()
  const {
    connections,
    folders,
    deleteConnection,
    duplicateConnection,
    createFolder,
    deleteFolder,
    moveConnectionToFolder,
    moveFolderToFolder,
    loadConnections,
  } = useConnection()

  // UI state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [shareOverlay, setShareOverlay] = useState<ShareOverlayState | null>(null)

  // Inline rename
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')

  // Inline new folder
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newSubfolderParentId, setNewSubfolderParentId] = useState<string | null>(null)

  // Drag state
  const [draggingConnectionId, setDraggingConnectionId] = useState<string | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const draggingFolderIdRef = useRef<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null)
        } else if (shareOverlay) {
          setShareOverlay(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, contextMenu, shareOverlay])

  // Folder helpers
  const folderHelpers = useMemo(() => {
    const rootFolders = folders
      .filter(f => !f.parentId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const getChildFolders = (parentId: string): Folder[] =>
      folders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const getDescendantIds = (folderId: string): string[] => {
      const result: string[] = []
      const children = getChildFolders(folderId)
      for (const child of children) {
        result.push(child.id)
        result.push(...getDescendantIds(child.id))
      }
      return result
    }

    const getDescendantFolderIds = (folderId: string): string[] => {
      const result: string[] = [folderId]
      const children = getChildFolders(folderId)
      for (const child of children) {
        result.push(...getDescendantFolderIds(child.id))
      }
      return result
    }

    return { rootFolders, getChildFolders, getDescendantIds, getDescendantFolderIds }
  }, [folders])

  // Connections grouped by folder
  const connectionsByFolder = useMemo(() => {
    const byFolder: Record<string, SavedConnection[]> = {}
    connections.forEach(conn => {
      if (conn.folderId) {
        if (!byFolder[conn.folderId]) byFolder[conn.folderId] = []
        byFolder[conn.folderId].push(conn)
      }
    })
    // Sort each folder's connections by name
    Object.keys(byFolder).forEach(folderId => {
      byFolder[folderId].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    })
    return byFolder
  }, [connections])

  const rootConnections = useMemo(() =>
    connections
      .filter(c => !c.folderId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [connections]
  )

  // Folder actions
  const handleCreateFolder = async (parentId: string): Promise<void> => {
    if (!newFolderName.trim()) return
    try {
      await createFolder(newFolderName.trim(), parentId || undefined)
      setNewFolderName('')
      setShowNewFolderInput(false)
      setNewSubfolderParentId(null)
      if (parentId) {
        setExpandedFolders(prev => ({ ...prev, [parentId]: true }))
      }
    } catch (err) {
      notify.error(`Failed to create folder: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleRenameFolder = async (folderId: string, newName: string): Promise<void> => {
    if (!newName.trim()) {
      setRenamingFolderId(null)
      setRenameFolderValue('')
      return
    }
    try {
      const folder = folders.find(f => f.id === folderId)
      if (folder) {
        const goBindings = window.go?.main?.App as { UpdateFolder?: (id: string, name: string, parentId: string) => Promise<void> } | undefined
        await goBindings?.UpdateFolder?.(folderId, newName.trim(), folder.parentId || '')
        await loadConnections()
      }
    } catch (err) {
      notify.error(`Failed to rename folder: ${err instanceof Error ? err.message : String(err)}`)
    }
    setRenamingFolderId(null)
    setRenameFolderValue('')
  }

  const handleDeleteFolder = (folderId: string): void => {
    const folder = folders.find(f => f.id === folderId)
    const folderConns = connectionsByFolder[folderId] || []
    const childFolders = folderHelpers.getChildFolders(folderId)
    const msg = folderConns.length > 0 || childFolders.length > 0
      ? `Delete "${folder?.name}"? Contents (${folderConns.length} connections, ${childFolders.length} subfolders) will be moved to root.`
      : `Delete "${folder?.name}"?`

    setConfirmDialog({
      title: 'Delete Folder',
      message: msg,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          await deleteFolder(folderId)
        } catch (err) {
          notify.error(`Failed to delete folder: ${err instanceof Error ? err.message : String(err)}`)
        }
      },
    })
  }

  const handleDeleteConnection = (connId: string): void => {
    const conn = connections.find(c => c.id === connId)
    setConfirmDialog({
      title: 'Delete Connection',
      message: `Delete "${conn?.name}"?\n\nThis action cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null)
        await deleteConnection(connId)
      },
    })
  }

  // Export single connection
  const handleExportConnection = (connId: string): void => {
    const conn = connections.find(c => c.id === connId)
    if (!conn) return
    setShareOverlay({ mode: 'export', connectionId: connId, connectionName: conn.name })
  }

  // Import success handler
  const handleImported = async (): Promise<void> => {
    await loadConnections()
    setShareOverlay(null)
    notify.success('Connection imported successfully')
  }

  // Drag-and-drop handlers
  const handleConnectionDragStart = (connId: string): void => {
    setDraggingConnectionId(connId)
  }

  const handleConnectionDragEnd = (): void => {
    setDraggingConnectionId(null)
    setDragOverFolderId(null)
  }

  const handleFolderDragStart = (folderId: string): void => {
    draggingFolderIdRef.current = folderId
    setDraggingFolderId(folderId)
  }

  const handleFolderDragEnd = (): void => {
    draggingFolderIdRef.current = null
    setDraggingFolderId(null)
    setDragOverFolderId(null)
  }

  const handleDragOver = (e: React.DragEvent, folderId: string | null): void => {
    e.preventDefault()
    e.stopPropagation()

    if (draggingFolderIdRef.current && draggingFolderIdRef.current === folderId) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    if (draggingConnectionId || draggingFolderIdRef.current) {
      if (draggingFolderIdRef.current && folderId) {
        const descendants = folderHelpers.getDescendantIds(draggingFolderIdRef.current)
        if (descendants.includes(folderId)) {
          e.dataTransfer.dropEffect = 'none'
          return
        }
      }
      e.dataTransfer.dropEffect = 'move'
      setDragOverFolderId(folderId || 'root')
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    const relatedTarget = e.relatedTarget as Node | null
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverFolderId(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()

    const connId = e.dataTransfer.getData('application/x-mongopal-connection')
    if (connId) {
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
          notify.error(`Failed to move: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    const sourceFolderId = e.dataTransfer.getData('application/x-mongopal-folder')
    if (sourceFolderId) {
      const sourceFolder = folders.find(f => f.id === sourceFolderId)
      const targetId = targetFolderId || ''
      const currentParentId = sourceFolder?.parentId || ''

      if (sourceFolderId === targetFolderId) {
        handleFolderDragEnd()
        return
      }
      if (targetFolderId) {
        const descendants = folderHelpers.getDescendantIds(sourceFolderId)
        if (descendants.includes(targetFolderId)) {
          notify.warning('Cannot move folder into its own subfolder')
          handleFolderDragEnd()
          return
        }
      }
      if (sourceFolder && currentParentId !== targetId) {
        try {
          await moveFolderToFolder(sourceFolderId, targetId)
          const folderName = targetFolderId
            ? folders.find(f => f.id === targetFolderId)?.name || 'folder'
            : 'root'
          notify.success(`Moved folder to ${folderName}`)
        } catch (err) {
          notify.error(`Failed to move: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    setDraggingConnectionId(null)
    draggingFolderIdRef.current = null
    setDraggingFolderId(null)
    setDragOverFolderId(null)
  }

  // Context menu helper
  const showContextMenu = useCallback((x: number, y: number, items: ContextMenuItem[]): void => {
    setContextMenu({ x, y, items })
  }, [])

  // Toggle folder
  const toggleFolder = (folderId: string): void => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  // Connection type badge
  const getConnectionType = (uri: string): string => {
    if (uri.startsWith('mongodb+srv://')) return 'SRV'
    if (uri.includes('replicaSet=')) return 'Replica'
    const hostPart = uri.replace(/^mongodb:\/\//, '').split('/')[0]
    const atIndex = hostPart.lastIndexOf('@')
    const hosts = (atIndex >= 0 ? hostPart.substring(atIndex + 1) : hostPart).split(',')
    if (hosts.length > 1) return 'Sharded'
    return 'Standalone'
  }

  // Render folder node
  const renderFolder = (folder: Folder, level: number): ReactNode => {
    const childFolders = folderHelpers.getChildFolders(folder.id)
    const folderConns = connectionsByFolder[folder.id] || []
    const expanded = expandedFolders[folder.id] ?? false
    const hasChildren = childFolders.length > 0 || folderConns.length > 0
    const totalConns = folderHelpers.getDescendantFolderIds(folder.id)
      .reduce((sum, fid) => sum + (connectionsByFolder[fid]?.length || 0), 0)

    if (renamingFolderId === folder.id) {
      return (
        <div key={folder.id} className="px-2 py-1" style={{ paddingLeft: `${level * 16 + 8}px` }}>
          <div className="flex items-center gap-1">
            <span className="text-zinc-400"><FolderIcon className="w-4 h-4" /></span>
            <input
              type="text"
              className="input py-0.5 px-2 text-sm flex-1"
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder(folder.id, renameFolderValue)
                if (e.key === 'Escape') { setRenamingFolderId(null); setRenameFolderValue('') }
              }}
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

    const handleContextMenu = (e: React.MouseEvent): void => {
      e.preventDefault()
      const items: ContextMenuItem[] = [
        { label: 'Rename', onClick: () => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name) } },
        { label: 'New Subfolder', onClick: () => {
          setNewSubfolderParentId(folder.id)
          setNewFolderName('')
          setShowNewFolderInput(true)
          setExpandedFolders(prev => ({ ...prev, [folder.id]: true }))
        }},
      ]
      if (folder.parentId) {
        items.push({ label: 'Move to Root', onClick: async () => {
          try {
            await moveFolderToFolder(folder.id, '')
            notify.success('Moved folder to root')
          } catch (err) {
            notify.error(`Failed to move folder: ${err instanceof Error ? err.message : String(err)}`)
          }
        }})
      }
      items.push({ type: 'separator' })
      items.push({ label: 'Delete Folder', onClick: () => handleDeleteFolder(folder.id), danger: true })
      showContextMenu(e.clientX, e.clientY, items)
    }

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-800 rounded-md mx-1 transition-colors ${
            dragOverFolderId === folder.id ? 'bg-accent/10 ring-1 ring-accent/30' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={handleContextMenu}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-mongopal-folder', folder.id)
            e.dataTransfer.effectAllowed = 'move'
            setTimeout(() => handleFolderDragStart(folder.id), 0)
          }}
          onDragEnd={handleFolderDragEnd}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder.id)}
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''} ${!hasChildren ? 'invisible' : ''}`}>
            <ChevronIcon className="w-3 h-3 text-zinc-500" />
          </span>
          <FolderIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <span className="text-sm text-zinc-200 truncate flex-1">{folder.name}</span>
          <span className="text-xs text-zinc-500">{totalConns}</span>
        </div>
        {expanded && (
          <div>
            {childFolders.map(child => renderFolder(child, level + 1))}
            {folderConns.map(conn => renderConnection(conn, level + 1))}
          </div>
        )}
      </div>
    )
  }

  // Render connection node
  const renderConnection = (conn: SavedConnection, level: number): ReactNode => {
    const typeBadge = getConnectionType(conn.uri)

    const handleContextMenu = (e: React.MouseEvent): void => {
      e.preventDefault()
      const items: ContextMenuItem[] = [
        { label: 'Edit', onClick: () => onEditConnection(conn) },
        { label: 'Duplicate', onClick: () => duplicateConnection(conn.id) },
        { label: 'Export', onClick: () => handleExportConnection(conn.id) },
        { type: 'separator' },
        { label: 'Delete', onClick: () => handleDeleteConnection(conn.id), danger: true },
      ]
      showContextMenu(e.clientX, e.clientY, items)
    }

    return (
      <div
        key={conn.id}
        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-800 rounded-md mx-1 group transition-colors`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onDoubleClick={() => onEditConnection(conn)}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-mongopal-connection', conn.id)
          e.dataTransfer.effectAllowed = 'move'
          setTimeout(() => handleConnectionDragStart(conn.id), 0)
        }}
        onDragEnd={handleConnectionDragEnd}
      >
        {/* Chevron spacer to align with folder rows */}
        <span className="w-3 flex-shrink-0" />
        {/* Color dot */}
        {conn.color ? (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: conn.color }}
          />
        ) : (
          <ServerIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        )}
        <span className="text-sm text-zinc-200 truncate flex-1">{conn.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 font-mono flex-shrink-0">
          {typeBadge}
        </span>
        {/* Action buttons on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            className="p-0.5 rounded hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200"
            onClick={(e) => { e.stopPropagation(); onEditConnection(conn) }}
            title="Edit"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            className="p-0.5 rounded hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200"
            onClick={(e) => { e.stopPropagation(); handleExportConnection(conn.id) }}
            title="Export"
          >
            <ExportIcon className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.id) }}
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-border flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-medium">Manage Connections</h2>
          <button className="icon-btn p-1 hover:bg-zinc-700" onClick={onClose}>
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-shrink-0">
          <button
            className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1.5"
            onClick={onAddConnection}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Connection
          </button>
          <button
            className="btn btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5"
            onClick={() => setShareOverlay({ mode: 'import' })}
          >
            <ImportIcon className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            className="btn btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5"
            onClick={() => setShareOverlay({ mode: 'bulk-export' })}
            disabled={connections.length === 0}
          >
            <ExportIcon className="w-3.5 h-3.5" />
            Export
          </button>
          <div className="flex-1" />
          <button
            className="btn btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5"
            onClick={() => { setNewSubfolderParentId(null); setNewFolderName(''); setShowNewFolderInput(true) }}
          >
            <FolderIcon className="w-3.5 h-3.5" />
            New Folder
          </button>
        </div>

        {/* New folder input (inline) */}
        {showNewFolderInput && (
          <div className="px-4 py-2 border-b border-border">
            {newSubfolderParentId && (
              <div className="text-xs text-zinc-400 mb-1">
                New subfolder in: {folders.find(f => f.id === newSubfolderParentId)?.name}
              </div>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                className="input py-1 px-2 flex-1 text-sm"
                placeholder={newSubfolderParentId ? 'Subfolder name' : 'Folder name'}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder(newSubfolderParentId || '')
                  if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); setNewSubfolderParentId(null) }
                }}
                autoFocus
              />
              <button className="btn btn-ghost p-1" onClick={() => handleCreateFolder(newSubfolderParentId || '')}>
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tree view */}
        <div className="flex-1 overflow-y-auto py-2 min-h-[200px]">
          {connections.length === 0 && folders.length === 0 ? (
            <div className="flex items-center justify-center h-full px-6 py-8">
              <div className="space-y-4 text-center max-w-[240px]">
                <div className="w-14 h-14 mx-auto rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <ServerIcon className="w-7 h-7 text-accent" />
                </div>
                <div>
                  <h3 className="text-zinc-100 font-semibold text-base mb-2">No Connections</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Add your first connection or import one from a colleague.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button className="btn btn-primary w-full py-2" onClick={onAddConnection}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Connection
                  </button>
                  <button className="btn btn-ghost w-full py-2" onClick={() => setShareOverlay({ mode: 'import' })}>
                    <ImportIcon className="w-4 h-4 mr-2" />
                    Import Connection
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`root-drop-zone ${dragOverFolderId === 'root' ? 'bg-accent/5' : ''}`}
              onDragOver={(e) => handleDragOver(e, null)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, null)}
            >
              {/* Folders */}
              {folderHelpers.rootFolders.map(folder => renderFolder(folder, 0))}

              {/* Root connections */}
              {rootConnections.map(conn => renderConnection(conn, 0))}

              {/* Root drop indicator */}
              {((draggingConnectionId && connections.find(c => c.id === draggingConnectionId)?.folderId) ||
                (draggingFolderId && folders.find(f => f.id === draggingFolderId)?.parentId)) && (
                <div
                  className={`px-4 py-2 text-xs text-zinc-400 italic border border-dashed rounded mx-3 my-1 transition-colors ${
                    dragOverFolderId === 'root'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-zinc-600'
                  }`}
                  onDragOver={(e) => handleDragOver(e, null)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, null)}
                >
                  Drop here to move to root
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border flex-shrink-0 text-xs text-zinc-500">
          <span>{connections.length} connection{connections.length !== 1 ? 's' : ''}, {folders.length} folder{folders.length !== 1 ? 's' : ''}</span>
          <span>Right-click for options</span>
        </div>
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

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Share overlay (export / import / bulk-export) */}
      {shareOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          {shareOverlay.mode === 'export' && shareOverlay.connectionId ? (
            <ConnectionShareOverlay
              mode="export"
              connectionId={shareOverlay.connectionId}
              connectionName={shareOverlay.connectionName || 'Connection'}
              onClose={() => setShareOverlay(null)}
            />
          ) : shareOverlay.mode === 'bulk-export' ? (
            <ConnectionShareOverlay
              mode="bulk-export"
              connections={connections.map(c => ({ id: c.id, name: c.name, folderId: c.folderId }))}
              folders={folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId }))}
              onClose={() => setShareOverlay(null)}
            />
          ) : (
            <ConnectionShareOverlay
              mode="import"
              onImported={handleImported}
              onClose={() => setShareOverlay(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
