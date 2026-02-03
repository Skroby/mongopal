import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { EventsOn } from '../../../wailsjs/runtime/runtime'
import { useNotification } from '../NotificationContext'

// Access go at call time, not module load time (bindings may not be ready yet)
const getGo = () => window.go?.main?.App

const ExportQueueContext = createContext(null)

// Max concurrent exports per connection
const MAX_CONCURRENT_PER_CONNECTION = 3

export function ExportQueueProvider({ children }) {
  const { notify } = useNotification()
  const [exports, setExports] = useState([])
  const [completedExports, setCompletedExports] = useState([])
  const processingRef = useRef(false)
  const completedIdsRef = useRef(new Set()) // Track completed IDs to prevent duplicates

  const generateId = () => `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // Count active (non-queued) exports for a connection
  const getActiveCount = useCallback((connectionId, currentExports) => {
    return currentExports.filter(e =>
      e.connectionId === connectionId &&
      e.phase !== 'queued' &&
      e.phase !== 'complete' &&
      e.phase !== 'error'
    ).length
  }, [])

  // Process queued exports
  const processQueue = useCallback(() => {
    if (processingRef.current) return
    processingRef.current = true

    setExports(prev => {
      const next = [...prev]
      let changed = false

      for (let i = 0; i < next.length; i++) {
        const entry = next[i]
        if (entry.phase === 'queued') {
          const activeCount = getActiveCount(entry.connectionId, next)
          if (activeCount < MAX_CONCURRENT_PER_CONNECTION) {
            next[i] = { ...entry, phase: 'starting' }
            changed = true

            const startExportAsync = async () => {
              try {
                if (entry.type === 'csv') {
                  const csvOptions = {
                    delimiter: entry.options?.delimiter || ',',
                    includeHeaders: entry.options?.includeHeaders !== false,
                    flattenArrays: entry.options?.flattenArrays !== false,
                    filter: entry.options?.filter || '',
                    filePath: entry.options?.filePath,
                  }
                  await getGo()?.ExportCollectionAsCSV(
                    entry.connectionId,
                    entry.database,
                    entry.collection,
                    '',
                    csvOptions
                  )
                }
              } catch (err) {
                const errorMsg = err?.message || String(err)
                if (!errorMsg.toLowerCase().includes('cancel')) {
                  notify.error(`Export failed: ${entry.label}`)
                }
                setExports(p => p.filter(e => e.id !== entry.id))
              }
            }

            startExportAsync()
          }
        }
      }

      processingRef.current = false
      return changed ? next : prev
    })
  }, [getActiveCount, notify])

  // Auto-process queue when exports change
  useEffect(() => {
    const hasQueued = exports.some(e => e.phase === 'queued')
    if (hasQueued) {
      const timer = setTimeout(() => processQueue(), 50)
      return () => clearTimeout(timer)
    }
  }, [exports, processQueue])

  // Queue a CSV export
  const queueCSVExport = useCallback((connectionId, database, collection, options) => {
    const entry = {
      id: generateId(),
      type: 'csv',
      connectionId,
      database,
      collection,
      options,
      phase: 'queued',
      current: 0,
      total: 0,
      progress: 0,
      startedAt: Date.now(),
      label: collection,
    }

    setExports(prev => [...prev, entry])
  }, [])

  // Track a ZIP export (database or collection export) - these are started immediately, not queued
  const trackZipExport = useCallback((connectionId, database, collections, label) => {
    const id = generateId()
    const entry = {
      id,
      type: 'zip',
      connectionId,
      database,
      collections, // array of collection names or null for database export
      phase: 'starting',
      current: 0,
      total: 0,
      progress: 0,
      startedAt: Date.now(),
      label: label || database,
      // Extra fields for multi-item progress
      itemIndex: 0,
      itemTotal: collections?.length || 0,
      currentItem: null,
    }

    setExports(prev => [...prev, entry])
    return id // Return ID so caller can update/remove this export
  }, [])

  // Update a tracked export (for ZIP exports that manage their own progress)
  const updateTrackedExport = useCallback((exportId, updates) => {
    setExports(prev => {
      const idx = prev.findIndex(e => e.id === exportId)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...updates }
      return next
    })
  }, [])

  // Complete and remove a tracked export
  const completeTrackedExport = useCallback((exportId, filePath) => {
    // Use ref to prevent duplicate completions
    if (completedIdsRef.current.has(exportId)) {
      setExports(prev => prev.filter(e => e.id !== exportId))
      return
    }
    completedIdsRef.current.add(exportId)

    setExports(prev => {
      const entry = prev.find(e => e.id === exportId)
      if (!entry) return prev

      // Add to completed history
      setCompletedExports(completed => [{
        id: exportId,
        type: entry.type,
        database: entry.database,
        collection: entry.collections?.join(', ') || entry.database,
        label: entry.label,
        filePath: filePath,
        completedAt: Date.now(),
      }, ...completed].slice(0, 20))

      return prev.filter(e => e.id !== exportId)
    })
  }, [])

  // Remove a tracked export without adding to history (for cancellation)
  const removeTrackedExport = useCallback((exportId) => {
    setExports(prev => prev.filter(e => e.id !== exportId))
  }, [])

  // Listen for export events
  useEffect(() => {
    const unsubProgress = EventsOn('export:progress', (data) => {
      setExports(prev => {
        // First try to match by backend exportId if available
        let idx = -1
        if (data.exportId) {
          idx = prev.findIndex(entry => entry.backendExportId === data.exportId)
        }

        // Fallback: match by database/collection or first active ZIP without backendExportId
        if (idx === -1) {
          idx = prev.findIndex(entry => {
            if (entry.phase === 'queued' || entry.phase === 'complete') return false
            if (entry.type === 'csv') {
              return entry.database === data.database && entry.collection === data.collection
            }
            if (entry.type === 'zip') {
              const isActive = entry.phase !== 'queued' && entry.phase !== 'complete' && entry.phase !== 'error'
              // If event has exportId, only match entries without backendExportId (waiting for first event)
              // This prevents stealing progress from another concurrent export
              if (data.exportId && entry.backendExportId) {
                return false
              }
              return isActive
            }
            return false
          })
        }

        if (idx === -1) return prev

        const entry = prev[idx]

        // Calculate progress differently for ZIP vs CSV
        let progress = 0
        if (entry.type === 'zip') {
          // For ZIP exports, use total document count for accurate progress
          // processedDocs = cumulative docs exported, totalDocs = total across all databases
          const processedDocs = data.processedDocs || 0
          const totalDocs = data.totalDocs || entry.totalDocs || 0
          if (totalDocs > 0) {
            progress = Math.min(100, Math.round((processedDocs / totalDocs) * 100))
          } else {
            // Fallback to database index if no doc counts available
            const itemTotal = data.databaseTotal || data.collectionTotal || 0
            const itemIndex = data.databaseIndex || data.collectionIndex || 0
            if (itemTotal > 0) {
              progress = Math.round(((itemIndex - 1) / itemTotal) * 100)
            }
          }
        } else {
          progress = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0
        }

        // Never allow progress to go backwards
        progress = Math.max(progress, entry.progress || 0)

        // Use processedDocs for display if available, otherwise current
        const docCount = data.processedDocs || data.current || 0
        const displayDocs = Math.max(docCount, entry.current || 0)

        const next = [...prev]
        next[idx] = {
          ...entry,
          // Store backend exportId for future matching
          backendExportId: data.exportId || entry.backendExportId,
          phase: data.phase || 'downloading',
          current: displayDocs, // Actual doc count for display
          total: data.total || entry.total,
          totalDocs: data.totalDocs || entry.totalDocs, // Total docs across all databases
          progress,
          // ZIP-specific fields
          currentItem: data.collection || data.database,
          itemIndex: data.databaseIndex || data.collectionIndex || entry.itemIndex,
          itemTotal: data.databaseTotal || data.collectionTotal || entry.itemTotal,
        }
        return next
      })
    })

    const unsubComplete = EventsOn('export:complete', (data) => {
      setExports(prev => {
        // First try to match by backend exportId if available
        let idx = -1
        if (data?.exportId) {
          idx = prev.findIndex(entry => entry.backendExportId === data.exportId)
        }

        // Fallback: match by database/collection or first active ZIP without different backendExportId
        if (idx === -1) {
          idx = prev.findIndex(entry => {
            const isActive = entry.phase !== 'queued' && entry.phase !== 'complete' && entry.phase !== 'error'
            if (!isActive) return false

            // For CSV exports, match by database and collection
            if (entry.type === 'csv' && data?.database && data?.collection) {
              return entry.database === data.database && entry.collection === data.collection
            }
            // For ZIP exports, only match if no conflicting backendExportId
            if (entry.type === 'zip') {
              // Don't match if event has exportId and entry has different backendExportId
              if (data?.exportId && entry.backendExportId && entry.backendExportId !== data.exportId) {
                return false
              }
              return true
            }
            return false
          })
        }

        if (idx === -1) return prev

        const entry = prev[idx]

        // Use ref to prevent duplicate completions (React strict mode can call this twice)
        if (completedIdsRef.current.has(entry.id)) {
          return prev.filter((_, i) => i !== idx)
        }
        completedIdsRef.current.add(entry.id)

        const filePath = data?.filePath || entry.options?.filePath
        const fileName = filePath?.split('/').pop() || entry.label
        notify.success(`Exported ${fileName}`)

        // Add to completed history
        setCompletedExports(completed => [{
          id: entry.id,
          type: entry.type,
          database: entry.database,
          collection: entry.type === 'zip' ? (entry.collections?.join(', ') || entry.database) : entry.collection,
          label: entry.label,
          filePath: filePath,
          completedAt: Date.now(),
        }, ...completed].slice(0, 20))

        return prev.filter((_, i) => i !== idx)
      })
    })

    const unsubCancelled = EventsOn('export:cancelled', (data) => {
      setExports(prev => {
        // First try to match by backend exportId if available
        let idx = -1
        if (data?.exportId) {
          idx = prev.findIndex(entry => entry.backendExportId === data.exportId)
        }

        // Fallback: match by database/collection or first active ZIP without different backendExportId
        if (idx === -1) {
          idx = prev.findIndex(entry => {
            const isActive = entry.phase !== 'queued' && entry.phase !== 'complete' && entry.phase !== 'error'
            if (!isActive) return false

            // For CSV exports, match by database and collection if available
            if (entry.type === 'csv' && data?.database && data?.collection) {
              return entry.database === data.database && entry.collection === data.collection
            }
            // For ZIP exports, only match if no conflicting backendExportId
            if (entry.type === 'zip') {
              if (data?.exportId && entry.backendExportId && entry.backendExportId !== data.exportId) {
                return false
              }
              return true
            }
            return false
          })
        }

        if (idx === -1) return prev

        const entry = prev[idx]
        notify.info(`Export cancelled: ${entry.label}`)

        return prev.filter((_, i) => i !== idx)
      })
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
    }
  }, [notify])

  // Get the export closest to finishing
  const getLeadingExport = useCallback(() => {
    let leading = null
    let highestProgress = -1

    for (const entry of exports) {
      if (entry.phase !== 'queued' && entry.progress > highestProgress) {
        highestProgress = entry.progress
        leading = entry
      }
    }

    return leading
  }, [exports])

  // Cancel an export
  const cancelExport = useCallback((exportId) => {
    const entry = exports.find(e => e.id === exportId)
    if (!entry) return

    if (entry.phase === 'queued') {
      setExports(prev => prev.filter(e => e.id !== exportId))
      notify.info(`Removed ${entry.label} from queue`)
    } else {
      getGo()?.CancelExport?.()
    }
  }, [exports, notify])

  // Cancel all exports
  const cancelAllExports = useCallback(() => {
    const hasActive = exports.some(e => e.phase !== 'queued')
    if (hasActive) {
      getGo()?.CancelExport?.()
    }
    setExports([])
    notify.info('All exports cancelled')
  }, [exports, notify])

  // Clear completed history
  const clearHistory = useCallback(() => {
    setCompletedExports([])
    completedIdsRef.current.clear()
  }, [])

  const queuedCount = exports.filter(e => e.phase === 'queued').length
  const activeCount = exports.filter(e => e.phase !== 'queued' && e.phase !== 'complete').length

  const value = {
    exports,
    completedExports,
    queuedCount,
    activeCount,
    queueCSVExport,
    trackZipExport,
    updateTrackedExport,
    completeTrackedExport,
    removeTrackedExport,
    getLeadingExport,
    cancelExport,
    cancelAllExports,
    clearHistory,
    // Legacy alias
    startExport: queueCSVExport,
  }

  return (
    <ExportQueueContext.Provider value={value}>
      {children}
    </ExportQueueContext.Provider>
  )
}

export function useExportQueue() {
  const context = useContext(ExportQueueContext)
  if (!context) {
    throw new Error('useExportQueue must be used within ExportQueueProvider')
  }
  return context
}

// Legacy aliases
export const useCSVExport = useExportQueue
export const CSVExportProvider = ExportQueueProvider

export default ExportQueueContext
