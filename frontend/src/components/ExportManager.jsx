import { useState, useRef, useEffect } from 'react'
import { useExportQueue } from './contexts/ExportQueueContext'

const getGo = () => window.go?.main?.App

const DownloadIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const XIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const FolderIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
  </svg>
)

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const TableIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

function getPhaseLabel(phase, type) {
  switch (phase) {
    case 'queued': return 'Queued'
    case 'starting': return 'Starting...'
    case 'downloading': return type === 'zip' ? 'Exporting' : 'Downloading'
    case 'writing':
      return type === 'csv' ? 'Writing CSV' : 'Writing ZIP'
    case 'complete': return 'Complete'
    default: return phase
  }
}

function getPhaseColor(phase) {
  switch (phase) {
    case 'queued': return 'text-zinc-500'
    case 'downloading': return 'text-blue-400'
    case 'writing': return 'text-accent'
    case 'complete': return 'text-green-400'
    default: return 'text-zinc-400'
  }
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ExportManager() {
  const { exports, completedExports, getLeadingExport, cancelExport, cancelAllExports, clearHistory, activeCount, queuedCount } = useExportQueue()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef(null)
  const buttonRef = useRef(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleShowInFolder = async (filePath) => {
    try {
      await getGo()?.RevealInFinder?.(filePath)
    } catch (err) {
      console.error('Failed to reveal file:', err)
    }
  }

  const leading = getLeadingExport()
  const totalActive = exports.length
  const hasActivity = totalActive > 0 || completedExports.length > 0

  return (
    <div className="relative">
      {/* Status bar button - always visible */}
      <button
        ref={buttonRef}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
          totalActive > 0 ? 'bg-zinc-700/50 hover:bg-zinc-700' : 'hover:bg-zinc-700/50'
        }`}
        onClick={() => setOpen(!open)}
        title="Export manager"
      >
        <DownloadIcon className={`w-3 h-3 ${totalActive > 0 ? 'text-accent' : 'text-zinc-400'}`} />
        {totalActive > 0 && (
          <>
            <span className="text-zinc-300 max-w-[120px] truncate">
              {leading ? leading.label : 'Queued...'}
            </span>
            {leading && leading.progress > 0 && (
              <span className="text-accent font-medium">
                {leading.progress}%
              </span>
            )}
            {totalActive > 1 && (
              <span className="text-zinc-500">
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
            <span className="text-sm font-medium text-zinc-200">Exports</span>
            {totalActive > 0 && (
              <span className="text-xs text-zinc-500">
                {activeCount} active{queuedCount > 0 ? `, ${queuedCount} queued` : ''}
              </span>
            )}
          </div>

          {/* Export list */}
          <div className="max-h-64 overflow-y-auto">
            {/* Active exports */}
            {exports.map((exp) => (
              <div
                key={exp.id}
                className="px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-zinc-800/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500"><TableIcon className="w-3 h-3" /></span>
                      <span className="text-sm text-zinc-200 truncate" title={exp.options?.filePath || exp.label}>
                        {exp.options?.filePath?.split('/').pop() || exp.label}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate mt-0.5">
                      {exp.type === 'zip' ? (
                        // Show current item for ZIP exports (multi-collection/database)
                        exp.currentItem ? `${exp.database} / ${exp.currentItem}` : exp.database
                      ) : (
                        // CSV exports show database.collection
                        `${exp.database}.${exp.collection}`
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className={`text-xs ${getPhaseColor(exp.phase)}`}>
                      {getPhaseLabel(exp.phase, exp.type)}
                    </span>
                    <button
                      className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
                      onClick={() => cancelExport(exp.id)}
                      title={exp.phase === 'queued' ? 'Remove from queue' : 'Cancel export'}
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {exp.phase !== 'queued' && (
                  <div className="mt-1.5">
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      {exp.progress > 0 ? (
                        <div
                          className="h-full bg-accent transition-all duration-300"
                          style={{ width: `${exp.progress}%` }}
                        />
                      ) : (
                        <div className="h-full w-full relative">
                          <div className="absolute inset-0 bg-accent/30" />
                          <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent progress-indeterminate" />
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-zinc-500">
                        {exp.type === 'zip' && exp.itemTotal > 0 ? (
                          // Show item progress for ZIP exports
                          `${exp.itemIndex || 0}/${exp.itemTotal} ${exp.itemTotal === 1 ? 'item' : 'items'}${exp.current > 0 ? ` • ${exp.current.toLocaleString()} docs` : ''}`
                        ) : (
                          // Show doc count for CSV exports
                          exp.current > 0 ? `${exp.current.toLocaleString()} docs` : ''
                        )}
                      </span>
                      {exp.progress > 0 && (
                        <span className="text-xs text-accent font-medium">
                          {exp.progress}%
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Queued indicator */}
                {exp.phase === 'queued' && (
                  <div className="mt-1 text-xs text-zinc-500 italic">
                    Waiting in queue...
                  </div>
                )}
              </div>
            ))}

            {/* Completed exports */}
            {completedExports.map((exp) => (
              <div
                key={exp.id}
                className="px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-zinc-800/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-green-400"><CheckIcon className="w-3 h-3" /></span>
                      <span className="text-sm text-zinc-200 truncate" title={exp.filePath}>
                        {exp.filePath?.split('/').pop() || exp.label}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate mt-0.5">
                      {exp.database}.{exp.collection} • {formatTimeAgo(exp.completedAt)}
                    </div>
                  </div>
                  <button
                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors ml-2"
                    onClick={() => handleShowInFolder(exp.filePath)}
                    title="Show in folder"
                  >
                    <FolderIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Empty state */}
            {!hasActivity && (
              <div className="px-3 py-6 text-center text-zinc-500 text-sm">
                <DownloadIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No exports yet</p>
                <p className="text-xs mt-1">Exports will appear here</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {(exports.length > 1 || completedExports.length > 0) && (
            <div className="px-3 py-2 border-t border-border flex justify-between">
              {exports.length > 1 && (
                <button
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  onClick={() => {
                    cancelAllExports()
                  }}
                >
                  Cancel all
                </button>
              )}
              {completedExports.length > 0 && (
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors ml-auto"
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

// Legacy alias
export { ExportManager as CSVExportManager }
