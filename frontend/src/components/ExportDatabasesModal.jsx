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

export default function ExportDatabasesModal({ connectionId, connectionName, onClose }) {
  const { notify } = useNotification()
  const [databases, setDatabases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDbs, setSelectedDbs] = useState(new Set())
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    loadDatabases()

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

  const loadDatabases = async () => {
    try {
      if (go?.GetDatabasesForExport) {
        const dbs = await go.GetDatabasesForExport(connectionId)
        setDatabases(dbs || [])
        // Pre-select all non-system databases
        const nonSystem = (dbs || [])
          .filter(db => !['admin', 'local', 'config'].includes(db.name))
          .map(db => db.name)
        setSelectedDbs(new Set(nonSystem))
      }
    } catch (err) {
      console.error('Failed to load databases:', err)
      notify.error(`Failed to load databases: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleDatabase = (dbName) => {
    setSelectedDbs(prev => {
      const next = new Set(prev)
      if (next.has(dbName)) {
        next.delete(dbName)
      } else {
        next.add(dbName)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedDbs(new Set(databases.map(db => db.name)))
  }

  const deselectAll = () => {
    setSelectedDbs(new Set())
  }

  const handleExport = async () => {
    if (selectedDbs.size === 0) {
      notify.warning('Please select at least one database')
      return
    }

    setExporting(true)
    setProgress({ databaseIndex: 0, databaseTotal: selectedDbs.size })
    try {
      await go?.ExportDatabases(connectionId, Array.from(selectedDbs))
    } catch (err) {
      console.error('Export failed:', err)
      notify.error(`Export failed: ${err.message || err}`)
      setExporting(false)
      setProgress(null)
    }
  }

  const getProgressPercent = () => {
    if (!progress) return 0
    if (progress.total > 0 && progress.current > 0) {
      return Math.min(100, (progress.current / progress.total) * 100)
    }
    // Fallback to database-level progress
    if (progress.databaseTotal > 0) {
      return ((progress.databaseIndex - 1) / progress.databaseTotal) * 100
    }
    return 0
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary border border-border rounded-lg w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-zinc-100">Export Databases</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {connectionName} - Select databases to export
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
                {/* Database progress */}
                <div className="flex items-center justify-between text-sm text-zinc-300 mb-2">
                  <span>
                    Database {progress?.databaseIndex || 0} of {progress?.databaseTotal || selectedDbs.size}
                  </span>
                  <span className="text-zinc-500">
                    {progress?.database}
                  </span>
                </div>

                {/* Collection info */}
                {progress?.collection && (
                  <div className="text-sm text-zinc-400 mb-2">
                    Collection: <span className="text-zinc-300">{progress.collection}</span>
                  </div>
                )}

                {/* Progress bar */}
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                {/* Document count */}
                {progress?.total > 0 && (
                  <div className="text-xs text-zinc-500 mt-1">
                    {progress.current?.toLocaleString() || 0} / {progress.total?.toLocaleString()} documents
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-500 text-center">
                Please wait while your databases are being exported...
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
                  {selectedDbs.size} selected
                </span>
              </div>

              {/* Database list */}
              <div className="flex-1 overflow-y-auto p-2">
                {databases.map(db => (
                  <label
                    key={db.name}
                    className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-zinc-700/50 ${
                      selectedDbs.has(db.name) ? 'bg-zinc-700/30' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent/50"
                      checked={selectedDbs.has(db.name)}
                      onChange={() => toggleDatabase(db.name)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{db.name}</div>
                      {['admin', 'local', 'config'].includes(db.name) && (
                        <div className="text-xs text-zinc-500">System database</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatBytes(db.sizeOnDisk)}
                    </div>
                  </label>
                ))}
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
            disabled={exporting || selectedDbs.size === 0}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
