import { useState, useRef, useEffect } from 'react'
import CSVExportDialog from './CSVExportDialog'
import JSONExportDialog from './JSONExportDialog'
import BSONExportDialog from './BSONExportDialog'
import type { ToolAvailability } from '../types/wails.d'

interface DownloadIconProps {
  className?: string
}

const DownloadIcon = ({ className = "w-4 h-4" }: DownloadIconProps): React.JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const ChevronDownIcon = ({ className = "w-3 h-3" }: DownloadIconProps): React.JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

interface GoApp {
  CheckToolAvailability?: () => Promise<ToolAvailability>
}

const getGo = (): GoApp | undefined => (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

export interface CollectionExportButtonProps {
  connectionId: string
  connectionName?: string
  database: string
  collection: string
  currentFilter?: string
  disabled?: boolean
}

export default function CollectionExportButton({
  connectionId,
  connectionName,
  database,
  collection,
  currentFilter,
  disabled = false
}: CollectionExportButtonProps): React.JSX.Element {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCSVDialog, setShowCSVDialog] = useState(false)
  const [showJSONDialog, setShowJSONDialog] = useState(false)
  const [showBSONDialog, setShowBSONDialog] = useState(false)
  const [bsonAvailable, setBsonAvailable] = useState<boolean | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handleClick = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDropdown])

  // Close dropdown on Escape
  useEffect(() => {
    if (!showDropdown) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setShowDropdown(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showDropdown])

  // Check BSON tool availability when dropdown opens
  useEffect(() => {
    if (!showDropdown || bsonAvailable !== null) return
    const check = async (): Promise<void> => {
      try {
        const result = await getGo()?.CheckToolAvailability?.()
        setBsonAvailable(result?.mongodump ?? false)
      } catch {
        setBsonAvailable(false)
      }
    }
    check()
  }, [showDropdown, bsonAvailable])

  const handleClick = (): void => {
    if (!disabled) {
      setShowDropdown(!showDropdown)
    }
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          className={`icon-btn p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-light inline-flex items-center gap-0.5 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={handleClick}
          disabled={disabled}
          title={disabled ? 'Connect to database first' : 'Export collection'}
        >
          <DownloadIcon className="w-4 h-4" />
          <ChevronDownIcon className="w-3 h-3" />
        </button>

        {showDropdown && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-surface-secondary border border-border rounded-lg shadow-xl z-50 py-1">
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-light"
              onClick={() => {
                setShowDropdown(false)
                setShowCSVDialog(true)
              }}
            >
              Export as CSV
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-light"
              onClick={() => {
                setShowDropdown(false)
                setShowJSONDialog(true)
              }}
            >
              Export as JSON
            </button>
            {bsonAvailable && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-light"
                  onClick={() => {
                    setShowDropdown(false)
                    setShowBSONDialog(true)
                  }}
                >
                  Export with mongodump
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <CSVExportDialog
        open={showCSVDialog}
        connectionId={connectionId}
        database={database}
        collection={collection}
        currentFilter={currentFilter}
        onClose={() => setShowCSVDialog(false)}
      />

      <JSONExportDialog
        open={showJSONDialog}
        connectionId={connectionId}
        database={database}
        collection={collection}
        currentFilter={currentFilter}
        onClose={() => setShowJSONDialog(false)}
      />

      <BSONExportDialog
        open={showBSONDialog}
        connectionId={connectionId}
        connectionName={connectionName || connectionId}
        database={database}
        collection={collection}
        onClose={() => setShowBSONDialog(false)}
      />
    </>
  )
}
