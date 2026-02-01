import { useState, useEffect } from 'react'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'

const go = window.go?.main?.App

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatCount(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

export default function ExportCollectionsModal({ connectionId, connectionName, databaseName, onClose }) {
  const { notify } = useNotification()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedColls, setSelectedColls] = useState(new Set())
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    loadCollections()

    // Listen for export progress events
    const unsubProgress = EventsOn('export:progress', (data) => {
      setProgress(data)
    })
    const unsubComplete = EventsOn('export:complete', () => {
      setExporting(false)
      setProgress(null)
      notify.success('Export completed successfully')
      onClose()
    })
    const unsubCancelled = EventsOn('export:cancelled', () => {
      setExporting(false)
      setProgress(null)
      notify.info('Export cancelled')
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
    }
  }, [])

  const loadCollections = async () => {
    try {
      if (go?.GetCollectionsForExport) {
        const colls = await go.GetCollectionsForExport(connectionId, databaseName)
        setCollections(colls || [])
        // Pre-select all collections
        setSelectedColls(new Set((colls || []).map(c => c.name)))
      }
    } catch (err) {
      console.error('Failed to load collections:', err)
      notify.error(`Failed to load collections: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleCollection = (collName) => {
    setSelectedColls(prev => {
      const next = new Set(prev)
      if (next.has(collName)) {
        next.delete(collName)
      } else {
        next.add(collName)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedColls(new Set(collections.map(c => c.name)))
  }

  const deselectAll = () => {
    setSelectedColls(new Set())
  }

  const handleExport = async () => {
    if (selectedColls.size === 0) {
      notify.warning('Please select at least one collection')
      return
    }

    setExporting(true)
    setProgress({ collectionIndex: 0, collectionTotal: selectedColls.size })
    try {
      await go?.ExportCollections(connectionId, databaseName, Array.from(selectedColls))
    } catch (err) {
      console.error('Export failed:', err)
      notify.error(`Export failed: ${err?.message || String(err)}`)
      setExporting(false)
      setProgress(null)
    }
  }

  const getProgressPercent = () => {
    if (!progress) return 0
    if (progress.total > 0 && progress.current > 0) {
      return Math.min(100, (progress.current / progress.total) * 100)
    }
    // Fallback to collection-level progress
    if (progress.collectionTotal > 0) {
      return ((progress.collectionIndex - 1) / progress.collectionTotal) * 100
    }
    return 0
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary border border-border rounded-lg w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-zinc-100">Export Collections</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {connectionName} / {databaseName}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : exporting ? (
            <div className="p-4">
              <div className="mb-4">
                {/* Collection progress */}
                <div className="flex items-center justify-between text-sm text-zinc-300 mb-2 h-5">
                  <span>
                    Collection {progress?.collectionIndex || 0} of {progress?.collectionTotal || selectedColls.size}
                  </span>
                  <span className="text-zinc-500">
                    {progress?.collection}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                {/* Document count */}
                <div className="text-xs text-zinc-500 mt-1 h-4">
                  {progress?.total > 0 && (
                    <>{progress.current?.toLocaleString() || 0} / {progress.total?.toLocaleString()} documents</>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-500 text-center">
                Please wait while your collections are being exported...
              </p>
            </div>
          ) : (
            <>
              {/* Selection controls */}
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <button
                  className="text-sm text-accent hover:text-accent/80"
                  onClick={selectAll}
                >
                  Select All
                </button>
                <span className="text-zinc-600">|</span>
                <button
                  className="text-sm text-accent hover:text-accent/80"
                  onClick={deselectAll}
                >
                  Deselect All
                </button>
                <span className="ml-auto text-sm text-zinc-500">
                  {selectedColls.size} selected
                </span>
              </div>

              {/* Collection list */}
              <div className="flex-1 overflow-y-auto p-2">
                {collections.length === 0 ? (
                  <div className="text-center text-zinc-500 py-4">
                    No collections found in this database
                  </div>
                ) : (
                  collections.map(coll => (
                    <label
                      key={coll.name}
                      className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-zinc-700/50 ${
                        selectedColls.has(coll.name) ? 'bg-zinc-700/30' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                        checked={selectedColls.has(coll.name)}
                        onChange={() => toggleCollection(coll.name)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate">{coll.name}</div>
                        <div className="text-xs text-zinc-500">
                          {formatCount(coll.count)} docs
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {formatBytes(coll.sizeOnDisk)}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (exporting) {
                go?.CancelExport?.()
              } else {
                onClose()
              }
            }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || selectedColls.size === 0}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
