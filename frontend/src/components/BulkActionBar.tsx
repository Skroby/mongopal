import { useEffect, useRef } from 'react'

/**
 * Props for icon components
 */
interface IconProps {
  className?: string
}

const XIcon = ({ className = "w-4 h-4" }: IconProps): JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const TrashIcon = ({ className = "w-4 h-4" }: IconProps): JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const DownloadIcon = ({ className = "w-4 h-4" }: IconProps): JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

// Detect platform for keyboard shortcut display
const isMac: boolean = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

/**
 * Props for the BulkActionBar component
 */
export interface BulkActionBarProps {
  /** Number of selected documents */
  selectedCount: number
  /** Callback when clear selection is triggered */
  onClear: () => void
  /** Callback when delete action is triggered */
  onDelete: () => void
  /** Callback when export action is triggered */
  onExport: () => void
  /** Whether a delete operation is in progress */
  isDeleting?: boolean
  /** Whether an export operation is in progress */
  isExporting?: boolean
}

export default function BulkActionBar({
  selectedCount,
  onClear,
  onDelete,
  onExport,
  isDeleting = false,
  isExporting = false
}: BulkActionBarProps): JSX.Element {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const clearButtonRef = useRef<HTMLButtonElement>(null)

  // Handle keyboard shortcuts when the bar is visible
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't handle if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        e.preventDefault()
        onClear()
        return
      }

      // Delete/Backspace: Trigger delete confirmation
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isDeleting) {
        e.preventDefault()
        onDelete()
        return
      }

      // Cmd/Ctrl+E: Trigger export
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !isExporting) {
        e.preventDefault()
        onExport()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClear, onDelete, onExport, isDeleting, isExporting])

  // Announce to screen readers when bar appears
  useEffect(() => {
    // Focus the first button when the bar appears for keyboard accessibility
    // Use preventScroll to avoid jumping the view
    if (clearButtonRef.current) {
      clearButtonRef.current.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={`Bulk actions for ${selectedCount} selected document${selectedCount !== 1 ? 's' : ''}`}
      className="h-12 bg-surface border-t border-primary/50 flex items-center justify-between px-4 animate-slide-in-bottom shadow-lg"
    >
      {/* Screen reader announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {selectedCount} document{selectedCount !== 1 ? 's' : ''} selected.
        Press Escape to clear selection, {isMac ? 'Command' : 'Control'}+E to export, or Delete to remove.
      </div>

      {/* Left side: selection count and clear button */}
      <div className="flex items-center gap-3">
        <button
          ref={clearButtonRef}
          className="icon-btn p-1 hover:bg-surface-hover/50 text-text-muted hover:text-text-light"
          onClick={onClear}
          aria-label="Clear selection (Escape)"
          title="Clear selection (Escape)"
        >
          <XIcon className="w-4 h-4" />
        </button>
        <span className="text-sm text-text-light" aria-hidden="true">
          {selectedCount} document{selectedCount !== 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-2" role="group" aria-label="Bulk actions">
        <button
          className="btn btn-secondary flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background"
          onClick={onExport}
          disabled={isExporting}
          aria-label={`Export ${selectedCount} document${selectedCount !== 1 ? 's' : ''} (${isMac ? 'Cmd' : 'Ctrl'}+E)`}
          title={`Export selected (${isMac ? 'Cmd' : 'Ctrl'}+E)`}
        >
          <DownloadIcon className="w-4 h-4" />
          <span>{isExporting ? 'Exporting...' : 'Export'}</span>
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={`Delete ${selectedCount} document${selectedCount !== 1 ? 's' : ''} (Delete key)`}
          title="Delete selected (Delete)"
        >
          <TrashIcon className="w-4 h-4" />
          <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
        </button>
      </div>
    </div>
  )
}
