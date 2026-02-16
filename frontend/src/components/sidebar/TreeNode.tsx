import React, { useRef } from 'react'
import type { TreeNodeProps } from './types'
import { ChevronDown, ChevronRight, StarIcon } from './icons'
import { HighlightedText } from './icons'

export function TreeNode({
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
