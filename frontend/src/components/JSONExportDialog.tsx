import { useState, useEffect, useRef, ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useExportQueue, JSONExportOptions } from './contexts/ExportQueueContext'

// Go bindings type
interface GoApp {
  GetJSONSavePath?: (defaultFilename: string) => Promise<string | null>
}

const getGo = (): GoApp | undefined => (window as { go?: { main?: { App?: GoApp } } }).go?.main?.App

interface DialogOptions {
  pretty: boolean
  array: boolean
  useCurrentFilter: boolean
}

export interface JSONExportDialogProps {
  open: boolean
  connectionId: string
  database: string
  collection: string
  currentFilter?: string
  onClose: () => void
}

export default function JSONExportDialog({
  open,
  connectionId,
  database,
  collection,
  currentFilter,
  onClose,
}: JSONExportDialogProps): React.JSX.Element | null {
  const { queueJSONExport } = useExportQueue()
  const [options, setOptions] = useState<DialogOptions>({
    pretty: false,
    array: false,
    useCurrentFilter: false,
  })
  const [filePath, setFilePath] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Reset file path and options when dialog opens
  useEffect(() => {
    if (open) {
      setFilePath('')
      setOptions({ pretty: false, array: false, useCurrentFilter: false })
    }
  }, [open, collection])

  // Focus confirm button when file selected
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
      const defaultFilename = `${collection}-${timestamp}.json`
      const path = await getGo()?.GetJSONSavePath?.(defaultFilename)
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

    const exportOptions: JSONExportOptions = {
      pretty: options.pretty,
      array: options.array,
      filter: options.useCurrentFilter && currentFilter ? currentFilter : '',
      filePath,
    }

    queueJSONExport(connectionId, database, collection, exportOptions)
  }

  if (!open) return null

  const hasFilter = currentFilter && currentFilter !== '{}'
  const fileName = filePath ? filePath.split('/').pop() : ''

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div role="dialog" aria-modal="true" className="bg-surface-secondary text-text border border-border rounded-lg w-[400px] shadow-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text">Export as JSON</h2>
          <p className="text-xs text-text-dim mt-0.5 truncate">{database}.{collection}</p>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Save location */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Save to</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-sm text-text-secondary truncate min-w-0">
                {filePath ? (
                  <span title={filePath}>{fileName}</span>
                ) : (
                  <span className="text-text-dim italic">Choose location...</span>
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
              <p className="text-xs text-text-dim mt-1 truncate" title={filePath}>
                {filePath}
              </p>
            )}
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Format</label>
            <select
              className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm text-text-secondary focus:border-primary focus:outline-none"
              value={options.array ? 'array' : 'ndjson'}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const isArray = e.target.value === 'array'
                setOptions({ ...options, array: isArray, pretty: isArray ? options.pretty : false })
              }}
            >
              <option value="ndjson">NDJSON (one document per line)</option>
              <option value="array">JSON Array</option>
            </select>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            {options.array && (
              <label className="flex items-center gap-2.5 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border-light bg-background text-primary focus:ring-primary/50"
                  checked={options.pretty}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setOptions({ ...options, pretty: e.target.checked })
                  }
                />
                Pretty-print
              </label>
            )}

            {hasFilter && (
              <label className="flex items-center gap-2.5 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border-light bg-background text-primary focus:ring-primary/50"
                  checked={options.useCurrentFilter}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setOptions({ ...options, useCurrentFilter: e.target.checked })
                  }
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
