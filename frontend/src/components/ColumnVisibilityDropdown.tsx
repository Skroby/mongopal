import { useState, useRef, useEffect, type ChangeEvent } from 'react'

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
}

/**
 * Dropdown component for managing column visibility.
 * Shows a list of all columns with checkboxes to toggle visibility.
 */
export default function ColumnVisibilityDropdown({
  allColumns = [],
  hiddenColumns = new Set(),
  onToggleColumn,
  onShowAll,
}: ColumnVisibilityDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)

  const hiddenCount = hiddenColumns.size

  // Filter columns based on search text
  const filteredColumns = filterText.trim()
    ? allColumns.filter(col => col.toLowerCase().includes(filterText.toLowerCase()))
    : allColumns

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

  // Reset filter when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFilterText('')
    }
  }, [isOpen])

  const handleFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className={`icon-btn p-1.5 hover:bg-zinc-700 flex items-center gap-1 ${
          hiddenCount > 0 ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
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
        <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 flex flex-col max-h-80">
          {/* Header */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Column Visibility</span>
            {hiddenCount > 0 && (
              <button
                className="text-xs text-accent hover:text-accent/80"
                onClick={() => {
                  onShowAll()
                  setIsOpen(false)
                }}
              >
                Show All
              </button>
            )}
          </div>

          {/* Filter input */}
          {allColumns.length > 10 && (
            <div className="flex-shrink-0 p-2 border-b border-zinc-700">
              <input
                ref={filterInputRef}
                type="text"
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
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

          {/* Column list */}
          <div className="flex-1 overflow-auto py-1">
            {filteredColumns.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">
                {allColumns.length === 0 ? 'No columns' : 'No matching columns'}
              </div>
            ) : (
              filteredColumns.map(column => {
                const isHidden = hiddenColumns.has(column)
                return (
                  <button
                    key={column}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 transition-colors"
                    onClick={() => onToggleColumn(column)}
                  >
                    <span className={isHidden ? 'text-zinc-500' : 'text-accent'}>
                      {isHidden ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </span>
                    <span className={`flex-1 truncate ${isHidden ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {column}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer with hint */}
          <div className="flex-shrink-0 px-3 py-1.5 border-t border-zinc-700 text-xs text-zinc-500">
            Right-click column header to hide
          </div>
        </div>
      )}
    </div>
  )
}
