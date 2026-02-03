import { useState, useEffect, useRef } from 'react'
import { useNotification } from './NotificationContext'

const go = window.go?.main?.App

/**
 * Modal for saving or editing a query.
 */
export default function SaveQueryModal({
  isOpen,
  onClose,
  connectionId,
  database,
  collection,
  query,
  existingQuery = null, // If provided, we're editing
  onSaved,
}) {
  const { notify } = useNotification()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef(null)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (existingQuery) {
        setName(existingQuery.name || '')
        setDescription(existingQuery.description || '')
      } else {
        setName('')
        setDescription('')
      }
      // Focus name input after modal renders
      setTimeout(() => nameInputRef.current?.focus(), 100)
    }
  }, [isOpen, existingQuery])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!name.trim()) {
      notify.error('Please enter a name for the query')
      return
    }

    setSaving(true)
    try {
      const queryData = {
        id: existingQuery?.id || '',
        name: name.trim(),
        description: description.trim(),
        connectionId,
        database,
        collection,
        query,
      }

      if (go?.SaveQuery) {
        const saved = await go.SaveQuery(queryData)
        notify.success(existingQuery ? 'Query updated' : 'Query saved')
        onSaved?.(saved)
        onClose()
      }
    } catch (err) {
      notify.error(err?.message || 'Failed to save query')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !saving) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-zinc-100">
            {existingQuery ? 'Edit Saved Query' : 'Save Query'}
          </h3>
          <p className="text-sm text-zinc-400 mt-0.5">
            {database} &gt; {collection}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            {/* Name input */}
            <div>
              <label htmlFor="query-name" className="block text-sm font-medium text-zinc-300 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="query-name"
                type="text"
                className="input w-full"
                placeholder="e.g., Active Users"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                maxLength={100}
                autoComplete="off"
              />
            </div>

            {/* Description input */}
            <div>
              <label htmlFor="query-description" className="block text-sm font-medium text-zinc-300 mb-1">
                Description <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="query-description"
                className="input w-full resize-none"
                placeholder="e.g., Users who logged in last 7 days"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
                rows={2}
                maxLength={500}
                autoComplete="off"
              />
            </div>

            {/* Query preview */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Query
              </label>
              <pre className="bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-400 font-mono overflow-auto max-h-24">
                {query}
              </pre>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving...' : existingQuery ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
