import { useState, useRef, useEffect } from 'react'
import { useNotification } from './NotificationContext'

// Access window.go dynamically for testability
const getGo = () => window.go?.main?.App

const DownloadIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const ChevronDownIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

export default function CSVExportButton({ connectionId, database, collection, currentFilter }) {
  const { notify } = useNotification()
  const [showOptions, setShowOptions] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [options, setOptions] = useState({
    delimiter: ',',
    includeHeaders: true,
    flattenArrays: true,
    useCurrentFilter: false,
  })
  const popoverRef = useRef(null)

  // Close popover on click outside
  useEffect(() => {
    if (!showOptions) return
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowOptions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showOptions])

  // Close on Escape
  useEffect(() => {
    if (!showOptions) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowOptions(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showOptions])

  const handleExport = async () => {
    setExporting(true)
    setShowOptions(false)

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultFilename = `${collection}-${timestamp}.csv`

      const csvOptions = {
        delimiter: options.delimiter,
        includeHeaders: options.includeHeaders,
        flattenArrays: options.flattenArrays,
        filter: options.useCurrentFilter && currentFilter ? currentFilter : '',
      }

      const go = getGo()
      if (go?.ExportCollectionAsCSV) {
        await go.ExportCollectionAsCSV(connectionId, database, collection, defaultFilename, csvOptions)
        notify.success('CSV exported successfully')
      }
    } catch (err) {
      const errorMsg = err?.message || String(err)
      // Don't show error for user cancellation
      if (!errorMsg.toLowerCase().includes('cancel')) {
        notify.error(`CSV export failed: ${errorMsg}`)
      }
    } finally {
      setExporting(false)
    }
  }

  const handleQuickExport = () => {
    // Quick export with default options
    handleExport()
  }

  return (
    <div className="relative flex items-center" ref={popoverRef}>
      {/* Icon-only export button */}
      <button
        className={`icon-btn p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 ${exporting ? 'animate-pulse' : ''}`}
        onClick={() => setShowOptions(!showOptions)}
        disabled={exporting}
        title="Export as CSV"
      >
        <DownloadIcon className="w-4 h-4" />
      </button>

      {/* Options popover */}
      {showOptions && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 p-3">
          <div className="space-y-3">
            {/* Quick export option */}
            <button
              className="btn btn-primary w-full flex items-center justify-center gap-2"
              onClick={handleQuickExport}
              disabled={exporting}
            >
              <DownloadIcon className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export Now'}
            </button>

            <div className="border-t border-zinc-700 pt-3">
              <div className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Export Options</div>

              {/* Delimiter */}
              <div className="mb-2">
                <label className="block text-xs text-zinc-400 mb-1">Delimiter</label>
                <select
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
                  value={options.delimiter}
                  onChange={(e) => setOptions({ ...options, delimiter: e.target.value })}
                >
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="\t">Tab</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-accent focus:ring-accent/50"
                    checked={options.includeHeaders}
                    onChange={(e) => setOptions({ ...options, includeHeaders: e.target.checked })}
                  />
                  Include column headers
                </label>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-accent focus:ring-accent/50"
                    checked={options.flattenArrays}
                    onChange={(e) => setOptions({ ...options, flattenArrays: e.target.checked })}
                  />
                  Flatten arrays (join with ;)
                </label>

                {currentFilter && currentFilter !== '{}' && (
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-accent focus:ring-accent/50"
                      checked={options.useCurrentFilter}
                      onChange={(e) => setOptions({ ...options, useCurrentFilter: e.target.checked })}
                    />
                    Apply current filter
                  </label>
                )}
              </div>

              {/* Export with options button */}
              <button
                className="btn btn-secondary w-full mt-3"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export with Options'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
