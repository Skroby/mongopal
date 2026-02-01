import { useState, useEffect, useRef } from 'react'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useOperation } from './contexts/OperationContext'
import { useProgressETA } from '../hooks/useProgressETA'
import ConfirmDialog from './ConfirmDialog'

const go = window.go?.main?.App

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatElapsedTime(seconds) {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) {
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m ${secs}s`
}

export default function ExportDatabasesModal({ connectionId, connectionName, onClose }) {
  const { notify } = useNotification()
  const { startOperation, updateOperation, completeOperation } = useOperation()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()
  const [databases, setDatabases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDbs, setSelectedDbs] = useState(new Set())
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const lastClickedIndex = useRef(null)
  const operationId = useRef(null)
  const exportStartTime = useRef(null)
  const totalDocsRef = useRef(0)
  const processedDocsRef = useRef(0)

  useEffect(() => {
    loadDatabases()

    // Listen for export progress events
    const unsubProgress = EventsOn('export:progress', (data) => {
      setProgress(data)

      // Track cumulative progress for ETA calculation
      // When we get totalDocs, update our reference total
      if (data.totalDocs && data.totalDocs > totalDocsRef.current) {
        totalDocsRef.current = data.totalDocs
      }
      // Track processed docs (processedDocs comes from backend as cumulative)
      if (typeof data.processedDocs === 'number') {
        processedDocsRef.current = data.processedDocs
        recordProgress(data.processedDocs)
      }

      // Update global operation indicator
      if (operationId.current) {
        let progressPercent = null
        let label = `Exporting ${connectionName}...`

        if (data.total > 0 && data.current > 0) {
          progressPercent = Math.min(100, Math.round((data.current / data.total) * 100))
        } else if (data.databaseTotal > 0) {
          progressPercent = Math.round(((data.databaseIndex - 1) / data.databaseTotal) * 100)
        }

        if (data.collection) {
          label = `Exporting ${data.collection}...`
        } else if (data.database) {
          label = `Exporting ${data.database}...`
        }

        updateOperation(operationId.current, { progress: progressPercent, label })
      }
    })
    const unsubComplete = EventsOn('export:complete', () => {
      setExporting(false)
      setProgress(null)
      notify.success('Export completed successfully')
      if (operationId.current) {
        completeOperation(operationId.current)
        operationId.current = null
      }
      onClose()
    })
    const unsubCancelled = EventsOn('export:cancelled', () => {
      setExporting(false)
      setProgress(null)
      notify.info('Export cancelled')
      if (operationId.current) {
        completeOperation(operationId.current)
        operationId.current = null
      }
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
    }
  }, [connectionName, updateOperation, completeOperation])

  // Elapsed time counter during export
  useEffect(() => {
    let interval = null
    if (exporting) {
      if (!exportStartTime.current) {
        exportStartTime.current = Date.now()
        setElapsedSeconds(0)
      }
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - exportStartTime.current) / 1000)
        setElapsedSeconds(elapsed)
      }, 1000)
    } else {
      exportStartTime.current = null
      setElapsedSeconds(0)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [exporting])

  // Handle Escape key to close modal (shows confirmation if export in progress)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showCancelConfirm) {
          // Let ConfirmDialog handle Escape
          return
        }
        if (exporting) {
          setShowCancelConfirm(true)
        } else {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exporting, showCancelConfirm, onClose])

  const handleCancelClick = () => {
    if (exporting) {
      setShowCancelConfirm(true)
    } else {
      onClose()
    }
  }

  const confirmCancelExport = () => {
    setShowCancelConfirm(false)
    setExporting(false)
    setProgress(null)
    go?.CancelExport?.()
    if (operationId.current) {
      completeOperation(operationId.current)
      operationId.current = null
    }
  }

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
      notify.error(`Failed to load databases: ${err?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleDatabase = (dbName, index, event) => {
    // Handle shift-click for range selection
    if (event?.shiftKey && lastClickedIndex.current !== null && lastClickedIndex.current !== index) {
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const rangeNames = databases.slice(start, end + 1).map(db => db.name)

      setSelectedDbs(prev => {
        const next = new Set(prev)
        // Determine action based on target item state (the one being clicked)
        const shouldSelect = !prev.has(dbName)
        rangeNames.forEach(name => {
          if (shouldSelect) {
            next.add(name)
          } else {
            next.delete(name)
          }
        })
        return next
      })
    } else {
      // Normal single toggle
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
    lastClickedIndex.current = index
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
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0

    // Register global operation
    operationId.current = startOperation({
      type: 'export',
      label: `Exporting ${connectionName}...`,
      progress: null,
      destructive: false,
      active: true,
    })

    try {
      await go?.ExportDatabases(connectionId, Array.from(selectedDbs))
    } catch (err) {
      // Don't show error for cancellation - the event handler shows info toast
      const errMsg = err?.message || String(err)
      if (!errMsg.toLowerCase().includes('cancel')) {
        console.error('Export failed:', err)
        notify.error(`Export failed: ${errMsg}`)
      }
      setExporting(false)
      setProgress(null)
      if (operationId.current) {
        completeOperation(operationId.current)
        operationId.current = null
      }
    }
  }

  const isPreparing = () => {
    // We're in "preparing" state when export started but no database has begun processing yet
    return !progress || !progress.databaseIndex || progress.databaseIndex === 0
  }

  const getProgressPercent = () => {
    if (!progress) return 0

    const dbTotal = progress.databaseTotal || 0
    const dbIndex = progress.databaseIndex || 0

    if (dbTotal === 0) return 0

    // Calculate base progress from completed databases
    const completedDatabases = Math.max(0, dbIndex - 1)
    const baseProgress = (completedDatabases / dbTotal) * 100

    // Calculate current database progress based on document count
    let currentDbProgress = 0
    if (progress.total > 0 && progress.current >= 0) {
      // We have document-level progress for current database
      currentDbProgress = (progress.current / progress.total) / dbTotal * 100
    } else if (dbIndex > 0) {
      // Database started but no document progress yet - show minimal progress
      currentDbProgress = (0.05 / dbTotal) * 100 // 5% of one database slice
    }

    return Math.min(100, baseProgress + currentDbProgress)
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
                {/* Header with elapsed time and ETA */}
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-zinc-300">
                    {isPreparing() ? 'Preparing export...' : `Database ${progress?.databaseIndex || 0} of ${progress?.databaseTotal || selectedDbs.size}`}
                  </span>
                  <div className="flex items-center gap-3 text-zinc-500 font-mono text-xs">
                    {(() => {
                      const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                      return eta ? <span className="text-accent">{eta} left</span> : null
                    })()}
                    <span>{formatElapsedTime(elapsedSeconds)}</span>
                  </div>
                </div>

                {/* Current collection with full context */}
                {!isPreparing() && progress?.collection && (
                  <div className="bg-zinc-800/50 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-accent font-medium">
                        {progress.database}.{progress.collection}
                      </span>
                    </div>

                    {/* Document progress */}
                    {progress?.total > 0 && (
                      <>
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                          <span>
                            {(progress.current || 0).toLocaleString()} / {progress.total.toLocaleString()} docs
                          </span>
                          <span>
                            {Math.round(((progress.current || 0) / progress.total) * 100)}%
                          </span>
                        </div>
                        {/* Mini progress bar for collection */}
                        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all duration-200"
                            style={{ width: `${Math.min(100, ((progress.current || 0) / progress.total) * 100)}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Overall progress bar */}
                <div className="mb-1">
                  <div className="text-xs text-zinc-500 mb-1">Overall Progress</div>
                  <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                    {isPreparing() ? (
                      <div className="h-full w-full relative">
                        <div className="absolute inset-0 bg-accent/30" />
                        <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-accent to-transparent progress-indeterminate" />
                      </div>
                    ) : (
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${getProgressPercent()}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <p className="text-sm text-zinc-400 text-center">
                Please wait while your databases are being exported...
              </p>
            </div>
          ) : (
            <>
              {/* Selection controls */}
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <button
                  className="text-sm text-accent hover:text-accent/80 rounded px-1 focus-visible:ring-2 focus-visible:ring-accent/50"
                  onClick={selectAll}
                >
                  Select All
                </button>
                <span className="text-zinc-600">|</span>
                <button
                  className="text-sm text-accent hover:text-accent/80 rounded px-1 focus-visible:ring-2 focus-visible:ring-accent/50"
                  onClick={deselectAll}
                >
                  Deselect All
                </button>
                <span className="ml-auto text-sm text-zinc-400">
                  {selectedDbs.size} selected
                </span>
              </div>

              {/* Database list */}
              <div className="flex-1 overflow-y-auto p-2">
                {databases.map((db, index) => (
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
                      onChange={(e) => toggleDatabase(db.name, index, e.nativeEvent)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{db.name}</div>
                      {['admin', 'local', 'config'].includes(db.name) && (
                        <div className="text-xs text-zinc-400">System database</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">
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
            onClick={handleCancelClick}
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

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Export?"
        message="Are you sure you want to cancel the export? Progress will be lost and you'll need to start over."
        confirmLabel="Yes, Cancel Export"
        cancelLabel="Continue Export"
        danger={true}
        onConfirm={confirmCancelExport}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  )
}
