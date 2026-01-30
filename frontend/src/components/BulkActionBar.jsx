const XIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const DownloadIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

export default function BulkActionBar({
  selectedCount,
  onClear,
  onDelete,
  onExport,
  isDeleting = false,
  isExporting = false
}) {
  return (
    <div className="h-12 bg-accent/10 border-t border-accent/30 flex items-center justify-between px-4 animate-slide-in-bottom">
      {/* Left side: selection count and clear button */}
      <div className="flex items-center gap-3">
        <button
          className="p-1 rounded hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
          onClick={onClear}
          title="Clear selection"
        >
          <XIcon className="w-4 h-4" />
        </button>
        <span className="text-sm text-zinc-200">
          {selectedCount} document{selectedCount !== 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-2">
        <button
          className="btn btn-secondary flex items-center gap-1.5"
          onClick={onExport}
          disabled={isExporting}
        >
          <DownloadIcon className="w-4 h-4" />
          <span>{isExporting ? 'Exporting...' : 'Export'}</span>
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          onClick={onDelete}
          disabled={isDeleting}
        >
          <TrashIcon className="w-4 h-4" />
          <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
        </button>
      </div>
    </div>
  )
}
