import { useState, useEffect, useRef, ChangeEvent } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useExportQueue } from './contexts/ExportQueueContext'
import { useProgressETA } from '../hooks/useProgressETA'
import ConfirmDialog from './ConfirmDialog'

// Go bindings type
interface GoApp {
  PreviewCollectionsImportFile?: () => Promise<CollectionsImportPreview | null>
  ImportCollections?: (connectionId: string, databaseName: string, options: CollectionsImportOptions) => Promise<void>
  DryRunImportCollections?: (connectionId: string, databaseName: string, options: CollectionsImportOptions) => Promise<CollectionsImportResult | null>
  CancelImport?: () => void
  PauseImport?: () => void
  ResumeImport?: () => void
}

// Import options passed to Go backend
interface CollectionsImportOptions {
  filePath: string
  sourceDatabase: string
  collections: string[]
  mode: ImportMode
}

// Import mode
type ImportMode = 'skip' | 'override'

// Modal step type
type ModalStep = 'select' | 'configure' | 'previewing' | 'preview' | 'importing' | 'done' | 'error'

// Preview data from archive file
interface CollectionsImportPreview {
  filePath: string
  exportedAt: string
  databases: PreviewDatabase[]
}

// Database in preview
interface PreviewDatabase {
  name: string
  collections: PreviewCollection[]
}

// Collection in preview
interface PreviewCollection {
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
  collectionIndex?: number
  collectionTotal?: number
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
}

// Component props
export interface ImportCollectionsModalProps {
  connectionId: string
  connectionName: string
  databaseName: string
  onClose: () => void
  onHide?: () => void
  onShow?: () => void
  onComplete?: () => void
}

// Access go at call time, not module load time (bindings may not be ready yet)
const getGo = (): GoApp | undefined =>
  (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

function formatNumber(num: number | undefined): string {
  return num?.toLocaleString() || '0'
}

function formatResultForClipboard(result: CollectionsImportResult, connectionName: string, databaseName: string): string {
  const status = result.cancelled ? 'Import Cancelled' : 'Import Results'
  const lines = [`${status} - ${connectionName} / ${databaseName}`, '']
  lines.push(`Total: ${formatNumber(result.documentsInserted)} inserted${result.documentsSkipped > 0 ? `, ${formatNumber(result.documentsSkipped)} skipped` : ''}`)
  lines.push('')

  for (const db of result.databases || []) {
    for (const coll of db.collections || []) {
      const skipped = coll.documentsSkipped > 0 ? `, ${formatNumber(coll.documentsSkipped)} skipped` : ''
      lines.push(`  ${coll.name}: ${formatNumber(coll.documentsInserted)} inserted${skipped}`)
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

export default function ImportCollectionsModal({
  connectionId,
  connectionName,
  databaseName,
  onClose,
  onHide,
  onShow,
  onComplete,
}: ImportCollectionsModalProps): React.ReactElement {
  const { notify } = useNotification()
  const { trackImport, updateTrackedImport, completeTrackedImport, removeTrackedImport } = useExportQueue()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()

  // Step: 'select' | 'configure' | 'previewing' | 'preview' | 'importing' | 'done' | 'error'
  const [step, setStep] = useState<ModalStep>('select')
  const [preview, setPreview] = useState<CollectionsImportPreview | null>(null)
  const [selectedSourceDb, setSelectedSourceDb] = useState<string>('')
  const [selectedColls, setSelectedColls] = useState<Set<string>>(new Set())
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

  useEffect(() => {
    // Listen for import progress events
    const unsubProgress = EventsOn('import:progress', (data: ImportProgressEventData) => {
      setProgress(data)

      // Track cumulative progress for ETA calculation
      if (data.totalDocs && data.totalDocs > totalDocsRef.current) {
        totalDocsRef.current = data.totalDocs
      }
      if (typeof data.processedDocs === 'number') {
        processedDocsRef.current = data.processedDocs
        recordProgress(data.processedDocs)
      }

      // Update transfer manager
      if (importId.current) {
        let progressPercent = 0

        if (data.total && data.total > 0 && data.current && data.current > 0) {
          progressPercent = Math.min(100, Math.round((data.current / data.total) * 100))
        } else if (data.collectionTotal && data.collectionTotal > 0) {
          progressPercent = Math.round((((data.collectionIndex || 1) - 1) / data.collectionTotal) * 100)
        }

        updateTrackedImport(importId.current, {
          phase: 'importing',
          progress: progressPercent,
          currentItem: data.collection || null,
          itemIndex: data.collectionIndex || 0,
          itemTotal: data.collectionTotal || 0,
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
      // Auto-show modal so user sees the result
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
      // Auto-show modal so user sees the result
      onShow?.()
    })
    const unsubError = EventsOn('import:error', (data: ImportErrorEventData) => {
      setStep('error')
      setProgress(null)
      setPaused(false)
      setErrorInfo(data)
      // Auto-show modal so user sees the error
      onShow?.()
    })
    const unsubPaused = EventsOn('import:paused', () => {
      setPaused(true)
    })
    const unsubResumed = EventsOn('import:resumed', () => {
      setPaused(false)
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
      if (unsubError) unsubError()
      if (unsubPaused) unsubPaused()
      if (unsubResumed) unsubResumed()
    }
  }, [databaseName, updateTrackedImport, completeTrackedImport, removeTrackedImport, recordProgress, notify])

  // Handle Escape key to close modal (respects nested ConfirmDialog)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Don't handle if ConfirmDialog is open (it has its own handler)
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

  const handleSelectFile = async (): Promise<void> => {
    try {
      const previewData = await getGo()?.PreviewCollectionsImportFile?.()
      if (!previewData) {
        // User cancelled file dialog
        return
      }
      setPreview(previewData)

      // Default to database matching target name, or nothing if no match
      const matchingDb = previewData.databases?.find(db => db.name === databaseName)
      if (matchingDb) {
        setSelectedSourceDb(matchingDb.name)
        // Pre-select all collections from the matching database
        setSelectedColls(new Set(matchingDb.collections.map(c => c.name)))
      } else {
        setSelectedSourceDb('')
        setSelectedColls(new Set())
      }
      setStep('configure')
    } catch (err) {
      console.error('Failed to preview file:', err)
      notify.error(`Failed to read file: ${(err as Error)?.message || String(err)}`)
    }
  }

  // Get collections for the currently selected source database
  const getSourceCollections = (): PreviewCollection[] => {
    if (!preview || !selectedSourceDb) return []
    const db = preview.databases?.find(db => db.name === selectedSourceDb)
    return db?.collections || []
  }

  const handleSourceDbChange = (dbName: string): void => {
    setSelectedSourceDb(dbName)
    // Pre-select all collections from the new source database
    const db = preview?.databases?.find(db => db.name === dbName)
    if (db) {
      setSelectedColls(new Set(db.collections.map(c => c.name)))
    } else {
      setSelectedColls(new Set())
    }
  }

  const toggleCollection = (collName: string): void => {
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

  const selectAll = (): void => {
    const collections = getSourceCollections()
    setSelectedColls(new Set(collections.map(c => c.name)))
  }

  const deselectAll = (): void => {
    setSelectedColls(new Set())
  }

  const togglePause = (): void => {
    if (paused) {
      getGo()?.ResumeImport?.()
    } else {
      getGo()?.PauseImport?.()
    }
  }

  const startImport = async (): Promise<void> => {
    if (!preview) return

    setStep('importing')
    setErrorInfo(null)
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0

    // Track in transfer manager
    importId.current = trackImport(
      connectionId,
      databaseName,
      Array.from(selectedColls),
      `Import to ${databaseName} (${selectedColls.size} collections)`,
      onShow
    )

    try {
      await getGo()?.ImportCollections?.(connectionId, databaseName, {
        filePath: preview.filePath,
        sourceDatabase: selectedSourceDb,
        collections: Array.from(selectedColls),
        mode: mode,
      })
      // Result will be set by event handler (import:complete, import:cancelled, or import:error)
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      // Don't show error for cancellation - the event handler shows info toast
      if (errMsg.toLowerCase().includes('cancel')) {
        return
      }
      console.error('Import failed:', err)
      notify.error(`Import failed: ${errMsg}`)
      // Show error recovery screen
      setStep('error')
      setErrorInfo({
        error: errMsg,
        partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
        failedDatabase: databaseName,
        failedCollection: '',
      })
      if (importId.current) {
        removeTrackedImport(importId.current)
        importId.current = null
      }
    }
  }

  const handlePreview = async (): Promise<void> => {
    if (selectedColls.size === 0 || !preview) {
      notify.warning('Please select at least one collection')
      return
    }

    // Reset cancelled flag when starting a new preview
    previewCancelledRef.current = false
    setStep('previewing')
    setDryRunResult(null)
    try {
      const result = await getGo()?.DryRunImportCollections?.(connectionId, databaseName, {
        filePath: preview.filePath,
        sourceDatabase: selectedSourceDb,
        collections: Array.from(selectedColls),
        mode: mode,
      })
      // Check if preview was cancelled while we were awaiting
      if (previewCancelledRef.current) {
        previewCancelledRef.current = false
        return
      }
      if (result) {
        setDryRunResult(result)
        setStep('preview')
      } else {
        setStep('configure')
      }
    } catch (err) {
      console.error('Preview failed:', err)
      notify.error(`Preview failed: ${(err as Error)?.message || String(err)}`)
      setStep('configure')
    }
  }

  const handleBackToConfigure = (): void => {
    setStep('configure')
    setDryRunResult(null)
  }

  const handleCancelAnalysis = (): void => {
    // Mark preview as cancelled so handlePreview won't transition to preview step
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

  const handleRetryImport = async (): Promise<void> => {
    // Retry the import with the same settings
    if (!preview) return

    setErrorInfo(null)
    setStep('importing')
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0
    try {
      await getGo()?.ImportCollections?.(connectionId, databaseName, {
        filePath: preview.filePath,
        sourceDatabase: selectedSourceDb,
        collections: Array.from(selectedColls),
        mode: mode,
      })
    } catch (err) {
      console.error('Retry failed:', err)
      if (step === 'importing') {
        setStep('error')
        setErrorInfo({
          error: (err as Error)?.message || String(err),
          partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
          failedDatabase: databaseName,
          failedCollection: '',
        })
      }
    }
  }

  const handleDismissError = (): void => {
    // Show partial results as done
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
    if (progress.collectionTotal && progress.collectionTotal > 0) {
      return (((progress.collectionIndex || 1) - 1) / progress.collectionTotal) * 100
    }
    return 0
  }

  // Get selected collection names for the override confirmation
  const getCollectionNames = (): string[] => {
    return Array.from(selectedColls)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary text-text border border-border rounded-lg w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text">Import Collections</h2>
          <p className="text-sm text-text-muted mt-1">
            {connectionName} / {databaseName}
            {preview && <span className="text-text-muted"> - {preview.databases?.length || 0} database{preview.databases?.length !== 1 ? 's' : ''} in archive</span>}
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
                Select a previously exported .zip archive to import into <span className="text-text-light">{databaseName}</span>
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

              {/* Source database selector */}
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

              {selectedSourceDb && (
                <>
                  {/* Selection controls */}
                  <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                    <button className="text-sm text-primary hover:text-primary/80" onClick={selectAll}>
                      Select All
                    </button>
                    <span className="text-text-dim">|</span>
                    <button className="text-sm text-primary hover:text-primary/80" onClick={deselectAll}>
                      Deselect All
                    </button>
                    <span className="ml-auto text-sm text-text-muted">
                      {selectedColls.size} selected
                    </span>
                  </div>

                  {/* Collections list */}
                  <div className="flex-1 overflow-y-auto p-2">
                    {getSourceCollections().map(coll => (
                      <label
                        key={coll.name}
                        className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-surface-hover/50 ${
                          selectedColls.has(coll.name) ? 'bg-surface-hover/30' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                          checked={selectedColls.has(coll.name)}
                          onChange={() => toggleCollection(coll.name)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-text-light truncate">{coll.name}</div>
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                          {formatNumber(coll.docCount)} docs
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {!selectedSourceDb && (
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
                        Drops matching collections first, then imports fresh.
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
                  {progress?.collectionTotal && progress.collectionTotal > 0 && (
                    <>
                      <span>
                        Analyzing {progress?.collectionIndex || 0} of {progress?.collectionTotal}
                      </span>
                      <span className="text-text-muted">
                        {progress?.collection}
                      </span>
                    </>
                  )}
                </div>

                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                <div className="text-xs text-text-muted mt-1 h-4">
                  {progress?.total && progress.total > 0 && (
                    <span>{formatNumber(progress.current)} / {formatNumber(progress.total)} documents</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-text-muted text-center">
                Analyzing changes...
              </p>
              <p className="text-xs text-text-dim text-center mt-2">
                This may take a while for large files
              </p>
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

              <div className="flex-1 overflow-y-auto">
                {dryRunResult.databases?.[0]?.collections?.length > 0 && (
                  <div className="bg-surface/50 rounded p-3">
                    <div className="text-sm font-medium text-text-light mb-2">{databaseName}</div>
                    <div className="space-y-1">
                      {dryRunResult.databases[0].collections.map(coll => (
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
                )}
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
                {/* Paused indicator */}
                {paused && (
                  <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Import paused
                  </div>
                )}
                {/* Collection progress */}
                <div className="flex items-center justify-between text-sm text-text-secondary mb-2 h-5">
                  {progress?.collectionTotal && progress.collectionTotal > 0 && (
                    <>
                      <span>
                        Collection {progress?.collectionIndex || 0} of {progress?.collectionTotal}
                      </span>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                          return eta ? <span className="text-primary text-xs font-mono">{eta} left</span> : null
                        })()}
                        <span className="text-text-muted">
                          {progress?.collection}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Phase info - fixed height slot */}
                <div className="text-sm mb-2 h-5">
                  {progress?.phase === 'dropping' ? (
                    <span className="text-yellow-400">Dropping collection: {progress?.collection}</span>
                  ) : progress?.phase === 'importing' ? (
                    <span className="text-text-muted">Importing...</span>
                  ) : null}
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                {/* Document count - fixed height slot */}
                <div className="text-xs text-text-muted mt-1 h-4">
                  {progress?.total && progress.total > 0 && progress?.phase === 'importing' && (
                    <span>{formatNumber(progress.current)} / {formatNumber(progress.total)} documents</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-text-muted text-center">
                Please wait while your collections are being imported...
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

              {/* Summary totals */}
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

              {/* Per-collection breakdown */}
              <div className="flex-1 overflow-y-auto">
                {result.databases?.[0]?.collections?.length > 0 && (
                  <div className="bg-surface/50 rounded p-3">
                    <div className="text-sm font-medium text-text-light mb-2">{databaseName}</div>
                    <div className="space-y-1">
                      {result.databases[0].collections.map(coll => (
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
                )}
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
              {/* Error header */}
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg font-medium text-text">Import Failed</span>
              </div>

              {/* Error message */}
              <div className="bg-error-dark border border-red-800/50 rounded p-3 mb-4">
                <div className="text-sm text-error font-medium mb-1">Error:</div>
                <div className="text-sm text-text-secondary">{errorInfo.error}</div>
                {errorInfo.failedCollection && (
                  <div className="text-xs text-text-muted mt-2">
                    Failed at collection: {errorInfo.failedCollection}
                  </div>
                )}
              </div>

              {/* Partial results */}
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
                  {errorInfo.partialResult.databases?.[0]?.collections?.length > 0 && (
                    <div className="max-h-32 overflow-y-auto">
                      <div className="bg-surface/50 rounded p-2">
                        <div className="text-xs font-medium text-text-light mb-1">{databaseName}</div>
                        <div className="space-y-0.5">
                          {errorInfo.partialResult.databases[0].collections.map(coll => (
                            <div key={coll.name} className="flex items-center justify-between text-xs">
                              <span className="text-text-muted truncate mr-2">{coll.name}</span>
                              <span className="text-success shrink-0">+{formatNumber(coll.documentsInserted)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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
              <button className="btn btn-primary" onClick={handleRetryImport}>
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
                  disabled={!selectedSourceDb || selectedColls.size === 0}
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
        title="Override Collections"
        message={
          <div>
            {/* Impact summary when we have dry-run data */}
            {dryRunResult && dryRunResult.documentsDropped && dryRunResult.documentsDropped > 0 && (
              <div className="mb-4 p-3 bg-error-dark border border-red-800/50 rounded">
                <div className="text-error font-medium text-sm">
                  This will permanently delete {formatNumber(dryRunResult.documentsDropped)} documents across {dryRunResult.databases?.[0]?.collections?.length || 0} collection{(dryRunResult.databases?.[0]?.collections?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
            )}

            <p className="mb-3">This will DROP and replace the following collections in <span className="text-text-light">{databaseName}</span>:</p>
            <div className="max-h-40 overflow-y-auto bg-surface rounded p-2 mb-3 space-y-1">
              {dryRunResult?.databases?.[0]?.collections ? (
                // Show with document counts from dry-run
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
                // Fallback: just show names (no preview was done)
                getCollectionNames().map(coll => (
                  <div key={coll} className="py-1 px-2 text-text-light">{coll}</div>
                ))
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
