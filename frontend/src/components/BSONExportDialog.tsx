import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useNotification } from './NotificationContext'
import { useExportQueue } from './contexts/ExportQueueContext'
import ConfirmDialog from './ConfirmDialog'
import type { ToolAvailability, MongodumpOptions } from '../types/wails.d'

interface GoApp {
  CheckToolAvailability?: () => Promise<ToolAvailability>
  ExportWithMongodump?: (connectionId: string, options: MongodumpOptions) => Promise<void>
  CancelExport?: () => void
  GetBSONSavePath?: (defaultFilename: string) => Promise<string | null>
}

const getGo = (): GoApp | undefined => (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

interface ExportProgressEventData {
  exportId?: string
  database?: string
  collection?: string
  databaseIndex?: number
  databaseTotal?: number
  current?: number
  total?: number
}

export interface BSONExportDialogProps {
  open: boolean
  connectionId: string
  connectionName: string
  database?: string
  collection?: string
  onClose: () => void
}

export default function BSONExportDialog({
  open,
  connectionId,
  connectionName,
  database,
  collection,
  onClose,
}: BSONExportDialogProps): React.JSX.Element | null {
  const { notify } = useNotification()
  const { trackZipExport, updateTrackedExport, completeTrackedExport, removeTrackedExport } = useExportQueue()

  const [toolAvailable, setToolAvailable] = useState<boolean | null>(null)
  const [toolVersion, setToolVersion] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [browsingDir, setBrowsingDir] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgressEventData | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const exportIdRef = useRef<string | null>(null)
  const [exportActive, setExportActive] = useState(false)

  // Check tool availability on open
  useEffect(() => {
    if (!open) return
    setToolAvailable(null)
    setToolVersion('')
    setOutputPath('')
    setBrowsingDir(false)
    setExporting(false)
    setProgress(null)

    const check = async (): Promise<void> => {
      try {
        const result = await getGo()?.CheckToolAvailability?.()
        if (result) {
          setToolAvailable(result.mongodump)
          setToolVersion(result.mongodumpVersion || '')
        }
      } catch {
        setToolAvailable(false)
      }
    }
    check()
  }, [open])

  // Stable callbacks for event handlers
  const handleExportProgress = useCallback((data: ExportProgressEventData) => {
    if (!exportIdRef.current) return
    setProgress(data)
    let pct = 0
    if (data.databaseTotal && data.databaseTotal > 0 && data.databaseIndex) {
      pct = Math.round(((data.databaseIndex - 1) / data.databaseTotal) * 100)
    }
    updateTrackedExport(exportIdRef.current, {
      phase: 'downloading',
      progress: pct,
      current: data.current || 0,
      total: data.total || 0,
      currentItem: data.collection || data.database || null,
      itemIndex: data.databaseIndex || 0,
      itemTotal: data.databaseTotal || 0,
    } as Partial<import('./contexts/ExportQueueContext').ZipExportEntry>)
  }, [updateTrackedExport])

  const handleExportComplete = useCallback(() => {
    if (!exportIdRef.current) return
    setExporting(false)
    setProgress(null)
    setExportActive(false)
    notify.success('mongodump export completed')
    completeTrackedExport(exportIdRef.current)
    exportIdRef.current = null
    onClose()
  }, [completeTrackedExport, notify, onClose])

  const handleExportCancelled = useCallback(() => {
    if (!exportIdRef.current) return
    setExporting(false)
    setProgress(null)
    setExportActive(false)
    notify.info('mongodump export cancelled')
    removeTrackedExport(exportIdRef.current)
    exportIdRef.current = null
  }, [removeTrackedExport, notify])

  // Listen for export events - stays alive as long as an export is active
  useEffect(() => {
    if (!exportActive) return
    const unsubProgress = EventsOn('export:progress', handleExportProgress)
    const unsubComplete = EventsOn('export:complete', handleExportComplete)
    const unsubCancelled = EventsOn('export:cancelled', handleExportCancelled)
    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubComplete) unsubComplete()
      if (unsubCancelled) unsubCancelled()
    }
  }, [exportActive, handleExportProgress, handleExportComplete, handleExportCancelled])

  // Handle Escape key
  useEffect(() => {
    if (!open) return
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
  }, [open, exporting, showCancelConfirm, onClose])

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    setProgress(null)
    setExportActive(true)

    const label = collection
      ? `${database}.${collection} (mongodump)`
      : database
        ? `${database} (mongodump)`
        : `${connectionName} (mongodump)`
    exportIdRef.current = trackZipExport(connectionId, database || connectionName, null, label, undefined, false)

    const opts: MongodumpOptions = {
      outputPath,
    }
    if (database) opts.database = database
    if (collection) opts.collections = [collection]

    try {
      await getGo()?.ExportWithMongodump?.(connectionId, opts)
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      if (!errMsg.toLowerCase().includes('cancel')) {
        notify.error(`mongodump failed: ${errMsg}`)
      }
      setExporting(false)
      setProgress(null)
      setExportActive(false)
      if (exportIdRef.current) {
        removeTrackedExport(exportIdRef.current)
        exportIdRef.current = null
      }
    }
  }

  const confirmCancel = (): void => {
    setShowCancelConfirm(false)
    setExporting(false)
    setProgress(null)
    setExportActive(false)
    getGo()?.CancelExport?.()
    if (exportIdRef.current) {
      removeTrackedExport(exportIdRef.current)
      exportIdRef.current = null
    }
  }

  if (!open) return null

  const target = collection ? `${database}.${collection}` : database || connectionName

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div role="dialog" aria-modal="true" className="bg-surface-secondary text-text border border-border rounded-lg w-[420px] shadow-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text">Export with mongodump</h2>
          <p className="text-xs text-text-dim mt-0.5 truncate">{target}</p>
        </div>

        <div className="px-4 py-4">
          {toolAvailable === null ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span className="ml-2 text-sm text-text-muted">Checking mongodump availability...</span>
            </div>
          ) : !toolAvailable ? (
            <div className="text-center py-4">
              <svg className="w-10 h-10 text-text-muted mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-text-light mb-2">mongodump not found</p>
              <p className="text-xs text-text-muted mb-3">
                Install MongoDB Database Tools to use BSON export.
              </p>
              <a
                href="https://www.mongodb.com/try/download/database-tools"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:text-primary/80 underline"
              >
                Download MongoDB Database Tools
              </a>
            </div>
          ) : exporting ? (
            <div className="py-2">
              <div className="h-2 bg-surface-hover rounded-full overflow-hidden mb-2">
                <div className="h-full w-full relative">
                  <div className="absolute inset-0 bg-primary/30" />
                  <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent progress-indeterminate" />
                </div>
              </div>
              {progress?.database && (
                <p className="text-sm text-text-secondary text-center">
                  {progress.collection ? `${progress.database}.${progress.collection}` : progress.database}
                  {progress.databaseIndex && progress.databaseTotal ? ` (${progress.databaseIndex}/${progress.databaseTotal})` : ''}
                </p>
              )}
              <p className="text-xs text-text-muted text-center mt-1">Exporting with mongodump...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {toolVersion && (
                <p className="text-xs text-text-dim">Version: {toolVersion}</p>
              )}

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
                      setBrowsingDir(true)
                      try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                        const name = collection
                          ? `${database}_${collection}_${timestamp}.archive`
                          : database
                            ? `${database}_${timestamp}.archive`
                            : `${connectionName}_${timestamp}.archive`
                        const path = await getGo()?.GetBSONSavePath?.(name)
                        if (path) setOutputPath(path)
                      } catch (err) {
                        console.error('Failed to get save path:', err)
                      } finally {
                        setBrowsingDir(false)
                      }
                    }}
                    disabled={browsingDir}
                  >
                    {browsingDir ? 'Opening...' : 'Browse...'}
                  </button>
                </div>
                {outputPath && (
                  <p className="text-xs text-text-dim mt-1 truncate" title={outputPath}>
                    {outputPath}
                  </p>
                )}
              </div>

            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          {exporting ? (
            <button className="btn btn-ghost" onClick={() => setShowCancelConfirm(true)}>Cancel</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                {toolAvailable === false ? 'Close' : 'Cancel'}
              </button>
              {toolAvailable && (
                <button className="btn btn-primary" onClick={handleExport} disabled={!outputPath}>
                  Export
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Export?"
        message="Are you sure you want to cancel the mongodump export?"
        confirmLabel="Yes, Cancel"
        cancelLabel="Continue"
        danger={true}
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>,
    document.body
  )
}
