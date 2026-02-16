import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react'
import { EventsOn } from '../../../wailsjs/runtime/runtime'
import { useNotification } from '../NotificationContext'

// Type definitions for CSV export options
export interface CSVExportOptions {
  delimiter?: string
  includeHeaders?: boolean
  flattenArrays?: boolean
  filter?: string
  filePath?: string
}

// Type definitions for JSON export options
export interface JSONExportOptions {
  filter?: string
  filePath?: string
  pretty?: boolean
  array?: boolean
}

// Export phase types
export type ExportPhase = 'queued' | 'starting' | 'downloading' | 'complete' | 'error'

// Export type
export type ExportType = 'csv' | 'json' | 'zip' | 'bson'

// Transfer direction discriminator
export type TransferDirection = 'export' | 'import'

// Import phase types
export type ImportPhase = 'starting' | 'importing' | 'complete' | 'error'

// Base export entry interface
export interface ExportEntry {
  id: string
  direction: TransferDirection
  type: ExportType
  connectionId: string
  database: string
  phase: ExportPhase
  current: number
  total: number
  progress: number
  startedAt: number
  label: string
  paused: boolean
  supportsPause: boolean
  backendExportId?: string
  totalDocs?: number
  modalOpener?: () => void
}

// CSV-specific export entry
export interface CSVExportEntry extends ExportEntry {
  type: 'csv'
  collection: string
  options?: CSVExportOptions
}

// JSON-specific export entry
export interface JSONExportEntry extends ExportEntry {
  type: 'json'
  collection: string
  options?: JSONExportOptions
}

// ZIP-specific export entry
export interface ZipExportEntry extends ExportEntry {
  type: 'zip'
  collections: string[] | null
  itemIndex: number
  itemTotal: number
  currentItem: string | null
}

// Union type for all export entries
export type ExportEntryUnion = CSVExportEntry | JSONExportEntry | ZipExportEntry

// Import entry
export interface ImportEntry {
  id: string
  direction: 'import'
  connectionId: string
  database: string
  collections: string[] | null // null = database-level import
  phase: ImportPhase
  progress: number
  startedAt: number
  label: string
  paused: boolean
  modalOpener?: () => void
  currentItem: string | null
  itemIndex: number
  itemTotal: number
  processedDocs: number
  totalDocs: number
}

// Any active transfer (export or import)
export type TransferEntry = ExportEntryUnion | ImportEntry

// Completed transfer entry
export interface CompletedExport {
  id: string
  direction: TransferDirection
  type: ExportType | 'import'
  database: string
  collection: string
  label: string
  filePath: string | undefined
  completedAt: number
}

// Event data types from backend
interface ExportProgressEventData {
  exportId?: string
  database?: string
  collection?: string
  phase?: ExportPhase
  current?: number
  total?: number
  processedDocs?: number
  totalDocs?: number
  databaseIndex?: number
  databaseTotal?: number
  collectionIndex?: number
  collectionTotal?: number
}

interface ExportCompleteEventData {
  exportId?: string
  database?: string
  collection?: string
  filePath?: string
}

interface ExportCancelledEventData {
  exportId?: string
  database?: string
  collection?: string
}

// Context value interface
export interface ExportQueueContextValue {
  exports: ExportEntryUnion[]
  imports: ImportEntry[]
  allTransfers: TransferEntry[]
  completedExports: CompletedExport[]
  queuedCount: number
  activeCount: number
  queueCSVExport: (connectionId: string, database: string, collection: string, options?: CSVExportOptions) => void
  queueJSONExport: (connectionId: string, database: string, collection: string, options?: JSONExportOptions) => void
  trackZipExport: (connectionId: string, database: string, collections: string[] | null, label?: string, modalOpener?: () => void, supportsPause?: boolean) => string
  updateTrackedExport: (exportId: string, updates: Partial<ExportEntryUnion>) => void
  completeTrackedExport: (exportId: string, filePath?: string) => void
  removeTrackedExport: (exportId: string) => void
  trackImport: (connectionId: string, database: string, collections: string[] | null, label: string, modalOpener?: () => void) => string
  updateTrackedImport: (importId: string, updates: Partial<ImportEntry>) => void
  completeTrackedImport: (importId: string) => void
  removeTrackedImport: (importId: string) => void
  getLeadingExport: () => ExportEntryUnion | null
  cancelExport: (exportId: string) => void
  cancelAllExports: () => void
  clearHistory: () => void
}

// Provider props interface
interface ExportQueueProviderProps {
  children: ReactNode
}

// Go bindings type
interface GoApp {
  ExportCollectionAsCSV?: (
    connectionId: string,
    database: string,
    collection: string,
    query: string,
    options: CSVExportOptions
  ) => Promise<void>
  ExportCollectionAsJSON?: (
    connectionId: string,
    database: string,
    collection: string,
    defaultFilename: string,
    options: JSONExportOptions
  ) => Promise<void>
  CancelExport?: () => void
  CancelImport?: () => void
  PauseExport?: () => void
  ResumeExport?: () => void
  PauseImport?: () => void
  ResumeImport?: () => void
}

// Access go at call time, not module load time (bindings may not be ready yet)
const getGo = (): GoApp | undefined => (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

const ExportQueueContext = createContext<ExportQueueContextValue | undefined>(undefined)

// Max concurrent exports per connection
const MAX_CONCURRENT_PER_CONNECTION = 3

export function ExportQueueProvider({ children }: ExportQueueProviderProps): React.JSX.Element {
  const { notify } = useNotification()
  const [exports, setExports] = useState<ExportEntryUnion[]>([])
  const [imports, setImports] = useState<ImportEntry[]>([])
  const [completedExports, setCompletedExports] = useState<CompletedExport[]>([])
  const processingRef = useRef<boolean>(false)
  const completedIdsRef = useRef<Set<string>>(new Set()) // Track completed IDs to prevent duplicates

  const generateId = (): string => `export-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

  // Count active (non-queued) exports for a connection
  const getActiveCount = useCallback((connectionId: string, currentExports: ExportEntryUnion[]): number => {
    return currentExports.filter(e =>
      e.connectionId === connectionId &&
      e.phase !== 'queued' &&
      e.phase !== 'complete' &&
      e.phase !== 'error'
    ).length
  }, [])

  // Process queued exports
  const processQueue = useCallback((): void => {
    if (processingRef.current) return
    processingRef.current = true

    // Collect entries to start outside the state updater
    const entriesToStart: ExportEntryUnion[] = []

    setExports(prev => {
      const next = [...prev]
      let changed = false

      for (let i = 0; i < next.length; i++) {
        const entry = next[i]
        if (entry.phase === 'queued') {
          const activeForConn = getActiveCount(entry.connectionId, next)
          if (activeForConn < MAX_CONCURRENT_PER_CONNECTION) {
            next[i] = { ...entry, phase: 'starting' }
            changed = true
            entriesToStart.push(entry)
          }
        }
      }

      processingRef.current = false
      return changed ? next : prev
    })

    // Launch async operations AFTER state update
    for (const entry of entriesToStart) {
      const startExportAsync = async (): Promise<void> => {
        try {
          if (entry.type === 'csv') {
            const csvEntry = entry as CSVExportEntry
            const csvOptions: CSVExportOptions = {
              delimiter: csvEntry.options?.delimiter || ',',
              includeHeaders: csvEntry.options?.includeHeaders !== false,
              flattenArrays: csvEntry.options?.flattenArrays !== false,
              filter: csvEntry.options?.filter || '',
              filePath: csvEntry.options?.filePath,
            }
            await getGo()?.ExportCollectionAsCSV?.(
              csvEntry.connectionId,
              csvEntry.database,
              csvEntry.collection,
              '',
              csvOptions
            )
          } else if (entry.type === 'json') {
            const jsonEntry = entry as JSONExportEntry
            const jsonOptions: JSONExportOptions = {
              filter: jsonEntry.options?.filter || '',
              filePath: jsonEntry.options?.filePath,
              pretty: jsonEntry.options?.pretty || false,
              array: jsonEntry.options?.array || false,
            }
            await getGo()?.ExportCollectionAsJSON?.(
              jsonEntry.connectionId,
              jsonEntry.database,
              jsonEntry.collection,
              '',
              jsonOptions
            )
          }
        } catch (err) {
          const errorMsg = (err as Error)?.message || String(err)
          if (!errorMsg.toLowerCase().includes('cancel')) {
            notify.error(`Export failed: ${entry.label}`)
          }
          setExports(p => p.filter(e => e.id !== entry.id))
        }
      }

      startExportAsync()
    }
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
  const queueCSVExport = useCallback((connectionId: string, database: string, collection: string, options?: CSVExportOptions): void => {
    const entry: CSVExportEntry = {
      id: generateId(),
      direction: 'export',
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
      paused: false,
      supportsPause: true,
    }

    setExports(prev => [...prev, entry])
  }, [])

  // Queue a JSON export
  const queueJSONExport = useCallback((connectionId: string, database: string, collection: string, options?: JSONExportOptions): void => {
    const entry: JSONExportEntry = {
      id: generateId(),
      direction: 'export',
      type: 'json',
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
      paused: false,
      supportsPause: true,
    }

    setExports(prev => [...prev, entry])
  }, [])

  // Track a ZIP export (database or collection export) - these are started immediately, not queued
  const trackZipExport = useCallback((connectionId: string, database: string, collections: string[] | null, label?: string, modalOpener?: () => void, supportsPause = true): string => {
    const id = generateId()
    const entry: ZipExportEntry = {
      id,
      direction: 'export',
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
      paused: false,
      supportsPause,
      modalOpener,
      // Extra fields for multi-item progress
      itemIndex: 0,
      itemTotal: collections?.length || 0,
      currentItem: null,
    }

    setExports(prev => [...prev, entry])
    return id // Return ID so caller can update/remove this export
  }, [])

  // Update a tracked export (for ZIP exports that manage their own progress)
  const updateTrackedExport = useCallback((exportId: string, updates: Partial<ExportEntryUnion>): void => {
    setExports(prev => {
      const idx = prev.findIndex(e => e.id === exportId)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...updates } as ExportEntryUnion
      return next
    })
  }, [])

  // Complete and remove a tracked export
  const completeTrackedExport = useCallback((exportId: string, filePath?: string): void => {
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
      const zipEntry = entry as ZipExportEntry
      setCompletedExports(completed => [{
        id: exportId,
        direction: 'export' as const,
        type: entry.type,
        database: entry.database,
        collection: zipEntry.collections?.join(', ') || entry.database,
        label: entry.label,
        filePath: filePath,
        completedAt: Date.now(),
      }, ...completed].slice(0, 20))

      return prev.filter(e => e.id !== exportId)
    })
  }, [])

  // Remove a tracked export without adding to history (for cancellation)
  const removeTrackedExport = useCallback((exportId: string): void => {
    setExports(prev => prev.filter(e => e.id !== exportId))
  }, [])

  // Track an import operation
  const trackImport = useCallback((connectionId: string, database: string, collections: string[] | null, label: string, modalOpener?: () => void): string => {
    const id = `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const entry: ImportEntry = {
      id,
      direction: 'import',
      connectionId,
      database,
      collections,
      phase: 'starting',
      progress: 0,
      startedAt: Date.now(),
      label,
      paused: false,
      modalOpener,
      currentItem: null,
      itemIndex: 0,
      itemTotal: collections?.length || 0,
      processedDocs: 0,
      totalDocs: 0,
    }
    setImports(prev => [...prev, entry])
    return id
  }, [])

  // Update a tracked import
  const updateTrackedImport = useCallback((importId: string, updates: Partial<ImportEntry>): void => {
    setImports(prev => {
      const idx = prev.findIndex(e => e.id === importId)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...updates }
      return next
    })
  }, [])

  // Complete a tracked import (move to completed list)
  const completeTrackedImport = useCallback((importId: string): void => {
    setImports(prev => {
      const entry = prev.find(e => e.id === importId)
      if (!entry) return prev

      setCompletedExports(completed => [{
        id: importId,
        direction: 'import' as const,
        type: 'import' as const,
        database: entry.database,
        collection: entry.collections?.join(', ') || entry.database,
        label: entry.label,
        filePath: undefined,
        completedAt: Date.now(),
      }, ...completed].slice(0, 20))

      return prev.filter(e => e.id !== importId)
    })
  }, [])

  // Remove a tracked import without adding to history (for cancellation)
  const removeTrackedImport = useCallback((importId: string): void => {
    setImports(prev => prev.filter(e => e.id !== importId))
  }, [])

  // Listen for export events
  useEffect(() => {
    const unsubProgress = EventsOn('export:progress', (data: ExportProgressEventData) => {
      setExports(prev => {
        // First try to match by backend exportId if available
        let idx = -1
        if (data.exportId) {
          idx = prev.findIndex(entry => entry.backendExportId === data.exportId)
        }

        // Fallback: match by database/collection or first active ZIP without backendExportId
        if (idx === -1) {
          idx = prev.findIndex(entry => {
            // Skip queued, complete, and error entries - only match active exports
            if (entry.phase === 'queued' || entry.phase === 'complete' || entry.phase === 'error') return false
            if (entry.type === 'csv' || entry.type === 'json') {
              const csvEntry = entry as CSVExportEntry | JSONExportEntry
              return csvEntry.database === data.database && csvEntry.collection === data.collection
            }
            if (entry.type === 'zip') {
              // If event has exportId, only match entries without backendExportId (waiting for first event)
              // This prevents stealing progress from another concurrent export
              if (data.exportId && entry.backendExportId) {
                return false
              }
              return true
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
          progress = data.total && data.total > 0 ? Math.round(((data.current || 0) / data.total) * 100) : 0
        }

        // Never allow progress to go backwards
        progress = Math.max(progress, entry.progress || 0)

        // Use processedDocs for display if available, otherwise current
        const docCount = data.processedDocs || data.current || 0
        const displayDocs = Math.max(docCount, entry.current || 0)

        const next = [...prev]
        const zipEntry = entry as ZipExportEntry
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
          currentItem: data.collection || data.database || (entry.type === 'zip' ? zipEntry.currentItem : null),
          itemIndex: data.databaseIndex || data.collectionIndex || (entry.type === 'zip' ? zipEntry.itemIndex : 0),
          itemTotal: data.databaseTotal || data.collectionTotal || (entry.type === 'zip' ? zipEntry.itemTotal : 0),
        } as ExportEntryUnion
        return next
      })
    })

    const unsubComplete = EventsOn('export:complete', (data: ExportCompleteEventData) => {
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
              const csvEntry = entry as CSVExportEntry
              return csvEntry.database === data.database && csvEntry.collection === data.collection
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

        const csvEntry = entry as CSVExportEntry
        const zipEntry = entry as ZipExportEntry
        const filePath = data?.filePath || csvEntry.options?.filePath
        const fileName = filePath?.split('/').pop() || entry.label
        notify.success(`Exported ${fileName}`)

        // Add to completed history
        setCompletedExports(completed => [{
          id: entry.id,
          direction: 'export' as const,
          type: entry.type,
          database: entry.database,
          collection: entry.type === 'zip' ? (zipEntry.collections?.join(', ') || entry.database) : (entry as CSVExportEntry | JSONExportEntry).collection,
          label: entry.label,
          filePath: filePath,
          completedAt: Date.now(),
        }, ...completed].slice(0, 20))

        return prev.filter((_, i) => i !== idx)
      })
    })

    const unsubCancelled = EventsOn('export:cancelled', (data: ExportCancelledEventData) => {
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
              const csvEntry = entry as CSVExportEntry
              return csvEntry.database === data.database && csvEntry.collection === data.collection
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

    // Listen for export pause/resume events
    const unsubExportPaused = EventsOn('export:paused', () => {
      setExports(prev => {
        // Mark active exports as paused
        const activeIdx = prev.findIndex(e => e.phase !== 'queued' && e.phase !== 'complete' && e.phase !== 'error')
        if (activeIdx === -1) return prev
        const next = [...prev]
        next[activeIdx] = { ...next[activeIdx], paused: true } as ExportEntryUnion
        return next
      })
    })

    const unsubExportResumed = EventsOn('export:resumed', () => {
      setExports(prev => {
        const pausedIdx = prev.findIndex(e => e.paused)
        if (pausedIdx === -1) return prev
        const next = [...prev]
        next[pausedIdx] = { ...next[pausedIdx], paused: false } as ExportEntryUnion
        return next
      })
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
      if (unsubExportPaused) unsubExportPaused()
      if (unsubExportResumed) unsubExportResumed()
    }
  }, [notify])

  // Listen for import pause/resume events (tracked imports update their own paused state via modals,
  // but we also listen here for ExportManager-initiated pause/resume)
  useEffect(() => {
    const unsubImportPaused = EventsOn('import:paused', () => {
      setImports(prev => {
        const activeIdx = prev.findIndex(e => e.phase === 'importing' || e.phase === 'starting')
        if (activeIdx === -1) return prev
        const next = [...prev]
        next[activeIdx] = { ...next[activeIdx], paused: true }
        return next
      })
    })

    const unsubImportResumed = EventsOn('import:resumed', () => {
      setImports(prev => {
        const pausedIdx = prev.findIndex(e => e.paused)
        if (pausedIdx === -1) return prev
        const next = [...prev]
        next[pausedIdx] = { ...next[pausedIdx], paused: false }
        return next
      })
    })

    return () => {
      if (unsubImportPaused) unsubImportPaused()
      if (unsubImportResumed) unsubImportResumed()
    }
  }, [])

  // Beforeunload protection for active imports (imports are destructive)
  useEffect(() => {
    const hasActiveImport = imports.some(e => e.phase === 'importing' || e.phase === 'starting')
    if (!hasActiveImport) return

    const handleBeforeUnload = (e: BeforeUnloadEvent): string | undefined => {
      e.preventDefault()
      e.returnValue = 'An import is in progress. Closing now may leave your data in an inconsistent state.'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [imports])

  // Get the export closest to finishing
  const getLeadingExport = useCallback((): ExportEntryUnion | null => {
    let leading: ExportEntryUnion | null = null
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
  const cancelExport = useCallback((exportId: string): void => {
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
  const cancelAllExports = useCallback((): void => {
    const hasActive = exports.some(e => e.phase !== 'queued')
    if (hasActive) {
      getGo()?.CancelExport?.()
    }
    setExports([])
    notify.info('All exports cancelled')
  }, [exports, notify])

  // Clear completed history
  const clearHistory = useCallback((): void => {
    setCompletedExports([])
    completedIdsRef.current.clear()
  }, [])

  const queuedCount = useMemo(() => exports.filter(e => e.phase === 'queued').length, [exports])
  const activeCount = useMemo(() => {
    const activeExportCount = exports.filter(e => e.phase !== 'queued' && e.phase !== 'complete').length
    const activeImportCount = imports.filter(e => e.phase !== 'complete' && e.phase !== 'error').length
    return activeExportCount + activeImportCount
  }, [exports, imports])

  // Unified transfers list sorted by startedAt
  const allTransfers: TransferEntry[] = useMemo(
    () => [...exports, ...imports].sort((a, b) => a.startedAt - b.startedAt),
    [exports, imports]
  )

  const value: ExportQueueContextValue = useMemo(() => ({
    exports,
    imports,
    allTransfers,
    completedExports,
    queuedCount,
    activeCount,
    queueCSVExport,
    queueJSONExport,
    trackZipExport,
    updateTrackedExport,
    completeTrackedExport,
    removeTrackedExport,
    trackImport,
    updateTrackedImport,
    completeTrackedImport,
    removeTrackedImport,
    getLeadingExport,
    cancelExport,
    cancelAllExports,
    clearHistory,
  }), [
    exports, imports, allTransfers, completedExports, queuedCount, activeCount,
    queueCSVExport, queueJSONExport, trackZipExport, updateTrackedExport,
    completeTrackedExport, removeTrackedExport, trackImport, updateTrackedImport,
    completeTrackedImport, removeTrackedImport, getLeadingExport,
    cancelExport, cancelAllExports, clearHistory,
  ])

  return (
    <ExportQueueContext.Provider value={value}>
      {children}
    </ExportQueueContext.Provider>
  )
}

export function useExportQueue(): ExportQueueContextValue {
  const context = useContext(ExportQueueContext)
  if (context === undefined) {
    throw new Error('useExportQueue must be used within ExportQueueProvider')
  }
  return context
}

export default ExportQueueContext
