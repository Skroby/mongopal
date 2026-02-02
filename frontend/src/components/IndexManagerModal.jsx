import { useState, useEffect } from 'react'
import { useNotification } from './NotificationContext'
import ConfirmDialog from './ConfirmDialog'

// Access window.go dynamically for testability
const getGo = () => window.go?.main?.App

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const MinusIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
  </svg>
)

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatKeys(keys) {
  return Object.entries(keys)
    .map(([field, direction]) => `${field}: ${direction === 1 ? '1' : '-1'}`)
    .join(', ')
}

// Create Index Form Component
function CreateIndexForm({ onSubmit, onCancel, creating }) {
  const [keys, setKeys] = useState([{ field: '', direction: 1 }])
  const [options, setOptions] = useState({
    unique: false,
    sparse: false,
    background: true,
    name: '',
    expireAfterSeconds: '',
  })

  const addKey = () => {
    setKeys([...keys, { field: '', direction: 1 }])
  }

  const removeKey = (index) => {
    if (keys.length > 1) {
      setKeys(keys.filter((_, i) => i !== index))
    }
  }

  const updateKey = (index, field, value) => {
    const newKeys = [...keys]
    newKeys[index][field] = value
    setKeys(newKeys)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // Build keys object
    const keysObj = {}
    for (const key of keys) {
      if (key.field.trim()) {
        keysObj[key.field.trim()] = key.direction
      }
    }

    if (Object.keys(keysObj).length === 0) {
      return
    }

    // Build options
    const opts = {
      unique: options.unique,
      sparse: options.sparse,
      background: options.background,
      name: options.name.trim() || '',
      expireAfterSeconds: options.expireAfterSeconds ? parseInt(options.expireAfterSeconds, 10) : 0,
    }

    onSubmit(keysObj, opts)
  }

  const isValid = keys.some(k => k.field.trim())

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Index Keys */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Index Keys
        </label>
        <div className="space-y-2">
          {keys.map((key, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 input py-1.5 px-2 text-sm font-mono"
                placeholder="field.path"
                value={key.field}
                onChange={(e) => updateKey(index, 'field', e.target.value)}
                autoFocus={index === 0}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <select
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
                value={key.direction}
                onChange={(e) => updateKey(index, 'direction', parseInt(e.target.value, 10))}
              >
                <option value={1}>Ascending (1)</option>
                <option value={-1}>Descending (-1)</option>
              </select>
              {keys.length > 1 && (
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
                  onClick={() => removeKey(index)}
                  title="Remove key"
                >
                  <MinusIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 text-xs text-accent hover:text-accent/80 flex items-center gap-1"
          onClick={addKey}
        >
          <PlusIcon className="w-3 h-3" />
          Add key
        </button>
      </div>

      {/* Options */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Options
        </label>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                checked={options.unique}
                onChange={(e) => setOptions({ ...options, unique: e.target.checked })}
              />
              Unique
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                checked={options.sparse}
                onChange={(e) => setOptions({ ...options, sparse: e.target.checked })}
              />
              Sparse
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                checked={options.background}
                onChange={(e) => setOptions({ ...options, background: e.target.checked })}
              />
              Background
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Index Name (optional)</label>
              <input
                type="text"
                className="w-full input py-1.5 px-2 text-sm"
                placeholder="Auto-generated if empty"
                value={options.name}
                onChange={(e) => setOptions({ ...options, name: e.target.value })}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div className="w-40">
              <label className="block text-xs text-zinc-400 mb-1">TTL (seconds)</label>
              <input
                type="number"
                className="w-full input py-1.5 px-2 text-sm"
                placeholder="0 = disabled"
                value={options.expireAfterSeconds}
                onChange={(e) => setOptions({ ...options, expireAfterSeconds: e.target.value })}
                min="0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={creating}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!isValid || creating}>
          {creating ? 'Creating...' : 'Create Index'}
        </button>
      </div>
    </form>
  )
}

export default function IndexManagerModal({ connectionId, database, collection, onClose }) {
  const { notify } = useNotification()
  const [indexes, setIndexes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadIndexes()
  }, [connectionId, database, collection])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !confirmDelete && !showCreateForm) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, confirmDelete, showCreateForm])

  const loadIndexes = async () => {
    setLoading(true)
    setError(null)
    try {
      const go = getGo()
      if (go?.ListIndexes) {
        const result = await go.ListIndexes(connectionId, database, collection)
        setIndexes(result || [])
      }
    } catch (err) {
      const errorMsg = err?.message || String(err)
      setError(errorMsg)
      notify.error(`Failed to load indexes: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateIndex = async (keys, opts) => {
    setCreating(true)
    try {
      const go = getGo()
      if (go?.CreateIndex) {
        await go.CreateIndex(connectionId, database, collection, keys, opts)
        notify.success('Index created successfully')
        setShowCreateForm(false)
        await loadIndexes()
      }
    } catch (err) {
      const errorMsg = err?.message || String(err)
      notify.error(`Failed to create index: ${errorMsg}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDropIndex = async (indexName) => {
    setDeleting(true)
    try {
      const go = getGo()
      if (go?.DropIndex) {
        await go.DropIndex(connectionId, database, collection, indexName)
        notify.success(`Index "${indexName}" dropped`)
        setConfirmDelete(null)
        await loadIndexes()
      }
    } catch (err) {
      const errorMsg = err?.message || String(err)
      notify.error(`Failed to drop index: ${errorMsg}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-medium text-zinc-100">Index Manager</h2>
          <p className="text-sm text-zinc-400 mt-0.5 font-mono">
            {database}.{collection}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : error ? (
            <div className="py-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button className="mt-3 btn btn-secondary text-sm" onClick={loadIndexes}>
                Retry
              </button>
            </div>
          ) : showCreateForm ? (
            <CreateIndexForm
              onSubmit={handleCreateIndex}
              onCancel={() => setShowCreateForm(false)}
              creating={creating}
            />
          ) : (
            <>
              {/* Index list */}
              <div className="flex-1 overflow-y-auto">
                {indexes.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400">
                    No indexes found
                  </div>
                ) : (
                  <div className="space-y-2">
                    {indexes.map((index) => {
                      const isDefaultId = index.name === '_id_'
                      return (
                        <div
                          key={index.name}
                          className="bg-zinc-800 rounded p-3 flex items-start justify-between gap-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-zinc-100">{index.name}</span>
                              {index.unique && (
                                <span className="px-1.5 py-0.5 text-xs bg-blue-900/50 text-blue-400 rounded">
                                  unique
                                </span>
                              )}
                              {index.sparse && (
                                <span className="px-1.5 py-0.5 text-xs bg-purple-900/50 text-purple-400 rounded">
                                  sparse
                                </span>
                              )}
                              {index.ttl > 0 && (
                                <span className="px-1.5 py-0.5 text-xs bg-amber-900/50 text-amber-400 rounded">
                                  TTL: {index.ttl}s
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-zinc-400 font-mono">
                              {`{ ${formatKeys(index.keys)} }`}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              Size: {formatBytes(index.size)}
                              {index.usageCount > 0 && (
                                <span className="ml-3">Usage: {index.usageCount.toLocaleString()} ops</span>
                              )}
                            </div>
                          </div>
                          {!isDefaultId && (
                            <button
                              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 flex-shrink-0"
                              onClick={() => setConfirmDelete(index.name)}
                              title="Drop index"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Create button */}
              <div className="mt-4 flex-shrink-0">
                <button
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                  onClick={() => setShowCreateForm(true)}
                >
                  <PlusIcon className="w-4 h-4" />
                  Create New Index
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!showCreateForm && (
          <div className="px-4 py-3 border-t border-border flex justify-end flex-shrink-0">
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <ConfirmDialog
          open={true}
          title="Drop Index?"
          message={`Are you sure you want to drop the index "${confirmDelete}"? This action cannot be undone.`}
          confirmLabel={deleting ? 'Dropping...' : 'Drop Index'}
          danger={true}
          onConfirm={() => handleDropIndex(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
