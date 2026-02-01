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
  const { startOperation, updateOperation, completeOperation } = useOperation()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedColls, setSelectedColls] = useState(new Set())
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const lastClickedIndex = useRef(null)
  const operationId = useRef(null)
  const totalDocsRef = useRef(0)
  const processedDocsRef = useRef(0)

  useEffect(() => {
    loadCollections()

    // Listen for export progress events
    const unsubProgress = EventsOn('export:progress', (data) => {
      setProgress(data)

      // Track cumulative progress for ETA calculation
      if (data.totalDocs && data.totalDocs > totalDocsRef.current) {
        totalDocsRef.current = data.totalDocs
      }
      if (typeof data.processedDocs === 'number') {
        processedDocsRef.current = data.processedDocs
        recordProgress(data.processedDocs)
      }

      // Update global operation indicator
      if (operationId.current) {
        let progressPercent = null
        let label = `Exporting ${databaseName}...`

        if (data.total > 0 && data.current > 0) {
          progressPercent = Math.min(100, Math.round((data.current / data.total) * 100))
        } else if (data.collectionTotal > 0) {
          progressPercent = Math.round(((data.collectionIndex - 1) / data.collectionTotal) * 100)
        }

        if (data.collection) {
          label = `Exporting ${data.collection}...`
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
  }, [databaseName, updateOperation, completeOperation])

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

  const toggleCollection = (collName, index, event) => {
    // Handle shift-click for range selection
    if (event?.shiftKey && lastClickedIndex.current !== null && lastClickedIndex.current !== index) {
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const rangeNames = collections.slice(start, end + 1).map(c => c.name)

      setSelectedColls(prev => {
        const next = new Set(prev)
        // Determine action based on target item state (the one being clicked)
        const shouldSelect = !prev.has(collName)
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
    lastClickedIndex.current = index
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
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0

    // Register global operation
    operationId.current = startOperation({
      type: 'export',
      label: `Exporting ${databaseName}...`,
      progress: null,
      destructive: false,
      active: true,
    })

    try {
      await go?.ExportCollections(connectionId, databaseName, Array.from(selectedColls))
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
    // We're in "preparing" state when export started but no collection has begun processing yet
    return !progress || !progress.collectionIndex || progress.collectionIndex === 0
  }

  const getProgressPercent = () => {
    if (!progress) return 0

    const collTotal = progress.collectionTotal || 0
    const collIndex = progress.collectionIndex || 0

    if (collTotal === 0) return 0

    // Calculate base progress from completed collections
    const completedCollections = Math.max(0, collIndex - 1)
    const baseProgress = (completedCollections / collTotal) * 100

    // Calculate current collection progress based on document count
    let currentCollProgress = 0
    if (progress.total > 0 && progress.current >= 0) {
      // We have document-level progress for current collection
      currentCollProgress = (progress.current / progress.total) / collTotal * 100
    } else if (collIndex > 0) {
      // Collection started but no document progress yet - show minimal progress
      currentCollProgress = (0.05 / collTotal) * 100 // 5% of one collection slice
    }

    return Math.min(100, baseProgress + currentCollProgress)
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
                  {isPreparing() ? (
                    <span>Preparing export...</span>
                  ) : (
                    <>
                      <span>
                        Collection {progress?.collectionIndex || 0} of {progress?.collectionTotal || selectedColls.size}
                      </span>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                          return eta ? <span className="text-accent text-xs font-mono">{eta} left</span> : null
                        })()}
                        <span className="text-zinc-400">
                          {progress?.collection}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Progress bar */}
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

                {/* Document count */}
                <div className="text-xs text-zinc-400 mt-1 h-4">
                  {!isPreparing() && progress?.total > 0 && (
                    <>{progress.current?.toLocaleString() || 0} / {progress.total?.toLocaleString()} documents</>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-400 text-center">
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
                <span className="ml-auto text-sm text-zinc-400">
                  {selectedColls.size} selected
                </span>
              </div>

              {/* Collection list */}
              <div className="flex-1 overflow-y-auto p-2">
                {collections.length === 0 ? (
                  <div className="text-center text-zinc-400 py-4">
                    No collections found in this database
                  </div>
                ) : (
                  collections.map((coll, index) => (
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
                        onChange={(e) => toggleCollection(coll.name, index, e.nativeEvent)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate">{coll.name}</div>
                        <div className="text-xs text-zinc-400">
                          {formatCount(coll.count)} docs
                        </div>
                      </div>
                      <div className="text-xs text-zinc-400">
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
            onClick={handleCancelClick}
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
