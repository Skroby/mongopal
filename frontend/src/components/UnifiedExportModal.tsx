import { useState, useEffect, useRef, useCallback, ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useExportQueue } from './contexts/ExportQueueContext'
import { useProgressETA } from '../hooks/useProgressETA'
import ConfirmDialog from './ConfirmDialog'
import type { MongodumpOptions } from '../types/wails.d'

type ExportFormat = 'zip' | 'bson'

// Go bindings type
interface GoApp {
  GetDatabasesForExport?: (connectionId: string) => Promise<DatabaseInfo[]>
  GetCollectionsForExport?: (connectionId: string, databaseName: string) => Promise<CollectionInfo[]>
  ExportDatabases?: (connectionId: string, databases: string[], savePath: string) => Promise<void>
  ExportSelectiveDatabases?: (connectionId: string, dbCollections: Record<string, string[]>, savePath: string) => Promise<void>
  ExportCollections?: (connectionId: string, databaseName: string, collections: string[]) => Promise<void>
  ExportWithMongodump?: (connectionId: string, options: MongodumpOptions) => Promise<void>
  GetZipSavePath?: (defaultFilename: string) => Promise<string | null>
  GetBSONSavePath?: (defaultFilename: string) => Promise<string | null>
  CancelExport?: () => void
  PauseExport?: () => void
  ResumeExport?: () => void
  CheckToolAvailability?: () => Promise<{ mongodump: boolean; mongodumpVersion?: string }>
}

interface DatabaseInfo {
  name: string
  sizeOnDisk: number
}

interface CollectionInfo {
  name: string
  count: number
  sizeOnDisk: number
}

interface ExportProgressEventData {
  databaseIndex?: number
  databaseTotal?: number
  collectionIndex?: number
  collectionTotal?: number
  database?: string
  collection?: string
  current?: number
  total?: number
  processedDocs?: number
  totalDocs?: number
  filePath?: string
}

interface ExportCompleteEventData {
  filePath?: string
}

interface ProgressState {
  databaseIndex?: number
  databaseTotal?: number
  collectionIndex?: number
  collectionTotal?: number
  database?: string
  collection?: string
  current?: number
  total?: number
  processedDocs?: number
  totalDocs?: number
  filePath?: string
}

// Database row for connection-scope tree view
interface DatabaseRow {
  name: string
  sizeOnDisk: number
  collections: CollectionInfo[] | null // null = not loaded yet
  loading: boolean
  expanded: boolean
}

export interface UnifiedExportModalProps {
  connectionId: string
  connectionName: string
  databaseName?: string      // absent = connection scope
  collectionName?: string    // pre-select single collection
  onClose: () => void
  onHide?: () => void
  onShow?: () => void
}

const getGo = (): GoApp | undefined =>
  (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
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

// Scope derived from props
type ExportScope = 'connection' | 'database' | 'collection'
function getScope(databaseName?: string, collectionName?: string): ExportScope {
  if (!databaseName) return 'connection'
  if (collectionName) return 'collection'
  return 'database'
}

export default function UnifiedExportModal({
  connectionId,
  connectionName,
  databaseName,
  collectionName,
  onClose,
  onHide,
  onShow,
}: UnifiedExportModalProps): React.ReactElement {
  const scope = getScope(databaseName, collectionName)
  const { notify } = useNotification()
  const { trackZipExport, updateTrackedExport, completeTrackedExport, removeTrackedExport } = useExportQueue()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()

  // --- State ---
  // Connection scope: tree of databases with expandable collections
  const [databases, setDatabases] = useState<DatabaseRow[]>([])
  // Database/collection scope: flat list of collections
  const [collections, setCollections] = useState<CollectionInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Selection: db → Set<collectionName>
  const [selection, setSelection] = useState<Map<string, Set<string>>>(new Map())

  const [format, setFormat] = useState<ExportFormat>('zip')
  const [outputPath, setOutputPath] = useState('')
  const [browsingPath, setBrowsingPath] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [bsonAvailable, setBsonAvailable] = useState<boolean | null>(null)
  const [bsonVersion, setBsonVersion] = useState('')

  const lastClickedIndex = useRef<number | null>(null)
  const exportId = useRef<string | null>(null)
  const exportStartTime = useRef<number | null>(null)
  const totalDocsRef = useRef<number>(0)
  const processedDocsRef = useRef<number>(0)
  const filePathRef = useRef<string | null>(null)
  const maxProgressRef = useRef<number>(0)

  // --- Selection helpers ---
  const totalSelected = useCallback((): number => {
    let count = 0
    selection.forEach(s => { count += s.size })
    return count
  }, [selection])

  const getDbCheckState = useCallback((dbName: string, dbRow?: DatabaseRow): 'checked' | 'unchecked' | 'indeterminate' => {
    const sel = selection.get(dbName)
    if (!sel || sel.size === 0) return 'unchecked'
    const row = dbRow || databases.find(d => d.name === dbName)
    if (!row?.collections) return sel.size > 0 ? 'checked' : 'unchecked'
    if (sel.size >= row.collections.length) return 'checked'
    return 'indeterminate'
  }, [selection, databases])

  // --- Load data ---
  const loadDatabases = useCallback(async () => {
    try {
      const go = getGo()
      if (go?.GetDatabasesForExport) {
        const dbs = await go.GetDatabasesForExport(connectionId)
        const rows: DatabaseRow[] = (dbs || []).map(db => ({
          name: db.name,
          sizeOnDisk: db.sizeOnDisk,
          collections: null,
          loading: false,
          expanded: false,
        }))
        setDatabases(rows)
        // Pre-select all non-system databases (fully selected = empty set placeholder)
        const initial = new Map<string, Set<string>>()
        ;(dbs || []).forEach(db => {
          if (!['admin', 'local', 'config'].includes(db.name)) {
            // Mark as "all selected" — will be resolved when collections are loaded
            initial.set(db.name, new Set(['__ALL__']))
          }
        })
        setSelection(initial)
      }
    } catch (err) {
      notify.error(`Failed to load databases: ${(err as Error)?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [connectionId, notify])

  const loadCollections = useCallback(async () => {
    try {
      const go = getGo()
      if (go?.GetCollectionsForExport && databaseName) {
        const colls = await go.GetCollectionsForExport(connectionId, databaseName)
        setCollections(colls || [])
        const initial = new Map<string, Set<string>>()
        if (collectionName) {
          initial.set(databaseName, new Set([collectionName]))
        } else {
          initial.set(databaseName, new Set((colls || []).map(c => c.name)))
        }
        setSelection(initial)
      }
    } catch (err) {
      notify.error(`Failed to load collections: ${(err as Error)?.message || String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [connectionId, databaseName, collectionName, notify])

  const loadDbCollections = useCallback(async (dbName: string) => {
    const go = getGo()
    if (!go?.GetCollectionsForExport) return

    setDatabases(prev => prev.map(d =>
      d.name === dbName ? { ...d, loading: true, expanded: true } : d
    ))

    try {
      const colls = await go.GetCollectionsForExport(connectionId, dbName)
      setDatabases(prev => prev.map(d =>
        d.name === dbName ? { ...d, collections: colls || [], loading: false } : d
      ))

      // If this DB was marked as __ALL__, resolve to actual collection names
      setSelection(prev => {
        const sel = prev.get(dbName)
        if (sel?.has('__ALL__')) {
          const next = new Map(prev)
          next.set(dbName, new Set((colls || []).map(c => c.name)))
          return next
        }
        return prev
      })
    } catch {
      setDatabases(prev => prev.map(d =>
        d.name === dbName ? { ...d, loading: false } : d
      ))
    }
  }, [connectionId])

  // --- Effects ---
  useEffect(() => {
    if (scope === 'connection') {
      loadDatabases()
    } else {
      loadCollections()
    }

    const checkBson = async (): Promise<void> => {
      try {
        const result = await getGo()?.CheckToolAvailability?.()
        const available = result?.mongodump ?? false
        setBsonAvailable(available)
        setBsonVersion(result?.mongodumpVersion || '')
        if (available) setFormat('bson')
      } catch {
        setBsonAvailable(false)
      }
    }
    checkBson()

    const unsubProgress = EventsOn('export:progress', (data: ExportProgressEventData) => {
      setProgress(data)

      if (data.totalDocs && data.totalDocs > totalDocsRef.current) {
        totalDocsRef.current = data.totalDocs
      }
      if (typeof data.processedDocs === 'number') {
        processedDocsRef.current = data.processedDocs
        recordProgress(data.processedDocs)
      }

      if (data.filePath) {
        filePathRef.current = data.filePath
      }

      if (exportId.current) {
        const pDocs = data.processedDocs ?? processedDocsRef.current ?? 0
        const tDocs = data.totalDocs ?? totalDocsRef.current ?? 0
        let progressPercent = 0

        if (tDocs > 0) {
          progressPercent = Math.min(100, Math.round((pDocs / tDocs) * 100))
        } else if (data.databaseTotal && data.databaseTotal > 0) {
          progressPercent = Math.round((((data.databaseIndex || 1) - 1) / data.databaseTotal) * 100)
        } else if (data.collectionTotal && data.collectionTotal > 0) {
          progressPercent = Math.round((((data.collectionIndex || 1) - 1) / data.collectionTotal) * 100)
        }

        let currentItem: string | null = null
        if (data.collection) {
          currentItem = data.collection
        } else if (data.database) {
          currentItem = data.database
        }

        updateTrackedExport(exportId.current, {
          phase: 'downloading',
          progress: progressPercent,
          current: pDocs,
          total: tDocs,
          currentItem,
          itemIndex: data.databaseIndex || data.collectionIndex || 0,
          itemTotal: data.databaseTotal || data.collectionTotal || 0,
        })
      }
    })

    const unsubComplete = EventsOn('export:complete', (data: ExportCompleteEventData) => {
      if (!exportId.current) return
      setExporting(false)
      setProgress(null)
      notify.success('Export completed successfully')
      completeTrackedExport(exportId.current, data?.filePath || filePathRef.current || undefined)
      exportId.current = null
      filePathRef.current = null
      onShow?.()
      onClose()
    })

    const unsubCancelled = EventsOn('export:cancelled', () => {
      if (!exportId.current) return
      setExporting(false)
      setPaused(false)
      setProgress(null)
      notify.info('Export cancelled')
      removeTrackedExport(exportId.current)
      exportId.current = null
      filePathRef.current = null
    })

    const unsubPaused = EventsOn('export:paused', () => { setPaused(true) })
    const unsubResumed = EventsOn('export:resumed', () => { setPaused(false) })

    return () => {
      unsubProgress?.()
      unsubComplete?.()
      unsubCancelled?.()
      unsubPaused?.()
      unsubResumed?.()
    }
  }, [scope, updateTrackedExport, completeTrackedExport, removeTrackedExport])

  // Elapsed time counter
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
    return () => { if (interval) clearInterval(interval) }
  }, [exporting])

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showCancelConfirm) return
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

  // --- Handlers ---
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

  // --- Selection toggles ---

  // Connection scope: toggle a database checkbox
  const toggleDatabase = (dbName: string): void => {
    const row = databases.find(d => d.name === dbName)
    const state = getDbCheckState(dbName, row)

    if (state === 'unchecked') {
      // Select all collections
      if (row?.collections) {
        setSelection(prev => {
          const next = new Map(prev)
          next.set(dbName, new Set(row.collections!.map(c => c.name)))
          return next
        })
      } else {
        // Not loaded yet — mark as ALL, load collections
        setSelection(prev => {
          const next = new Map(prev)
          next.set(dbName, new Set(['__ALL__']))
          return next
        })
        loadDbCollections(dbName)
      }
    } else {
      // Deselect all
      setSelection(prev => {
        const next = new Map(prev)
        next.delete(dbName)
        return next
      })
    }
  }

  // Connection scope: toggle a single collection within a database
  const toggleCollectionInDb = (dbName: string, collName: string): void => {
    setSelection(prev => {
      const next = new Map(prev)
      const set = new Set(prev.get(dbName) || [])
      set.delete('__ALL__')
      if (set.has(collName)) {
        set.delete(collName)
      } else {
        set.add(collName)
      }
      if (set.size === 0) {
        next.delete(dbName)
      } else {
        next.set(dbName, set)
      }
      return next
    })
  }

  // Database/collection scope: toggle a collection
  const toggleCollection = (collName: string, index: number, event?: Event | ReactMouseEvent): void => {
    const nativeEvent = event as MouseEvent | undefined
    if (nativeEvent?.shiftKey && lastClickedIndex.current !== null && lastClickedIndex.current !== index) {
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const rangeNames = collections.slice(start, end + 1).map(c => c.name)
      const db = databaseName!

      setSelection(prev => {
        const next = new Map(prev)
        const set = new Set(prev.get(db) || [])
        const shouldSelect = !set.has(collName)
        rangeNames.forEach(name => {
          if (shouldSelect) set.add(name)
          else set.delete(name)
        })
        if (set.size === 0) next.delete(db)
        else next.set(db, set)
        return next
      })
    } else {
      const db = databaseName!
      setSelection(prev => {
        const next = new Map(prev)
        const set = new Set(prev.get(db) || [])
        if (set.has(collName)) set.delete(collName)
        else set.add(collName)
        if (set.size === 0) next.delete(db)
        else next.set(db, set)
        return next
      })
    }
    lastClickedIndex.current = index
  }

  // Expand/collapse a database in connection scope
  const toggleExpand = (dbName: string): void => {
    const row = databases.find(d => d.name === dbName)
    if (!row) return

    if (row.expanded) {
      setDatabases(prev => prev.map(d =>
        d.name === dbName ? { ...d, expanded: false } : d
      ))
    } else {
      if (row.collections === null && !row.loading) {
        loadDbCollections(dbName)
      } else {
        setDatabases(prev => prev.map(d =>
          d.name === dbName ? { ...d, expanded: true } : d
        ))
      }
    }
  }

  // Select all / deselect all
  const selectAll = (): void => {
    if (scope === 'connection') {
      const next = new Map<string, Set<string>>()
      databases.forEach(db => {
        if (db.collections) {
          next.set(db.name, new Set(db.collections.map(c => c.name)))
        } else {
          next.set(db.name, new Set(['__ALL__']))
        }
      })
      setSelection(next)
    } else {
      setSelection(new Map([[databaseName!, new Set(collections.map(c => c.name))]]))
    }
  }

  const deselectAll = (): void => {
    setSelection(new Map())
  }

  // --- Export dispatch ---
  const handleExport = async (): Promise<void> => {
    const count = totalSelected()
    if (count === 0) {
      notify.warning('Please select at least one item')
      return
    }

    setExporting(true)
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0
    filePathRef.current = null
    maxProgressRef.current = 0

    const formatLabel = format === 'bson' ? 'mongodump' : 'ZIP'
    const canPause = format !== 'bson'

    // Build tracking label
    let label: string
    if (scope === 'connection') {
      label = `${connectionName} (${selection.size} databases, ${formatLabel})`
    } else {
      const collCount = selection.get(databaseName!)?.size || 0
      label = `${databaseName} (${collCount} collections, ${formatLabel})`
    }

    const selectedNames = scope === 'connection'
      ? Array.from(selection.keys())
      : Array.from(selection.get(databaseName!) || [])

    setProgress({
      databaseIndex: 0,
      databaseTotal: scope === 'connection' ? selection.size : 1,
      collectionIndex: 0,
      collectionTotal: scope !== 'connection' ? selectedNames.length : 0,
    })

    exportId.current = trackZipExport(
      connectionId,
      scope === 'connection' ? connectionName : databaseName!,
      selectedNames,
      label,
      onShow,
      canPause
    )

    try {
      if (scope === 'connection') {
        await dispatchConnectionExport()
      } else {
        await dispatchDatabaseExport()
      }
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      if (!errMsg.toLowerCase().includes('cancel')) {
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

  const dispatchConnectionExport = async (): Promise<void> => {
    const go = getGo()

    // Determine if all databases are fully selected
    const allFull = Array.from(selection.entries()).every(([dbName, collSet]) => {
      if (collSet.has('__ALL__')) return true
      const row = databases.find(d => d.name === dbName)
      return row?.collections && collSet.size >= row.collections.length
    })

    if (format === 'bson') {
      if (allFull) {
        // All fully selected → simple multi-DB mongodump
        const opts: MongodumpOptions = {
          databases: Array.from(selection.keys()),
          outputPath,
        }
        await go?.ExportWithMongodump?.(connectionId, opts)
      } else {
        // Partial selection → per-DB jobs with exclusions
        const databaseCollections: Record<string, string[]> = {}
        for (const [dbName, collSet] of selection.entries()) {
          const row = databases.find(d => d.name === dbName)
          if (!row?.collections) {
            // Not loaded = __ALL__, no exclusions
            databaseCollections[dbName] = []
          } else {
            const excluded = row.collections.filter(c => !collSet.has(c.name)).map(c => c.name)
            databaseCollections[dbName] = excluded
          }
        }
        const opts: MongodumpOptions = {
          databaseCollections,
          outputPath,
        }
        await go?.ExportWithMongodump?.(connectionId, opts)
      }
    } else {
      // ZIP format
      if (allFull) {
        await go?.ExportDatabases?.(connectionId, Array.from(selection.keys()), outputPath)
      } else {
        // Partial selection → selective export
        const dbCollections: Record<string, string[]> = {}
        for (const [dbName, collSet] of selection.entries()) {
          const names = Array.from(collSet).filter(n => n !== '__ALL__')
          dbCollections[dbName] = names
        }
        await go?.ExportSelectiveDatabases?.(connectionId, dbCollections, outputPath)
      }
    }
  }

  const dispatchDatabaseExport = async (): Promise<void> => {
    const go = getGo()
    const selectedColls = Array.from(selection.get(databaseName!) || [])

    if (format === 'bson') {
      const allCollNames = collections.map(c => c.name)
      const excluded = allCollNames.filter(name => !selection.get(databaseName!)?.has(name))
      const opts: MongodumpOptions = {
        database: databaseName!,
        ...(excluded.length > 0 ? { excludeCollections: excluded } : {}),
        outputPath,
      }
      await go?.ExportWithMongodump?.(connectionId, opts)
    } else {
      await go?.ExportCollections?.(connectionId, databaseName!, selectedColls)
    }
  }

  // --- Progress helpers ---
  const isPreparing = (): boolean => {
    if (!progress) return true
    if (scope === 'connection') {
      return !progress.databaseIndex || progress.databaseIndex === 0
    }
    return (!progress.collectionIndex || progress.collectionIndex === 0) &&
           (!progress.databaseIndex || progress.databaseIndex === 0)
  }

  const getProgressPercent = (): number => {
    if (!progress) return maxProgressRef.current

    const processedDocs = progress.processedDocs || processedDocsRef.current || 0
    const totalDocs = progress.totalDocs || totalDocsRef.current || 0

    let percent = 0
    if (totalDocs > 0) {
      percent = Math.min(100, Math.round((processedDocs / totalDocs) * 100))
    } else {
      const itemTotal = progress.databaseTotal || progress.collectionTotal || 0
      const itemIndex = progress.databaseIndex || progress.collectionIndex || 0
      if (itemTotal > 0 && itemIndex > 0) {
        percent = Math.round(((itemIndex - 1) / itemTotal) * 100)
      }
    }

    percent = Math.max(percent, maxProgressRef.current)
    maxProgressRef.current = percent
    return percent
  }

  const getProgressLabel = (): string => {
    if (isPreparing()) return 'Preparing export...'
    if (scope === 'connection') {
      return `Database ${progress?.databaseIndex || 0} of ${progress?.databaseTotal || selection.size}`
    }
    const collTotal = progress?.collectionTotal || (selection.get(databaseName!)?.size ?? 0)
    return `Collection ${progress?.collectionIndex || progress?.databaseIndex || 0} of ${collTotal}`
  }

  // --- Title ---
  const title = scope === 'connection' ? 'Export Databases' : 'Export Collections'
  const subtitle = scope === 'connection'
    ? connectionName
    : `${connectionName} / ${databaseName}`

  // --- Render ---
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary text-text border border-border rounded-lg w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text">{title}</h2>
          <p className="text-sm text-text-muted mt-1">{subtitle}</p>
          {bsonAvailable && !exporting && (
            <div className="flex items-center gap-1 mt-2.5 bg-surface rounded-lg p-0.5">
              <button
                className={`flex-1 text-xs py-1.5 px-3 rounded-md transition-colors ${
                  format === 'bson'
                    ? 'bg-surface-hover text-text-light font-medium'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => { setFormat('bson'); setOutputPath('') }}
              >
                BSON (mongodump)
              </button>
              <button
                className={`flex-1 text-xs py-1.5 px-3 rounded-md transition-colors ${
                  format === 'zip'
                    ? 'bg-surface-hover text-text-light font-medium'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => { setFormat('zip'); setOutputPath('') }}
              >
                JSON (ZIP)
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : exporting ? (
            /* Progress view */
            <div className="p-4 flex-1 flex flex-col justify-center">
              <div className="mb-4">
                {paused && format !== 'bson' && (
                  <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Export paused
                  </div>
                )}
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-text-secondary">{getProgressLabel()}</span>
                  <div className="flex items-center gap-3 text-text-dim font-mono text-xs">
                    {(() => {
                      const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                      return eta ? <span className="text-primary">{eta} left</span> : null
                    })()}
                    <span>{formatElapsedTime(elapsedSeconds)}</span>
                  </div>
                </div>

                {!isPreparing() && progress?.collection && (
                  <div className="bg-surface/50 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-primary font-medium">
                        {progress.database ? `${progress.database}.` : ''}{progress.collection}
                      </span>
                    </div>
                    {progress?.total && progress.total > 0 && (
                      <>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>{(progress.current || 0).toLocaleString()} / {progress.total.toLocaleString()} docs</span>
                          <span>{Math.round(((progress.current || 0) / progress.total) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-200"
                            style={{ width: `${Math.min(100, ((progress.current || 0) / progress.total) * 100)}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="mb-1">
                  <div className="text-xs text-text-dim mb-1">Overall Progress</div>
                  <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                    {isPreparing() ? (
                      <div className="h-full w-full relative">
                        <div className="absolute inset-0 bg-primary/30" />
                        <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent progress-indeterminate" />
                      </div>
                    ) : (
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${getProgressPercent()}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-muted text-center">
                Please wait while your data is being exported...
              </p>
            </div>
          ) : (
            /* Selection view */
            <>
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <button
                  className="text-sm text-primary hover:text-primary/80 rounded px-1 focus-visible:ring-2 focus-visible:ring-primary/50"
                  onClick={selectAll}
                >
                  Select All
                </button>
                <span className="text-text-dim">|</span>
                <button
                  className="text-sm text-primary hover:text-primary/80 rounded px-1 focus-visible:ring-2 focus-visible:ring-primary/50"
                  onClick={deselectAll}
                >
                  Deselect All
                </button>
                <span className="ml-auto text-sm text-text-muted">
                  {totalSelected()} selected
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {scope === 'connection' ? (
                  /* Connection scope: database tree with expandable collections */
                  databases.map(db => {
                    const checkState = getDbCheckState(db.name, db)
                    return (
                      <div key={db.name}>
                        <div
                          className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer hover:bg-surface-hover/50 ${
                            checkState !== 'unchecked' ? 'bg-surface-hover/30' : ''
                          }`}
                        >
                          {/* Expand arrow */}
                          <button
                            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary shrink-0"
                            onClick={() => toggleExpand(db.name)}
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${db.expanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>

                          {/* Tri-state checkbox */}
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border-light bg-surface text-primary focus:ring-primary/50 shrink-0"
                            checked={checkState === 'checked'}
                            ref={(el) => { if (el) el.indeterminate = checkState === 'indeterminate' }}
                            onChange={() => toggleDatabase(db.name)}
                          />

                          <div className="flex-1 min-w-0" onClick={() => toggleExpand(db.name)}>
                            <div className="text-sm text-text-light truncate">{db.name}</div>
                            {['admin', 'local', 'config'].includes(db.name) && (
                              <div className="text-xs text-text-muted">System database</div>
                            )}
                          </div>
                          <div className="text-xs text-text-muted shrink-0">
                            {formatBytes(db.sizeOnDisk)}
                          </div>
                        </div>

                        {/* Expanded collections */}
                        {db.expanded && (
                          <div className="ml-7 border-l border-border/50 pl-2">
                            {db.loading ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted">
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-primary"></div>
                                Loading collections...
                              </div>
                            ) : db.collections && db.collections.length > 0 ? (
                              db.collections.map(coll => {
                                const isSelected = selection.get(db.name)?.has(coll.name) || selection.get(db.name)?.has('__ALL__')
                                return (
                                  <label
                                    key={coll.name}
                                    className={`flex items-center gap-3 px-3 py-1.5 rounded cursor-pointer hover:bg-surface-hover/50 ${
                                      isSelected ? 'bg-surface-hover/20' : ''
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="w-3.5 h-3.5 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                                      checked={!!isSelected}
                                      onChange={() => toggleCollectionInDb(db.name, coll.name)}
                                    />
                                    <span className="flex-1 text-xs text-text-secondary truncate">{coll.name}</span>
                                    <span className="text-xs text-text-dim">{formatCount(coll.count)} docs</span>
                                  </label>
                                )
                              })
                            ) : (
                              <div className="px-3 py-1.5 text-xs text-text-dim">No collections</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  /* Database/collection scope: flat collection list */
                  collections.length === 0 ? (
                    <div className="text-center text-text-muted py-4">
                      No collections found in this database
                    </div>
                  ) : (
                    collections.map((coll, index) => {
                      const isSelected = selection.get(databaseName!)?.has(coll.name)
                      return (
                        <label
                          key={coll.name}
                          className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-surface-hover/50 ${
                            isSelected ? 'bg-surface-hover/30' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                            checked={!!isSelected}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => toggleCollection(coll.name, index, e.nativeEvent)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-text-light truncate">{coll.name}</div>
                            <div className="text-xs text-text-muted">{formatCount(coll.count)} docs</div>
                          </div>
                          <div className="text-xs text-text-muted">
                            {formatBytes(coll.sizeOnDisk)}
                          </div>
                        </label>
                      )
                    })
                  )
                )}
              </div>

              {/* Save location */}
              <div className="px-4 py-2 border-t border-border space-y-2">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Save to</label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-sm text-text-secondary truncate min-w-0">
                      {outputPath ? (
                        <span title={outputPath}>{outputPath.split('/').pop()}</span>
                      ) : (
                        <span className="text-text-dim italic">Choose location...</span>
                      )}
                    </div>
                    <button
                      className="btn btn-secondary px-3 whitespace-nowrap"
                      onClick={async () => {
                        setBrowsingPath(true)
                        try {
                          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                          const count = scope === 'connection' ? selection.size : (selection.get(databaseName!)?.size || 0)
                          const unit = scope === 'connection' ? 'db' : 'coll'
                          const baseName = scope === 'connection' ? connectionName : databaseName!
                          if (format === 'bson') {
                            const defaultFilename = `${baseName}_${count}${unit}_${timestamp}.archive`
                            const path = await getGo()?.GetBSONSavePath?.(defaultFilename)
                            if (path) setOutputPath(path)
                          } else {
                            const defaultFilename = `${baseName}_${count}${unit}_${timestamp}.zip`
                            const path = await getGo()?.GetZipSavePath?.(defaultFilename)
                            if (path) setOutputPath(path)
                          }
                        } catch (err) {
                          console.error('Failed to get save path:', err)
                        } finally {
                          setBrowsingPath(false)
                        }
                      }}
                      disabled={browsingPath}
                    >
                      {browsingPath ? 'Opening...' : 'Browse...'}
                    </button>
                  </div>
                  {outputPath && (
                    <p className="text-xs text-text-dim mt-1 truncate" title={outputPath}>
                      {outputPath}
                    </p>
                  )}
                </div>
                {format === 'bson' && bsonVersion && (
                  <span className="text-xs text-text-dim">{bsonVersion}</span>
                )}
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
                  onClick={onHide ?? onClose}
                  title="Hide this dialog and continue in background"
                >
                  Hide
                </button>
              )}
              {format !== 'bson' && (
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
              )}
            </>
          )}
          <button className="btn btn-ghost" onClick={handleCancelClick}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || totalSelected() === 0 || !outputPath}
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
