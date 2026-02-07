import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const DEBUG_STORAGE_KEY = 'mongopal-debug-enabled'

// Log sources
export const DEBUG_SOURCE = {
  FRONTEND: 'fe',
  BACKEND: 'be',
} as const

export type DebugSource = typeof DEBUG_SOURCE[keyof typeof DEBUG_SOURCE]

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
} as const

export type DebugCategory = typeof DEBUG_CATEGORIES[keyof typeof DEBUG_CATEGORIES]

// Category color type
interface CategoryColor {
  console: string
  ui: string
}

// Category colors for console and UI
export const CATEGORY_COLORS: Record<DebugCategory, CategoryColor> = {
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

// Log entry type
export interface DebugLogEntry {
  id: number
  timestamp: string
  source: DebugSource
  category: DebugCategory
  message: string
  details: unknown | null
}

// Context value type
export interface DebugContextValue {
  isDebugEnabled: boolean
  toggleDebug: () => void
  debugLog: (category: DebugCategory, message: string, details?: unknown | null) => void
  logs: DebugLogEntry[]
  clearLogs: () => void
}

// Provider props type
interface DebugProviderProps {
  children: React.ReactNode
}

const DebugContext = createContext<DebugContextValue | undefined>(undefined)

export function DebugProvider({ children }: DebugProviderProps): React.JSX.Element {
  const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [logs, setLogs] = useState<DebugLogEntry[]>([])
  const [maxLogs] = useState<number>(500)
  const isDebugEnabledRef = useRef<boolean>(isDebugEnabled)

  // Keep ref in sync with state for event listener
  useEffect(() => {
    isDebugEnabledRef.current = isDebugEnabled
  }, [isDebugEnabled])

  // Persist debug state and sync with backend
  useEffect(() => {
    try {
      localStorage.setItem(DEBUG_STORAGE_KEY, isDebugEnabled.toString())
      // Sync with backend
      ;(window as unknown as WailsWindow).go?.main?.App?.SetDebugEnabled?.(isDebugEnabled)
    } catch (err) {
      console.error('Failed to persist debug state:', err)
    }
  }, [isDebugEnabled])

  const toggleDebug = useCallback((): void => {
    setIsDebugEnabled(prev => !prev)
  }, [])

  /**
   * Add a log entry (internal, used by both FE and BE logging)
   */
  const addLogEntry = useCallback((source: DebugSource, category: DebugCategory, message: string, details: unknown | null = null): void => {
    const timestamp = new Date().toISOString()
    const logEntry: DebugLogEntry = {
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
   */
  const debugLog = useCallback((category: DebugCategory, message: string, details: unknown | null = null): void => {
    if (!isDebugEnabled) return
    addLogEntry(DEBUG_SOURCE.FRONTEND, category, message, details)
  }, [isDebugEnabled, addLogEntry])

  // Listen for backend debug events
  useEffect(() => {
    const runtime = (window as unknown as WailsWindow).runtime
    if (!runtime?.EventsOn) return

    const unsubscribe = runtime.EventsOn<[DebugCategory, string, unknown?]>('debug:log', (category, message, details) => {
      // Check ref for current debug state (avoids stale closure)
      if (!isDebugEnabledRef.current) return
      addLogEntry(DEBUG_SOURCE.BACKEND, category, message, details || null)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [addLogEntry])

  const clearLogs = useCallback((): void => {
    setLogs([])
  }, [])

  const value: DebugContextValue = {
    isDebugEnabled,
    toggleDebug,
    debugLog,
    logs,
    clearLogs,
  }

  return (
    <DebugContext.Provider value={value}>
      {children}
    </DebugContext.Provider>
  )
}

export function useDebug(): DebugContextValue {
  const context = useContext(DebugContext)
  if (context === undefined) {
    throw new Error('useDebug must be used within DebugProvider')
  }
  return context
}

// Return type for useDebugLog hook
interface UseDebugLogReturn {
  log: (message: string, details?: unknown | null) => void
  isDebugEnabled: boolean
}

/**
 * Convenience hook that returns a logger bound to a specific category
 */
export function useDebugLog(category: DebugCategory): UseDebugLogReturn {
  const { debugLog, isDebugEnabled } = useDebug()

  const log = useCallback((message: string, details: unknown | null = null): void => {
    debugLog(category, message, details)
  }, [debugLog, category])

  return { log, isDebugEnabled }
}

// Wails window type - cast window to this type when accessing Wails-specific properties
interface WailsWindow {
  go?: {
    main?: {
      App?: {
        SetDebugEnabled?: (enabled: boolean) => void
      }
    }
  }
  runtime?: {
    EventsOn?: <T extends unknown[]>(event: string, callback: (...args: T) => void) => (() => void) | undefined
  }
}

export default DebugContext
