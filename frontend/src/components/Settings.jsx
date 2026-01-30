import { useState, useEffect } from 'react'

const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const defaultSettings = {
  queryLimit: 50,
  autoFormat: true,
  confirmDelete: true,
  wordWrap: true,
  showLineNumbers: true,
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

export default function Settings({ onClose }) {
  const [settings, setSettings] = useState(loadSettings)

  const handleChange = (key, value) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  const handleReset = () => {
    setSettings(defaultSettings)
    saveSettings(defaultSettings)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary rounded-lg shadow-xl w-full max-w-md mx-4 border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">Settings</h2>
          <button
            className="p-1 rounded hover:bg-zinc-700"
            onClick={onClose}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Form */}
        <div className="p-4 space-y-4">
          {/* Query Limit */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Default query limit
            </label>
            <select
              className="input"
              value={settings.queryLimit}
              onChange={(e) => handleChange('queryLimit', parseInt(e.target.value, 10))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Number of documents to fetch per page
            </p>
          </div>

          {/* Toggle Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-accent focus:ring-accent"
                checked={settings.autoFormat}
                onChange={(e) => handleChange('autoFormat', e.target.checked)}
              />
              <div>
                <span className="text-sm text-zinc-300">Auto-format JSON</span>
                <p className="text-xs text-zinc-500">Automatically format JSON when viewing documents</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-accent focus:ring-accent"
                checked={settings.confirmDelete}
                onChange={(e) => handleChange('confirmDelete', e.target.checked)}
              />
              <div>
                <span className="text-sm text-zinc-300">Confirm before delete</span>
                <p className="text-xs text-zinc-500">Show confirmation dialog when deleting documents</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-accent focus:ring-accent"
                checked={settings.wordWrap}
                onChange={(e) => handleChange('wordWrap', e.target.checked)}
              />
              <div>
                <span className="text-sm text-zinc-300">Word wrap in editor</span>
                <p className="text-xs text-zinc-500">Wrap long lines in the document editor</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-accent focus:ring-accent"
                checked={settings.showLineNumbers}
                onChange={(e) => handleChange('showLineNumbers', e.target.checked)}
              />
              <div>
                <span className="text-sm text-zinc-300">Show line numbers</span>
                <p className="text-xs text-zinc-500">Display line numbers in the document editor</p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
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
