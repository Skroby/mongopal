import { useState } from 'react'
import CSVExportDialog from './CSVExportDialog'

const DownloadIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

export default function CSVExportButton({ connectionId, database, collection, currentFilter, disabled }) {
  const [showDialog, setShowDialog] = useState(false)

  return (
    <>
      <button
        className={`icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setShowDialog(true)}
        disabled={disabled}
        title={disabled ? 'Connect to database first' : 'Export as CSV'}
      >
        <DownloadIcon className="w-4 h-4" />
      </button>

      <CSVExportDialog
        open={showDialog}
        connectionId={connectionId}
        database={database}
        collection={collection}
        currentFilter={currentFilter}
        onClose={() => setShowDialog(false)}
      />
    </>
  )
}
