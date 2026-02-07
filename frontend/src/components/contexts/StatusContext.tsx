import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// Type definitions
export interface StatusContextValue {
  documentCount: number | null
  queryTime: number | null
  updateDocumentStatus: (count: number | null, time: number | null) => void
  clearStatus: () => void
}

interface StatusProviderProps {
  children: ReactNode
}

const StatusContext = createContext<StatusContextValue | undefined>(undefined)

export function StatusProvider({ children }: StatusProviderProps): React.JSX.Element {
  // Document count for current collection view
  const [documentCount, setDocumentCount] = useState<number | null>(null)
  // Query execution time
  const [queryTime, setQueryTime] = useState<number | null>(null)

  // Update document count (called by CollectionView)
  const updateDocumentStatus = useCallback((count: number | null, time: number | null): void => {
    setDocumentCount(count)
    setQueryTime(time)
  }, [])

  // Clear status (called when no collection is active)
  const clearStatus = useCallback((): void => {
    setDocumentCount(null)
    setQueryTime(null)
  }, [])

  const value: StatusContextValue = {
    documentCount,
    queryTime,
    updateDocumentStatus,
    clearStatus,
  }

  return (
    <StatusContext.Provider value={value}>
      {children}
    </StatusContext.Provider>
  )
}

export function useStatus(): StatusContextValue {
  const context = useContext(StatusContext)
  if (context === undefined) {
    throw new Error('useStatus must be used within StatusProvider')
  }
  return context
}

export default StatusContext
