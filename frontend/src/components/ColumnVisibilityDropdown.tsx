import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react'

interface IconProps {
  className?: string
}

const ColumnsIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
  </svg>
)

const EyeIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
)

const EyeOffIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
)

// Virtual list constants
const ITEM_HEIGHT = 32 // px per column row
const VIEWPORT_HEIGHT = 256 // px visible area (8 items)
const BUFFER_ITEMS = 4 // extra items rendered above/below viewport

/**
 * Props for the ColumnVisibilityDropdown component.
 */
export interface ColumnVisibilityDropdownProps {
  /** List of all column names */
  allColumns?: string[]
  /** Set of hidden column names */
  hiddenColumns?: Set<string>
  /** Callback when a column is toggled */
  onToggleColumn: (column: string) => void
  /** Callback to show all columns */
  onShowAll: () => void
  /** Callback to hide all columns (optional, for bulk hide) */
  onHideAll?: (columns: string[]) => void
}

/**
 * Dropdown component for managing column visibility.
 * Uses virtual scrolling for performance with large column counts (LDH-07).
 */
export default function ColumnVisibilityDropdown({
  allColumns = [],
  hiddenColumns = new Set(),
  onToggleColumn,
  onShowAll,
  onHideAll,
}: ColumnVisibilityDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Only count hidden columns that actually exist in the current data
  const hiddenCount = allColumns.filter(col => hiddenColumns.has(col)).length
  const visibleCount = allColumns.length - hiddenCount

  // Filter columns based on search text
  const filteredColumns = filterText.trim()
    ? allColumns.filter(col => col.toLowerCase().includes(filterText.toLowerCase()))
    : allColumns

  // Virtual scrolling calculations
  const totalHeight = filteredColumns.length * ITEM_HEIGHT
  const useVirtualization = filteredColumns.length > 30
  const startIndex = useVirtualization
    ? Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_ITEMS)
    : 0
  const endIndex = useVirtualization
    ? Math.min(filteredColumns.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT) + BUFFER_ITEMS)
    : filteredColumns.length
  const visibleItems = filteredColumns.slice(startIndex, endIndex)
  const offsetY = startIndex * ITEM_HEIGHT

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop)
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Focus filter input when dropdown opens
  useEffect(() => {
    if (isOpen && filterInputRef.current) {
      filterInputRef.current.focus()
    }
  }, [isOpen])

  // Reset filter and scroll when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFilterText('')
      setScrollTop(0)
    }
  }, [isOpen])

  const handleFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value)
    setScrollTop(0)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }

  const handleHideAll = () => {
    if (onHideAll) {
      // Hide all visible (non-_id) columns
      const columnsToHide = allColumns.filter(col => col !== '_id')
      onHideAll(columnsToHide)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className={`icon-btn p-1.5 hover:bg-surface-hover flex items-center gap-1 ${
          hiddenCount > 0 ? 'text-amber-400' : 'text-text-muted hover:text-text-light'
        }`}
        onClick={() => setIsOpen(!isOpen)}
        title={hiddenCount > 0 ? `${hiddenCount} column${hiddenCount !== 1 ? 's' : ''} hidden` : 'Manage columns'}
      >
        <ColumnsIcon className="w-4 h-4" />
        {hiddenCount > 0 && (
          <span className="text-xs font-medium">{hiddenCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-xl z-50 flex flex-col" style={{ maxHeight: 400 }}>
          {/* Header with bulk actions */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-text-light">Column Visibility</span>
            <div className="flex items-center gap-2">
              {onHideAll && visibleCount > 1 && (
                <button
                  className="text-xs text-text-muted hover:text-text-light"
                  onClick={handleHideAll}
                >
                  Hide All
                </button>
              )}
              {hiddenCount > 0 && (
                <button
                  className="text-xs text-primary hover:text-primary/80"
                  onClick={() => {
                    onShowAll()
                    setIsOpen(false)
                  }}
                >
                  Show All
                </button>
              )}
            </div>
          </div>

          {/* Filter input */}
          {allColumns.length > 10 && (
            <div className="flex-shrink-0 p-2 border-b border-border">
              <input
                ref={filterInputRef}
                type="text"
                className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-text-light placeholder-text-dim focus:outline-none focus:border-border-light"
                placeholder="Filter columns..."
                value={filterText}
                onChange={handleFilterChange}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          )}

          {/* Column list with virtual scrolling */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto py-1"
            style={{ maxHeight: VIEWPORT_HEIGHT }}
            onScroll={handleScroll}
          >
            {filteredColumns.length === 0 ? (
              <div className="px-3 py-2 text-sm text-text-dim">
                {allColumns.length === 0 ? 'No columns' : 'No matching columns'}
              </div>
            ) : useVirtualization ? (
              /* Virtual scrolling for large column counts */
              <div style={{ height: totalHeight, position: 'relative' }}>
                <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
                  {visibleItems.map(column => {
                    const isHidden = hiddenColumns.has(column)
                    return (
                      <button
                        key={column}
                        className="w-full px-3 text-left text-sm hover:bg-surface-hover flex items-center gap-2 transition-colors"
                        style={{ height: ITEM_HEIGHT }}
                        onClick={() => onToggleColumn(column)}
                      >
                        <span className={isHidden ? 'text-text-dim' : 'text-primary'}>
                          {isHidden ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </span>
                        <span className={`flex-1 truncate ${isHidden ? 'text-text-dim line-through' : 'text-text-light'}`}>
                          {column}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* Direct rendering for small column counts */
              filteredColumns.map(column => {
                const isHidden = hiddenColumns.has(column)
                return (
                  <button
                    key={column}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-hover flex items-center gap-2 transition-colors"
                    onClick={() => onToggleColumn(column)}
                  >
                    <span className={isHidden ? 'text-text-dim' : 'text-primary'}>
                      {isHidden ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </span>
                    <span className={`flex-1 truncate ${isHidden ? 'text-text-dim line-through' : 'text-text-light'}`}>
                      {column}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer with column count summary */}
          <div className="flex-shrink-0 px-3 py-1.5 border-t border-border text-xs text-text-dim">
            {visibleCount} visible / {allColumns.length} total columns
          </div>
        </div>
      )}
    </div>
  )
}
