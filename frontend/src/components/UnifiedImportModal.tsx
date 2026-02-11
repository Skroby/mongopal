import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useExportQueue } from './contexts/ExportQueueContext'
import { useProgressETA } from '../hooks/useProgressETA'
import ConfirmDialog from './ConfirmDialog'
import { getErrorSummary } from '../utils/errorParser'

// Go bindings type
interface GoApp {
  PreviewImportFile?: () => Promise<ImportPreview | null>
  PreviewImportFilePath?: (filePath: string) => Promise<ImportPreview | null>
  PreviewCollectionsImportFile?: () => Promise<CollectionsImportPreview | null>
  PreviewCollectionsImportFilePath?: (filePath: string) => Promise<CollectionsImportPreview | null>
  ImportDatabases?: (connectionId: string, options: ImportOptions) => Promise<void>
  DryRunImport?: (connectionId: string, options: ImportOptions) => Promise<void>
  ImportSelectiveDatabases?: (connectionId: string, dbCollections: Record<string, string[]>, mode: string, filePath: string) => Promise<void>
  DryRunSelectiveImport?: (connectionId: string, dbCollections: Record<string, string[]>, mode: string, filePath: string) => Promise<void>
  ImportCollections?: (connectionId: string, databaseName: string, options: CollectionsImportOptions) => Promise<void>
  DryRunImportCollections?: (connectionId: string, databaseName: string, options: CollectionsImportOptions) => Promise<CollectionsImportResult | null>
  CancelImport?: () => void
  PauseImport?: () => void
  ResumeImport?: () => void
}

// Import options passed to Go backend (connection scope)
interface ImportOptions {
  filePath: string
  databases: string[]
  mode: ImportMode
}

// Import options passed to Go backend (database scope)
interface CollectionsImportOptions {
  filePath: string
  sourceDatabase: string
  collections: string[]
  mode: ImportMode
}

type ImportMode = 'skip' | 'override'
type ModalStep = 'select' | 'configure' | 'previewing' | 'preview' | 'importing' | 'done' | 'error'

// Connection-scope preview (from PreviewImportFile)
interface ImportPreview {
  filePath: string
  exportedAt: string
  databases: PreviewDatabase[]
}

interface PreviewDatabase {
  name: string
  collectionCount: number
  documentCount: number
}

// Collections-level preview (from PreviewCollectionsImportFile)
interface CollectionsImportPreview {
  filePath: string
  exportedAt: string
  databases: CollectionsPreviewDatabase[]
}

interface CollectionsPreviewDatabase {
  name: string
  collections: CollectionsPreviewItem[]
}

interface CollectionsPreviewItem {
  name: string
  docCount: number
}

// Collection result from import/dry-run
interface CollectionResult {
  name: string
  documentsInserted: number
  documentsSkipped: number
  currentCount?: number
}

// Database result from import/dry-run
interface DatabaseResult {
  name: string
  currentCount?: number
  collections: CollectionResult[]
}

// Import/dry-run result
interface CollectionsImportResult {
  databases: DatabaseResult[]
  documentsInserted: number
  documentsSkipped: number
  documentsDropped?: number
  errors: string[]
  cancelled?: boolean
}

// Progress event data from Wails
interface ImportProgressEventData {
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
  phase?: 'dropping' | 'importing'
}

// Error event data from Wails
interface ImportErrorEventData {
  error: string
  partialResult: CollectionsImportResult
  failedDatabase: string
  failedCollection: string
  remainingDatabases?: string[]
}

// Component props
export interface UnifiedImportModalProps {
  connectionId: string
  connectionName: string
  databaseName?: string      // absent = connection scope
  initialFilePath?: string   // pre-selected from ImportDialog ZIP detection
  onClose: () => void
  onHide?: () => void
  onShow?: () => void
  onComplete?: () => void
}

const getGo = (): GoApp | undefined =>
  (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

function formatNumber(num: number | undefined): string {
  return num?.toLocaleString() || '0'
}

function formatResultForClipboard(result: CollectionsImportResult, connectionName: string, databaseName?: string): string {
  const status = result.cancelled ? 'Import Cancelled' : 'Import Results'
  const target = databaseName ? `${connectionName} / ${databaseName}` : connectionName
  const lines = [`${status} - ${target}`, '']
  lines.push(`Total: ${formatNumber(result.documentsInserted)} inserted${result.documentsSkipped > 0 ? `, ${formatNumber(result.documentsSkipped)} skipped` : ''}`)
  lines.push('')

  for (const db of result.databases || []) {
    if (!databaseName) lines.push(`${db.name}`)
    for (const coll of db.collections || []) {
      const skipped = coll.documentsSkipped > 0 ? `, ${formatNumber(coll.documentsSkipped)} skipped` : ''
      const prefix = databaseName ? '  ' : '    '
      lines.push(`${prefix}${coll.name}: ${formatNumber(coll.documentsInserted)} inserted${skipped}`)
    }
  }

  if (result.errors?.length > 0) {
    lines.push('')
    lines.push('Errors:')
    for (const err of result.errors) {
      lines.push(`  - ${err}`)
    }
  }

  return lines.join('\n')
}

export default function UnifiedImportModal({
  connectionId,
  connectionName,
  databaseName,
  initialFilePath,
  onClose,
  onHide,
  onShow,
  onComplete,
}: UnifiedImportModalProps): React.ReactElement {
  const isConnectionScope = !databaseName
  const { notify } = useNotification()
  const { trackImport, updateTrackedImport, completeTrackedImport, removeTrackedImport } = useExportQueue()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()

  const [step, setStep] = useState<ModalStep>('select')
  // Connection scope: uses CollectionsImportPreview (has collection details per DB)
  const [preview, setPreview] = useState<CollectionsImportPreview | null>(null)
  // Selection: db → set of collection names
  const [selection, setSelection] = useState<Map<string, Set<string>>>(new Map())
  // Database scope: source database from archive
  const [selectedSourceDb, setSelectedSourceDb] = useState<string>('')
  // Connection scope: which databases are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<ImportMode>('skip')
  const [progress, setProgress] = useState<ImportProgressEventData | null>(null)
  const [paused, setPaused] = useState<boolean>(false)
  const [result, setResult] = useState<CollectionsImportResult | null>(null)
  const [dryRunResult, setDryRunResult] = useState<CollectionsImportResult | null>(null)
  const [showOverrideConfirm, setShowOverrideConfirm] = useState<boolean>(false)
  const importId = useRef<string | null>(null)
  const [errorInfo, setErrorInfo] = useState<ImportErrorEventData | null>(null)
  const previewCancelledRef = useRef<boolean>(false)
  const totalDocsRef = useRef<number>(0)
  const processedDocsRef = useRef<number>(0)

  // Get total selected collection count
  const selectedCollectionCount = Array.from(selection.values()).reduce((sum, set) => sum + set.size, 0)
  const selectedDatabaseCount = selection.size

  useEffect(() => {
    const unsubProgress = EventsOn('import:progress', (data: ImportProgressEventData) => {
      setProgress(data)

      if (data.totalDocs && data.totalDocs > totalDocsRef.current) {
        totalDocsRef.current = data.totalDocs
      }
      if (typeof data.processedDocs === 'number') {
        processedDocsRef.current = data.processedDocs
        recordProgress(data.processedDocs)
      }

      if (importId.current) {
        let progressPercent = 0
        if (data.total && data.total > 0 && data.current && data.current > 0) {
          progressPercent = Math.min(100, Math.round((data.current / data.total) * 100))
        } else if (data.databaseTotal && data.databaseTotal > 0) {
          progressPercent = Math.round((((data.databaseIndex || 1) - 1) / data.databaseTotal) * 100)
        } else if (data.collectionTotal && data.collectionTotal > 0) {
          progressPercent = Math.round((((data.collectionIndex || 1) - 1) / data.collectionTotal) * 100)
        }

        updateTrackedImport(importId.current, {
          phase: 'importing',
          progress: progressPercent,
          currentItem: data.collection || data.database || null,
          itemIndex: data.databaseIndex || data.collectionIndex || 0,
          itemTotal: data.databaseTotal || data.collectionTotal || 0,
          processedDocs: data.processedDocs || 0,
          totalDocs: data.totalDocs || 0,
        })
      }
    })
    const unsubComplete = EventsOn('import:complete', (data: CollectionsImportResult) => {
      setStep('done')
      setProgress(null)
      setResult(data)
      if (importId.current) {
        completeTrackedImport(importId.current)
        importId.current = null
      }
      onShow?.()
    })
    const unsubCancelled = EventsOn('import:cancelled', (data: CollectionsImportResult) => {
      setStep('done')
      setProgress(null)
      setPaused(false)
      setResult({ ...data, cancelled: true })
      notify.info('Import cancelled')
      if (importId.current) {
        removeTrackedImport(importId.current)
        importId.current = null
      }
      onShow?.()
    })
    const unsubError = EventsOn('import:error', (data: ImportErrorEventData) => {
      setStep('error')
      setProgress(null)
      setPaused(false)
      setErrorInfo(data)
      onShow?.()
    })
    const unsubPaused = EventsOn('import:paused', () => {
      setPaused(true)
    })
    const unsubResumed = EventsOn('import:resumed', () => {
      setPaused(false)
    })

    // Dry-run events (connection scope uses event-based completion)
    const unsubDryRunProgress = EventsOn('dryrun:progress', (data: ImportProgressEventData) => {
      setProgress(data)
    })
    const unsubDryRunComplete = EventsOn('dryrun:complete', (data: CollectionsImportResult) => {
      if (previewCancelledRef.current) {
        previewCancelledRef.current = false
        return
      }
      setStep('preview')
      setProgress(null)
      setDryRunResult(data)
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
      if (unsubError) unsubError()
      if (unsubPaused) unsubPaused()
      if (unsubResumed) unsubResumed()
      if (unsubDryRunProgress) unsubDryRunProgress()
      if (unsubDryRunComplete) unsubDryRunComplete()
    }
  }, [connectionName, updateTrackedImport, completeTrackedImport, removeTrackedImport, recordProgress, notify])

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showOverrideConfirm) return
        if (step === 'importing') {
          getGo()?.CancelImport?.()
        } else if (step === 'previewing') {
          handleCancelAnalysis()
        } else if (step === 'done' || step === 'error') {
          handleClose()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, showOverrideConfirm, onClose])

  // Auto-preview when opened with a pre-selected file path
  useEffect(() => {
    if (!initialFilePath) return
    const autoPreview = async (): Promise<void> => {
      try {
        const previewData = await getGo()?.PreviewCollectionsImportFilePath?.(initialFilePath)
        if (previewData) {
          setPreview(previewData)
          initSelectionFromPreview(previewData)
          setStep('configure')
        }
      } catch (err) {
        console.error('Failed to preview file:', err)
        notify.error(getErrorSummary((err as Error)?.message || String(err)))
      }
    }
    autoPreview()
  }, [initialFilePath, notify])

  // Initialize selection from preview data
  const initSelectionFromPreview = useCallback((previewData: CollectionsImportPreview): void => {
    if (isConnectionScope) {
      // Pre-select all databases and all collections
      const sel = new Map<string, Set<string>>()
      for (const db of previewData.databases || []) {
        sel.set(db.name, new Set(db.collections.map(c => c.name)))
      }
      setSelection(sel)
      // Auto-expand if few databases
      if (previewData.databases.length <= 5) {
        setExpanded(new Set(previewData.databases.map(db => db.name)))
      }
    } else {
      // Database scope: find matching source database
      const matchingDb = previewData.databases?.find(db => db.name === databaseName)
      if (matchingDb) {
        setSelectedSourceDb(matchingDb.name)
        const sel = new Map<string, Set<string>>()
        sel.set(matchingDb.name, new Set(matchingDb.collections.map(c => c.name)))
        setSelection(sel)
      } else if (previewData.databases?.length > 0) {
        setSelectedSourceDb(previewData.databases[0].name)
        const sel = new Map<string, Set<string>>()
        sel.set(previewData.databases[0].name, new Set(previewData.databases[0].collections.map(c => c.name)))
        setSelection(sel)
      }
    }
  }, [isConnectionScope, databaseName])

  const handleSelectFile = async (): Promise<void> => {
    try {
      // Always use collections-level preview (has more detail)
      const previewData = await getGo()?.PreviewCollectionsImportFile?.()
      if (!previewData) return
      setPreview(previewData)
      initSelectionFromPreview(previewData)
      setStep('configure')
    } catch (err) {
      console.error('Failed to preview file:', err)
      notify.error(getErrorSummary((err as Error)?.message || String(err)))
    }
  }

  // --- Connection scope selection helpers ---

  const getDbCheckboxState = (dbName: string): 'checked' | 'unchecked' | 'indeterminate' => {
    const colls = selection.get(dbName)
    if (!colls || colls.size === 0) return 'unchecked'
    const dbPreview = preview?.databases?.find(db => db.name === dbName)
    if (!dbPreview) return 'unchecked'
    if (colls.size === dbPreview.collections.length) return 'checked'
    return 'indeterminate'
  }

  const toggleDatabase = (dbName: string): void => {
    const dbPreview = preview?.databases?.find(db => db.name === dbName)
    if (!dbPreview) return
    setSelection(prev => {
      const next = new Map(prev)
      const state = getDbCheckboxState(dbName)
      if (state === 'checked') {
        next.delete(dbName)
      } else {
        next.set(dbName, new Set(dbPreview.collections.map(c => c.name)))
      }
      return next
    })
  }

  const toggleCollection = (dbName: string, collName: string): void => {
    setSelection(prev => {
      const next = new Map(prev)
      const colls = new Set(next.get(dbName) || [])
      if (colls.has(collName)) {
        colls.delete(collName)
        if (colls.size === 0) {
          next.delete(dbName)
        } else {
          next.set(dbName, colls)
        }
      } else {
        colls.add(collName)
        next.set(dbName, colls)
      }
      return next
    })
  }

  const toggleExpand = (dbName: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(dbName)) {
        next.delete(dbName)
      } else {
        next.add(dbName)
      }
      return next
    })
  }

  const selectAll = (): void => {
    if (!preview) return
    if (isConnectionScope) {
      const sel = new Map<string, Set<string>>()
      for (const db of preview.databases || []) {
        sel.set(db.name, new Set(db.collections.map(c => c.name)))
      }
      setSelection(sel)
    } else {
      // Database scope: select all collections from source DB
      const sourceDb = preview.databases?.find(db => db.name === selectedSourceDb)
      if (sourceDb) {
        const sel = new Map<string, Set<string>>()
        sel.set(sourceDb.name, new Set(sourceDb.collections.map(c => c.name)))
        setSelection(sel)
      }
    }
  }

  const deselectAll = (): void => {
    setSelection(new Map())
  }

  // --- Database scope source DB change ---
  const handleSourceDbChange = (dbName: string): void => {
    setSelectedSourceDb(dbName)
    const db = preview?.databases?.find(db => db.name === dbName)
    if (db) {
      const sel = new Map<string, Set<string>>()
      sel.set(db.name, new Set(db.collections.map(c => c.name)))
      setSelection(sel)
    } else {
      setSelection(new Map())
    }
  }

  // --- Import helpers ---

  const allDatabasesFullySelected = (): boolean => {
    if (!preview) return false
    for (const db of preview.databases) {
      const colls = selection.get(db.name)
      if (!colls || colls.size !== db.collections.length) return false
    }
    return selection.size === preview.databases.length
  }

  const buildDbCollections = (): Record<string, string[]> => {
    const result: Record<string, string[]> = {}
    for (const [db, colls] of selection) {
      result[db] = [...colls]
    }
    return result
  }

  const togglePause = (): void => {
    if (paused) {
      getGo()?.ResumeImport?.()
    } else {
      getGo()?.PauseImport?.()
    }
  }

  const handlePreview = async (): Promise<void> => {
    if (selectedCollectionCount === 0 || !preview) {
      notify.warning(isConnectionScope ? 'Please select at least one database' : 'Please select at least one collection')
      return
    }

    previewCancelledRef.current = false
    setStep('previewing')
    setDryRunResult(null)
    try {
      if (isConnectionScope) {
        if (allDatabasesFullySelected()) {
          await getGo()?.DryRunImport?.(connectionId, {
            filePath: preview.filePath,
            databases: [...selection.keys()],
            mode: mode,
          })
        } else {
          await getGo()?.DryRunSelectiveImport?.(connectionId, buildDbCollections(), mode, preview.filePath)
        }
        // Result set by dryrun:complete event
      } else {
        // Database scope — synchronous result
        const dryResult = await getGo()?.DryRunImportCollections?.(connectionId, databaseName!, {
          filePath: preview.filePath,
          sourceDatabase: selectedSourceDb,
          collections: [...(selection.get(selectedSourceDb) || [])],
          mode: mode,
        })
        if (previewCancelledRef.current) {
          previewCancelledRef.current = false
          return
        }
        if (dryResult) {
          setDryRunResult(dryResult)
          setStep('preview')
        } else {
          setStep('configure')
        }
      }
    } catch (err) {
      console.error('Preview failed:', err)
      notify.error(getErrorSummary((err as Error)?.message || String(err)))
      setStep('configure')
    }
  }

  const startImport = async (): Promise<void> => {
    if (!preview) return

    setStep('importing')
    setErrorInfo(null)
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0

    const itemNames = isConnectionScope ? [...selection.keys()] : [...(selection.get(selectedSourceDb) || [])]
    const label = isConnectionScope
      ? `Import to ${connectionName} (${selectedDatabaseCount} databases)`
      : `Import to ${databaseName} (${selectedCollectionCount} collections)`

    importId.current = trackImport(
      connectionId,
      isConnectionScope ? connectionName : databaseName!,
      itemNames,
      label,
      onShow
    )

    try {
      if (isConnectionScope) {
        if (allDatabasesFullySelected()) {
          await getGo()?.ImportDatabases?.(connectionId, {
            filePath: preview.filePath,
            databases: [...selection.keys()],
            mode: mode,
          })
        } else {
          await getGo()?.ImportSelectiveDatabases?.(connectionId, buildDbCollections(), mode, preview.filePath)
        }
      } else {
        await getGo()?.ImportCollections?.(connectionId, databaseName!, {
          filePath: preview.filePath,
          sourceDatabase: selectedSourceDb,
          collections: [...(selection.get(selectedSourceDb) || [])],
          mode: mode,
        })
      }
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      if (errMsg.toLowerCase().includes('cancel')) return
      console.error('Import failed:', err)
      notify.error(getErrorSummary(errMsg))
      setStep('error')
      setErrorInfo({
        error: errMsg,
        partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
        failedDatabase: isConnectionScope ? '' : databaseName!,
        failedCollection: '',
        remainingDatabases: isConnectionScope ? [...selection.keys()] : undefined,
      })
      if (importId.current) {
        removeTrackedImport(importId.current)
        importId.current = null
      }
    }
  }

  const handleBackToConfigure = (): void => {
    setStep('configure')
    setDryRunResult(null)
  }

  const handleCancelAnalysis = (): void => {
    previewCancelledRef.current = true
    setStep('configure')
    setProgress(null)
    setDryRunResult(null)
  }

  const handleClose = (): void => {
    if (result || (errorInfo?.partialResult?.documentsInserted && errorInfo.partialResult.documentsInserted > 0)) {
      onComplete?.()
    }
    onClose()
  }

  const handleRetryFailed = async (): Promise<void> => {
    if (!preview) return
    if (isConnectionScope && errorInfo?.remainingDatabases?.length) {
      // Retry with remaining databases
      const remainingSet = new Set(errorInfo.remainingDatabases)
      const newSelection = new Map<string, Set<string>>()
      for (const [db, colls] of selection) {
        if (remainingSet.has(db)) newSelection.set(db, colls)
      }
      setSelection(newSelection)
      setErrorInfo(null)
      setStep('importing')
      resetETA()
      totalDocsRef.current = 0
      processedDocsRef.current = 0
      try {
        if (allDatabasesFullySelected()) {
          await getGo()?.ImportDatabases?.(connectionId, {
            filePath: preview.filePath,
            databases: errorInfo.remainingDatabases,
            mode: mode,
          })
        } else {
          const dbColls: Record<string, string[]> = {}
          for (const [db, colls] of newSelection) {
            dbColls[db] = [...colls]
          }
          await getGo()?.ImportSelectiveDatabases?.(connectionId, dbColls, mode, preview.filePath)
        }
      } catch (err) {
        console.error('Retry failed:', err)
        setStep('error')
        setErrorInfo({
          error: (err as Error)?.message || String(err),
          partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
          failedDatabase: '',
          failedCollection: '',
          remainingDatabases: errorInfo.remainingDatabases,
        })
      }
    } else {
      // Database scope: retry same import
      setErrorInfo(null)
      setStep('importing')
      resetETA()
      totalDocsRef.current = 0
      processedDocsRef.current = 0
      try {
        await getGo()?.ImportCollections?.(connectionId, databaseName!, {
          filePath: preview.filePath,
          sourceDatabase: selectedSourceDb,
          collections: [...(selection.get(selectedSourceDb) || [])],
          mode: mode,
        })
      } catch (err) {
        console.error('Retry failed:', err)
        setStep('error')
        setErrorInfo({
          error: (err as Error)?.message || String(err),
          partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
          failedDatabase: databaseName!,
          failedCollection: '',
        })
      }
    }
  }

  const handleSkipAndContinue = async (): Promise<void> => {
    if (!isConnectionScope || !errorInfo?.remainingDatabases?.length || errorInfo.remainingDatabases.length <= 1 || !preview) {
      setResult(errorInfo?.partialResult || { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] })
      setStep('done')
      return
    }

    const remaining = errorInfo.remainingDatabases.slice(1)
    const remainingSet = new Set(remaining)
    const newSelection = new Map<string, Set<string>>()
    for (const [db, colls] of selection) {
      if (remainingSet.has(db)) newSelection.set(db, colls)
    }
    setSelection(newSelection)
    setErrorInfo(null)
    setStep('importing')
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0
    try {
      const dbColls: Record<string, string[]> = {}
      for (const [db, colls] of newSelection) {
        dbColls[db] = [...colls]
      }
      // Check if all remaining are fully selected
      let allFull = true
      for (const dbName of remaining) {
        const dbPreview = preview.databases?.find(d => d.name === dbName)
        const colls = newSelection.get(dbName)
        if (!dbPreview || !colls || colls.size !== dbPreview.collections.length) {
          allFull = false
          break
        }
      }
      if (allFull) {
        await getGo()?.ImportDatabases?.(connectionId, {
          filePath: preview.filePath,
          databases: remaining,
          mode: mode,
        })
      } else {
        await getGo()?.ImportSelectiveDatabases?.(connectionId, dbColls, mode, preview.filePath)
      }
    } catch (err) {
      console.error('Continue failed:', err)
      setStep('error')
      setErrorInfo({
        error: (err as Error)?.message || String(err),
        partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
        failedDatabase: '',
        failedCollection: '',
        remainingDatabases: remaining,
      })
    }
  }

  const handleDismissError = (): void => {
    if (errorInfo?.partialResult?.documentsInserted && errorInfo.partialResult.documentsInserted > 0) {
      setResult({
        ...errorInfo.partialResult,
        errors: [...(errorInfo.partialResult.errors || []), `Import stopped: ${errorInfo.error}`]
      })
      setStep('done')
    } else {
      handleClose()
    }
  }

  const getProgressPercent = (): number => {
    if (!progress) return 0
    if (progress.total && progress.total > 0 && progress.current && progress.current > 0) {
      return Math.min(100, (progress.current / progress.total) * 100)
    }
    if (progress.databaseTotal && progress.databaseTotal > 0) {
      return (((progress.databaseIndex || 1) - 1) / progress.databaseTotal) * 100
    }
    if (progress.collectionTotal && progress.collectionTotal > 0) {
      return (((progress.collectionIndex || 1) - 1) / progress.collectionTotal) * 100
    }
    return 0
  }

  // Get source collections for database scope
  const getSourceCollections = (): CollectionsPreviewItem[] => {
    if (!preview || !selectedSourceDb) return []
    const db = preview.databases?.find(db => db.name === selectedSourceDb)
    return db?.collections || []
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary text-text border border-border rounded-lg w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text">
            {isConnectionScope ? 'Import Databases' : 'Import Collections'}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {isConnectionScope ? connectionName : `${connectionName} / ${databaseName}`}
            {preview && isConnectionScope && (
              <span className="text-text-muted"> - {preview.databases.length} databases in archive</span>
            )}
            {preview && !isConnectionScope && (
              <span className="text-text-muted"> - {preview.databases?.length || 0} database{preview.databases?.length !== 1 ? 's' : ''} in archive</span>
            )}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {step === 'select' && (
            <div className="p-6 flex flex-col items-center justify-center">
              <svg className="w-16 h-16 text-text-dim mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-text-muted mb-4 text-center">
                {isConnectionScope
                  ? 'Select a previously exported .zip archive to import'
                  : <>Select a previously exported .zip archive to import into <span className="text-text-light">{databaseName}</span></>
                }
              </p>
              <button className="btn btn-primary" onClick={handleSelectFile}>
                Select File
              </button>
            </div>
          )}

          {step === 'configure' && preview && (
            <>
              {/* File info */}
              <div className="px-4 py-2 bg-surface/50 border-b border-border text-xs text-text-muted">
                Exported: {preview.exportedAt}
              </div>

              {/* Database scope: source database selector */}
              {!isConnectionScope && (
                <div className="px-4 py-3 border-b border-border">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Import from database
                  </label>
                  <select
                    className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary"
                    value={selectedSourceDb}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleSourceDbChange(e.target.value)}
                  >
                    <option value="">Select a database...</option>
                    {preview.databases?.map(db => (
                      <option key={db.name} value={db.name}>
                        {db.name} ({db.collections?.length || 0} collections)
                      </option>
                    ))}
                  </select>
                  {selectedSourceDb && selectedSourceDb !== databaseName && (
                    <p className="text-xs text-yellow-500 mt-1">
                      Collections from "{selectedSourceDb}" will be imported into "{databaseName}"
                    </p>
                  )}
                </div>
              )}

              {/* Selection controls */}
              {(isConnectionScope || selectedSourceDb) && (
                <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                  <button className="text-sm text-primary hover:text-primary/80" onClick={selectAll}>
                    Select All
                  </button>
                  <span className="text-text-dim">|</span>
                  <button className="text-sm text-primary hover:text-primary/80" onClick={deselectAll}>
                    Deselect All
                  </button>
                  <span className="ml-auto text-sm text-text-muted">
                    {isConnectionScope
                      ? `${selectedCollectionCount} collection${selectedCollectionCount !== 1 ? 's' : ''} in ${selectedDatabaseCount} database${selectedDatabaseCount !== 1 ? 's' : ''}`
                      : `${selectedCollectionCount} selected`
                    }
                  </span>
                </div>
              )}

              {/* Connection scope: expandable database rows */}
              {isConnectionScope && (
                <div className="flex-1 overflow-y-auto p-2">
                  {preview.databases.map(db => {
                    const state = getDbCheckboxState(db.name)
                    const isExpanded = expanded.has(db.name)
                    const totalDocs = db.collections.reduce((sum, c) => sum + c.docCount, 0)
                    return (
                      <div key={db.name}>
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-surface-hover/50 ${
                            state !== 'unchecked' ? 'bg-surface-hover/30' : ''
                          }`}
                        >
                          {/* Expand arrow */}
                          <button
                            className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-light shrink-0"
                            onClick={() => toggleExpand(db.name)}
                          >
                            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          {/* Tri-state checkbox */}
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                            checked={state === 'checked'}
                            ref={(el) => { if (el) el.indeterminate = state === 'indeterminate' }}
                            onChange={() => toggleDatabase(db.name)}
                          />
                          <div className="flex-1 min-w-0" onClick={() => toggleExpand(db.name)}>
                            <div className="text-sm text-text-light truncate">{db.name}</div>
                            <div className="text-xs text-text-muted">
                              {db.collections.length} collections, {formatNumber(totalDocs)} docs
                            </div>
                          </div>
                        </div>
                        {/* Expanded collection list */}
                        {isExpanded && (
                          <div className="ml-10 mb-1">
                            {db.collections.map(coll => (
                              <label
                                key={coll.name}
                                className="flex items-center gap-3 px-3 py-1.5 rounded cursor-pointer hover:bg-surface-hover/30"
                              >
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                                  checked={selection.get(db.name)?.has(coll.name) || false}
                                  onChange={() => toggleCollection(db.name, coll.name)}
                                />
                                <span className="text-xs text-text-light truncate flex-1">{coll.name}</span>
                                <span className="text-xs text-text-muted shrink-0">{formatNumber(coll.docCount)} docs</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Database scope: flat collection list */}
              {!isConnectionScope && selectedSourceDb && (
                <div className="flex-1 overflow-y-auto p-2">
                  {getSourceCollections().map(coll => (
                    <label
                      key={coll.name}
                      className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-surface-hover/50 ${
                        selection.get(selectedSourceDb)?.has(coll.name) ? 'bg-surface-hover/30' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                        checked={selection.get(selectedSourceDb)?.has(coll.name) || false}
                        onChange={() => toggleCollection(selectedSourceDb, coll.name)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-light truncate">{coll.name}</div>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">{formatNumber(coll.docCount)} docs</span>
                    </label>
                  ))}
                </div>
              )}

              {!isConnectionScope && !selectedSourceDb && (
                <div className="flex-1 flex items-center justify-center p-6 text-text-muted text-sm">
                  Select a source database to view its collections
                </div>
              )}

              {/* Import mode */}
              <div className="p-4 border-t border-border">
                <label className="block text-sm font-medium text-text-secondary mb-3">
                  Import Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-surface-hover/30">
                    <input
                      type="radio"
                      name="mode"
                      value="skip"
                      checked={mode === 'skip'}
                      onChange={() => setMode('skip')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-text-light">Keep Existing (Skip)</div>
                      <div className="text-xs text-text-muted">
                        Keep existing documents in the database, skip importing conflicting documents (by _id).
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-surface-hover/30">
                    <input
                      type="radio"
                      name="mode"
                      value="override"
                      checked={mode === 'override'}
                      onChange={() => setMode('override')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-text-light">Override (Drop & Replace)</div>
                      <div className="text-xs text-error">
                        {isConnectionScope
                          ? 'Drops the selected databases first, then imports fresh.'
                          : 'Drops matching collections first, then imports fresh.'}
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}

          {step === 'previewing' && (
            <div className="p-4 min-h-[160px]">
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-text-secondary mb-2 h-5">
                  {progress?.databaseTotal && progress.databaseTotal > 0 && (
                    <>
                      <span>Analyzing {progress?.databaseIndex || 0} of {progress?.databaseTotal}</span>
                      <span className="text-text-muted">{progress?.database}</span>
                    </>
                  )}
                  {progress?.collectionTotal && progress.collectionTotal > 0 && !progress?.databaseTotal && (
                    <>
                      <span>Analyzing {progress?.collectionIndex || 0} of {progress?.collectionTotal}</span>
                      <span className="text-text-muted">{progress?.collection}</span>
                    </>
                  )}
                </div>

                <div className="text-sm mb-2 h-5">
                  {progress?.collection && progress?.databaseTotal && (
                    <span className="text-text-muted">Collection: <span className="text-text-secondary">{progress.collection}</span></span>
                  )}
                </div>

                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-info transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                <div className="text-xs text-text-muted mt-1 h-4">
                  {progress?.total && progress.total > 0 && (
                    <span>{formatNumber(progress.current)} / {formatNumber(progress.total)} documents</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-text-muted text-center">Analyzing changes...</p>
              <p className="text-xs text-text-dim text-center mt-2">This may take a while for large files</p>
            </div>
          )}

          {step === 'preview' && dryRunResult && (
            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-lg font-medium text-text">Preview Changes</span>
              </div>

              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                {dryRunResult.documentsDropped && dryRunResult.documentsDropped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Will Drop:</span>
                    <span className="text-error font-medium">{formatNumber(dryRunResult.documentsDropped)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">Will Insert:</span>
                  <span className="text-success font-medium">{formatNumber(dryRunResult.documentsInserted)}</span>
                </div>
                {dryRunResult.documentsSkipped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Will Skip:</span>
                    <span className="text-yellow-400 font-medium">{formatNumber(dryRunResult.documentsSkipped)}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {dryRunResult.databases?.map(db => (
                  <div key={db.name} className="bg-surface/50 rounded p-3">
                    <div className="flex items-center justify-between text-sm font-medium text-text-light mb-2">
                      <span>{isConnectionScope ? db.name : databaseName}</span>
                      {db.currentCount && db.currentCount > 0 && (
                        <span className="text-xs text-error font-normal">
                          {formatNumber(db.currentCount)} docs will be dropped
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {db.collections?.map(coll => (
                        <div key={coll.name} className="flex items-center justify-between text-xs">
                          <span className="text-text-muted truncate mr-2">{coll.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            {coll.currentCount && coll.currentCount > 0 && (
                              <span className="text-error">-{formatNumber(coll.currentCount)}</span>
                            )}
                            <span className="text-success">+{formatNumber(coll.documentsInserted)}</span>
                            {coll.documentsSkipped > 0 && (
                              <span className="text-yellow-400">~{formatNumber(coll.documentsSkipped)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {mode === 'override' && dryRunResult.documentsDropped && dryRunResult.documentsDropped > 0 && (
                <div className="mt-4 p-3 bg-error-dark border border-red-800/50 rounded text-sm text-error">
                  Warning: {formatNumber(dryRunResult.documentsDropped)} documents will be permanently deleted.
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="p-4 min-h-[160px]">
              <div className="mb-4">
                {paused && (
                  <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Import paused
                  </div>
                )}
                {/* Progress counter */}
                <div className="flex items-center justify-between text-sm text-text-secondary mb-2 h-5">
                  {progress?.databaseTotal && progress.databaseTotal > 0 && (
                    <>
                      <span>Database {progress?.databaseIndex || 0} of {progress?.databaseTotal}</span>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                          return eta ? <span className="text-primary text-xs font-mono">{eta} left</span> : null
                        })()}
                        <span className="text-text-muted">{progress?.database}</span>
                      </div>
                    </>
                  )}
                  {progress?.collectionTotal && progress.collectionTotal > 0 && !progress?.databaseTotal && (
                    <>
                      <span>Collection {progress?.collectionIndex || 0} of {progress?.collectionTotal}</span>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                          return eta ? <span className="text-primary text-xs font-mono">{eta} left</span> : null
                        })()}
                        <span className="text-text-muted">{progress?.collection}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="text-sm mb-2 h-5">
                  {progress?.phase === 'dropping' ? (
                    <span className="text-yellow-400">
                      Dropping {isConnectionScope ? 'database' : 'collection'}: {progress?.collection || progress?.database}
                    </span>
                  ) : progress?.collection && progress?.phase === 'importing' ? (
                    <span className="text-text-muted">Collection: <span className="text-text-secondary">{progress.collection}</span></span>
                  ) : null}
                </div>

                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                <div className="text-xs text-text-muted mt-1 h-4">
                  {progress?.total && progress.total > 0 && progress?.phase === 'importing' && (
                    <span>{formatNumber(progress.current)} / {formatNumber(progress.total)} documents</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-text-muted text-center">
                Please wait while your {isConnectionScope ? 'databases are' : 'collections are'} being imported...
              </p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {result.cancelled ? (
                    <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span className="text-lg font-medium text-text">
                    {result.cancelled ? 'Import Cancelled' : 'Import Complete'}
                  </span>
                </div>
                <button
                  className="text-xs text-text-muted hover:text-text-light flex items-center gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(formatResultForClipboard(result, connectionName, databaseName))
                    notify.success('Copied to clipboard')
                  }}
                  title="Copy results to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>

              <div className="flex gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">Total Inserted:</span>
                  <span className="text-success font-medium">{formatNumber(result.documentsInserted)}</span>
                </div>
                {result.documentsSkipped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Skipped:</span>
                    <span className="text-yellow-400 font-medium">{formatNumber(result.documentsSkipped)}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {result.databases?.map(db => (
                  <div key={db.name} className="bg-surface/50 rounded p-3">
                    <div className="text-sm font-medium text-text-light mb-2">
                      {isConnectionScope ? db.name : databaseName}
                    </div>
                    <div className="space-y-1">
                      {db.collections?.map(coll => (
                        <div key={coll.name} className="flex items-center justify-between text-xs">
                          <span className="text-text-muted truncate mr-2">{coll.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-success">+{formatNumber(coll.documentsInserted)}</span>
                            {coll.documentsSkipped > 0 && (
                              <span className="text-yellow-400">~{formatNumber(coll.documentsSkipped)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {result.errors?.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm text-error mb-2">Errors ({result.errors.length}):</div>
                  <div className="bg-surface rounded p-2 max-h-32 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <div key={i} className="text-xs text-text-muted">{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'error' && errorInfo && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg font-medium text-text">Import Failed</span>
              </div>

              <div className="bg-error-dark border border-red-800/50 rounded p-3 mb-4">
                <div className="text-sm text-error font-medium mb-1">Error:</div>
                <div className="text-sm text-text-secondary">{errorInfo.error}</div>
                {(errorInfo.failedDatabase || errorInfo.failedCollection) && (
                  <div className="text-xs text-text-muted mt-2">
                    Failed at: {errorInfo.failedDatabase}
                    {errorInfo.failedCollection && ` / ${errorInfo.failedCollection}`}
                  </div>
                )}
              </div>

              {errorInfo.partialResult?.documentsInserted > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-text-secondary mb-2">Partial Progress (before failure):</div>
                  <div className="flex gap-4 mb-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-muted">Inserted:</span>
                      <span className="text-success font-medium">{formatNumber(errorInfo.partialResult.documentsInserted)}</span>
                    </div>
                    {errorInfo.partialResult.documentsSkipped > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-muted">Skipped:</span>
                        <span className="text-yellow-400 font-medium">{formatNumber(errorInfo.partialResult.documentsSkipped)}</span>
                      </div>
                    )}
                  </div>
                  {errorInfo.partialResult.databases?.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-2">
                      {errorInfo.partialResult.databases.map(db => (
                        <div key={db.name} className="bg-surface/50 rounded p-2">
                          <div className="text-xs font-medium text-text-light mb-1">{db.name}</div>
                          <div className="space-y-0.5">
                            {db.collections?.map(coll => (
                              <div key={coll.name} className="flex items-center justify-between text-xs">
                                <span className="text-text-muted truncate mr-2">{coll.name}</span>
                                <span className="text-success shrink-0">+{formatNumber(coll.documentsInserted)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isConnectionScope && errorInfo.remainingDatabases && errorInfo.remainingDatabases.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-text-secondary mb-2">Remaining ({errorInfo.remainingDatabases.length}):</div>
                  <div className="bg-surface/50 rounded p-2 max-h-24 overflow-y-auto">
                    {errorInfo.remainingDatabases.map(db => (
                      <div key={db} className="text-xs text-text-muted py-0.5">{db}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          {step === 'error' ? (
            <>
              <button className="btn btn-ghost" onClick={handleDismissError}>
                {errorInfo?.partialResult?.documentsInserted && errorInfo.partialResult.documentsInserted > 0 ? 'View Results' : 'Close'}
              </button>
              {isConnectionScope && errorInfo?.remainingDatabases && errorInfo.remainingDatabases.length > 1 && (
                <button className="btn btn-ghost" onClick={handleSkipAndContinue}>
                  Skip & Continue
                </button>
              )}
              <button className="btn btn-primary" onClick={handleRetryFailed}>
                Retry
              </button>
            </>
          ) : step === 'done' ? (
            <button className="btn btn-primary" onClick={handleClose}>
              Done
            </button>
          ) : step === 'importing' ? (
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
              <button
                className="btn btn-ghost inline-flex items-center"
                onClick={togglePause}
                title={paused ? 'Resume import' : 'Pause import'}
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
              <button
                className="btn btn-ghost"
                onClick={() => getGo()?.CancelImport?.()}
              >
                Cancel
              </button>
            </>
          ) : step === 'previewing' ? (
            <button className="btn btn-ghost" onClick={handleCancelAnalysis}>
              Cancel Analysis
            </button>
          ) : step === 'preview' ? (
            <>
              <button className="btn btn-ghost" onClick={handleBackToConfigure}>
                Back
              </button>
              <button
                className={`btn ${mode === 'override' ? 'btn-danger' : 'btn-primary'}`}
                onClick={mode === 'override' ? () => setShowOverrideConfirm(true) : startImport}
              >
                {mode === 'override' ? 'Drop & Import' : 'Import'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              {step === 'configure' && (
                <button
                  className="btn btn-primary"
                  onClick={handlePreview}
                  disabled={selectedCollectionCount === 0 || (!isConnectionScope && !selectedSourceDb)}
                >
                  Preview Changes
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showOverrideConfirm}
        title={isConnectionScope ? 'Override Databases' : 'Override Collections'}
        message={
          <div>
            {dryRunResult && dryRunResult.documentsDropped && dryRunResult.documentsDropped > 0 && (
              <div className="mb-4 p-3 bg-error-dark border border-red-800/50 rounded">
                <div className="text-error font-medium text-sm">
                  This will permanently delete {formatNumber(dryRunResult.documentsDropped)} documents
                  {isConnectionScope
                    ? ` across ${dryRunResult.databases?.length || 0} database${(dryRunResult.databases?.length || 0) !== 1 ? 's' : ''}`
                    : ` across ${dryRunResult.databases?.[0]?.collections?.length || 0} collection${(dryRunResult.databases?.[0]?.collections?.length || 0) !== 1 ? 's' : ''}`
                  }
                </div>
              </div>
            )}

            <p className="mb-3">
              {isConnectionScope
                ? 'This will DROP and replace the following databases:'
                : <>This will DROP and replace the following collections in <span className="text-text-light">{databaseName}</span>:</>
              }
            </p>
            <div className="max-h-40 overflow-y-auto bg-surface rounded p-2 mb-3 space-y-1">
              {isConnectionScope ? (
                dryRunResult?.databases ? (
                  dryRunResult.databases.map(db => (
                    <div key={db.name} className="py-1.5 px-2 flex items-center justify-between">
                      <span className="text-text-light">{db.name}</span>
                      {db.currentCount && db.currentCount > 0 && (
                        <span className="text-error text-sm font-medium">
                          {formatNumber(db.currentCount)} docs
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  [...selection.keys()].map(db => (
                    <div key={db} className="py-1 px-2 text-text-light">{db}</div>
                  ))
                )
              ) : (
                dryRunResult?.databases?.[0]?.collections ? (
                  dryRunResult.databases[0].collections.map(coll => (
                    <div key={coll.name} className="py-1.5 px-2 flex items-center justify-between">
                      <span className="text-text-light">{coll.name}</span>
                      {coll.currentCount && coll.currentCount > 0 && (
                        <span className="text-error text-sm font-medium">
                          {formatNumber(coll.currentCount)} docs
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  [...(selection.get(selectedSourceDb) || [])].map(coll => (
                    <div key={coll} className="py-1 px-2 text-text-light">{coll}</div>
                  ))
                )
              )}
            </div>
            <p className="text-error text-sm">This action cannot be undone.</p>
          </div>
        }
        confirmLabel="Drop & Import"
        danger={true}
        onConfirm={() => {
          setShowOverrideConfirm(false)
          startImport()
        }}
        onCancel={() => setShowOverrideConfirm(false)}
      />
    </div>
  )
}
