import React, { useState, useEffect, useRef, useCallback, useMemo, RefObject, ReactNode } from 'react'
import { useNotification } from './NotificationContext'
import { useConnection, SavedConnection, Folder } from './contexts/ConnectionContext'
import { useTab } from './contexts/TabContext'
import ConfirmDialog from './ConfirmDialog'
import { getErrorSummary } from '../utils/errorParser'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Database info with access tracking
 */
interface DatabaseInfoWithAccess {
  name: string
  sizeOnDisk?: number
  empty?: boolean
  lastAccessedAt?: string
}

/**
 * Collection info from backend
 */
interface CollectionInfo {
  name: string
  type?: string
  count: number
}

/**
 * Go App bindings accessible via window.go.main.App (component-specific)
 */
interface SidebarGoBindings {
  ListDatabases?: (connId: string) => Promise<DatabaseInfoWithAccess[]>
  ListCollections?: (connId: string, dbName: string) => Promise<CollectionInfo[]>
  ListFavorites?: () => Promise<string[]>
  ListDatabaseFavorites?: () => Promise<string[]>
  AddFavorite?: (connId: string, dbName: string, collName: string) => Promise<void>
  RemoveFavorite?: (connId: string, dbName: string, collName: string) => Promise<void>
  AddDatabaseFavorite?: (connId: string, dbName: string) => Promise<void>
  RemoveDatabaseFavorite?: (connId: string, dbName: string) => Promise<void>
  UpdateDatabaseAccessed?: (connId: string, dbName: string) => Promise<void>
  UpdateFolder?: (folderId: string, name: string, parentId: string) => Promise<void>
}

const go: SidebarGoBindings | undefined = window.go?.main?.App as SidebarGoBindings | undefined

/**
 * Database data cache entry
 */
interface DbDataEntry {
  collections?: CollectionInfo[]
}

/**
 * Type for database data cache
 */
type DbDataCache = Record<string, DbDataEntry>

/**
 * Visible node for keyboard navigation
 */
interface VisibleNode {
  id: string
  type: 'folder' | 'connection' | 'database' | 'collection'
  folderId?: string
  folderName?: string
  connectionId?: string
  connectionName?: string
  databaseName?: string
  collectionName?: string
  hasChildren: boolean
  expanded: boolean
  parentId: string | null
  isConnected?: boolean
}

/**
 * Node action for keyboard navigation
 */
type NodeAction = 'expand' | 'collapse' | 'activate'

/**
 * Context menu item
 */
interface ContextMenuItem {
  type?: 'separator'
  label?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  shortcut?: string
}

/**
 * Context menu state
 */
interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

/**
 * Confirm dialog state
 */
interface ConfirmDialogState {
  title: string
  message: string
  confirmText: string
  confirmStyle: 'danger' | 'primary'
  onConfirm: () => Promise<void>
}

/**
 * Search results structure
 */
interface SearchResults {
  filteredConnections: SavedConnection[]
  matchInfo: Record<string, ConnectionMatchInfo>
  autoExpandConnections: Record<string, boolean>
  autoExpandDatabases: Record<string, boolean>
}

/**
 * Connection match info for search
 */
interface ConnectionMatchInfo {
  matchedConnection: boolean
  matchedDatabases: string[]
  matchedCollections: Record<string, string[]>
}

/**
 * Database sort mode
 */
type DbSortMode = 'alpha' | 'lastAccessed'

/**
 * Folder helpers interface
 */
interface FolderHelpers {
  rootFolders: Folder[]
  getChildFolders: (parentId: string) => Folder[]
  getDescendantIds: (folderId: string, visited?: Set<string>) => string[]
  getFolderDepth: (folderId: string, depth?: number) => number
}

// =============================================================================
// Icon Components
// =============================================================================

interface IconProps {
  className?: string
}

const ChevronRight = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const ChevronDown = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const DatabaseIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
)

const CollectionIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
)

const ServerIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
)

const LockIcon = ({ className = "w-3 h-3" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
)

const PlusIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const FolderIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const SearchIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const ClearIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const DisconnectIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
  </svg>
)

interface StarIconProps extends IconProps {
  filled?: boolean
}

const StarIcon = ({ className = "w-4 h-4", filled = false }: StarIconProps): React.ReactElement => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
)

const SortAlphaIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h6l-3 8h6M9 20l3-16M15 4h6M15 8h6M15 12h6M15 16h4M15 20h2" />
  </svg>
)

const SortClockIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// =============================================================================
// Helper Components
// =============================================================================

interface HighlightedTextProps {
  text: string
  searchQuery: string
}

/**
 * Helper component to highlight matching text in search results
 */
function HighlightedText({ text, searchQuery }: HighlightedTextProps): React.ReactElement {
  if (!searchQuery || !text) {
    return <>{text}</>
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = searchQuery.toLowerCase()
  const matchIndex = lowerText.indexOf(lowerQuery)

  if (matchIndex === -1) {
    return <>{text}</>
  }

  const before = text.slice(0, matchIndex)
  const match = text.slice(matchIndex, matchIndex + searchQuery.length)
  const after = text.slice(matchIndex + searchQuery.length)

  return (
    <>
      {before}
      <span className="bg-warning/30 text-warning rounded px-0.5">{match}</span>
      {after}
    </>
  )
}

// =============================================================================
// Keyboard Navigation Hook
// =============================================================================

interface TreeKeyboardNavigation {
  focusedNodeId: string | null
  setFocusedNodeId: React.Dispatch<React.SetStateAction<string | null>>
  handleKeyDown: (e: React.KeyboardEvent) => void
}

/**
 * Hook for managing tree keyboard navigation
 * Accepts external focusedNodeId for synchronization with click-based focus
 */
function useTreeKeyboardNavigation(
  treeRef: RefObject<HTMLDivElement>,
  visibleNodes: VisibleNode[],
  onNodeAction: (node: VisibleNode, action: NodeAction) => void,
  externalFocusedNodeId?: string | null,
  setExternalFocusedNodeId?: React.Dispatch<React.SetStateAction<string | null>>
): TreeKeyboardNavigation {
  const [internalFocusedNodeId, setInternalFocusedNodeId] = useState<string | null>(null)
  const focusedNodeId = externalFocusedNodeId !== undefined ? externalFocusedNodeId : internalFocusedNodeId
  const setFocusedNodeId = setExternalFocusedNodeId || setInternalFocusedNodeId

  const focusedIndex = useMemo(() => {
    if (!focusedNodeId) return -1
    return visibleNodes.findIndex(n => n.id === focusedNodeId)
  }, [focusedNodeId, visibleNodes])

  const focusNodeByIndex = useCallback((index: number): void => {
    if (index >= 0 && index < visibleNodes.length) {
      const node = visibleNodes[index]
      setFocusedNodeId(node.id)
      const element = treeRef.current?.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement | null
      element?.focus()
    }
  }, [visibleNodes, treeRef, setFocusedNodeId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
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
            onNodeAction(currentNode, 'expand')
          } else if (currentNode.hasChildren && currentNode.expanded) {
            focusNodeByIndex(currentIndex + 1)
          }
        }
        break

      case 'ArrowLeft':
        e.preventDefault()
        if (currentNode) {
          if (currentNode.hasChildren && currentNode.expanded) {
            onNodeAction(currentNode, 'collapse')
          } else if (currentNode.parentId) {
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

// =============================================================================
// Context Menu Component
// =============================================================================

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
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

  const adjustedStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  }

  return (
    <div
      ref={menuRef}
      className="bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
      style={adjustedStyle}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={idx} className="border-t border-border my-1" />
        }
        return (
          <button
            key={idx}
            className={`context-menu-item w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
              ${item.danger ? 'text-error hover:bg-error-dark/30' : ''}
              ${item.disabled
                ? 'text-text-dim cursor-not-allowed'
                : item.danger ? '' : 'text-text-light hover:bg-surface-hover'}`}
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
              <span className="ml-auto text-xs text-text-dim">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// =============================================================================
// TreeNode Component
// =============================================================================

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

interface TreeNodeProps {
  label: ReactNode
  icon: ReactNode
  count?: number
  expanded?: boolean
  onToggle?: () => void
  selected?: boolean
  onClick?: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  children?: ReactNode
  level?: number
  color?: string
  connectionStatus?: ConnectionStatus
  statusTooltip?: string
  isFavorite?: boolean
  onToggleFavorite?: () => void
  nodeId?: string
  isFocused?: boolean
  onFocus?: () => void
  setSize?: number
  posInSet?: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  isDropTarget?: boolean
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragOver?: boolean
  dropIndicator?: 'above' | 'below' | null
  searchQuery?: string
  highlightLabel?: boolean
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
  connectionStatus,
  statusTooltip,
  isFavorite,
  onToggleFavorite,
  nodeId,
  isFocused,
  onFocus,
  draggable,
  onDragStart,
  onDragEnd,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  dropIndicator,
  searchQuery,
  highlightLabel = false,
}: TreeNodeProps): React.ReactElement {
  const nodeRef = useRef<HTMLDivElement>(null)
  const hasChildren = children && (Array.isArray(children) ? children.length > 0 : React.Children.count(children) > 0)
  const showChevron = hasChildren || onToggle

  const getStatusDot = (): React.ReactElement | null => {
    if (!connectionStatus) {
      return null
    }

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
      return (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 border border-text-dim"
          title={statusTooltip || "Disconnected - Click to connect"}
        />
      )
    }
  }

  const handleClick = (e: React.MouseEvent): void => {
    onFocus?.()
    onClick?.(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
      return
    }
  }

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
        className={`tree-item group relative ${selected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${isDragOver ? 'drag-over' : ''} ${dropIndicator === 'above' ? 'drop-indicator-above' : ''} ${dropIndicator === 'below' ? 'drop-indicator-below' : ''}`}
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
            className="icon-btn p-0.5 hover:bg-surface-active rounded flex-shrink-0 text-text"
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
          style={{ color: color || 'var(--color-text-muted)' }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="flex-1 truncate text-sm text-text">
          {highlightLabel && searchQuery ? (
            <HighlightedText text={typeof label === 'string' ? label : ''} searchQuery={searchQuery} />
          ) : (
            label
          )}
        </span>
        {onToggleFavorite !== undefined && (
          <button
            className={`icon-btn p-0.5 rounded flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
              isFavorite ? 'opacity-100 text-yellow-500' : 'hover:bg-surface-active text-text-dim hover:text-text-secondary'
            }`}
            tabIndex={-1}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite?.()
            }}
          >
            <StarIcon className="w-3.5 h-3.5" filled={isFavorite} />
          </button>
        )}
        {count !== undefined && (
          <span className="text-xs text-text-muted flex-shrink-0" aria-label={`${count} documents`}>({count})</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>{children}</div>
      )}
    </div>
  )
}

// =============================================================================
// ConnectionNode Component
// =============================================================================

interface ExtendedSavedConnection extends SavedConnection {
  readOnly?: boolean
  lastAccessedAt?: string
}

interface ConnectionNodeProps {
  connection: ExtendedSavedConnection
  isConnected: boolean
  isConnecting: boolean
  databases: DatabaseInfoWithAccess[]
  activeConnections: string[]
  selectedItem: string | null
  onConnect: (connId: string) => void
  onDisconnect: (connId: string) => void
  onDisconnectOthers: (connId: string) => void
  onSelectDatabase: (dbName: string) => void
  onSelectCollection: (connId: string, dbName: string, collName: string) => void
  onOpenCollection: (connId: string, dbName: string, collName: string) => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onCopyURI: () => void
  onRefresh: () => void
  onShowContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  onDropDatabase: (connId: string, dbName: string, removeFromState: (dbName: string) => void) => void
  onDropCollection: (connId: string, dbName: string, collName: string, removeFromState: (dbName: string, collName: string) => void) => void
  onClearCollection: (connId: string, dbName: string, collName: string) => void
  onViewSchema: (connId: string, dbName: string, collName: string) => void
  onShowStats?: (connId: string, dbName: string, collName: string) => void
  onManageIndexes?: (connId: string, dbName: string, collName: string) => void
  onShowServerInfo?: () => void
  onExportDatabases?: () => void
  onImportDatabases?: () => void
  onExportCollections?: (dbName: string) => void
  onImportCollections?: (dbName: string) => void
  onError?: (msg: string) => void
  favorites: Set<string>
  onToggleFavorite?: (connId: string, dbName: string, collName: string) => void
  databaseFavorites: string[]
  onToggleDatabaseFavorite?: (connId: string, dbName: string) => void
  dbSortMode?: DbSortMode
  onDatabaseAccessed?: (connId: string, dbName: string) => void
  focusedNodeId: string | null
  onNodeFocus?: (nodeId: string) => void
  setSize?: number
  posInSet?: number
  expandedConnections: Record<string, boolean>
  setExpandedConnections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  expandedDatabases: Record<string, boolean>
  setExpandedDatabases: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onCollectionsLoaded?: (dbName: string, collections: CollectionInfo[]) => void
  onDragStart?: (connId: string) => void
  onDragEnd?: () => void
  level?: number
  searchQuery?: string
  connectionNameMatched?: boolean
  matchingDatabases?: string[]
  matchingCollections?: Record<string, string[]>
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
  onShowServerInfo,
  onExportDatabases,
  onImportDatabases,
  onExportCollections,
  onImportCollections,
  onError,
  favorites,
  onToggleFavorite,
  databaseFavorites,
  onToggleDatabaseFavorite,
  dbSortMode = 'alpha',
  onDatabaseAccessed,
  focusedNodeId,
  onNodeFocus,
  expandedConnections,
  setExpandedConnections,
  expandedDatabases,
  setExpandedDatabases,
  onCollectionsLoaded,
  onDragStart,
  onDragEnd,
  level = 0,
  searchQuery = '',
  connectionNameMatched = false,
  matchingDatabases = [],
  matchingCollections = {},
}: ConnectionNodeProps): React.ReactElement {
  const expanded = expandedConnections?.[connection.id] ?? false
  const setExpanded = (value: boolean | ((prev: boolean) => boolean)): void => {
    const newValue = typeof value === 'function' ? value(expanded) : value
    setExpandedConnections?.(prev => ({ ...prev, [connection.id]: newValue }))
  }

  const getDbExpanded = (dbName: string): boolean => expandedDatabases?.[`${connection.id}:${dbName}`] ?? false
  const setDbExpanded = (dbName: string, value: boolean | ((prev: boolean) => boolean)): void => {
    const key = `${connection.id}:${dbName}`
    const newValue = typeof value === 'function' ? value(getDbExpanded(dbName)) : value
    setExpandedDatabases?.(prev => ({ ...prev, [key]: newValue }))
  }

  const [dbData, setDbData] = useState<DbDataCache>({})
  const [_loading, setLoading] = useState(false)

  const removeCollection = (dbName: string, collName: string): void => {
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

  const removeDatabase = (dbName: string): void => {
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

  useEffect(() => {
    if (!isConnected && expanded) {
      setExpanded(false)
    }
  }, [isConnected])

  const loadDatabases = async (): Promise<void> => {
    if (!go?.ListDatabases) return
    setLoading(true)
    try {
      await go.ListDatabases(connection.id)
    } catch (err) {
      console.error('Failed to load databases:', err)
      onError?.(`Failed to load databases: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const loadCollections = async (dbName: string, forceRefresh = false): Promise<void> => {
    if (!go?.ListCollections) return
    if (!forceRefresh && dbData[dbName]?.collections) return
    try {
      const collections = await go.ListCollections(connection.id, dbName)
      setDbData(prev => ({
        ...prev,
        [dbName]: { ...prev[dbName], collections }
      }))
      onCollectionsLoaded?.(dbName, collections)
    } catch (err) {
      console.error('Failed to load collections:', err)
      onError?.(`Failed to load collections: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const toggleDatabase = (dbName: string): void => {
    const wasExpanded = getDbExpanded(dbName)
    setDbExpanded(dbName, !wasExpanded)
    if (!wasExpanded) {
      loadCollections(dbName)
      go?.UpdateDatabaseAccessed?.(connection.id, dbName).catch(() => {})
      onDatabaseAccessed?.(connection.id, dbName)
    }
  }

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

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    const hasOtherConnections = activeConnections.length > 1

    const items: ContextMenuItem[] = isConnected
      ? [
          { label: 'Refresh', onClick: onRefresh },
          { label: 'Server Info...', onClick: onShowServerInfo },
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

  const handleDatabaseContextMenu = (e: React.MouseEvent, dbName: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const isReadOnly = connection.readOnly
    const dbFavoriteKey = `db:${connection.id}:${dbName}`
    const isDbFavorite = databaseFavorites?.includes(dbFavoriteKey)
    const items: ContextMenuItem[] = [
      { label: 'Refresh Collections', onClick: () => {
        loadCollections(dbName, true)
      }},
      { type: 'separator' },
      isDbFavorite
        ? { label: 'Remove from Favorites', onClick: () => onToggleDatabaseFavorite?.(connection.id, dbName) }
        : { label: 'Add to Favorites', onClick: () => onToggleDatabaseFavorite?.(connection.id, dbName) },
      { type: 'separator' },
      { label: 'Export Collections...', onClick: () => onExportCollections?.(dbName) },
    ]
    if (!isReadOnly) {
      items.push(
        { label: 'Import Collections...', onClick: () => onImportCollections?.(dbName) },
        { type: 'separator' },
        { label: 'Drop Database...', onClick: () => onDropDatabase(connection.id, dbName, removeDatabase), danger: true },
      )
    }
    onShowContextMenu(e.clientX, e.clientY, items)
  }

  const handleCollectionContextMenu = (e: React.MouseEvent, dbName: string, collName: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const isReadOnly = connection.readOnly
    const favoriteKey = `${connection.id}:${dbName}:${collName}`
    const isFavorite = favorites?.has(favoriteKey)
    const items: ContextMenuItem[] = [
      { label: 'Open Collection', onClick: () => onOpenCollection(connection.id, dbName, collName) },
      { label: 'View Schema...', onClick: () => onViewSchema(connection.id, dbName, collName) },
      { type: 'separator' },
      isFavorite
        ? { label: 'Remove from Favorites', onClick: () => onToggleFavorite?.(connection.id, dbName, collName) }
        : { label: 'Add to Favorites', onClick: () => onToggleFavorite?.(connection.id, dbName, collName) },
      { type: 'separator' },
      { label: 'Show Stats...', onClick: () => onShowStats?.(connection.id, dbName, collName) },
      { label: 'Manage Indexes...', onClick: () => onManageIndexes?.(connection.id, dbName, collName) },
    ]
    if (!isReadOnly) {
      items.push(
        { type: 'separator' },
        { label: 'Clear Collection...', onClick: () => onClearCollection(connection.id, dbName, collName), danger: true },
        { label: 'Drop Collection...', onClick: () => onDropCollection(connection.id, dbName, collName, removeCollection), danger: true },
      )
    }
    onShowContextMenu(e.clientX, e.clientY, items)
  }

  const getLabel = (): ReactNode => {
    const ReadOnlyBadge = connection.readOnly ? (
      <span className="inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-warning-dark text-warning border border-warning-dark" title="Read-only connection - write operations disabled">
        <LockIcon className="w-2.5 h-2.5" />
        <span>Read-Only</span>
      </span>
    ) : null
    const nameWithHighlight = searchQuery ? (
      <HighlightedText text={connection.name} searchQuery={searchQuery} />
    ) : connection.name
    if (isConnecting) return <>{nameWithHighlight}{ReadOnlyBadge} <span className="text-text-dim">[connecting...]</span></>
    if (isConnected) return <>{nameWithHighlight}{ReadOnlyBadge}</>
    return <>{nameWithHighlight}{ReadOnlyBadge}</>
  }

  const connectionStatus: ConnectionStatus = isConnecting ? 'connecting' : isConnected ? 'connected' : 'disconnected'

  const getStatusTooltip = (): string => {
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

  const connectionNodeId = `conn:${connection.id}`

  const handleRowDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.setData('application/x-mongopal-connection', connection.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(connection.id)
  }

  const handleRowDragEnd = (): void => {
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
      draggable={true}
      onDragStart={handleRowDragStart}
      onDragEnd={handleRowDragEnd}
    >
      {isConnected ? (
        databases
          .filter(db => {
            if (!searchQuery) return true
            if (connectionNameMatched) return true
            const dbMatchesSearch = matchingDatabases.includes(db.name)
            const hasMatchingCollections = (matchingCollections[db.name] || []).length > 0
            return dbMatchesSearch || hasMatchingCollections
          })
          .sort((a, b) => {
            const aKey = `db:${connection.id}:${a.name}`
            const bKey = `db:${connection.id}:${b.name}`
            const aIsFav = databaseFavorites?.includes(aKey)
            const bIsFav = databaseFavorites?.includes(bKey)

            if (aIsFav !== bIsFav) return aIsFav ? -1 : 1

            if (dbSortMode === 'lastAccessed') {
              const aAccessed = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
              const bAccessed = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
              if (aAccessed !== bAccessed) return bAccessed - aAccessed
            }
            return a.name.localeCompare(b.name)
          })
          .map((db, _dbIndex, _filteredDbs) => {
          const dbNodeId = `db:${connection.id}:${db.name}`
          const collections = dbData[db.name]?.collections || []
          const dbMatchesSearch = matchingDatabases.includes(db.name)
          const collectionsMatchingInDb = matchingCollections[db.name] || []

          const dbLabel = searchQuery ? (
            <HighlightedText text={db.name} searchQuery={searchQuery} />
          ) : db.name

          const filteredCollections = searchQuery && !connectionNameMatched && !dbMatchesSearch && collectionsMatchingInDb.length > 0
            ? collections.filter(c => collectionsMatchingInDb.includes(c.name))
            : collections

          const dbFavKey = `db:${connection.id}:${db.name}`
          const isDbFavorite = databaseFavorites?.includes(dbFavKey)

          return (
            <TreeNode
              key={db.name}
              label={dbLabel}
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
              isFavorite={isDbFavorite}
              onToggleFavorite={() => onToggleDatabaseFavorite?.(connection.id, db.name)}
            >
              {[...filteredCollections].sort((a, b) => {
                const aKey = `${connection.id}:${db.name}:${a.name}`
                const bKey = `${connection.id}:${db.name}:${b.name}`
                const aFav = favorites?.has(aKey) ? 1 : 0
                const bFav = favorites?.has(bKey) ? 1 : 0
                if (aFav !== bFav) return bFav - aFav
                return a.name.localeCompare(b.name)
              }).map((coll, _collIndex) => {
                const itemKey = `${connection.id}:${db.name}:${coll.name}`
                const collNodeId = `coll:${connection.id}:${db.name}:${coll.name}`
                const isFavorite = favorites?.has(itemKey)

                const collLabel = searchQuery ? (
                  <HighlightedText text={coll.name} searchQuery={searchQuery} />
                ) : coll.name

                return (
                  <TreeNode
                    key={coll.name}
                    label={collLabel}
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
                    isFavorite={isFavorite}
                    onToggleFavorite={() => onToggleFavorite?.(connection.id, db.name, coll.name)}
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

// =============================================================================
// FolderNode Component
// =============================================================================

interface FolderNodeProps {
  folder: Folder
  level?: number
  childFolders: Folder[]
  folderConnections: ExtendedSavedConnection[]
  expanded: boolean
  onToggle: () => void
  onContextMenu: (e: React.MouseEvent) => void
  focusedNodeId: string | null
  onNodeFocus: (nodeId: string) => void
  setSize?: number
  posInSet?: number
  onDragStart?: (folderId: string) => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragOver?: boolean
  renderFolderNode: (folder: Folder, index: number, siblings: number, level: number) => ReactNode
  renderConnectionNode: (conn: ExtendedSavedConnection, index: number, totalConnections: number, level: number) => ReactNode
}

function FolderNode({
  folder,
  level = 0,
  childFolders,
  folderConnections,
  expanded,
  onToggle,
  onContextMenu,
  focusedNodeId,
  onNodeFocus,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  renderFolderNode,
  renderConnectionNode,
}: FolderNodeProps): React.ReactElement {
  const folderNodeId = `folder:${folder.id}`

  const handleRowDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.setData('application/x-mongopal-folder', folder.id)
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => onDragStart?.(folder.id), 0)
  }

  const handleRowDragEnd = (): void => {
    onDragEnd?.()
  }

  return (
    <TreeNode
      label={folder.name}
      icon={<FolderIcon />}
      level={level}
      expanded={expanded}
      onToggle={onToggle}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      nodeId={folderNodeId}
      isFocused={focusedNodeId === folderNodeId}
      onFocus={() => onNodeFocus?.(folderNodeId)}
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

// =============================================================================
// Sidebar Component
// =============================================================================

export interface SidebarProps {
  onManageConnections: () => void
  onEditConnection: (conn: SavedConnection) => void
  onDeleteConnection: (connId: string) => void
  onExportDatabases?: (connId: string, connName: string) => void
  onImportDatabases?: (connId: string, connName: string) => void
  onExportCollections?: (connId: string, connName: string, dbName: string) => void
  onImportCollections?: (connId: string, connName: string, dbName: string) => void
  onShowStats?: (connId: string, dbName: string, collName: string) => void
  onManageIndexes?: (connId: string, dbName: string, collName: string) => void
  onShowServerInfo?: (connId: string, connName: string) => void
}

export default function Sidebar({
  onManageConnections,
  onEditConnection,
  onDeleteConnection,
  onExportDatabases,
  onImportDatabases,
  onExportCollections,
  onImportCollections,
  onShowStats,
  onManageIndexes,
  onShowServerInfo,
}: SidebarProps): React.ReactElement {
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
  const [databases, setDatabases] = useState<Record<string, DatabaseInfoWithAccess[]>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [draggingConnectionId, setDraggingConnectionId] = useState<string | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const draggingFolderIdRef = useRef<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [newSubfolderParentId, setNewSubfolderParentId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [databaseFavorites, setDatabaseFavorites] = useState<string[]>([])
  const [dbSortMode, setDbSortMode] = useState<DbSortMode>(() => {
    try {
      return (localStorage.getItem('mongopal-db-sort-mode') as DbSortMode) || 'alpha'
    } catch {
      return 'alpha'
    }
  })

  const [expandedConnections, setExpandedConnections] = useState<Record<string, boolean>>({})
  const [expandedDatabases, setExpandedDatabases] = useState<Record<string, boolean>>({})
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const lastAccessedDbNodeRef = useRef<string | null>(null)

  const [collectionsMap, setCollectionsMap] = useState<Record<string, CollectionInfo[]>>({})

  const folderHelpers = useMemo((): FolderHelpers => {
    const sortFolders = (folderList: Folder[]): Folder[] =>
      [...folderList].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const rootFolders = sortFolders(folders.filter(f => !f.parentId))

    const getChildFolders = (parentId: string): Folder[] => sortFolders(folders.filter(f => f.parentId === parentId))

    const getDescendantIds = (folderId: string, visited = new Set<string>()): string[] => {
      if (visited.has(folderId)) return []
      visited.add(folderId)
      const children = getChildFolders(folderId)
      let descendants = children.map(c => c.id)
      children.forEach(child => {
        descendants = [...descendants, ...getDescendantIds(child.id, visited)]
      })
      return descendants
    }

    const getFolderDepth = (folderId: string, depth = 0): number => {
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

  useEffect(() => {
    if (go?.ListFavorites) {
      go.ListFavorites().then(keys => {
        setFavorites(new Set(keys || []))
      }).catch(err => {
        console.error('Failed to load favorites:', err)
      })
    }
    if (go?.ListDatabaseFavorites) {
      go.ListDatabaseFavorites().then(keys => {
        setDatabaseFavorites(keys || [])
      }).catch(err => {
        console.error('Failed to load database favorites:', err)
      })
    }
  }, [])

  const handleToggleFavorite = async (connId: string, dbName: string, collName: string): Promise<void> => {
    const key = `${connId}:${dbName}:${collName}`
    const isFavorite = favorites.has(key)
    try {
      if (isFavorite) {
        await go?.RemoveFavorite?.(connId, dbName, collName)
        setFavorites(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        notify.success(`Removed "${collName}" from favorites`)
      } else {
        await go?.AddFavorite?.(connId, dbName, collName)
        setFavorites(prev => new Set([...prev, key]))
        notify.success(`Added "${collName}" to favorites`)
      }
    } catch (err) {
      notify.error(`Failed to update favorites: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggleDatabaseFavorite = async (connId: string, dbName: string): Promise<void> => {
    const key = `db:${connId}:${dbName}`
    const isFavorite = databaseFavorites.includes(key)
    try {
      if (isFavorite) {
        await go?.RemoveDatabaseFavorite?.(connId, dbName)
        setDatabaseFavorites(prev => prev.filter(k => k !== key))
        notify.success(`Removed "${dbName}" from favorites`)
      } else {
        await go?.AddDatabaseFavorite?.(connId, dbName)
        setDatabaseFavorites(prev => [...prev, key])
        notify.success(`Added "${dbName}" to favorites`)
      }
    } catch (err) {
      notify.error(`Failed to update database favorites: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const toggleDbSortMode = (): void => {
    const newMode: DbSortMode = dbSortMode === 'alpha' ? 'lastAccessed' : 'alpha'
    setDbSortMode(newMode)
    try {
      localStorage.setItem('mongopal-db-sort-mode', newMode)
    } catch {
      // Ignore localStorage errors
    }
  }

  const searchResults = useMemo((): SearchResults => {
    const query = searchQuery.toLowerCase().trim()

    if (!query) {
      return {
        filteredConnections: connections as ExtendedSavedConnection[],
        matchInfo: {},
        autoExpandConnections: {},
        autoExpandDatabases: {},
      }
    }

    const filteredConnections: ExtendedSavedConnection[] = []
    const matchInfo: Record<string, ConnectionMatchInfo> = {}
    const autoExpandConnections: Record<string, boolean> = {}
    const autoExpandDatabases: Record<string, boolean> = {}

    connections.forEach(conn => {
      const connNameMatches = conn.name.toLowerCase().includes(query)
      const connDatabases = databases[conn.id] || []

      const matchedDatabases: string[] = []
      const matchedCollections: Record<string, string[]> = {}

      connDatabases.forEach(db => {
        const dbNameMatches = db.name.toLowerCase().includes(query)
        const dbCollections = collectionsMap[`${conn.id}:${db.name}`] || []

        const matchedCollsInDb = dbCollections
          .filter(coll => coll.name.toLowerCase().includes(query))
          .map(coll => coll.name)

        if (dbNameMatches) {
          matchedDatabases.push(db.name)
        }

        if (matchedCollsInDb.length > 0) {
          matchedCollections[db.name] = matchedCollsInDb
          autoExpandDatabases[`${conn.id}:${db.name}`] = true
        }
      })

      const hasMatchingDb = matchedDatabases.length > 0
      const hasMatchingColl = Object.keys(matchedCollections).length > 0

      if (connNameMatches || hasMatchingDb || hasMatchingColl) {
        filteredConnections.push(conn as ExtendedSavedConnection)

        matchInfo[conn.id] = {
          matchedConnection: connNameMatches,
          matchedDatabases,
          matchedCollections,
        }

        if ((hasMatchingDb || hasMatchingColl) && !connNameMatches) {
          autoExpandConnections[conn.id] = true
        }
      }
    })

    return {
      filteredConnections,
      matchInfo,
      autoExpandConnections,
      autoExpandDatabases,
    }
  }, [searchQuery, connections, databases, collectionsMap])

  const { filteredConnections, matchInfo, autoExpandConnections, autoExpandDatabases } = searchResults

  useEffect(() => {
    if (!searchQuery.trim()) return

    Object.keys(autoExpandConnections).forEach(connId => {
      if (autoExpandConnections[connId] && !expandedConnections[connId]) {
        setExpandedConnections(prev => ({ ...prev, [connId]: true }))
      }
    })

    Object.keys(autoExpandDatabases).forEach(key => {
      if (autoExpandDatabases[key] && !expandedDatabases[key]) {
        setExpandedDatabases(prev => ({ ...prev, [key]: true }))
      }
    })
  }, [searchQuery, autoExpandConnections, autoExpandDatabases])

  const sortConnections = (connList: ExtendedSavedConnection[]): ExtendedSavedConnection[] =>
    [...connList].sort((a, b) => {
      const aTime = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
      const bTime = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
      if (aTime !== bTime) return bTime - aTime
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

  const rootConnections = sortConnections(filteredConnections.filter(c => !c.folderId))
  const connectionsByFolder = useMemo(() => {
    const byFolder: Record<string, ExtendedSavedConnection[]> = {}
    filteredConnections.forEach(conn => {
      if (conn.folderId) {
        if (!byFolder[conn.folderId]) {
          byFolder[conn.folderId] = []
        }
        byFolder[conn.folderId].push(conn)
      }
    })
    Object.keys(byFolder).forEach(folderId => {
      byFolder[folderId] = sortConnections(byFolder[folderId])
    })
    return byFolder
  }, [filteredConnections])

  const visibleNodes = useMemo((): VisibleNode[] => {
    const nodes: VisibleNode[] = []

    const getChildFolders = (parentId: string): Folder[] =>
      folders.filter(f => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const addFolder = (folder: Folder, _index: number, _totalSiblings: number, parentNodeId: string | null = null): void => {
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
        expanded: isExpanded ?? false,
        parentId: parentNodeId,
      })

      if (isExpanded) {
        childFolders.forEach((childFolder, childIndex) => {
          addFolder(childFolder, childIndex, childFolders.length + folderConnections.length, folderNodeId)
        })
        folderConnections.forEach((conn, connIndex) => {
          addConnection(conn, childFolders.length + connIndex, childFolders.length + folderConnections.length, folderNodeId)
        })
      }
    }

    const addConnection = (conn: ExtendedSavedConnection, _index: number, _totalConnections: number, parentId: string | null = null): void => {
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
        expanded: isExpanded ?? false,
        parentId,
        isConnected,
      })

      if (isExpanded && isConnected) {
        // Sort databases the same way as visual display for consistent keyboard navigation
        const sortedDatabases = [...connDatabases].sort((a, b) => {
          const aKey = `db:${conn.id}:${a.name}`
          const bKey = `db:${conn.id}:${b.name}`
          const aIsFav = databaseFavorites?.includes(aKey)
          const bIsFav = databaseFavorites?.includes(bKey)

          // Favorites first
          if (aIsFav !== bIsFav) return aIsFav ? -1 : 1

          // Then by sort mode
          if (dbSortMode === 'lastAccessed') {
            const aAccessed = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
            const bAccessed = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
            if (aAccessed !== bAccessed) return bAccessed - aAccessed
          }
          return a.name.localeCompare(b.name)
        })

        sortedDatabases.forEach((db, dbIndex) => {
          addDatabase(conn.id, db, dbIndex, sortedDatabases.length, connNodeId)
        })
      }
    }

    const addDatabase = (connId: string, db: DatabaseInfoWithAccess, _index: number, _totalDbs: number, parentId: string): void => {
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
        hasChildren: hasCollections || true,
        expanded: isExpanded ?? false,
        parentId,
      })

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

    const rootFolders = folders.filter(f => !f.parentId)
    rootFolders.forEach((folder, idx) => addFolder(folder, idx, rootFolders.length + rootConnections.length))

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
    dbSortMode,
    databaseFavorites,
  ])

  // Scroll last accessed database into view after reordering
  useEffect(() => {
    if (lastAccessedDbNodeRef.current && dbSortMode === 'lastAccessed') {
      const nodeId = lastAccessedDbNodeRef.current
      // Wait for DOM to update after reordering
      requestAnimationFrame(() => {
        const element = treeRef.current?.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
        lastAccessedDbNodeRef.current = null
      })
    }
  }, [visibleNodes, dbSortMode])

  const handleNodeAction = useCallback((node: VisibleNode, action: NodeAction): void => {
    if (!node) return

    switch (action) {
      case 'expand':
        if (node.type === 'folder' && node.folderId) {
          setExpandedFolders(prev => ({ ...prev, [node.folderId!]: true }))
        } else if (node.type === 'connection' && node.connectionId) {
          setExpandedConnections(prev => ({ ...prev, [node.connectionId!]: true }))
          if (!node.isConnected) {
            connect(node.connectionId)
          }
        } else if (node.type === 'database' && node.connectionId && node.databaseName) {
          setExpandedDatabases(prev => ({ ...prev, [`${node.connectionId}:${node.databaseName}`]: true }))
        }
        break

      case 'collapse':
        if (node.type === 'folder' && node.folderId) {
          setExpandedFolders(prev => ({ ...prev, [node.folderId!]: false }))
        } else if (node.type === 'connection' && node.connectionId) {
          setExpandedConnections(prev => ({ ...prev, [node.connectionId!]: false }))
        } else if (node.type === 'database' && node.connectionId && node.databaseName) {
          setExpandedDatabases(prev => ({ ...prev, [`${node.connectionId}:${node.databaseName}`]: false }))
        }
        break

      case 'activate':
        if (node.type === 'folder' && node.folderId) {
          setExpandedFolders(prev => ({ ...prev, [node.folderId!]: !prev[node.folderId!] }))
        } else if (node.type === 'connection' && node.connectionId) {
          if (!node.isConnected) {
            connect(node.connectionId)
          }
          setExpandedConnections(prev => ({ ...prev, [node.connectionId!]: !prev[node.connectionId!] }))
        } else if (node.type === 'database' && node.connectionId && node.databaseName) {
          setExpandedDatabases(prev => ({ ...prev, [`${node.connectionId}:${node.databaseName}`]: !prev[`${node.connectionId}:${node.databaseName}`] }))
        } else if (node.type === 'collection' && node.connectionId && node.databaseName && node.collectionName) {
          openTab(node.connectionId, node.databaseName, node.collectionName)
        }
        break
    }
  }, [connect, openTab])

  const { handleKeyDown: handleTreeKeyDown } = useTreeKeyboardNavigation(
    treeRef as RefObject<HTMLDivElement>,
    visibleNodes,
    handleNodeAction,
    focusedNodeId,
    setFocusedNodeId
  )

  const toggleFolder = (folderId: string): void => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  const handleCreateFolder = async (parentId = ''): Promise<void> => {
    if (!newFolderName.trim()) return
    try {
      await createFolder(newFolderName.trim(), parentId)
      setNewFolderName('')
      setShowNewFolderInput(false)
      setNewSubfolderParentId(null)
      notify.success('Folder created')
      if (parentId) {
        setExpandedFolders(prev => ({ ...prev, [parentId]: true }))
      }
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeleteFolder = async (folderId: string): Promise<void> => {
    try {
      await deleteFolder(folderId)
      notify.success('Folder deleted')
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    }
  }

  const handleRenameFolder = async (folderId: string, newName: string): Promise<void> => {
    if (!newName.trim()) return
    try {
      const folder = folders.find(f => f.id === folderId)
      if (go?.UpdateFolder) {
        await go.UpdateFolder(folderId, newName.trim(), folder?.parentId || '')
        await loadConnections()
        notify.success('Folder renamed')
      }
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    } finally {
      setRenamingFolderId(null)
      setRenameFolderValue('')
    }
  }

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

  const handleFolderDragOver = (e: React.DragEvent, folderId: string | null): void => {
    e.preventDefault()
    e.stopPropagation()

    if (draggingFolderIdRef.current === folderId) {
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

  const handleFolderDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    const relatedTarget = e.relatedTarget as Node | null
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverFolderId(null)
    }
  }

  const handleFolderDrop = async (e: React.DragEvent, targetFolderId: string | null): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()

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
          notify.error(`Failed to move connection: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    const sourceFolderId = e.dataTransfer.getData('application/x-mongopal-folder')
    if (sourceFolderId && sourceFolderId !== '') {
      const sourceFolder = folders.find(f => f.id === sourceFolderId)
      const targetId = targetFolderId || ''
      const currentParentId = sourceFolder?.parentId || ''

      if (sourceFolderId === targetFolderId) {
        draggingFolderIdRef.current = null
        setDraggingFolderId(null)
        setDragOverFolderId(null)
        return
      }
      const descendants = folderHelpers.getDescendantIds(sourceFolderId)
      if (targetFolderId && descendants.includes(targetFolderId)) {
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
          notify.error(`Failed to move folder: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    setDraggingConnectionId(null)
    draggingFolderIdRef.current = null
    setDraggingFolderId(null)
    setDragOverFolderId(null)
  }

  const showContextMenu = (x: number, y: number, items: ContextMenuItem[]): void => {
    setContextMenu({ x, y, items })
  }

  const handleCopyURI = async (conn: SavedConnection): Promise<void> => {
    try {
      await navigator.clipboard.writeText(conn.uri)
      notify.success('Connection URI copied to clipboard')
    } catch (err) {
      console.error('Failed to copy URI:', err)
      notify.error('Failed to copy URI to clipboard')
    }
  }

  const handleDisconnect = async (connId: string): Promise<void> => {
    await disconnect(connId, closeTabsForConnection)
  }

  const handleDisconnectAll = async (): Promise<void> => {
    await disconnectAll(closeAllTabs)
  }

  const handleDisconnectOthers = async (keepConnId: string): Promise<void> => {
    await disconnectOthers(keepConnId, keepOnlyConnectionTabs)
  }

  const handleDropDatabase = (connId: string, dbName: string, removeFromState: (dbName: string) => void): void => {
    setConfirmDialog({
      title: `Drop Database "${dbName}"?`,
      message: `This will permanently delete the database "${dbName}" and ALL its collections. This action cannot be undone.`,
      confirmText: 'Drop Database',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await dropDatabase(connId, dbName)
          closeTabsForDatabase(connId, dbName)
          removeFromState?.(dbName)
          setDatabases(prev => ({
            ...prev,
            [connId]: (prev[connId] || []).filter(db => db.name !== dbName)
          }))
          notify.success(`Database "${dbName}" dropped`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
        }
      },
    })
  }

  const handleDropCollection = (connId: string, dbName: string, collName: string, removeFromState: (dbName: string, collName: string) => void): void => {
    setConfirmDialog({
      title: `Drop Collection "${collName}"?`,
      message: `This will permanently delete the collection "${collName}" and ALL its documents. This action cannot be undone.`,
      confirmText: 'Drop Collection',
      confirmStyle: 'danger',
      onConfirm: async () => {
        try {
          await dropCollection(connId, dbName, collName)
          closeTabsForCollection(connId, dbName, collName)
          removeFromState?.(dbName, collName)
          notify.success(`Collection "${collName}" dropped`)
          setConfirmDialog(null)
        } catch (err) {
          notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
        }
      },
    })
  }

  const handleClearCollection = (connId: string, dbName: string, collName: string): void => {
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
          notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
        }
      },
    })
  }

  const handleSelectCollection = (connId: string, dbName: string, collName: string): void => {
    setSelectedItem(`${connId}:${dbName}:${collName}`)
    setSelectedCollection(collName)
  }

  const handleOpenCollection = (connId: string, dbName: string, collName: string): void => {
    setSelectedCollection(collName)
    openTab(connId, dbName, collName)
  }

  const renderFolderNode = (folder: Folder, _index: number, _siblings: number, level = 0): ReactNode => {
    const folderConnections = connectionsByFolder[folder.id] || []
    const childFolders = folderHelpers.getChildFolders(folder.id)

    if (renamingFolderId === folder.id) {
      return (
        <div key={folder.id} className="px-2 py-1" style={{ paddingLeft: `${level * 12 + 8}px` }}>
          <div className="flex items-center gap-1">
            <span className="text-text-muted"><FolderIcon /></span>
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

    const handleContextMenu = (e: React.MouseEvent): void => {
      e.preventDefault()
      const menuItems: ContextMenuItem[] = [
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
      if (folder.parentId) {
        menuItems.push({ label: 'Move to Root', onClick: async () => {
          try {
            await moveFolderToFolder(folder.id, '')
            notify.success('Moved folder to root')
          } catch (err) {
            notify.error(`Failed to move folder: ${err instanceof Error ? err.message : String(err)}`)
          }
        }})
      }
      menuItems.push({ type: 'separator' })
      menuItems.push({ label: 'Delete Folder', onClick: () => handleDeleteFolder(folder.id), danger: true })
      showContextMenu(e.clientX, e.clientY, menuItems)
    }

    return (
      <FolderNode
        key={folder.id}
        folder={folder}
        level={level}
        childFolders={childFolders}
        folderConnections={folderConnections}
        expanded={expandedFolders[folder.id] ?? false}
        onToggle={() => toggleFolder(folder.id)}
        onContextMenu={handleContextMenu}
        focusedNodeId={focusedNodeId}
        onNodeFocus={setFocusedNodeId}
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

  const renderConnectionNode = (conn: ExtendedSavedConnection, _index: number, _totalConnections: number, level = 0): ReactNode => {
    const connMatchInfo = matchInfo[conn.id] || {
      matchedConnection: false,
      matchedDatabases: [],
      matchedCollections: {},
    }

    return (
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
        onShowServerInfo={() => onShowServerInfo?.(conn.id, conn.name)}
        onExportDatabases={() => onExportDatabases?.(conn.id, conn.name)}
        onImportDatabases={() => onImportDatabases?.(conn.id, conn.name)}
        onExportCollections={(dbName) => onExportCollections?.(conn.id, conn.name, dbName)}
        onImportCollections={(dbName) => onImportCollections?.(conn.id, conn.name, dbName)}
        onError={(msg) => notify.error(msg)}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        databaseFavorites={databaseFavorites}
        onToggleDatabaseFavorite={handleToggleDatabaseFavorite}
        dbSortMode={dbSortMode}
        onDatabaseAccessed={(connId, dbName) => {
          // Store the node ID to scroll to after reordering
          lastAccessedDbNodeRef.current = `db:${connId}:${dbName}`
          setDatabases(prev => ({
            ...prev,
            [connId]: (prev[connId] || []).map(db =>
              db.name === dbName ? { ...db, lastAccessedAt: new Date().toISOString() } : db
            )
          }))
        }}
        focusedNodeId={focusedNodeId}
        onNodeFocus={setFocusedNodeId}
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
        searchQuery={searchQuery}
        connectionNameMatched={connMatchInfo.matchedConnection}
        matchingDatabases={connMatchInfo.matchedDatabases}
        matchingCollections={connMatchInfo.matchedCollections}
      />
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Search bar - draggable header area */}
      <div className="p-2 border-b border-border titlebar-drag">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
          <input
            type="text"
            placeholder="Search connections, databases, collections..."
            className="input py-1.5 text-sm titlebar-no-drag"
            style={{ paddingLeft: '2.5rem', paddingRight: searchQuery ? '2.5rem' : '0.75rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-dim hover:text-text-secondary rounded hover:bg-surface-hover titlebar-no-drag"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <ClearIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Action buttons - draggable with no-drag on buttons */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border titlebar-drag">
        <button
          className="icon-btn p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-light titlebar-no-drag"
          onClick={onManageConnections}
          title="Manage Connections"
        >
          <ServerIcon className="w-4 h-4" />
        </button>
        <button
          className="icon-btn p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-light titlebar-no-drag"
          onClick={() => setShowNewFolderInput(true)}
          title="New Folder"
        >
          <FolderIcon className="w-4 h-4" />
        </button>
        <button
          className="icon-btn p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-light ml-auto titlebar-no-drag"
          onClick={toggleDbSortMode}
          title={dbSortMode === 'alpha' ? 'Sort by Name (click for Recent)' : 'Sort by Recent (click for Name)'}
        >
          {dbSortMode === 'alpha' ? <SortAlphaIcon className="w-4 h-4" /> : <SortClockIcon className="w-4 h-4" />}
        </button>
        {activeConnections.length > 0 && (
          <button
            className="icon-btn p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-light titlebar-no-drag"
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
            <div className="text-xs text-text-muted mb-1">
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
          if (e.target === treeRef.current && visibleNodes.length > 0 && !focusedNodeId) {
            setFocusedNodeId(visibleNodes[0].id)
            const firstNode = treeRef.current?.querySelector(`[data-node-id="${visibleNodes[0].id}"]`) as HTMLElement | null
            firstNode?.focus()
          }
        }}
      >
        {filteredConnections.length === 0 && folders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6 py-8">
            {connections.length === 0 ? (
              <div className="space-y-5 text-center max-w-[220px]">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ServerIcon className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-text font-semibold text-base mb-2">Welcome to MongoPal</h3>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Get started by adding your first MongoDB connection to explore databases and collections.
                  </p>
                </div>
                <button
                  className="btn btn-primary w-full py-2.5"
                  onClick={onManageConnections}
                >
                  <ServerIcon className="w-4 h-4 mr-2" />
                  Manage Connections
                </button>
                <p className="text-text-dim text-xs">
                  Tip: You can also press Ctrl+N to add a connection
                </p>
              </div>
            ) : (
              <p className="text-text-muted text-sm">No matching connections</p>
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
              onDragOver={(e) => handleFolderDragOver(e, null)}
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
                  className={`px-4 py-2 text-xs text-text-muted italic border border-dashed rounded mx-2 my-1 transition-colors ${
                    dragOverFolderId === 'root'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border-light'
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
