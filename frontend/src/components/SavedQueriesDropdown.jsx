import { useState, useEffect, useRef, useCallback } from 'react'
import { useNotification } from './NotificationContext'

const go = window.go?.main?.App

/**
 * Dropdown showing saved queries for the current collection.
 */
export default function SavedQueriesDropdown({
  connectionId,
  database,
  collection,
  onSelectQuery,
  onManageQueries,
  refreshTrigger = 0,
}) {
  const { notify } = useNotification()
  const [isOpen, setIsOpen] = useState(false)
  const [queries, setQueries] = useState([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)

  // Fetch saved queries for current collection
  const fetchQueries = useCallback(async () => {
    if (!connectionId || !database || !collection) {
      setQueries([])
      return
    }

    setLoading(true)
    try {
      if (go?.ListSavedQueries) {
        const result = await go.ListSavedQueries(connectionId, database, collection)
        setQueries(result || [])
      }
    } catch (err) {
      console.error('Failed to fetch saved queries:', err)
      setQueries([])
    } finally {
      setLoading(false)
    }
  }, [connectionId, database, collection])

  // Fetch on mount and when context changes
  useEffect(() => {
    fetchQueries()
  }, [fetchQueries, refreshTrigger])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !buttonRef.current?.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      buttonRef.current?.focus()
    }
  }

  const handleSelectQuery = (query) => {
    onSelectQuery?.(query.query)
    setIsOpen(false)
  }

  const toggleDropdown = () => {
    if (!isOpen) {
      fetchQueries() // Refresh when opening
    }
    setIsOpen(!isOpen)
  }

  const hasQueries = queries.length > 0

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-sm flex items-center gap-1"
        onClick={toggleDropdown}
        title={hasQueries ? 'Saved Queries' : 'No saved queries'}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
        <span className="hidden sm:inline">Saved</span>
        {hasQueries && (
          <span className="bg-zinc-700 text-zinc-300 text-xs px-1.5 py-0.5 rounded">
            {queries.length}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-1 w-72 bg-surface border border-border rounded-lg shadow-xl z-50"
          onKeyDown={handleKeyDown}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">
              Saved Queries
            </span>
            <button
              type="button"
              className="text-xs text-accent hover:text-accent/80"
              onClick={() => {
                setIsOpen(false)
                onManageQueries?.()
              }}
            >
              Manage All
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-zinc-500">
                Loading...
              </div>
            ) : queries.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-zinc-500">
                No saved queries for this collection
              </div>
            ) : (
              <ul className="py-1">
                {queries.map((query) => (
                  <li key={query.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                      onClick={() => handleSelectQuery(query)}
                    >
                      <div className="text-sm text-zinc-200 truncate">
                        {query.name}
                      </div>
                      {query.description && (
                        <div className="text-xs text-zinc-500 truncate mt-0.5">
                          {query.description}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border">
            <p className="text-xs text-zinc-500">
              Click to load query into filter
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
