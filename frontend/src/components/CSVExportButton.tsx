import { useState } from 'react'
import CSVExportDialog from './CSVExportDialog'

interface DownloadIconProps {
  className?: string
}

const DownloadIcon = ({ className = "w-4 h-4" }: DownloadIconProps): React.JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

export interface CSVExportButtonProps {
  /** The connection ID to export from */
  connectionId: string
  /** The database name */
  database: string
  /** The collection name */
  collection: string
  /** The current filter applied to the collection view */
  currentFilter?: string
  /** Whether the button is disabled */
  disabled?: boolean
}

export default function CSVExportButton({
  connectionId,
  database,
  collection,
  currentFilter,
  disabled = false
}: CSVExportButtonProps): React.JSX.Element {
  const [showDialog, setShowDialog] = useState(false)

  const handleClick = (): void => {
    if (!disabled) {
      setShowDialog(true)
    }
  }

  const handleClose = (): void => {
    setShowDialog(false)
  }

  return (
    <>
      <button
        className={`icon-btn p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-light ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleClick}
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
        onClose={handleClose}
      />
    </>
  )
}
