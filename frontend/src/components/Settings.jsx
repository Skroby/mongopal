import { useState, useEffect, useRef } from 'react'
import { useDebug, DEBUG_CATEGORIES, CATEGORY_COLORS, DEBUG_SOURCE } from './contexts/DebugContext'

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// Tab icons
const GeneralIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
)

const EditorIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

const SafetyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
)

const DeveloperIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
)

const defaultSettings = {
  queryLimit: 50,
  queryTimeout: 30, // seconds, 0 = no timeout
  autoFormat: true,
  confirmDelete: true,
  wordWrap: true,
  showLineNumbers: true,
  freezeIdColumn: false,
}

const STORAGE_KEY = 'mongopal-settings'

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) }
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
  return defaultSettings
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
}

// Tab button component
function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors w-full text-left ${
        active
          ? 'bg-zinc-700 text-zinc-100'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// Toggle setting component
function ToggleSetting({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input
        type="checkbox"
        className="w-4 h-4 mt-0.5 rounded bg-zinc-700 border-zinc-600 text-accent focus:ring-accent flex-shrink-0"
        checked={checked}
        onChange={onChange}
      />
      <div>
        <span className="text-sm text-zinc-200">{label}</span>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

// Select setting component
function SelectSetting({ label, description, value, onChange, options }) {
  return (
    <div className="py-2">
      <label className="block text-sm text-zinc-200 mb-1.5">{label}</label>
      <select
        className="input w-full"
        value={value}
        onChange={onChange}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {description && <p className="text-xs text-zinc-500 mt-1.5">{description}</p>}
    </div>
  )
}

// General tab content
function GeneralTab({ settings, onChange }) {
  return (
    <div className="space-y-4">
      <SelectSetting
        label="Default query limit"
        description="Number of documents to fetch per page"
        value={settings.queryLimit}
        onChange={(e) => onChange('queryLimit', parseInt(e.target.value, 10))}
        options={[
          { value: 10, label: '10' },
          { value: 25, label: '25' },
          { value: 50, label: '50' },
          { value: 100, label: '100' },
          { value: 200, label: '200' },
          { value: 500, label: '500' },
        ]}
      />
      <SelectSetting
        label="Query timeout"
        description="Cancel queries that take longer than this"
        value={settings.queryTimeout}
        onChange={(e) => onChange('queryTimeout', parseInt(e.target.value, 10))}
        options={[
          { value: 0, label: 'No timeout' },
          { value: 15, label: '15 seconds' },
          { value: 30, label: '30 seconds' },
          { value: 60, label: '1 minute' },
          { value: 120, label: '2 minutes' },
          { value: 300, label: '5 minutes' },
        ]}
      />
    </div>
  )
}

// Editor tab content
function EditorTab({ settings, onChange }) {
  return (
    <div className="space-y-1">
      <ToggleSetting
        checked={settings.freezeIdColumn}
        onChange={(e) => onChange('freezeIdColumn', e.target.checked)}
        label="Freeze _id column"
        description="Keep the _id column visible when scrolling horizontally"
      />
      <ToggleSetting
        checked={settings.autoFormat}
        onChange={(e) => onChange('autoFormat', e.target.checked)}
        label="Auto-format JSON"
        description="Automatically format JSON when viewing documents"
      />
      <ToggleSetting
        checked={settings.wordWrap}
        onChange={(e) => onChange('wordWrap', e.target.checked)}
        label="Word wrap in editor"
        description="Wrap long lines in the document editor"
      />
      <ToggleSetting
        checked={settings.showLineNumbers}
        onChange={(e) => onChange('showLineNumbers', e.target.checked)}
        label="Show line numbers"
        description="Display line numbers in the document editor"
      />
    </div>
  )
}

// Safety tab content
function SafetyTab({ settings, onChange }) {
  return (
    <div className="space-y-1">
      <ToggleSetting
        checked={settings.confirmDelete}
        onChange={(e) => onChange('confirmDelete', e.target.checked)}
        label="Confirm before delete"
        description="Show confirmation dialog when deleting documents"
      />
    </div>
  )
}

// Expandable log entry component
function LogEntry({ log }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasDetails = log.details !== null && log.details !== undefined

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const categoryColor = CATEGORY_COLORS[log.category]?.ui || 'text-zinc-400'
  const source = log.source || DEBUG_SOURCE.FRONTEND
  const isBackend = source === DEBUG_SOURCE.BACKEND

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <div
        className={`flex gap-2 py-1 leading-tight ${hasDetails ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        {/* Expand indicator */}
        <span className="text-zinc-600 w-3 flex-shrink-0">
          {hasDetails && (
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </span>
        {/* Source indicator */}
        <span className={`flex-shrink-0 w-5 text-center rounded text-[10px] font-medium ${
          isBackend ? 'bg-cyan-900/50 text-cyan-400' : 'bg-zinc-700/50 text-zinc-400'
        }`}>
          {isBackend ? 'BE' : 'FE'}
        </span>
        <span className="text-zinc-600 flex-shrink-0">{formatTime(log.timestamp)}</span>
        <span className={`flex-shrink-0 ${categoryColor}`}>
          [{log.category}]
        </span>
        <span className="text-zinc-300 truncate flex-1">{log.message}</span>
      </div>
      {/* Expandable details */}
      {isExpanded && hasDetails && (
        <div className="ml-5 pl-3 pb-2 border-l border-zinc-700">
          <pre className="text-zinc-500 text-[10px] whitespace-pre-wrap break-all">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// Developer tab content with debug log viewer
function DeveloperTab() {
  const { isDebugEnabled, toggleDebug, logs, clearLogs } = useDebug()
  const logContainerRef = useRef(null)
  const [copySuccess, setCopySuccess] = useState(false)

  // Format logs for export (with all details expanded)
  const formatLogsForExport = () => {
    return logs.map(log => ({
      timestamp: log.timestamp,
      source: log.source || 'fe',
      category: log.category,
      message: log.message,
      ...(log.details && { details: log.details }),
    }))
  }

  const handleCopyAll = async () => {
    const exportData = formatLogsForExport()
    const text = JSON.stringify(exportData, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy logs:', err)
    }
  }

  const handleSaveToFile = async () => {
    const exportData = formatLogsForExport()
    const text = JSON.stringify(exportData, null, 2)
    const defaultFilename = `mongopal-debug-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`

    try {
      const go = window.go?.main?.App
      if (go?.SaveDebugLogs) {
        await go.SaveDebugLogs(text, defaultFilename)
      } else {
        // Fallback for dev mode
        const blob = new Blob([text], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = defaultFilename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Failed to save logs:', err)
    }
  }

  return (
    <div className="space-y-4">
      <ToggleSetting
        checked={isDebugEnabled}
        onChange={toggleDebug}
        label="Debug logging"
        description="Log detailed debug information (also visible in browser console)"
      />

      {/* Debug log viewer */}
      <div className="border-t border-zinc-700 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-300">Debug Logs</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{logs.length} entries</span>
            {logs.length > 0 && (
              <>
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                  onClick={handleCopyAll}
                  title="Copy all logs to clipboard"
                >
                  {copySuccess ? (
                    <>
                      <CheckIcon className="w-3 h-3 text-accent" />
                      <span className="text-accent">Copied</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                  onClick={handleSaveToFile}
                  title="Save logs to file"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Save</span>
                </button>
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  onClick={clearLogs}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="bg-zinc-900 rounded border border-zinc-700 h-56 overflow-y-auto font-mono text-xs"
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              {isDebugEnabled ? 'No logs yet. Interact with the app to generate logs.' : 'Enable debug logging to see logs here.'}
            </div>
          ) : (
            <div className="p-2">
              {logs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>

        {isDebugEnabled && (
          <p className="text-xs text-zinc-500 mt-2">
            Click entries with details to expand. Also logged to browser console.
          </p>
        )}
      </div>
    </div>
  )
}

export default function Settings({ onClose }) {
  const [activeTab, setActiveTab] = useState('general')
  const [settings, setSettings] = useState(loadSettings)
  const [showSaved, setShowSaved] = useState(false)
  const savedTimeoutRef = useRef(null)

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
      }
    }
  }, [])

  const handleChange = (key, value) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    saveSettings(newSettings)

    // Show saved indicator
    setShowSaved(true)
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current)
    }
    savedTimeoutRef.current = setTimeout(() => {
      setShowSaved(false)
    }, 1500)
  }

  const handleReset = () => {
    setSettings(defaultSettings)
    saveSettings(defaultSettings)

    // Show saved indicator
    setShowSaved(true)
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current)
    }
    savedTimeoutRef.current = setTimeout(() => {
      setShowSaved(false)
    }, 1500)
  }

  const tabs = [
    { id: 'general', label: 'General', icon: <GeneralIcon /> },
    { id: 'editor', label: 'Editor', icon: <EditorIcon /> },
    { id: 'safety', label: 'Safety', icon: <SafetyIcon /> },
    { id: 'developer', label: 'Developer', icon: <DeveloperIcon /> },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-border flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Settings</h2>
            <div
              className={`flex items-center gap-1 text-sm text-accent transition-opacity duration-200 ${
                showSaved ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <CheckIcon className="w-4 h-4" />
              <span>Saved</span>
            </div>
          </div>
          <button
            className="icon-btn p-1 hover:bg-zinc-700"
            onClick={onClose}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content with sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-40 border-r border-border p-2 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <TabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 p-4 overflow-y-auto">
            {activeTab === 'general' && (
              <GeneralTab settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'editor' && (
              <EditorTab settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'safety' && (
              <SafetyTab settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'developer' && (
              <DeveloperTab />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface flex-shrink-0">
          <button
            className="btn btn-ghost text-zinc-400"
            onClick={handleReset}
          >
            Reset to defaults
          </button>
          <button
            className="btn btn-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
