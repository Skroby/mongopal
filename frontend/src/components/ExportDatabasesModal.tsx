import { useState, useEffect, useRef, ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useExportQueue } from './contexts/ExportQueueContext'
import { useProgressETA } from '../hooks/useProgressETA'
import ConfirmDialog from './ConfirmDialog'

// Go bindings type
interface GoApp {
  GetDatabasesForExport?: (connectionId: string) => Promise<DatabaseInfo[]>
  ExportDatabases?: (connectionId: string, databases: string[]) => Promise<void>
  CancelExport?: () => void
  PauseExport?: () => void
  ResumeExport?: () => void
}

// Database info from Go backend
interface DatabaseInfo {
  name: string
  sizeOnDisk: number
}

// Export progress event data from Wails
interface ExportProgressEventData {
  databaseIndex?: number
  databaseTotal?: number
  database?: string
  collection?: string
  current?: number
  total?: number
  processedDocs?: number
  totalDocs?: number
  filePath?: string
}

// Export complete event data from Wails
interface ExportCompleteEventData {
  filePath?: string
}

// Progress state type
interface ProgressState {
  databaseIndex?: number
  databaseTotal?: number
  database?: string
  collection?: string
  current?: number
  total?: number
  processedDocs?: number
  totalDocs?: number
  filePath?: string
}

// Component props
export interface ExportDatabasesModalProps {
  connectionId: string
  connectionName: string
  onClose: () => void
}

// Access go at call time, not module load time (bindings may not be ready yet)
const getGo = (): GoApp | undefined =>
  (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatElapsedTime(seconds: number): string {
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

export default function ExportDatabasesModal({
  connectionId,
  connectionName,
  onClose,
}: ExportDatabasesModalProps): React.ReactElement {
  const { notify } = useNotification()
  const { trackZipExport, updateTrackedExport, completeTrackedExport, removeTrackedExport } = useExportQueue()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState<boolean>(false)
  const [paused, setPaused] = useState<boolean>(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)
  const lastClickedIndex = useRef<number | null>(null)
  const exportId = useRef<string | null>(null)
  const exportStartTime = useRef<number | null>(null)
  const totalDocsRef = useRef<number>(0)
  const processedDocsRef = useRef<number>(0)
  const filePathRef = useRef<string | null>(null)
  const maxProgressRef = useRef<number>(0) // Track max progress to prevent backwards jumps

  useEffect(() => {
    loadDatabases()

    // Listen for export progress events
    const unsubProgress = EventsOn('export:progress', (data: ExportProgressEventData) => {
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

      // Store file path for completion
      if (data.filePath) {
        filePathRef.current = data.filePath
      }

      // Update export manager
      if (exportId.current) {
        let progressPercent = 0
        let currentItem: string | null = null

        if (data.total && data.total > 0 && data.current && data.current > 0) {
          progressPercent = Math.min(100, Math.round((data.current / data.total) * 100))
        } else if (data.databaseTotal && data.databaseTotal > 0) {
          progressPercent = Math.round((((data.databaseIndex || 1) - 1) / data.databaseTotal) * 100)
        }

        if (data.collection) {
          currentItem = data.collection
        } else if (data.database) {
          currentItem = data.database
        }

        updateTrackedExport(exportId.current, {
          phase: 'downloading',
          progress: progressPercent,
          current: data.current || 0,
          total: data.total || 0,
          currentItem,
          itemIndex: data.databaseIndex || 0,
          itemTotal: data.databaseTotal || 0,
        })
      }
    })
    const unsubComplete = EventsOn('export:complete', (data: ExportCompleteEventData) => {
      // Only handle if this modal initiated the export
      if (!exportId.current) return
      setExporting(false)
      setProgress(null)
      notify.success('Export completed successfully')
      completeTrackedExport(exportId.current, data?.filePath || filePathRef.current || undefined)
      exportId.current = null
      filePathRef.current = null
      onClose()
    })
    const unsubCancelled = EventsOn('export:cancelled', () => {
      // Only handle if this modal initiated the export
      if (!exportId.current) return
      setExporting(false)
      setPaused(false)
      setProgress(null)
      notify.info('Export cancelled')
      removeTrackedExport(exportId.current)
      exportId.current = null
      filePathRef.current = null
    })
    const unsubPaused = EventsOn('export:paused', () => {
      setPaused(true)
    })
    const unsubResumed = EventsOn('export:resumed', () => {
      setPaused(false)
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
      if (unsubPaused) unsubPaused()
      if (unsubResumed) unsubResumed()
    }
  }, [connectionName, updateTrackedExport, completeTrackedExport, removeTrackedExport])

  // Elapsed time counter during export
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (exporting) {
      if (!exportStartTime.current) {
        exportStartTime.current = Date.now()
        setElapsedSeconds(0)
      }
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (exportStartTime.current || Date.now())) / 1000)
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
    const handleKeyDown = (e: KeyboardEvent): void => {
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

  const handleCancelClick = (): void => {
    if (exporting) {
      setShowCancelConfirm(true)
    } else {
      onClose()
    }
  }

  const confirmCancelExport = (): void => {
    setShowCancelConfirm(false)
    setExporting(false)
    setPaused(false)
    setProgress(null)
    getGo()?.CancelExport?.()
    if (exportId.current) {
      removeTrackedExport(exportId.current)
      exportId.current = null
      filePathRef.current = null
    }
  }

  const togglePause = (): void => {
    if (paused) {
      getGo()?.ResumeExport?.()
    } else {
      getGo()?.PauseExport?.()
    }
  }

  const loadDatabases = async (): Promise<void> => {
    try {
      const go = getGo()
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
      notify.error(`Failed to load databases: ${(err as Error)?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleDatabase = (dbName: string, index: number, event?: Event | ReactMouseEvent): void => {
    // Handle shift-click for range selection
    const nativeEvent = event as MouseEvent | undefined
    if (nativeEvent?.shiftKey && lastClickedIndex.current !== null && lastClickedIndex.current !== index) {
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

  const selectAll = (): void => {
    setSelectedDbs(new Set(databases.map(db => db.name)))
  }

  const deselectAll = (): void => {
    setSelectedDbs(new Set())
  }

  const handleExport = async (): Promise<void> => {
    if (selectedDbs.size === 0) {
      notify.warning('Please select at least one database')
      return
    }

    setExporting(true)
    setProgress({ databaseIndex: 0, databaseTotal: selectedDbs.size })
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0
    filePathRef.current = null
    maxProgressRef.current = 0

    // Track in export manager
    exportId.current = trackZipExport(
      connectionId,
      connectionName, // Use connection name as database identifier for multi-db export
      Array.from(selectedDbs),
      `${connectionName} (${selectedDbs.size} databases)`
    )

    try {
      await getGo()?.ExportDatabases?.(connectionId, Array.from(selectedDbs))
    } catch (err) {
      // Don't show error for cancellation - the event handler shows info toast
      const errMsg = (err as Error)?.message || String(err)
      if (!errMsg.toLowerCase().includes('cancel')) {
        console.error('Export failed:', err)
        notify.error(`Export failed: ${errMsg}`)
      }
      setExporting(false)
      setProgress(null)
      if (exportId.current) {
        removeTrackedExport(exportId.current)
        exportId.current = null
        filePathRef.current = null
      }
    }
  }

  const isPreparing = (): boolean => {
    // We're in "preparing" state when export started but no database has begun processing yet
    return !progress || !progress.databaseIndex || progress.databaseIndex === 0
  }

  const getProgressPercent = (): number => {
    if (!progress) return maxProgressRef.current

    // Use processedDocs/totalDocs for accurate progress (same as ExportQueueContext)
    const processedDocs = progress.processedDocs || processedDocsRef.current || 0
    const totalDocs = progress.totalDocs || totalDocsRef.current || 0

    let percent = 0
    if (totalDocs > 0) {
      percent = Math.min(100, Math.round((processedDocs / totalDocs) * 100))
    } else {
      // Fallback to database index if no doc counts available
      const dbTotal = progress.databaseTotal || 0
      const dbIndex = progress.databaseIndex || 0
      if (dbTotal > 0 && dbIndex > 0) {
        // Use (dbIndex - 1) since dbIndex is 1-based and represents "currently processing"
        percent = Math.round(((dbIndex - 1) / dbTotal) * 100)
      }
    }

    // Never allow progress to go backwards
    percent = Math.max(percent, maxProgressRef.current)
    maxProgressRef.current = percent

    return percent
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
                {/* Paused indicator */}
                {paused && (
                  <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Export paused
                  </div>
                )}
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
                    {progress?.total && progress.total > 0 && (
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
                      onChange={(e: ChangeEvent<HTMLInputElement>) => toggleDatabase(db.name, index, e.nativeEvent)}
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
          {exporting && (
            <>
              {!paused && (
                <button
                  className="btn btn-ghost mr-auto"
                  onClick={onClose}
                  title="Hide this dialog and continue in background"
                >
                  Hide
                </button>
              )}
              <button
                className="btn btn-ghost inline-flex items-center"
                onClick={togglePause}
                title={paused ? 'Resume export' : 'Pause export'}
              >
                {paused ? (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Resume
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Pause
                  </>
                )}
              </button>
            </>
          )}
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
