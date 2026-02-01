import { createContext, useContext, useState, useCallback } from 'react'

const StatusContext = createContext(null)

export function StatusProvider({ children }) {
  // Document count for current collection view
  const [documentCount, setDocumentCount] = useState(null)
  // Query execution time
  const [queryTime, setQueryTime] = useState(null)

  // Update document count (called by CollectionView)
  const updateDocumentStatus = useCallback((count, time) => {
    setDocumentCount(count)
    setQueryTime(time)
  }, [])

  // Clear status (called when no collection is active)
  const clearStatus = useCallback(() => {
    setDocumentCount(null)
    setQueryTime(null)
  }, [])

  const value = {
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

export function useStatus() {
  const context = useContext(StatusContext)
  if (!context) {
    throw new Error('useStatus must be used within StatusProvider')
  }
  return context
}

export default StatusContext
