import { useState, useEffect, useCallback, ChangeEvent } from 'react'
import { useNotification } from './NotificationContext'
import ConfirmDialog from './ConfirmDialog'
import SaveQueryModal from './SaveQueryModal'
import { SavedQuery } from '../types/wails.d'

const go = window.go?.main?.App

/** Group by options for organizing queries */
export type GroupByOption = 'collection' | 'database' | 'none'

/**
 * Props for the SavedQueriesManager component.
 */
export interface SavedQueriesManagerProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when the modal is closed */
  onClose: () => void
  /** Connection ID to filter queries */
  connectionId: string
  /** Optional database filter */
  database?: string
  /** Optional collection filter */
  collection?: string
  /** Callback when a query is selected to use */
  onQuerySelected?: (query: SavedQuery) => void
  /** Callback when queries are changed (added, updated, deleted) */
  onQueriesChanged?: () => void
}

/** Grouped queries by key (collection or database path) */
interface GroupedQueries {
  [key: string]: SavedQuery[]
}

/**
 * Modal for managing all saved queries (list, edit, delete).
 */
export default function SavedQueriesManager({
  isOpen,
  onClose,
  connectionId,
  database: _database = '',
  collection: _collection = '',
  onQuerySelected,
  onQueriesChanged,
}: SavedQueriesManagerProps): React.ReactElement | null {
  // Note: _database and _collection are available for future filtering but currently unused
  void _database
  void _collection
  const { notify } = useNotification()
  const [queries, setQueries] = useState<SavedQuery[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [filter, setFilter] = useState<string>('')
  const [groupBy, setGroupBy] = useState<GroupByOption>('collection')

  // Edit modal state
  const [editingQuery, setEditingQuery] = useState<SavedQuery | null>(null)

  // Delete confirmation state
  const [queryToDelete, setQueryToDelete] = useState<SavedQuery | null>(null)
  const [deleting, setDeleting] = useState<boolean>(false)

  // Fetch all queries for the connection
  const fetchQueries = useCallback(async (): Promise<void> => {
    if (!connectionId) return

    setLoading(true)
    try {
      if (go?.ListSavedQueries) {
        // Fetch all queries for this connection
        const result = await go.ListSavedQueries(connectionId, '', '')
        setQueries(result || [])
      }
    } catch (err) {
      console.error('Failed to fetch saved queries:', err)
      notify.error('Failed to load saved queries')
      setQueries([])
    } finally {
      setLoading(false)
    }
  }, [connectionId, notify])

  useEffect(() => {
    if (isOpen) {
      fetchQueries()
    }
  }, [isOpen, fetchQueries])

  // Filter queries based on search
  const filteredQueries = queries.filter((q) => {
    if (!filter) return true
    const searchLower = filter.toLowerCase()
    return (
      q.name.toLowerCase().includes(searchLower) ||
      q.description?.toLowerCase().includes(searchLower) ||
      q.database.toLowerCase().includes(searchLower) ||
      q.collection.toLowerCase().includes(searchLower) ||
      q.query.toLowerCase().includes(searchLower)
    )
  })

  // Group queries
  const groupedQueries: GroupedQueries = (() => {
    if (groupBy === 'none') {
      return { All: filteredQueries }
    }

    const groups: GroupedQueries = {}
    filteredQueries.forEach((q) => {
      const key = groupBy === 'database'
        ? q.database
        : `${q.database}.${q.collection}`
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(q)
    })

    // Sort groups by key
    const sortedGroups: GroupedQueries = {}
    Object.keys(groups)
      .sort()
      .forEach((key) => {
        sortedGroups[key] = groups[key]
      })

    return sortedGroups
  })()

  const handleDelete = async (): Promise<void> => {
    if (!queryToDelete) return

    setDeleting(true)
    try {
      if (go?.DeleteSavedQuery) {
        await go.DeleteSavedQuery(queryToDelete.id)
        notify.success('Query deleted')
        setQueries((prev) => prev.filter((q) => q.id !== queryToDelete.id))
        onQueriesChanged?.()
      }
    } catch (err) {
      const error = err as Error
      notify.error(error?.message || 'Failed to delete query')
    } finally {
      setDeleting(false)
      setQueryToDelete(null)
    }
  }

  const handleCopyQuery = async (query: SavedQuery): Promise<void> => {
    try {
      await navigator.clipboard.writeText(query.query)
      notify.success('Query copied to clipboard')
    } catch (err) {
      notify.error('Failed to copy query')
    }
  }

  const handleEditSaved = (savedQuery: SavedQuery): void => {
    // Update the query in the list
    setQueries((prev) =>
      prev.map((q) => (q.id === savedQuery.id ? savedQuery : q))
    )
    setEditingQuery(null)
    onQueriesChanged?.()
  }

  const handleSelectQuery = (query: SavedQuery): void => {
    onQuerySelected?.(query)
    onClose()
  }

  const handleFilterChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setFilter(e.target.value)
  }

  const handleGroupByChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    setGroupBy(e.target.value as GroupByOption)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-surface text-text border border-border rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-medium text-text">
              Saved Queries
            </h3>
            <button
              type="button"
              className="text-text-muted hover:text-text-light"
              onClick={onClose}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Toolbar */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-3">
            <input
              type="text"
              className="input !w-auto flex-1 text-sm"
              placeholder="Search queries..."
              value={filter}
              onChange={handleFilterChange}
              autoComplete="off"
            />
            <select
              className="input text-sm"
              value={groupBy}
              onChange={handleGroupByChange}
            >
              <option value="collection">Group by Collection</option>
              <option value="database">Group by Database</option>
              <option value="none">No Grouping</option>
            </select>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-text-dim">
                Loading...
              </div>
            ) : queries.length === 0 ? (
              <div className="py-12 text-center text-text-dim">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-text-dim"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
                <p>No saved queries yet</p>
                <p className="text-sm text-text-dim mt-1">
                  Save a query from the collection view to see it here
                </p>
              </div>
            ) : filteredQueries.length === 0 ? (
              <div className="py-12 text-center text-text-dim">
                No queries match your search
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {Object.entries(groupedQueries).map(([groupName, groupQueries]) => (
                  <div key={groupName}>
                    {groupBy !== 'none' && (
                      <h4 className="text-sm font-medium text-text-muted mb-2 px-1">
                        {groupName}
                      </h4>
                    )}
                    <div className="space-y-2">
                      {groupQueries.map((query) => (
                        <div
                          key={query.id}
                          className="bg-background border border-border rounded-lg p-3 hover:border-border-light transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h5 className="text-sm font-medium text-text-light truncate">
                                {query.name}
                              </h5>
                              {query.description && (
                                <p className="text-xs text-text-dim mt-0.5 line-clamp-2">
                                  {query.description}
                                </p>
                              )}
                              <pre className="mt-2 text-xs text-text-muted font-mono bg-surface rounded p-2 overflow-auto max-h-20">
                                {query.query}
                              </pre>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                className="p-1.5 text-text-muted hover:text-primary hover:bg-surface rounded"
                                title="Use this query"
                                onClick={() => handleSelectQuery(query)}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="p-1.5 text-text-muted hover:text-text-light hover:bg-surface rounded"
                                title="Copy query"
                                onClick={() => handleCopyQuery(query)}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="p-1.5 text-text-muted hover:text-text-light hover:bg-surface rounded"
                                title="Edit query"
                                onClick={() => setEditingQuery(query)}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="p-1.5 text-text-muted hover:text-error hover:bg-surface rounded"
                                title="Delete query"
                                onClick={() => setQueryToDelete(query)}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-sm text-text-dim">
              {queries.length} saved {queries.length === 1 ? 'query' : 'queries'}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Edit Query Modal */}
      {editingQuery && (
        <SaveQueryModal
          isOpen={true}
          onClose={() => setEditingQuery(null)}
          connectionId={editingQuery.connectionId}
          database={editingQuery.database}
          collection={editingQuery.collection}
          query={editingQuery.query}
          existingQuery={editingQuery}
          onSaved={handleEditSaved}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!queryToDelete}
        title="Delete Saved Query"
        message={`Are you sure you want to delete "${queryToDelete?.name}"? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setQueryToDelete(null)}
      />
    </>
  )
}
