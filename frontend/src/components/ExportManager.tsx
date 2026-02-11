import { useState, useRef, useEffect } from 'react'
import { useExportQueue, ExportEntryUnion, ImportEntry, TransferEntry, CompletedExport, ZipExportEntry } from './contexts/ExportQueueContext'

// Go bindings type
interface GoApp {
  RevealInFinder?: (filePath: string) => Promise<void>
  CancelExport?: () => void
  CancelImport?: () => void
  PauseExport?: () => void
  ResumeExport?: () => void
  PauseImport?: () => void
  ResumeImport?: () => void
}

// Access go at call time, not module load time (bindings may not be ready yet)
const getGo = (): GoApp | undefined =>
  (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

// Icon component props
interface IconProps {
  className?: string
}

const DownloadIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const UploadIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
)

const XIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const FolderIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
  </svg>
)

const CheckIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const TableIcon = ({ className = "w-4 h-4" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const PauseIcon = ({ className = "w-3.5 h-3.5" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const PlayIcon = ({ className = "w-3.5 h-3.5" }: IconProps): React.ReactElement => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

function getPhaseLabel(entry: TransferEntry): string {
  if (entry.paused) return 'Paused'
  if (entry.direction === 'import') {
    const imp = entry as ImportEntry
    switch (imp.phase) {
      case 'starting': return 'Starting...'
      case 'importing': return 'Importing'
      case 'complete': return 'Complete'
      default: return imp.phase
    }
  }
  const exp = entry as ExportEntryUnion
  switch (exp.phase) {
    case 'queued': return 'Queued'
    case 'starting': return 'Starting...'
    case 'downloading': return exp.type === 'zip' ? 'Exporting' : 'Downloading'
    case 'complete': return 'Complete'
    default: return exp.phase
  }
}

function getPhaseColor(entry: TransferEntry): string {
  if (entry.paused) return 'text-yellow-400'
  if (entry.direction === 'import') {
    const imp = entry as ImportEntry
    switch (imp.phase) {
      case 'importing': return 'text-info'
      case 'complete': return 'text-success'
      default: return 'text-text-muted'
    }
  }
  const exp = entry as ExportEntryUnion
  switch (exp.phase) {
    case 'queued': return 'text-text-dim'
    case 'downloading': return 'text-info'
    case 'complete': return 'text-success'
    default: return 'text-text-muted'
  }
}

function getTransferProgress(entry: TransferEntry): number {
  if (entry.direction === 'import') {
    return (entry as ImportEntry).progress
  }
  return (entry as ExportEntryUnion).progress
}

function isQueued(entry: TransferEntry): boolean {
  return entry.direction === 'export' && (entry as ExportEntryUnion).phase === 'queued'
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ExportManager(): React.ReactElement {
  const { allTransfers, imports, completedExports, getLeadingExport, cancelExport, cancelAllExports, clearHistory, activeCount, queuedCount } = useExportQueue()
  const [open, setOpen] = useState<boolean>(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleShowInFolder = async (filePath: string | undefined): Promise<void> => {
    if (!filePath) return
    try {
      await getGo()?.RevealInFinder?.(filePath)
    } catch (err) {
      console.error('Failed to reveal file:', err)
    }
  }

  const handleCancel = (entry: TransferEntry): void => {
    if (entry.direction === 'import') {
      getGo()?.CancelImport?.()
    } else {
      cancelExport(entry.id)
    }
  }

  const handlePauseResume = (entry: TransferEntry): void => {
    if (entry.paused) {
      if (entry.direction === 'import') {
        getGo()?.ResumeImport?.()
      } else {
        getGo()?.ResumeExport?.()
      }
    } else {
      if (entry.direction === 'import') {
        getGo()?.PauseImport?.()
      } else {
        getGo()?.PauseExport?.()
      }
    }
  }

  const handleRowClick = (entry: TransferEntry): void => {
    if (entry.modalOpener) {
      entry.modalOpener()
      setOpen(false)
    }
  }

  const leading = getLeadingExport()
  const hasImports = imports.length > 0
  const totalActive = allTransfers.length
  const hasActivity = totalActive > 0 || completedExports.length > 0

  // Pick label for status bar: prefer leading export, fall back to first import
  const statusLabel = leading?.label || (hasImports ? imports[0].label : null)
  const statusProgress = leading?.progress || (hasImports ? imports[0].progress : 0)

  return (
    <div className="relative">
      {/* Status bar button - always visible */}
      <button
        ref={buttonRef}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
          totalActive > 0 ? 'bg-surface-hover/50 hover:bg-surface-hover' : 'hover:bg-surface-hover/50'
        }`}
        onClick={() => setOpen(!open)}
        title="Transfer manager"
      >
        {hasImports ? (
          <UploadIcon className={`w-3 h-3 ${totalActive > 0 ? 'text-primary' : 'text-text-muted'}`} />
        ) : (
          <DownloadIcon className={`w-3 h-3 ${totalActive > 0 ? 'text-primary' : 'text-text-muted'}`} />
        )}
        {totalActive > 0 && (
          <>
            <span className="text-text-secondary max-w-[120px] truncate">
              {statusLabel || 'Queued...'}
            </span>
            {statusProgress > 0 && (
              <span className="text-primary font-medium">
                {statusProgress}%
              </span>
            )}
            {totalActive > 1 && (
              <span className="text-text-dim">
                +{totalActive - 1}
              </span>
            )}
          </>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 mb-2 w-80 bg-surface-secondary border border-border rounded-lg shadow-xl z-50"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-text-light">Transfers</span>
            {totalActive > 0 && (
              <span className="text-xs text-text-dim">
                {activeCount} active{queuedCount > 0 ? `, ${queuedCount} queued` : ''}
              </span>
            )}
          </div>

          {/* Transfer list */}
          <div className="max-h-64 overflow-y-auto">
            {/* Active transfers */}
            {allTransfers.map((entry: TransferEntry) => {
              const isExport = entry.direction === 'export'
              const expEntry = isExport ? (entry as ExportEntryUnion) : null
              const impEntry = !isExport ? (entry as ImportEntry) : null
              const zipExp = expEntry?.type === 'zip' ? (expEntry as ZipExportEntry) : null
              const progress = getTransferProgress(entry)
              const queued = isQueued(entry)
              const hasOpener = !!entry.modalOpener

              return (
                <div
                  key={entry.id}
                  className={`px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-surface/30 ${hasOpener ? 'cursor-pointer' : ''}`}
                  onClick={hasOpener ? () => handleRowClick(entry) : undefined}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-dim">
                          {isExport ? <TableIcon className="w-3 h-3" /> : <UploadIcon className="w-3 h-3" />}
                        </span>
                        <span className="text-sm text-text-light truncate" title={entry.label}>
                          {entry.label}
                        </span>
                      </div>
                      <div className="text-xs text-text-dim truncate mt-0.5">
                        {isExport && expEntry ? (
                          expEntry.type === 'zip' ? (
                            zipExp?.currentItem ? `${expEntry.database} / ${zipExp.currentItem}` : expEntry.database
                          ) : (
                            `${expEntry.database}.${'collection' in expEntry ? expEntry.collection : ''}`
                          )
                        ) : impEntry ? (
                          impEntry.currentItem ? `${impEntry.database} / ${impEntry.currentItem}` : impEntry.database
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      <span className={`text-xs ${getPhaseColor(entry)}`}>
                        {getPhaseLabel(entry)}
                      </span>
                      {/* Pause/Resume button — hidden for BSON exports (external CLI, can't pause) */}
                      {!queued && (entry.direction === 'import' || (expEntry && expEntry.supportsPause)) && (
                        <button
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-light transition-colors"
                          onClick={() => handlePauseResume(entry)}
                          title={entry.paused ? 'Resume' : 'Pause'}
                        >
                          {entry.paused ? <PlayIcon className="w-3.5 h-3.5" /> : <PauseIcon className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {/* Cancel button */}
                      <button
                        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-error transition-colors"
                        onClick={() => handleCancel(entry)}
                        title={queued ? 'Remove from queue' : `Cancel ${isExport ? 'export' : 'import'}`}
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {!queued && (
                    <div className="mt-1.5">
                      <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
                        {entry.paused ? (
                          <div
                            className="h-full bg-yellow-500/70"
                            style={{ width: `${progress}%` }}
                          />
                        ) : progress > 0 ? (
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        ) : (
                          <div className="h-full w-full relative">
                            <div className="absolute inset-0 bg-primary/30" />
                            <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent progress-indeterminate" />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-xs text-text-dim">
                          {isExport && expEntry ? (
                            expEntry.type === 'zip' && zipExp && zipExp.itemTotal > 0 ? (
                              `${zipExp.itemIndex || 0}/${zipExp.itemTotal} ${zipExp.itemTotal === 1 ? 'item' : 'items'}${expEntry.current > 0 ? ` - ${expEntry.current.toLocaleString()} docs` : ''}`
                            ) : (
                              expEntry.current > 0 ? `${expEntry.current.toLocaleString()} docs` : ''
                            )
                          ) : impEntry ? (
                            impEntry.itemTotal > 0 ? (
                              `${impEntry.itemIndex || 0}/${impEntry.itemTotal} ${impEntry.itemTotal === 1 ? 'item' : 'items'}${impEntry.processedDocs > 0 ? ` - ${impEntry.processedDocs.toLocaleString()} docs` : ''}`
                            ) : (
                              impEntry.processedDocs > 0 ? `${impEntry.processedDocs.toLocaleString()} docs` : ''
                            )
                          ) : null}
                        </span>
                        {progress > 0 && (
                          <span className={`text-xs font-medium ${entry.paused ? 'text-yellow-400' : 'text-primary'}`}>
                            {progress}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Queued indicator */}
                  {queued && (
                    <div className="mt-1 text-xs text-text-dim italic">
                      Waiting in queue...
                    </div>
                  )}
                </div>
              )
            })}

            {/* Completed transfers */}
            {completedExports.map((exp: CompletedExport) => (
              <div
                key={exp.id}
                className="px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-surface/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-success"><CheckIcon className="w-3 h-3" /></span>
                      <span className="text-sm text-text-light truncate" title={exp.filePath || exp.label}>
                        {exp.direction === 'import' ? exp.label : (exp.filePath?.split('/').pop() || exp.label)}
                      </span>
                    </div>
                    <div className="text-xs text-text-dim truncate mt-0.5">
                      {exp.direction === 'import' ? 'Import' : 'Export'} - {exp.database}.{exp.collection} - {formatTimeAgo(exp.completedAt)}
                    </div>
                  </div>
                  {exp.direction === 'export' && exp.filePath && (
                    <button
                      className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-light transition-colors ml-2"
                      onClick={() => handleShowInFolder(exp.filePath)}
                      title="Show in folder"
                    >
                      <FolderIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Empty state */}
            {!hasActivity && (
              <div className="px-3 py-6 text-center text-text-dim text-sm">
                <DownloadIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No transfers yet</p>
                <p className="text-xs mt-1">Exports and imports will appear here</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {(allTransfers.length > 1 || completedExports.length > 0) && (
            <div className="px-3 py-2 border-t border-border flex justify-between">
              {allTransfers.length > 1 && (
                <button
                  className="text-xs text-error hover:text-red-300 transition-colors"
                  onClick={() => {
                    cancelAllExports()
                  }}
                >
                  Cancel all
                </button>
              )}
              {completedExports.length > 0 && (
                <button
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors ml-auto"
                  onClick={clearHistory}
                >
                  Clear history
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
