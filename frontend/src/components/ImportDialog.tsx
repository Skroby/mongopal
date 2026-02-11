import { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useExportQueue } from './contexts/ExportQueueContext'
import ConfirmDialog from './ConfirmDialog'
import type { ImportResult, JSONImportPreview, CSVImportPreview, CSVImportPreviewOptions, CSVImportOptions, ToolAvailability, MongorestoreOptions, ImportDirEntry, ArchivePreview } from '../types/wails.d'

// Go bindings type
interface GoApp {
  GetImportFilePath?: () => Promise<string>
  DetectFileFormat?: (filePath: string) => Promise<string>
  PreviewJSONFile?: (filePath: string) => Promise<JSONImportPreview>
  ImportJSON?: (connId: string, dbName: string, collName: string, opts: { filePath: string; mode: string }) => Promise<ImportResult>
  DryRunImportJSON?: (connId: string, dbName: string, collName: string, opts: { filePath: string; mode: string }) => Promise<ImportResult>
  PreviewCSVFile?: (opts: CSVImportPreviewOptions) => Promise<CSVImportPreview>
  ImportCSV?: (connId: string, dbName: string, collName: string, opts: CSVImportOptions) => Promise<ImportResult>
  DryRunImportCSV?: (connId: string, dbName: string, collName: string, opts: CSVImportOptions) => Promise<ImportResult>
  CancelImport?: () => void
  PauseImport?: () => void
  ResumeImport?: () => void
  IsImportPaused?: () => Promise<boolean>
  ListDatabases?: (connId: string) => Promise<Array<{ name: string }>>
  ListCollections?: (connId: string, dbName: string) => Promise<Array<{ name: string; count: number }>>
  CheckToolAvailability?: () => Promise<ToolAvailability>
  ImportWithMongorestore?: (connId: string, opts: MongorestoreOptions) => Promise<ImportResult>
  GetBSONImportDirPath?: () => Promise<string>
  ScanImportDir?: (dirPath: string) => Promise<ImportDirEntry[]>
  PreviewArchive?: (connectionId: string, archivePath: string) => Promise<ArchivePreview>
}

const getGo = (): GoApp | undefined => (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

type Step = 'select' | 'configure' | 'bsonConfigure' | 'previewing' | 'preview' | 'importing' | 'done' | 'error'

interface ProgressData {
  current?: number
  total?: number
  collection?: string
  phase?: string
}

interface ErrorInfo {
  error: string
  partialResult?: ImportResult
}

export interface ImportDialogProps {
  open: boolean
  connectionId: string
  connectionName: string
  databaseName?: string // If provided, import to specific database
  onClose: () => void
  onHide?: () => void
  onComplete?: () => void
  /** Called when a ZIP file is detected — delegate to existing ZIP import modal */
  onZipDetected?: (filePath: string) => void
}

// Format human-readable file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

export default function ImportDialog({
  open,
  connectionId,
  connectionName,
  databaseName: initialDbName,
  onClose,
  onHide,
  onComplete,
  onZipDetected,
}: ImportDialogProps): React.JSX.Element | null {
  const { notify } = useNotification()
  const { trackImport, updateTrackedImport, completeTrackedImport } = useExportQueue()

  const [step, setStep] = useState<Step>('select')
  const [filePath, setFilePath] = useState('')
  const [fileFormat, setFileFormat] = useState<'json' | 'csv' | null>(null)
  const [bsonAvailable, setBsonAvailable] = useState<boolean | null>(null)
  const [bsonDrop, setBsonDrop] = useState(false)
  const [bsonInputPath, setBsonInputPath] = useState('')
  const [bsonDirEntries, setBsonDirEntries] = useState<ImportDirEntry[]>([])
  const [bsonSelectedFiles, setBsonSelectedFiles] = useState<Set<string>>(new Set())
  const [archivePreview, setArchivePreview] = useState<ArchivePreview | null>(null)
  const [archivePreviewLoading, setArchivePreviewLoading] = useState(false)
  const [dirArchivePreviews, setDirArchivePreviews] = useState<Record<string, ArchivePreview | 'loading' | 'error'>>({})
  const [jsonPreview, setJsonPreview] = useState<JSONImportPreview | null>(null)
  const [csvPreview, setCsvPreview] = useState<CSVImportPreview | null>(null)

  // CSV-specific options
  const [csvDelimiter, setCsvDelimiter] = useState('')
  const [csvHasHeaders, setCsvHasHeaders] = useState(true)
  const [csvTypeInference, setCsvTypeInference] = useState(true)

  // Configure step state
  const [databases, setDatabases] = useState<string[]>([])
  const [collections, setCollections] = useState<string[]>([])
  const [targetDb, setTargetDb] = useState(initialDbName || '')
  const [targetColl, setTargetColl] = useState('')
  const [mode, setMode] = useState<'skip' | 'override'>('skip')
  const [loadingDbs, setLoadingDbs] = useState(false)

  // Import progress state
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [paused, setPaused] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false)
  const [showBsonDropConfirm, setShowBsonDropConfirm] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const importIdRef = useRef<string | null>(null)

  // BSON tree selection state (db → selected collections)
  const [bsonSelection, setBsonSelection] = useState<Map<string, Set<string>>>(new Map())
  const [bsonExpanded, setBsonExpanded] = useState<Set<string>>(new Set())

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select')
      setFilePath('')
      setFileFormat(null)
      setJsonPreview(null)
      setCsvPreview(null)
      setCsvDelimiter('')
      setCsvHasHeaders(true)
      setCsvTypeInference(true)
      setTargetDb(initialDbName || '')
      setTargetColl('')
      setMode('skip')
      setProgress(null)
      setPaused(false)
      setDryRunResult(null)
      setResult(null)
      setErrorInfo(null)
      setBsonDrop(false)
      setBsonInputPath('')
      setBsonDirEntries([])
      setBsonSelectedFiles(new Set())
      setArchivePreview(null)
      setArchivePreviewLoading(false)
      setDirArchivePreviews({})
      setFileLoading(false)
      setShowBsonDropConfirm(false)
      setBsonSelection(new Map())
      setBsonExpanded(new Set())

      // Check BSON availability
      const check = async (): Promise<void> => {
        try {
          const result = await getGo()?.CheckToolAvailability?.()
          setBsonAvailable(result?.mongorestore ?? false)
        } catch {
          setBsonAvailable(false)
        }
      }
      check()
    }
  }, [open, initialDbName])

  // Load databases list
  useEffect(() => {
    if (!open || step !== 'configure') return
    const loadDatabases = async (): Promise<void> => {
      setLoadingDbs(true)
      try {
        const dbs = await getGo()?.ListDatabases?.(connectionId)
        if (dbs) {
          setDatabases(dbs.map(d => d.name).filter(n => n !== 'admin' && n !== 'local' && n !== 'config'))
        }
      } catch (err) {
        console.error('Failed to load databases:', err)
      } finally {
        setLoadingDbs(false)
      }
    }
    loadDatabases()
  }, [open, step, connectionId])

  // Load collections when db changes
  useEffect(() => {
    if (!targetDb || step !== 'configure') return
    const loadCollections = async (): Promise<void> => {
      try {
        const colls = await getGo()?.ListCollections?.(connectionId, targetDb)
        if (colls) {
          setCollections(colls.map(c => c.name))
        }
      } catch {
        setCollections([])
      }
    }
    loadCollections()
  }, [targetDb, step, connectionId])

  // Listen for import progress events
  useEffect(() => {
    if (!open) return
    const unsub = EventsOn('import:progress', (data: ProgressData) => {
      setProgress(data)
      if (importIdRef.current) {
        const pct = data.total && data.total > 0 ? Math.round(((data.current || 0) / data.total) * 100) : 0
        updateTrackedImport(importIdRef.current, {
          progress: pct,
          currentItem: data.collection || null,
          processedDocs: data.current || 0,
          totalDocs: data.total || 0,
          phase: data.phase === 'importing' ? 'importing' : 'starting',
        })
      }
    })
    return () => { if (unsub) unsub() }
  }, [open, updateTrackedImport])

  // Handle Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showOverrideConfirm || showBsonDropConfirm) return // Let ConfirmDialog handle its own Escape
        if (step === 'importing' || step === 'previewing') return // Don't close during import or dry-run
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, step, showOverrideConfirm, showBsonDropConfirm, onClose])

  // File selection with native dialog
  const handleSelectFile = useCallback(async (): Promise<void> => {
    setFileLoading(true)
    try {
      // Use Go binding for file dialog
      const selected = await getGo()?.GetImportFilePath?.()
      if (!selected) return

      setFilePath(selected)
      setBsonDirEntries([])
      setBsonSelectedFiles(new Set())
      setDirArchivePreviews({})

      // Detect format
      const format = await getGo()?.DetectFileFormat?.(selected)
      if (!format) return

      if (format === 'zip') {
        // Delegate to existing ZIP import modal
        onClose()
        onZipDetected?.(selected)
        return
      }

      if (format === 'archive') {
        if (bsonAvailable === false) {
          notify.error('mongorestore is required to import .archive files. Install MongoDB Database Tools to use this feature.')
          return
        }
        if (bsonAvailable === null) {
          notify.error('Still checking for mongorestore availability. Please try again in a moment.')
          return
        }
        // Route .archive files to mongorestore
        setBsonInputPath(selected)
        // Load archive preview in background
        setArchivePreviewLoading(true)
        setArchivePreview(null)
        getGo()?.PreviewArchive?.(connectionId, selected)
          .then(preview => { if (preview) setArchivePreview(preview) })
          .catch(err => { console.error('Archive preview failed:', err) })
          .finally(() => setArchivePreviewLoading(false))
        return
      }

      if (format === 'ndjson' || format === 'jsonarray') {
        // Preview JSON file
        const preview = await getGo()?.PreviewJSONFile?.(selected)
        if (preview) {
          setFileFormat('json')
          setJsonPreview(preview)
          setStep('configure')
        }
      } else if (format === 'csv') {
        // Preview CSV file
        const preview = await getGo()?.PreviewCSVFile?.({ filePath: selected, maxRows: 10 })
        if (preview) {
          setFileFormat('csv')
          setCsvPreview(preview)
          setCsvDelimiter(preview.delimiter)
          setStep('configure')
        }
      } else {
        notify.error('Unsupported file format')
      }
    } catch (err) {
      notify.error(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setFileLoading(false)
    }
  }, [onClose, onZipDetected, notify, bsonAvailable])

  // Dry-run preview
  const handlePreview = useCallback(async (): Promise<void> => {
    if (!targetDb || !targetColl) return
    setStep('previewing')

    try {
      let result: ImportResult | undefined
      if (fileFormat === 'csv') {
        result = await getGo()?.DryRunImportCSV?.(connectionId, targetDb, targetColl, {
          filePath,
          delimiter: csvDelimiter,
          hasHeaders: csvHasHeaders,
          typeInference: csvTypeInference,
          mode,
        })
      } else {
        result = await getGo()?.DryRunImportJSON?.(connectionId, targetDb, targetColl, {
          filePath,
          mode,
        })
      }
      if (result) {
        setDryRunResult(result)
        setStep('preview')
      }
    } catch (err) {
      setErrorInfo({ error: err instanceof Error ? err.message : String(err) })
      setStep('error')
    }
  }, [connectionId, targetDb, targetColl, filePath, mode, fileFormat, csvDelimiter, csvHasHeaders, csvTypeInference])

  // Start import
  const startImport = useCallback(async (): Promise<void> => {
    setStep('importing')
    setProgress(null)
    setPaused(false)

    const formatLabel = fileFormat === 'csv' ? 'CSV' : 'JSON'
    const label = `${targetColl} (${formatLabel})`
    const importId = trackImport(connectionId, targetDb, [targetColl], label)
    importIdRef.current = importId

    try {
      let result: ImportResult | undefined
      if (fileFormat === 'csv') {
        result = await getGo()?.ImportCSV?.(connectionId, targetDb, targetColl, {
          filePath,
          delimiter: csvDelimiter,
          hasHeaders: csvHasHeaders,
          typeInference: csvTypeInference,
          mode,
        })
      } else {
        result = await getGo()?.ImportJSON?.(connectionId, targetDb, targetColl, {
          filePath,
          mode,
        })
      }
      if (result) {
        setResult(result)
        setStep('done')
        completeTrackedImport(importId)
        onComplete?.()
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.toLowerCase().includes('cancel')) {
        setResult({ databases: [], documentsInserted: 0, documentsSkipped: 0, errors: ['Import was cancelled'], cancelled: true })
        setStep('done')
      } else {
        setErrorInfo({ error: errMsg })
        setStep('error')
      }
      completeTrackedImport(importId)
    }
  }, [connectionId, targetDb, targetColl, filePath, mode, fileFormat, csvDelimiter, csvHasHeaders, csvTypeInference, trackImport, completeTrackedImport, onComplete])

  // --- BSON tree helpers ---

  // Build combined tree from all selected archive previews (or single archive)
  const getCombinedBsonTree = useCallback((): ArchivePreview => {
    const dbMap = new Map<string, Map<string, number>>() // db → (coll → docCount)
    const dbOrder: string[] = []

    const addPreview = (preview: ArchivePreview): void => {
      for (const db of preview.databases) {
        if (!dbMap.has(db.name)) {
          dbMap.set(db.name, new Map())
          dbOrder.push(db.name)
        }
        const collMap = dbMap.get(db.name)!
        for (const coll of db.collections) {
          if (!collMap.has(coll.name)) {
            collMap.set(coll.name, coll.documents)
          }
        }
      }
    }

    // Single archive
    if (bsonDirEntries.length === 0 && archivePreview) {
      addPreview(archivePreview)
    }

    // Directory: aggregate from selected files
    for (const fileName of bsonSelectedFiles) {
      const preview = dirArchivePreviews[fileName]
      if (preview && preview !== 'loading' && preview !== 'error') {
        addPreview(preview)
      }
    }

    return {
      databases: dbOrder.map(dbName => ({
        name: dbName,
        collections: [...dbMap.get(dbName)!.entries()].map(([name, documents]) => ({ name, documents })),
      })),
    }
  }, [archivePreview, bsonDirEntries, bsonSelectedFiles, dirArchivePreviews])

  const getBsonDbCheckboxState = (tree: ArchivePreview, dbName: string): 'checked' | 'unchecked' | 'indeterminate' => {
    const colls = bsonSelection.get(dbName)
    if (!colls || colls.size === 0) return 'unchecked'
    const dbPreview = tree.databases.find(db => db.name === dbName)
    if (!dbPreview) return 'unchecked'
    if (colls.size === dbPreview.collections.length) return 'checked'
    return 'indeterminate'
  }

  const toggleBsonDatabase = (tree: ArchivePreview, dbName: string): void => {
    const dbPreview = tree.databases.find(db => db.name === dbName)
    if (!dbPreview) return
    setBsonSelection(prev => {
      const next = new Map(prev)
      const state = getBsonDbCheckboxState(tree, dbName)
      if (state === 'checked') {
        next.delete(dbName)
      } else {
        next.set(dbName, new Set(dbPreview.collections.map(c => c.name)))
      }
      return next
    })
  }

  const toggleBsonCollection = (dbName: string, collName: string): void => {
    setBsonSelection(prev => {
      const next = new Map(prev)
      const colls = new Set(next.get(dbName) || [])
      if (colls.has(collName)) {
        colls.delete(collName)
        if (colls.size === 0) next.delete(dbName)
        else next.set(dbName, colls)
      } else {
        colls.add(collName)
        next.set(dbName, colls)
      }
      return next
    })
  }

  const bsonSelectAll = (tree: ArchivePreview): void => {
    const sel = new Map<string, Set<string>>()
    for (const db of tree.databases) {
      sel.set(db.name, new Set(db.collections.map(c => c.name)))
    }
    setBsonSelection(sel)
  }

  const bsonDeselectAll = (): void => {
    setBsonSelection(new Map())
  }

  const bsonSelectedCollectionCount = (): number => {
    let count = 0
    for (const colls of bsonSelection.values()) count += colls.size
    return count
  }

  const bsonSelectedDatabaseCount = (): number => bsonSelection.size

  // Check if all databases and collections are selected (no nsInclude needed)
  const isBsonAllSelected = (tree: ArchivePreview): boolean => {
    if (tree.databases.length === 0) return true
    if (bsonSelection.size !== tree.databases.length) return false
    for (const db of tree.databases) {
      const sel = bsonSelection.get(db.name)
      if (!sel || sel.size !== db.collections.length) return false
    }
    return true
  }

  // Navigate to bsonConfigure step, initializing selection from tree
  const goToBsonConfigure = useCallback((): void => {
    const tree = getCombinedBsonTree()
    // Pre-select everything
    const sel = new Map<string, Set<string>>()
    for (const db of tree.databases) {
      sel.set(db.name, new Set(db.collections.map(c => c.name)))
    }
    setBsonSelection(sel)
    setBsonExpanded(new Set())
    setStep('bsonConfigure')
  }, [getCombinedBsonTree])

  // Start BSON import (mongorestore)
  const startBSONImport = useCallback(async (): Promise<void> => {
    if (!bsonInputPath) return
    setStep('importing')
    setProgress(null)
    setPaused(false)

    const label = `mongorestore (${connectionName})`
    const importId = trackImport(connectionId, '', null, label)
    importIdRef.current = importId

    // Compute nsInclude from selection (only if partial selection)
    const tree = getCombinedBsonTree()
    const allSelected = isBsonAllSelected(tree)
    const nsInclude: string[] = []
    if (!allSelected) {
      for (const [db, colls] of bsonSelection) {
        for (const coll of colls) {
          nsInclude.push(`${db}.${coll}`)
        }
      }
    }

    const opts: MongorestoreOptions = {
      inputPath: bsonInputPath,
      drop: bsonDrop,
      ...(bsonSelectedFiles.size > 0 ? { files: [...bsonSelectedFiles] } : {}),
      ...(nsInclude.length > 0 ? { nsInclude } : {}),
    }

    try {
      const result = await getGo()?.ImportWithMongorestore?.(connectionId, opts)
      if (result) {
        setResult(result)
        setStep('done')
        completeTrackedImport(importId)
        onComplete?.()
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.toLowerCase().includes('cancel')) {
        setResult({ databases: [], documentsInserted: 0, documentsSkipped: 0, errors: ['Import was cancelled'], cancelled: true })
        setStep('done')
      } else {
        setErrorInfo({ error: errMsg })
        setStep('error')
      }
      completeTrackedImport(importId)
    }
  }, [connectionId, connectionName, bsonInputPath, bsonDrop, bsonSelectedFiles, bsonSelection, getCombinedBsonTree, trackImport, completeTrackedImport, onComplete])

  const togglePause = useCallback((): void => {
    if (paused) {
      getGo()?.ResumeImport?.()
      setPaused(false)
    } else {
      getGo()?.PauseImport?.()
      setPaused(true)
    }
  }, [paused])

  const getProgressPercent = (): number => {
    if (!progress?.total || progress.total === 0) return 0
    return Math.min(100, Math.round(((progress.current || 0) / progress.total) * 100))
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div role="dialog" aria-modal="true" className="bg-surface-secondary text-text border border-border rounded-lg w-[520px] max-h-[80vh] shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-lg font-medium text-text">Import</h2>
          <p className="text-xs text-text-dim mt-0.5 truncate">{connectionName}{targetDb ? ` / ${targetDb}` : ''}</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Step: Select file */}
          {step === 'select' && (
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center">
                <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm text-text-light mb-1">Select a file to import</p>
                <p className="text-xs text-text-muted">Supports JSON, NDJSON, CSV, ZIP, and .archive files</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSelectFile}
                disabled={fileLoading}
              >
                {fileLoading ? 'Loading...' : 'Choose File...'}
              </button>

              {bsonAvailable && (
                <>
                  <div className="w-full flex items-center gap-3 mt-2">
                    <div className="flex-1 border-t border-border" />
                    <span className="text-xs text-text-dim">or import a folder with mongorestore</span>
                    <div className="flex-1 border-t border-border" />
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      try {
                        const path = await getGo()?.GetBSONImportDirPath?.()
                        if (!path) return
                        setBsonInputPath(path)
                        setDirArchivePreviews({})
                        // Scan directory contents
                        const entries = await getGo()?.ScanImportDir?.(path)
                        if (entries && entries.length > 0) {
                          setBsonDirEntries(entries)
                          // Pre-select all .archive files
                          const archiveNames = entries.filter(e => e.name.endsWith('.archive')).map(e => e.name)
                          setBsonSelectedFiles(new Set(archiveNames))
                          // Preview each archive file in background
                          for (const name of archiveNames) {
                            const fullPath = path.endsWith('/') ? path + name : path + '/' + name
                            setDirArchivePreviews(prev => ({ ...prev, [name]: 'loading' }))
                            getGo()?.PreviewArchive?.(connectionId, fullPath)
                              .then(preview => {
                                if (preview) setDirArchivePreviews(prev => ({ ...prev, [name]: preview }))
                                else setDirArchivePreviews(prev => ({ ...prev, [name]: 'error' }))
                              })
                              .catch(() => setDirArchivePreviews(prev => ({ ...prev, [name]: 'error' })))
                          }
                        } else {
                          setBsonDirEntries([])
                          setBsonSelectedFiles(new Set())
                        }
                      } catch (err) {
                        console.error('Failed to get directory path:', err)
                      }
                    }}
                  >
                    Select Folder...
                  </button>
                </>
              )}

              {bsonInputPath && bsonAvailable && (
                <div className="w-full space-y-2">
                  <div className="bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text-secondary truncate" title={bsonInputPath}>
                    {bsonInputPath}
                  </div>

                  {/* Single archive: show loading / summary */}
                  {bsonDirEntries.length === 0 && archivePreviewLoading && (
                    <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-text-dim">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-primary" />
                      Scanning archive...
                    </div>
                  )}
                  {bsonDirEntries.length === 0 && archivePreview && archivePreview.databases.length > 0 && (
                    <div className="text-xs text-text-muted px-1">
                      {archivePreview.databases.length} database{archivePreview.databases.length !== 1 ? 's' : ''}, {archivePreview.databases.reduce((sum, db) => sum + db.collections.length, 0)} collections
                    </div>
                  )}

                  {/* Directory: file list with checkboxes */}
                  {bsonDirEntries.length > 0 && bsonDirEntries.some(e => e.name.endsWith('.archive')) && (
                    <div className="bg-background border border-border rounded overflow-hidden">
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-surface">
                        <span className="text-xs text-text-muted">
                          {bsonSelectedFiles.size} of {bsonDirEntries.filter(e => e.name.endsWith('.archive')).length} archive{bsonDirEntries.filter(e => e.name.endsWith('.archive')).length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex gap-2">
                          <button
                            className="text-xs text-primary hover:text-primary-hover"
                            onClick={() => setBsonSelectedFiles(new Set(bsonDirEntries.filter(e => e.name.endsWith('.archive')).map(e => e.name)))}
                          >
                            Select All
                          </button>
                          <button
                            className="text-xs text-primary hover:text-primary-hover"
                            onClick={() => setBsonSelectedFiles(new Set())}
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-border">
                        {bsonDirEntries
                          .filter(e => e.name.endsWith('.archive'))
                          .map(entry => {
                            const preview = dirArchivePreviews[entry.name]
                            return (
                              <div key={entry.name}>
                                <label className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-hover/30 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 rounded border-border-light bg-background text-primary focus:ring-primary/50"
                                    checked={bsonSelectedFiles.has(entry.name)}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                      const next = new Set(bsonSelectedFiles)
                                      if (e.target.checked) next.add(entry.name)
                                      else next.delete(entry.name)
                                      setBsonSelectedFiles(next)
                                    }}
                                  />
                                  <span className="text-xs text-text-secondary truncate flex-1">{entry.name}</span>
                                  <span className="text-xs text-text-muted shrink-0">{formatSize(entry.size)}</span>
                                </label>
                                {preview === 'loading' && (
                                  <div className="flex items-center gap-1.5 pl-8 pr-2.5 pb-1.5 text-xs text-text-dim">
                                    <div className="animate-spin rounded-full h-2.5 w-2.5 border-b border-primary" />
                                    Scanning...
                                  </div>
                                )}
                                {preview && preview !== 'loading' && preview !== 'error' && preview.databases.length > 0 && (
                                  <div className="pl-8 pr-2.5 pb-1.5">
                                    {preview.databases.map(db => (
                                      <div key={db.name} className="text-xs text-text-dim">
                                        {db.name}: {db.collections.map(c => c.name).join(', ')}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: BSON Configure (tree view selection) */}
          {step === 'bsonConfigure' && (() => {
            const tree = getCombinedBsonTree()
            const collCount = bsonSelectedCollectionCount()
            const dbCount = bsonSelectedDatabaseCount()
            return (
              <div className="flex flex-col" style={{ maxHeight: 'calc(80vh - 120px)' }}>
                {/* File info bar */}
                <div className="px-4 py-2 border-b border-border bg-surface shrink-0">
                  <div className="text-xs text-text-muted truncate" title={bsonInputPath}>
                    {bsonInputPath.split('/').pop()}
                    {bsonDirEntries.length > 0 && ` (${bsonSelectedFiles.size} archive${bsonSelectedFiles.size !== 1 ? 's' : ''})`}
                  </div>
                </div>

                {/* Selection controls */}
                <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
                  <button className="text-sm text-primary hover:text-primary/80" onClick={() => bsonSelectAll(tree)}>
                    Select All
                  </button>
                  <span className="text-text-dim">|</span>
                  <button className="text-sm text-primary hover:text-primary/80" onClick={bsonDeselectAll}>
                    Deselect All
                  </button>
                  <span className="ml-auto text-sm text-text-muted">
                    {collCount} collection{collCount !== 1 ? 's' : ''} in {dbCount} database{dbCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Tree view */}
                <div className="flex-1 overflow-y-auto p-2">
                  {tree.databases.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-dim">No databases found in archive</div>
                  ) : (
                    tree.databases.map(db => {
                      const state = getBsonDbCheckboxState(tree, db.name)
                      const isExpanded = bsonExpanded.has(db.name)
                      const totalDocs = db.collections.reduce((sum, c) => sum + c.documents, 0)
                      return (
                        <div key={db.name}>
                          <div
                            className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-surface-hover/50 ${
                              state !== 'unchecked' ? 'bg-surface-hover/30' : ''
                            }`}
                          >
                            <button
                              className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-light shrink-0"
                              onClick={() => {
                                setBsonExpanded(prev => {
                                  const next = new Set(prev)
                                  if (next.has(db.name)) next.delete(db.name)
                                  else next.add(db.name)
                                  return next
                                })
                              }}
                            >
                              <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-border-light bg-surface text-primary focus:ring-primary/50"
                              checked={state === 'checked'}
                              ref={(el) => { if (el) el.indeterminate = state === 'indeterminate' }}
                              onChange={() => toggleBsonDatabase(tree, db.name)}
                            />
                            <div
                              className="flex-1 min-w-0"
                              onClick={() => {
                                setBsonExpanded(prev => {
                                  const next = new Set(prev)
                                  if (next.has(db.name)) next.delete(db.name)
                                  else next.add(db.name)
                                  return next
                                })
                              }}
                            >
                              <div className="text-sm text-text-light truncate">{db.name}</div>
                              <div className="text-xs text-text-muted">
                                {db.collections.length} collection{db.collections.length !== 1 ? 's' : ''}
                                {totalDocs > 0 ? `, ${formatNumber(totalDocs)} docs` : ''}
                              </div>
                            </div>
                          </div>
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
                                    checked={bsonSelection.get(db.name)?.has(coll.name) || false}
                                    onChange={() => toggleBsonCollection(db.name, coll.name)}
                                  />
                                  <span className="text-xs text-text-light truncate flex-1">{coll.name}</span>
                                  {coll.documents > 0 && (
                                    <span className="text-xs text-text-muted shrink-0">{formatNumber(coll.documents)} docs</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Drop existing option */}
                <div className="px-4 py-3 border-t border-border shrink-0">
                  <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-border-light bg-background text-primary focus:ring-primary/50"
                      checked={bsonDrop}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setBsonDrop(e.target.checked)}
                    />
                    Drop existing collections before import
                  </label>
                  {bsonDrop && (
                    <p className="text-xs text-error mt-1 ml-6">Target collections will be permanently deleted before importing</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Step: Configure */}
          {step === 'configure' && (jsonPreview || csvPreview) && (
            <div className="p-4 space-y-4">
              {/* File info */}
              <div className="bg-surface rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-light font-medium truncate">{filePath.split('/').pop()}</span>
                  <span className="text-xs text-text-muted shrink-0 ml-2">
                    {formatSize(fileFormat === 'csv' ? (csvPreview?.fileSize ?? 0) : (jsonPreview?.fileSize ?? 0))}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  {fileFormat === 'csv' ? (
                    <>
                      <span>CSV</span>
                      <span>{formatNumber(csvPreview?.totalRows ?? 0)} rows</span>
                      <span>{csvPreview?.headers.length ?? 0} columns</span>
                    </>
                  ) : (
                    <>
                      <span>{jsonPreview?.format === 'ndjson' ? 'NDJSON' : 'JSON Array'}</span>
                      <span>{formatNumber(jsonPreview?.documentCount ?? 0)} documents</span>
                    </>
                  )}
                </div>
              </div>

              {/* CSV-specific options */}
              {fileFormat === 'csv' && csvPreview && (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-text-muted mb-1">Delimiter</label>
                      <select
                        className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm text-text-secondary focus:border-primary focus:outline-none"
                        value={csvDelimiter}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setCsvDelimiter(e.target.value)}
                      >
                        <option value=",">Comma (,)</option>
                        <option value={'\t'}>Tab</option>
                        <option value=";">Semicolon (;)</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-4">
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pb-1.5">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border-light bg-background text-primary focus:ring-primary/50"
                          checked={csvHasHeaders}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setCsvHasHeaders(e.target.checked)}
                        />
                        First row is header
                      </label>
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pb-1.5">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border-light bg-background text-primary focus:ring-primary/50"
                          checked={csvTypeInference}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setCsvTypeInference(e.target.checked)}
                        />
                        Infer types
                      </label>
                    </div>
                  </div>

                  {/* CSV preview table */}
                  {csvPreview.sampleRows.length > 0 && (
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Preview ({Math.min(csvPreview.sampleRows.length, 5)} of {formatNumber(csvPreview.totalRows)} rows)</label>
                      <div className="bg-background border border-border rounded overflow-x-auto max-h-40 overflow-y-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="border-b border-border">
                              {csvPreview.headers.map((h, i) => (
                                <th key={i} className="px-2 py-1.5 text-left text-text-muted font-medium whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreview.sampleRows.slice(0, 5).map((row, ri) => (
                              <tr key={ri} className="border-b border-border last:border-0">
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-2 py-1 text-text-secondary whitespace-nowrap max-w-[200px] truncate">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Target database */}
              <div>
                <label className="block text-xs text-text-muted mb-1">Target Database</label>
                {loadingDbs ? (
                  <div className="text-sm text-text-dim">Loading databases...</div>
                ) : (
                  <>
                    <input
                      list="target-db-list"
                      className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm text-text-secondary focus:border-primary focus:outline-none"
                      value={targetDb}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setTargetDb(e.target.value)
                        setTargetColl('')
                      }}
                      placeholder="Type or select database..."
                    />
                    <datalist id="target-db-list">
                      {databases.map(db => <option key={db} value={db} />)}
                    </datalist>
                  </>
                )}
              </div>

              {/* Target collection */}
              <div>
                <label className="block text-xs text-text-muted mb-1">Target Collection</label>
                <input
                  list="target-coll-list"
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm text-text-secondary focus:border-primary focus:outline-none"
                  value={targetColl}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTargetColl(e.target.value)}
                  placeholder="Type or select collection..."
                />
                <datalist id="target-coll-list">
                  {collections.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              {/* Import mode */}
              <div>
                <label className="block text-xs text-text-muted mb-2">Import Mode</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-surface-hover/30">
                    <input
                      type="radio"
                      name="importMode"
                      value="skip"
                      checked={mode === 'skip'}
                      onChange={() => setMode('skip')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-text-light">Keep Existing (Skip)</div>
                      <div className="text-xs text-text-muted">Skip documents with duplicate _id values</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-surface-hover/30">
                    <input
                      type="radio"
                      name="importMode"
                      value="override"
                      checked={mode === 'override'}
                      onChange={() => setMode('override')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-text-light">Override (Drop & Replace)</div>
                      <div className="text-xs text-error">Drops the target collection first, then imports fresh</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sample doc preview (JSON only) */}
              {fileFormat === 'json' && jsonPreview?.sampleDoc && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Sample Document</label>
                  <pre className="bg-background border border-border rounded p-2 text-xs text-text-secondary overflow-x-auto max-h-32 overflow-y-auto font-mono">
                    {jsonPreview.sampleDoc}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Step: Previewing (dry-run in progress) */}
          {step === 'previewing' && (
            <div className="p-6 text-center">
              <div className="mb-4">
                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 animate-pulse w-full" />
                </div>
              </div>
              <p className="text-sm text-text-muted">Analyzing changes...</p>
            </div>
          )}

          {/* Step: Preview (dry-run results) */}
          {step === 'preview' && dryRunResult && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-base font-medium text-text">Preview Changes</span>
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
                {(dryRunResult.documentsParseError ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Parse Errors:</span>
                    <span className="text-error font-medium">{formatNumber(dryRunResult.documentsParseError ?? 0)}</span>
                  </div>
                )}
              </div>

              {mode === 'override' && dryRunResult.documentsDropped && dryRunResult.documentsDropped > 0 && (
                <div className="p-3 bg-error-dark border border-red-800/50 rounded text-sm text-error">
                  Warning: {formatNumber(dryRunResult.documentsDropped)} documents will be permanently deleted.
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="p-6">
              {paused && (
                <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Import paused
                </div>
              )}
              <div className="mb-4">
                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  {progress?.total && progress.total > 0 ? (
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${getProgressPercent()}%` }}
                    />
                  ) : (
                    <div className="h-full w-full relative">
                      <div className="absolute inset-0 bg-primary/30" />
                      <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent progress-indeterminate" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted mt-1">
                  {progress?.total && progress.total > 0 ? (
                    <>
                      <span>{formatNumber(progress.current || 0)} / {formatNumber(progress.total)} documents</span>
                      <span>{getProgressPercent()}%</span>
                    </>
                  ) : progress?.collection ? (
                    <span>{progress.collection}{progress.current ? ` — ${formatNumber(progress.current)} documents` : ''}</span>
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-text-muted text-center">
                {bsonInputPath
                  ? `Restoring from ${bsonInputPath.split('/').pop()}...`
                  : `Importing to ${targetDb}.${targetColl}...`
                }
              </p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                {result.cancelled ? (
                  <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (result.documentsFailed ?? 0) > 0 || (result.errors?.length ?? 0) > 0 ? (
                  <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className="text-base font-medium text-text">
                  {result.cancelled ? 'Import Cancelled' : (result.documentsFailed ?? 0) > 0 ? 'Import Completed with Errors' : 'Import Complete'}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">Inserted:</span>
                  <span className="text-success font-medium">{formatNumber(result.documentsInserted)}</span>
                </div>
                {result.documentsSkipped > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Skipped:</span>
                    <span className="text-yellow-400 font-medium">{formatNumber(result.documentsSkipped)}</span>
                  </div>
                )}
                {(result.documentsFailed ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Failed:</span>
                    <span className="text-error font-medium">{formatNumber(result.documentsFailed!)}</span>
                  </div>
                )}
              </div>

              {result.errors?.length > 0 && (
                <div className="bg-surface rounded border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border">
                    <span className="text-xs text-text-muted">{formatNumber(result.errors.length)} unique error{result.errors.length !== 1 ? 's' : ''}</span>
                    <button
                      className="text-xs text-primary hover:text-primary-hover"
                      onClick={() => {
                        navigator.clipboard.writeText(result.errors.join('\n'))
                        notify.success('Errors copied to clipboard')
                      }}
                    >
                      Copy All
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto p-2">
                    {result.errors.map((err, i) => (
                      <div key={i} className="text-xs text-text-muted font-mono break-all py-0.5">{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && errorInfo && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-base font-medium text-text">Import Failed</span>
              </div>
              <div className="bg-error-dark border border-red-800/50 rounded p-3 text-sm text-error">
                {errorInfo.error}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          {step === 'select' && (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              {bsonInputPath && bsonAvailable && (
                <button
                  className="btn btn-primary"
                  onClick={goToBsonConfigure}
                  disabled={
                    archivePreviewLoading ||
                    (bsonDirEntries.length === 0 && !archivePreview) ||
                    (bsonDirEntries.length > 0 && bsonSelectedFiles.size === 0) ||
                    (bsonDirEntries.length > 0 && [...bsonSelectedFiles].every(f => {
                      const p = dirArchivePreviews[f]
                      return p === 'loading'
                    }))
                  }
                >
                  Next
                </button>
              )}
            </>
          )}
          {step === 'bsonConfigure' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStep('select')}>Back</button>
              <button
                className={`btn ${bsonDrop ? 'btn-danger' : 'btn-primary'}`}
                onClick={bsonDrop ? () => setShowBsonDropConfirm(true) : startBSONImport}
                disabled={bsonSelectedCollectionCount() === 0}
              >
                {bsonDrop ? 'Drop & Import' : 'Import'}
              </button>
            </>
          )}
          {step === 'configure' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStep('select')}>Back</button>
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={!targetDb || !targetColl}
              >
                Preview Changes
              </button>
            </>
          )}
          {step === 'previewing' && (
            <button className="btn btn-ghost" onClick={() => setStep('configure')}>Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStep('configure')}>Back</button>
              <button
                className={`btn ${mode === 'override' ? 'btn-danger' : 'btn-primary'}`}
                onClick={mode === 'override' ? () => setShowOverrideConfirm(true) : startImport}
              >
                {mode === 'override' ? 'Drop & Import' : 'Import'}
              </button>
            </>
          )}
          {step === 'importing' && (
            <>
              {!paused && onHide && (
                <button className="btn btn-ghost mr-auto" onClick={onHide}>Hide</button>
              )}
              {!bsonInputPath && (
                <button className="btn btn-ghost inline-flex items-center" onClick={togglePause}>
                  {paused ? 'Resume' : 'Pause'}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => getGo()?.CancelImport?.()}>Cancel</button>
            </>
          )}
          {step === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          )}
          {step === 'error' && (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={() => setStep(bsonInputPath ? 'bsonConfigure' : 'configure')}>Retry</button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showOverrideConfirm}
        title="Override Collection"
        message={
          <div>
            <p className="mb-3">This will DROP the collection <span className="text-text-light">{targetDb}.{targetColl}</span> and replace it with the imported data.</p>
            {dryRunResult?.documentsDropped && dryRunResult.documentsDropped > 0 && (
              <div className="p-3 bg-error-dark border border-red-800/50 rounded text-sm text-error mb-3">
                {formatNumber(dryRunResult.documentsDropped)} documents will be permanently deleted.
              </div>
            )}
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

      <ConfirmDialog
        open={showBsonDropConfirm}
        title="Drop & Import"
        message={
          <div>
            <p className="mb-3">Selected collections will be <span className="text-error">dropped</span> before importing. Existing data in those collections will be permanently deleted.</p>
            <p className="text-error text-sm">This action cannot be undone.</p>
          </div>
        }
        confirmLabel="Drop & Import"
        danger={true}
        onConfirm={() => {
          setShowBsonDropConfirm(false)
          startBSONImport()
        }}
        onCancel={() => setShowBsonDropConfirm(false)}
      />
    </div>,
    document.body
  )
}
