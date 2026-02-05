import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const DebugContext = createContext(null)

const DEBUG_STORAGE_KEY = 'mongopal-debug-enabled'

// Log sources
export const DEBUG_SOURCE = {
  FRONTEND: 'fe',
  BACKEND: 'be',
}

// Log categories for filtering
export const DEBUG_CATEGORIES = {
  CONNECTION: 'connection',
  QUERY: 'query',
  DOCUMENT: 'document',
  SCHEMA: 'schema',
  EXPORT: 'export',
  IMPORT: 'import',
  UI: 'ui',
  WAILS: 'wails',
  PERFORMANCE: 'performance',
}

// Category colors for console and UI
export const CATEGORY_COLORS = {
  [DEBUG_CATEGORIES.CONNECTION]: { console: '#4CC38A', ui: 'text-emerald-400' },
  [DEBUG_CATEGORIES.QUERY]: { console: '#60A5FA', ui: 'text-blue-400' },
  [DEBUG_CATEGORIES.DOCUMENT]: { console: '#818CF8', ui: 'text-indigo-400' },
  [DEBUG_CATEGORIES.SCHEMA]: { console: '#F472B6', ui: 'text-pink-300' },
  [DEBUG_CATEGORIES.EXPORT]: { console: '#F59E0B', ui: 'text-amber-400' },
  [DEBUG_CATEGORIES.IMPORT]: { console: '#A78BFA', ui: 'text-purple-400' },
  [DEBUG_CATEGORIES.UI]: { console: '#EC4899', ui: 'text-pink-400' },
  [DEBUG_CATEGORIES.WAILS]: { console: '#14B8A6', ui: 'text-teal-400' },
  [DEBUG_CATEGORIES.PERFORMANCE]: { console: '#F97316', ui: 'text-orange-400' },
}

export function DebugProvider({ children }) {
  const [isDebugEnabled, setIsDebugEnabled] = useState(() => {
    try {
      return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [logs, setLogs] = useState([])
  const [maxLogs] = useState(500)
  const isDebugEnabledRef = useRef(isDebugEnabled)

  // Keep ref in sync with state for event listener
  useEffect(() => {
    isDebugEnabledRef.current = isDebugEnabled
  }, [isDebugEnabled])

  // Persist debug state and sync with backend
  useEffect(() => {
    try {
      localStorage.setItem(DEBUG_STORAGE_KEY, isDebugEnabled.toString())
      // Sync with backend
      window.go?.main?.App?.SetDebugEnabled?.(isDebugEnabled)
    } catch (err) {
      console.error('Failed to persist debug state:', err)
    }
  }, [isDebugEnabled])

  const toggleDebug = useCallback(() => {
    setIsDebugEnabled(prev => !prev)
  }, [])

  /**
   * Add a log entry (internal, used by both FE and BE logging)
   */
  const addLogEntry = useCallback((source, category, message, details = null) => {
    const timestamp = new Date().toISOString()
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp,
      source,
      category,
      message,
      details,
    }

    // Console output with styling
    const color = CATEGORY_COLORS[category]?.console || '#9CA3AF'
    const sourceLabel = source === DEBUG_SOURCE.BACKEND ? 'BE' : 'FE'

    if (details !== null) {
      console.groupCollapsed(
        `%c[${sourceLabel}]%c[${category.toUpperCase()}]%c ${message}`,
        'color: #6B7280; font-weight: bold',
        `color: ${color}; font-weight: bold`,
        'color: inherit'
      )
      console.log(details)
      console.groupEnd()
    } else {
      console.log(
        `%c[${sourceLabel}]%c[${category.toUpperCase()}]%c ${message}`,
        'color: #6B7280; font-weight: bold',
        `color: ${color}; font-weight: bold`,
        'color: inherit'
      )
    }

    // Store in memory
    setLogs(prev => {
      const newLogs = [logEntry, ...prev]
      return newLogs.slice(0, maxLogs)
    })
  }, [maxLogs])

  /**
   * Log a debug message with optional details (frontend)
   * @param {string} category - One of DEBUG_CATEGORIES
   * @param {string} message - Short one-liner summary
   * @param {object|null} details - Optional expandable details object
   */
  const debugLog = useCallback((category, message, details = null) => {
    if (!isDebugEnabled) return
    addLogEntry(DEBUG_SOURCE.FRONTEND, category, message, details)
  }, [isDebugEnabled, addLogEntry])

  // Listen for backend debug events
  useEffect(() => {
    const runtime = window.runtime
    if (!runtime?.EventsOn) return

    const unsubscribe = runtime.EventsOn('debug:log', (category, message, details) => {
      // Check ref for current debug state (avoids stale closure)
      if (!isDebugEnabledRef.current) return
      addLogEntry(DEBUG_SOURCE.BACKEND, category, message, details || null)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [addLogEntry])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return (
    <DebugContext.Provider value={{
      isDebugEnabled,
      toggleDebug,
      debugLog,
      logs,
      clearLogs,
    }}>
      {children}
    </DebugContext.Provider>
  )
}

export function useDebug() {
  const context = useContext(DebugContext)
  if (!context) {
    throw new Error('useDebug must be used within DebugProvider')
  }
  return context
}

/**
 * Convenience hook that returns a logger bound to a specific category
 * @param {string} category - One of DEBUG_CATEGORIES
 * @returns {{ log: function, isDebugEnabled: boolean }}
 */
export function useDebugLog(category) {
  const { debugLog, isDebugEnabled } = useDebug()

  const log = useCallback((message, details = null) => {
    debugLog(category, message, details)
  }, [debugLog, category])

  return { log, isDebugEnabled }
}

export default DebugContext
