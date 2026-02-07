import { useState, useEffect, useRef, ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useExportQueue, CSVExportOptions } from './contexts/ExportQueueContext'

// Go bindings type
interface GoApp {
  GetCSVSavePath?: (defaultFilename: string) => Promise<string | null>
}

// Access go at call time, not module load time (bindings may not be ready yet)
const getGo = (): GoApp | undefined => (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

interface DialogOptions {
  delimiter: string
  includeHeaders: boolean
  flattenArrays: boolean
  useCurrentFilter: boolean
}

export interface CSVExportDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** The connection ID to export from */
  connectionId: string
  /** The database name */
  database: string
  /** The collection name */
  collection: string
  /** The current filter applied to the collection view */
  currentFilter?: string
  /** Callback when the dialog is closed */
  onClose: () => void
}

export default function CSVExportDialog({
  open,
  connectionId,
  database,
  collection,
  currentFilter,
  onClose,
}: CSVExportDialogProps): React.JSX.Element | null {
  const { queueCSVExport } = useExportQueue()
  const [options, setOptions] = useState<DialogOptions>({
    delimiter: ',',
    includeHeaders: true,
    flattenArrays: true,
    useCurrentFilter: false,
  })
  const [filePath, setFilePath] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Reset file path when dialog opens with new collection
  useEffect(() => {
    if (open) {
      setFilePath('')
    }
  }, [open, collection])

  // Focus confirm button when opened
  useEffect(() => {
    if (open && confirmRef.current && filePath) {
      confirmRef.current.focus()
    }
  }, [open, filePath])

  // Handle Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const handleBrowse = async (): Promise<void> => {
    setBrowsing(true)
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultFilename = `${collection}-${timestamp}.csv`
      const path = await getGo()?.GetCSVSavePath?.(defaultFilename)
      if (path) {
        setFilePath(path)
      }
    } catch (err) {
      console.error('Failed to get save path:', err)
    } finally {
      setBrowsing(false)
    }
  }

  const handleExport = (): void => {
    if (!filePath) return

    onClose()

    const exportOptions: CSVExportOptions = {
      delimiter: options.delimiter,
      includeHeaders: options.includeHeaders,
      flattenArrays: options.flattenArrays,
      filter: options.useCurrentFilter && currentFilter ? currentFilter : '',
      filePath,
    }

    queueCSVExport(connectionId, database, collection, exportOptions)
  }

  const handleDelimiterChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    setOptions({ ...options, delimiter: e.target.value })
  }

  const handleIncludeHeadersChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setOptions({ ...options, includeHeaders: e.target.checked })
  }

  const handleFlattenArraysChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setOptions({ ...options, flattenArrays: e.target.checked })
  }

  const handleUseCurrentFilterChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setOptions({ ...options, useCurrentFilter: e.target.checked })
  }

  if (!open) return null

  const hasFilter = currentFilter && currentFilter !== '{}'
  const fileName = filePath ? filePath.split('/').pop() : ''

  // Use portal to escape any parent transforms that break fixed positioning
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-surface-secondary border border-border rounded-lg w-[400px] shadow-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-zinc-100">Export as CSV</h2>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{database}.{collection}</p>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Save location */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Save to</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-300 truncate min-w-0">
                {filePath ? (
                  <span title={filePath}>{fileName}</span>
                ) : (
                  <span className="text-zinc-500 italic">Choose location...</span>
                )}
              </div>
              <button
                className="btn btn-secondary px-3 whitespace-nowrap"
                onClick={handleBrowse}
                disabled={browsing}
              >
                {browsing ? 'Opening...' : 'Browse...'}
              </button>
            </div>
            {filePath && (
              <p className="text-xs text-zinc-500 mt-1 truncate" title={filePath}>
                {filePath}
              </p>
            )}
          </div>

          {/* Delimiter */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Delimiter</label>
            <select
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-300 focus:border-accent focus:outline-none"
              value={options.delimiter}
              onChange={handleDelimiterChange}
            >
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value="\t">Tab</option>
              <option value="|">Pipe (|)</option>
            </select>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-accent focus:ring-accent/50"
                checked={options.includeHeaders}
                onChange={handleIncludeHeadersChange}
              />
              Include headers
            </label>

            <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-accent focus:ring-accent/50"
                checked={options.flattenArrays}
                onChange={handleFlattenArraysChange}
              />
              Flatten arrays
            </label>

            {hasFilter && (
              <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-accent focus:ring-accent/50"
                  checked={options.useCurrentFilter}
                  onChange={handleUseCurrentFilterChange}
                />
                Apply current filter
              </label>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className="btn btn-primary"
            onClick={handleExport}
            disabled={!filePath}
          >
            Add to Queue
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
