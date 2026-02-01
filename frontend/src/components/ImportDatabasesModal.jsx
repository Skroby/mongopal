import { useState, useEffect, useRef } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useOperation } from './contexts/OperationContext'
import { useProgressETA } from '../hooks/useProgressETA'
import ConfirmDialog from './ConfirmDialog'
import { getErrorSummary } from '../utils/errorParser'

const go = window.go?.main?.App

function formatNumber(num) {
  return num?.toLocaleString() || '0'
}

function formatResultForClipboard(result, connectionName) {
  const status = result.cancelled ? 'Import Cancelled' : 'Import Results'
  const lines = [`${status} - ${connectionName}`, '']
  lines.push(`Total: ${formatNumber(result.documentsInserted)} inserted${result.documentsSkipped > 0 ? `, ${formatNumber(result.documentsSkipped)} skipped` : ''}`)
  lines.push('')

  for (const db of result.databases || []) {
    lines.push(`${db.name}`)
    for (const coll of db.collections || []) {
      const skipped = coll.documentsSkipped > 0 ? `, ${formatNumber(coll.documentsSkipped)} skipped` : ''
      lines.push(`  • ${coll.name}: ${formatNumber(coll.documentsInserted)} inserted${skipped}`)
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

export default function ImportDatabasesModal({ connectionId, connectionName, onClose, onComplete }) {
  const { notify } = useNotification()
  const { startOperation, updateOperation, completeOperation } = useOperation()
  const { recordProgress, getETA, reset: resetETA } = useProgressETA()

  // Step: 'select' | 'configure' | 'previewing' | 'preview' | 'importing' | 'done' | 'error'
  const [step, setStep] = useState('select')
  const [preview, setPreview] = useState(null)
  const [selectedDbs, setSelectedDbs] = useState(new Set())
  const [mode, setMode] = useState('skip') // 'skip' | 'override'
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [dryRunResult, setDryRunResult] = useState(null)
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false)
  const operationId = useRef(null)
  const [errorInfo, setErrorInfo] = useState(null) // { error, partialResult, failedDatabase, failedCollection, remainingDatabases }
  const previewCancelledRef = useRef(false) // Track if preview was cancelled to ignore stale dryrun:complete events
  const totalDocsRef = useRef(0)
  const processedDocsRef = useRef(0)

  useEffect(() => {
    // Listen for import progress events
    const unsubProgress = EventsOn('import:progress', (data) => {
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
        let label = `Importing to ${connectionName}...`

        if (data.total > 0 && data.current > 0) {
          progressPercent = Math.min(100, Math.round((data.current / data.total) * 100))
        } else if (data.databaseTotal > 0) {
          progressPercent = Math.round(((data.databaseIndex - 1) / data.databaseTotal) * 100)
        }

        if (data.collection) {
          label = `Importing ${data.collection}...`
        } else if (data.database) {
          label = `Importing ${data.database}...`
        }

        updateOperation(operationId.current, { progress: progressPercent, label })
      }
    })
    const unsubComplete = EventsOn('import:complete', (data) => {
      setStep('done')
      setProgress(null)
      setResult(data)
      if (operationId.current) {
        completeOperation(operationId.current)
        operationId.current = null
      }
    })
    const unsubCancelled = EventsOn('import:cancelled', (data) => {
      setStep('done')
      setProgress(null)
      setResult({ ...data, cancelled: true })
      notify.info('Import cancelled')
      if (operationId.current) {
        completeOperation(operationId.current)
        operationId.current = null
      }
    })
    const unsubError = EventsOn('import:error', (data) => {
      setStep('error')
      setProgress(null)
      setErrorInfo(data)
    })

    // Listen for dry-run events
    const unsubDryRunProgress = EventsOn('dryrun:progress', (data) => {
      setProgress(data)
    })
    const unsubDryRunComplete = EventsOn('dryrun:complete', (data) => {
      // Ignore if preview was cancelled - user went back to configure step
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
      if (unsubDryRunProgress) unsubDryRunProgress()
      if (unsubDryRunComplete) unsubDryRunComplete()
    }
  }, [connectionName, updateOperation, completeOperation])

  // Handle Escape key to close modal (respects nested ConfirmDialog)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Don't handle if ConfirmDialog is open (it has its own handler)
        if (showOverrideConfirm) return

        if (step === 'importing') {
          go?.CancelImport?.()
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

  const handleSelectFile = async () => {
    try {
      const previewData = await go?.PreviewImportFile()
      if (!previewData) {
        // User cancelled file dialog
        return
      }
      setPreview(previewData)
      // Pre-select all databases
      setSelectedDbs(new Set(previewData.databases.map(db => db.name)))
      setStep('configure')
    } catch (err) {
      console.error('Failed to preview file:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
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
    if (preview) {
      setSelectedDbs(new Set(preview.databases.map(db => db.name)))
    }
  }

  const deselectAll = () => {
    setSelectedDbs(new Set())
  }

  const startImport = async () => {
    setStep('importing')
    setErrorInfo(null)
    resetETA()
    totalDocsRef.current = 0
    processedDocsRef.current = 0

    // Register global operation (imports with override mode are destructive)
    operationId.current = startOperation({
      type: 'import',
      label: `Importing to ${connectionName}...`,
      progress: null,
      destructive: mode === 'override',
      active: true,
    })

    try {
      await go?.ImportDatabases(connectionId, {
        filePath: preview.filePath,
        databases: Array.from(selectedDbs),
        mode: mode,
      })
      // Result will be set by event handler (import:complete, import:cancelled, or import:error)
    } catch (err) {
      const errMsg = err?.message || String(err)
      // Don't show error for cancellation - the event handler shows info toast
      if (errMsg.toLowerCase().includes('cancel')) {
        return
      }
      console.error('Import failed:', err)
      notify.error(getErrorSummary(errMsg))
      // Show error recovery screen
      setStep('error')
      setErrorInfo({
        error: errMsg,
        partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
        failedDatabase: '',
        failedCollection: '',
        remainingDatabases: Array.from(selectedDbs),
      })
      if (operationId.current) {
        completeOperation(operationId.current)
        operationId.current = null
      }
    }
  }

  const handleImport = () => {
    if (selectedDbs.size === 0) {
      notify.warning('Please select at least one database')
      return
    }

    // Confirm if override mode
    if (mode === 'override') {
      setShowOverrideConfirm(true)
      return
    }

    startImport()
  }

  const handlePreview = async () => {
    if (selectedDbs.size === 0) {
      notify.warning('Please select at least one database')
      return
    }

    // Reset cancelled flag when starting a new preview
    previewCancelledRef.current = false
    setStep('previewing')
    setDryRunResult(null)
    try {
      await go?.DryRunImport(connectionId, {
        filePath: preview.filePath,
        databases: Array.from(selectedDbs),
        mode: mode,
      })
      // Result will be set by event handler
    } catch (err) {
      console.error('Preview failed:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
      setStep('configure')
    }
  }

  const handleBackToConfigure = () => {
    setStep('configure')
    setDryRunResult(null)
  }

  const handleCancelAnalysis = () => {
    // Mark preview as cancelled so we ignore the dryrun:complete event
    previewCancelledRef.current = true
    setStep('configure')
    setProgress(null)
    setDryRunResult(null)
  }

  const handleClose = () => {
    if (result || (errorInfo?.partialResult?.documentsInserted > 0)) {
      onComplete?.()
    }
    onClose()
  }

  const handleRetryFailed = async () => {
    // Retry with only the remaining databases (starting from the failed one)
    if (errorInfo?.remainingDatabases?.length > 0) {
      setSelectedDbs(new Set(errorInfo.remainingDatabases))
      setErrorInfo(null)
      setStep('importing')
      resetETA()
      totalDocsRef.current = 0
      processedDocsRef.current = 0
      try {
        await go?.ImportDatabases(connectionId, {
          filePath: preview.filePath,
          databases: errorInfo.remainingDatabases,
          mode: mode,
        })
      } catch (err) {
        console.error('Retry failed:', err)
        if (step === 'importing') {
          setStep('error')
          setErrorInfo({
            error: err?.message || String(err),
            partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
            failedDatabase: '',
            failedCollection: '',
            remainingDatabases: errorInfo.remainingDatabases,
          })
        }
      }
    }
  }

  const handleSkipAndContinue = async () => {
    // Skip the failed database and continue with the remaining ones
    if (errorInfo?.remainingDatabases?.length > 1) {
      const remaining = errorInfo.remainingDatabases.slice(1) // Skip the first (failed) one
      setSelectedDbs(new Set(remaining))
      setErrorInfo(null)
      setStep('importing')
      resetETA()
      totalDocsRef.current = 0
      processedDocsRef.current = 0
      try {
        await go?.ImportDatabases(connectionId, {
          filePath: preview.filePath,
          databases: remaining,
          mode: mode,
        })
      } catch (err) {
        console.error('Continue failed:', err)
        if (step === 'importing') {
          setStep('error')
          setErrorInfo({
            error: err?.message || String(err),
            partialResult: { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] },
            failedDatabase: '',
            failedCollection: '',
            remainingDatabases: remaining,
          })
        }
      }
    } else {
      // No more databases to continue with, go to done with partial results
      setResult(errorInfo?.partialResult || { databases: [], documentsInserted: 0, documentsSkipped: 0, errors: [] })
      setStep('done')
    }
  }

  const handleDismissError = () => {
    // Show partial results as done
    if (errorInfo?.partialResult?.documentsInserted > 0) {
      setResult({
        ...errorInfo.partialResult,
        errors: [...(errorInfo.partialResult.errors || []), `Import stopped: ${errorInfo.error}`]
      })
      setStep('done')
    } else {
      handleClose()
    }
  }

  const getProgressPercent = () => {
    if (!progress) return 0
    if (progress.total > 0 && progress.current > 0) {
      return Math.min(100, (progress.current / progress.total) * 100)
    }
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
          <h2 className="text-lg font-medium text-zinc-100">Import Databases</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {connectionName}
            {preview && <span className="text-zinc-400"> - {preview.databases.length} databases in archive</span>}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {step === 'select' && (
            <div className="p-6 flex flex-col items-center justify-center">
              <svg className="w-16 h-16 text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-zinc-400 mb-4 text-center">
                Select a previously exported .zip archive to import
              </p>
              <button className="btn btn-primary" onClick={handleSelectFile}>
                Select File
              </button>
            </div>
          )}

          {step === 'configure' && preview && (
            <>
              {/* File info */}
              <div className="px-4 py-2 bg-zinc-800/50 border-b border-border text-xs text-zinc-400">
                Exported: {preview.exportedAt}
              </div>

              {/* Selection controls */}
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <button className="text-sm text-accent hover:text-accent/80" onClick={selectAll}>
                  Select All
                </button>
                <span className="text-zinc-600">|</span>
                <button className="text-sm text-accent hover:text-accent/80" onClick={deselectAll}>
                  Deselect All
                </button>
                <span className="ml-auto text-sm text-zinc-400">
                  {selectedDbs.size} selected
                </span>
              </div>

              {/* Database list */}
              <div className="flex-1 overflow-y-auto p-2">
                {preview.databases.map(db => (
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
                      <div className="text-xs text-zinc-400">
                        {db.collectionCount} collections, {formatNumber(db.documentCount)} docs
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Import mode */}
              <div className="p-4 border-t border-border">
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Import Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded border border-zinc-700 cursor-pointer hover:bg-zinc-700/30">
                    <input
                      type="radio"
                      name="mode"
                      value="skip"
                      checked={mode === 'skip'}
                      onChange={() => setMode('skip')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-zinc-200">Skip Existing</div>
                      <div className="text-xs text-zinc-400">
                        Only insert documents that don't already exist (by _id).
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded border border-zinc-700 cursor-pointer hover:bg-zinc-700/30">
                    <input
                      type="radio"
                      name="mode"
                      value="override"
                      checked={mode === 'override'}
                      onChange={() => setMode('override')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-zinc-200">Override (Drop & Replace)</div>
                      <div className="text-xs text-red-400">
                        Drops the selected databases first, then imports fresh.
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
                <div className="flex items-center justify-between text-sm text-zinc-300 mb-2 h-5">
                  {progress?.databaseTotal > 0 && (
                    <>
                      <span>
                        Analyzing {progress?.databaseIndex || 0} of {progress?.databaseTotal}
                      </span>
                      <span className="text-zinc-400">
                        {progress?.database}
                      </span>
                    </>
                  )}
                </div>

                <div className="text-sm mb-2 h-5">
                  {progress?.collection && (
                    <span className="text-zinc-400">Collection: <span className="text-zinc-300">{progress.collection}</span></span>
                  )}
                </div>

                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                <div className="text-xs text-zinc-400 mt-1 h-4">
                  {progress?.total > 0 && (
                    <span>{formatNumber(progress.current)} / {formatNumber(progress.total)} documents</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-400 text-center">
                Analyzing changes...
              </p>
              <p className="text-xs text-zinc-600 text-center mt-2">
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
                <span className="text-lg font-medium text-zinc-100">Preview Changes</span>
              </div>

              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                {dryRunResult.documentsDropped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Will Drop:</span>
                    <span className="text-red-400 font-medium">{formatNumber(dryRunResult.documentsDropped)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Will Insert:</span>
                  <span className="text-green-400 font-medium">{formatNumber(dryRunResult.documentsInserted)}</span>
                </div>
                {dryRunResult.documentsSkipped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Will Skip:</span>
                    <span className="text-yellow-400 font-medium">{formatNumber(dryRunResult.documentsSkipped)}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {dryRunResult.databases?.map(db => (
                  <div key={db.name} className="bg-zinc-800/50 rounded p-3">
                    <div className="flex items-center justify-between text-sm font-medium text-zinc-200 mb-2">
                      <span>{db.name}</span>
                      {db.currentCount > 0 && (
                        <span className="text-xs text-red-400 font-normal">
                          {formatNumber(db.currentCount)} docs will be dropped
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {db.collections?.map(coll => (
                        <div key={coll.name} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400 truncate mr-2">{coll.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            {coll.currentCount > 0 && (
                              <span className="text-red-400">-{formatNumber(coll.currentCount)}</span>
                            )}
                            <span className="text-green-400">+{formatNumber(coll.documentsInserted)}</span>
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

              {mode === 'override' && dryRunResult.documentsDropped > 0 && (
                <div className="mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded text-sm text-red-400">
                  Warning: {formatNumber(dryRunResult.documentsDropped)} documents will be permanently deleted.
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="p-4 min-h-[160px]">
              <div className="mb-4">
                {/* Database progress */}
                <div className="flex items-center justify-between text-sm text-zinc-300 mb-2 h-5">
                  {progress?.databaseTotal > 0 && (
                    <>
                      <span>
                        Database {progress?.databaseIndex || 0} of {progress?.databaseTotal}
                      </span>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const eta = getETA(processedDocsRef.current, totalDocsRef.current)
                          return eta ? <span className="text-accent text-xs font-mono">{eta} left</span> : null
                        })()}
                        <span className="text-zinc-400">
                          {progress?.database}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Collection/Phase info - fixed height slot */}
                <div className="text-sm mb-2 h-5">
                  {progress?.phase === 'dropping' ? (
                    <span className="text-yellow-400">Dropping database: {progress?.database}</span>
                  ) : progress?.collection && progress?.phase === 'importing' ? (
                    <span className="text-zinc-400">Collection: <span className="text-zinc-300">{progress.collection}</span></span>
                  ) : null}
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>

                {/* Document count - fixed height slot */}
                <div className="text-xs text-zinc-400 mt-1 h-4">
                  {progress?.total > 0 && progress?.phase === 'importing' && (
                    <span>{formatNumber(progress.current)} / {formatNumber(progress.total)} documents</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-400 text-center">
                Please wait while your databases are being imported...
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
                  <span className="text-lg font-medium text-zinc-100">
                    {result.cancelled ? 'Import Cancelled' : 'Import Complete'}
                  </span>
                </div>
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(formatResultForClipboard(result, connectionName))
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
                  <span className="text-zinc-400">Total Inserted:</span>
                  <span className="text-green-400 font-medium">{formatNumber(result.documentsInserted)}</span>
                </div>
                {result.documentsSkipped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Skipped:</span>
                    <span className="text-yellow-400 font-medium">{formatNumber(result.documentsSkipped)}</span>
                  </div>
                )}
              </div>

              {/* Per-database breakdown */}
              <div className="flex-1 overflow-y-auto space-y-3">
                {result.databases?.map(db => (
                  <div key={db.name} className="bg-zinc-800/50 rounded p-3">
                    <div className="text-sm font-medium text-zinc-200 mb-2">{db.name}</div>
                    <div className="space-y-1">
                      {db.collections?.map(coll => (
                        <div key={coll.name} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400 truncate mr-2">{coll.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-green-400">+{formatNumber(coll.documentsInserted)}</span>
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
                  <div className="text-sm text-red-400 mb-2">Errors ({result.errors.length}):</div>
                  <div className="bg-zinc-800 rounded p-2 max-h-32 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <div key={i} className="text-xs text-zinc-400">{err}</div>
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
                <span className="text-lg font-medium text-zinc-100">Import Failed</span>
              </div>

              {/* Error message */}
              <div className="bg-red-900/20 border border-red-800/50 rounded p-3 mb-4">
                <div className="text-sm text-red-400 font-medium mb-1">Error:</div>
                <div className="text-sm text-zinc-300">{errorInfo.error}</div>
                {errorInfo.failedDatabase && (
                  <div className="text-xs text-zinc-400 mt-2">
                    Failed at: {errorInfo.failedDatabase}
                    {errorInfo.failedCollection && ` / ${errorInfo.failedCollection}`}
                  </div>
                )}
              </div>

              {/* Partial results */}
              {errorInfo.partialResult?.documentsInserted > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-zinc-300 mb-2">Partial Progress (before failure):</div>
                  <div className="flex gap-4 mb-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-400">Inserted:</span>
                      <span className="text-green-400 font-medium">{formatNumber(errorInfo.partialResult.documentsInserted)}</span>
                    </div>
                    {errorInfo.partialResult.documentsSkipped > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-400">Skipped:</span>
                        <span className="text-yellow-400 font-medium">{formatNumber(errorInfo.partialResult.documentsSkipped)}</span>
                      </div>
                    )}
                  </div>
                  {errorInfo.partialResult.databases?.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-2">
                      {errorInfo.partialResult.databases.map(db => (
                        <div key={db.name} className="bg-zinc-800/50 rounded p-2">
                          <div className="text-xs font-medium text-zinc-200 mb-1">{db.name}</div>
                          <div className="space-y-0.5">
                            {db.collections?.map(coll => (
                              <div key={coll.name} className="flex items-center justify-between text-xs">
                                <span className="text-zinc-400 truncate mr-2">{coll.name}</span>
                                <span className="text-green-400 shrink-0">+{formatNumber(coll.documentsInserted)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Remaining databases */}
              {errorInfo.remainingDatabases?.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-zinc-300 mb-2">Remaining ({errorInfo.remainingDatabases.length}):</div>
                  <div className="bg-zinc-800/50 rounded p-2 max-h-24 overflow-y-auto">
                    {errorInfo.remainingDatabases.map(db => (
                      <div key={db} className="text-xs text-zinc-400 py-0.5">{db}</div>
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
                {errorInfo?.partialResult?.documentsInserted > 0 ? 'View Results' : 'Close'}
              </button>
              {errorInfo?.remainingDatabases?.length > 1 && (
                <button className="btn btn-ghost" onClick={handleSkipAndContinue}>
                  Skip & Continue
                </button>
              )}
              {errorInfo?.remainingDatabases?.length > 0 && (
                <button className="btn btn-primary" onClick={handleRetryFailed}>
                  Retry
                </button>
              )}
            </>
          ) : step === 'done' ? (
            <button className="btn btn-primary" onClick={handleClose}>
              Done
            </button>
          ) : step === 'importing' ? (
            <button
              className="btn btn-ghost"
              onClick={() => go?.CancelImport?.()}
            >
              Cancel
            </button>
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
                  disabled={selectedDbs.size === 0}
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
        title="Override Databases"
        message={
          <div>
            {/* Impact summary when we have dry-run data */}
            {dryRunResult && dryRunResult.documentsDropped > 0 && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded">
                <div className="text-red-400 font-medium text-sm">
                  This will permanently delete {formatNumber(dryRunResult.documentsDropped)} documents across {dryRunResult.databases?.length || 0} database{(dryRunResult.databases?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
            )}

            <p className="mb-3">This will DROP and replace the following databases:</p>
            <div className="max-h-40 overflow-y-auto bg-zinc-800 rounded p-2 mb-3 space-y-1">
              {dryRunResult?.databases ? (
                // Show with document counts from dry-run
                dryRunResult.databases.map(db => (
                  <div key={db.name} className="py-1.5 px-2 flex items-center justify-between">
                    <span className="text-zinc-200">{db.name}</span>
                    {db.currentCount > 0 && (
                      <span className="text-red-400 text-sm font-medium">
                        {formatNumber(db.currentCount)} docs
                      </span>
                    )}
                  </div>
                ))
              ) : (
                // Fallback: just show names (no preview was done)
                Array.from(selectedDbs).map(db => (
                  <div key={db} className="py-1 px-2 text-zinc-200">{db}</div>
                ))
              )}
            </div>
            <p className="text-red-400 text-sm">This action cannot be undone.</p>
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
