import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const OperationContext = createContext(null)

/**
 * Operation types:
 * - export: Database/collection export
 * - import: Database/collection import
 * - bulk-delete: Bulk document deletion
 */

/**
 * Operation structure:
 * {
 *   id: string,           // unique identifier
 *   type: string,         // 'export' | 'import' | 'bulk-delete'
 *   label: string,        // Human-readable label (e.g., "Exporting mydb...")
 *   progress: number | null, // 0-100 percentage, null for indeterminate
 *   destructive: boolean, // Whether this operation modifies data
 *   onCancel?: () => void, // Optional cancel handler
 *   modalOpener?: () => void, // Optional function to re-open related modal
 * }
 */

export function OperationProvider({ children }) {
  const [operations, setOperations] = useState(new Map())

  // Start tracking an operation
  const startOperation = useCallback((operation) => {
    const id = operation.id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const op = { ...operation, id }
    setOperations(prev => {
      const next = new Map(prev)
      next.set(id, op)
      return next
    })
    return id
  }, [])

  // Update operation progress
  const updateOperation = useCallback((id, updates) => {
    setOperations(prev => {
      const op = prev.get(id)
      if (!op) return prev
      const next = new Map(prev)
      next.set(id, { ...op, ...updates })
      return next
    })
  }, [])

  // Complete/remove an operation
  const completeOperation = useCallback((id) => {
    setOperations(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Check if any destructive operation is active
  const hasDestructiveOperation = Array.from(operations.values()).some(op => op.destructive)

  // Get active operations as array for display
  const activeOperations = Array.from(operations.values())

  // Prevent app close during destructive operations
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasDestructiveOperation) {
        e.preventDefault()
        e.returnValue = 'An operation is in progress. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasDestructiveOperation])

  const value = {
    operations,
    activeOperations,
    hasDestructiveOperation,
    startOperation,
    updateOperation,
    completeOperation,
  }

  return (
    <OperationContext.Provider value={value}>
      {children}
    </OperationContext.Provider>
  )
}

export function useOperation() {
  const context = useContext(OperationContext)
  if (!context) {
    throw new Error('useOperation must be used within OperationProvider')
  }
  return context
}

export default OperationContext
