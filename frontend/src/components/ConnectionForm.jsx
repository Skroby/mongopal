import { useState, useEffect, useRef } from 'react'
import { parseError } from '../utils/errorParser'

const go = window.go?.main?.App

const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const colors = [
  '', // No color (default)
  '#4CC38A', // Green
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
]

export default function ConnectionForm({ connection, folders = [], onSave, onCancel }) {
  const isEditing = !!connection

  const [name, setName] = useState(connection?.name || '')
  const [uri, setUri] = useState(connection?.uri || 'mongodb://localhost:27017')
  const [color, setColor] = useState(connection?.color || '')
  const [folderId, setFolderId] = useState(connection?.folderId || '')
  const [readOnly, setReadOnly] = useState(connection?.readOnly || false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showUri, setShowUri] = useState(false)

  // Track which fields have been touched for inline validation
  const [touched, setTouched] = useState({ name: false, uri: false })

  // Validation helper functions
  const validateName = (value) => {
    if (!value.trim()) return 'Connection name is required'
    if (value.trim().length < 2) return 'Name must be at least 2 characters'
    return null
  }

  const validateUri = (value) => {
    if (!value.trim()) return 'Connection URI is required'
    if (!value.trim().startsWith('mongodb://') && !value.trim().startsWith('mongodb+srv://')) {
      return 'URI must start with mongodb:// or mongodb+srv://'
    }
    return null
  }

  // Get current validation errors
  const nameError = validateName(name)
  const uriError = validateUri(uri)

  // Mark field as touched on blur
  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  const modalRef = useRef(null)

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  // Focus trap - keep focus within modal
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return

      const focusableElements = modal.querySelectorAll(focusableSelector)
      const focusable = Array.from(focusableElements).filter(
        el => !el.disabled && el.offsetParent !== null
      )

      if (focusable.length === 0) return

      const firstElement = focusable[0]
      const lastElement = focusable[focusable.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleTabKey)
    return () => modal.removeEventListener('keydown', handleTabKey)
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      if (go?.TestConnection) {
        await go.TestConnection(uri)
        setTestResult({ success: true, message: 'Connection successful!' })
      } else {
        setTestResult({ success: true, message: 'Test skipped (dev mode)' })
      }
    } catch (err) {
      const parsed = parseError(err.message || 'Connection failed')
      setTestResult({
        success: false,
        message: parsed.friendlyMessage,
        hint: parsed.isKnown ? parsed.hint : null,
        rawError: parsed.raw,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    // Mark all fields as touched to show any validation errors
    setTouched({ name: true, uri: true })

    // Don't save if there are validation errors
    if (nameError || uriError) return

    setSaving(true)
    try {
      const conn = {
        id: connection?.id || crypto.randomUUID(),
        name: name.trim(),
        uri: uri.trim(),
        color,
        folderId,
        readOnly,
        createdAt: connection?.createdAt || new Date().toISOString(),
      }
      // Extract password from URI for secure storage
      // For now, pass empty string - actual password extraction in Phase 2
      await onSave(conn, '')
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div ref={modalRef} className="bg-surface-secondary rounded-lg shadow-xl w-full max-w-lg mx-4 border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">
            {isEditing ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button
            className="icon-btn p-1 hover:bg-zinc-700"
            onClick={onCancel}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Connection name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Connection name
            </label>
            <input
              type="text"
              className={`input ${touched.name && nameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              placeholder="My MongoDB"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleBlur('name')}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {touched.name && nameError && (
              <p className="mt-1 text-xs text-red-400">{nameError}</p>
            )}
          </div>

          {/* Folder selection */}
          {folders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Folder
              </label>
              <select
                className="input"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">No folder</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Tab Color
            </label>
            <div className="flex gap-2" role="radiogroup" aria-label="Connection color">
              {colors.map((c, i) => (
                <button
                  key={c || 'none'}
                  className={`color-btn w-6 h-6 rounded-full border-2 transition-all ${
                    color === c ? 'border-white scale-110' : 'border-transparent'
                  } ${!c ? 'bg-zinc-700 flex items-center justify-center' : ''}`}
                  style={c ? { backgroundColor: c } : undefined}
                  onClick={() => setColor(c)}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c ? `Color ${c}` : 'No color'}
                  title={c ? undefined : 'No color'}
                >
                  {!c && <span className="text-zinc-500 text-xs">∅</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Read-only mode */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-accent focus:ring-accent"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
              />
              <div>
                <span className="text-sm text-zinc-300">Read-only mode</span>
                <p className="text-xs text-zinc-400">Disable all write operations (insert, update, delete)</p>
              </div>
            </label>
          </div>

          {/* Connection URI */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Connection URI
            </label>
            <div className="relative">
              <input
                type={showUri ? "text" : "password"}
                className={`input font-mono text-sm pr-10 ${touched.uri && uriError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                placeholder="mongodb://localhost:27017"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                onBlur={() => handleBlur('uri')}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="icon-btn absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                onClick={() => setShowUri(!showUri)}
                title={showUri ? "Hide URI" : "Show URI"}
              >
                {showUri ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {touched.uri && uriError ? (
              <p className="mt-1 text-xs text-red-400">{uriError}</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-400">
                Full MongoDB connection string including credentials
              </p>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`p-3 rounded text-sm ${
                testResult.success
                  ? 'bg-green-900/30 text-green-400 border border-green-800'
                  : 'bg-red-900/30 text-red-400 border border-red-800'
              }`}
            >
              <div className="font-medium">{testResult.message}</div>
              {testResult.hint && (
                <div className="mt-1 text-red-400/80 text-xs">{testResult.hint}</div>
              )}
              {testResult.rawError && testResult.rawError !== testResult.message && (
                <details className="mt-2">
                  <summary className="text-xs text-red-400/60 cursor-pointer hover:text-red-400/80">
                    Show details
                  </summary>
                  <pre className="mt-1 text-xs text-red-400/60 whitespace-pre-wrap break-words font-mono">
                    {testResult.rawError}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
          <button
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={testing || !uri.trim()}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          <div className="flex gap-2">
            <button
              className="btn btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !!nameError || !!uriError}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
