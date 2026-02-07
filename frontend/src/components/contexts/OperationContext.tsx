import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

/**
 * Operation types:
 * - export: Database/collection export
 * - import: Database/collection import
 * - bulk-delete: Bulk document deletion
 */
export type OperationType = 'export' | 'import' | 'bulk-delete'

/**
 * Operation structure
 */
export interface Operation {
  id: string
  type: OperationType
  label: string
  progress: number | null  // 0-100 percentage, null for indeterminate
  destructive: boolean     // Whether this operation modifies data
  onCancel?: () => void    // Optional cancel handler
  modalOpener?: () => void // Optional function to re-open related modal
}

/**
 * Input for starting an operation (id is optional, will be auto-generated)
 */
export interface OperationInput {
  id?: string
  type: OperationType
  label: string
  progress?: number | null
  destructive: boolean
  onCancel?: () => void
  modalOpener?: () => void
}

/**
 * Partial updates for an operation
 */
export interface OperationUpdate {
  label?: string
  progress?: number | null
  destructive?: boolean
  onCancel?: () => void
  modalOpener?: () => void
}

/**
 * Context value interface
 */
export interface OperationContextValue {
  operations: Map<string, Operation>
  activeOperations: Operation[]
  hasDestructiveOperation: boolean
  startOperation: (operation: OperationInput) => string
  updateOperation: (id: string, updates: OperationUpdate) => void
  completeOperation: (id: string) => void
}

/**
 * Provider props interface
 */
interface OperationProviderProps {
  children: ReactNode
}

const OperationContext = createContext<OperationContextValue | undefined>(undefined)

export function OperationProvider({ children }: OperationProviderProps): JSX.Element {
  const [operations, setOperations] = useState<Map<string, Operation>>(new Map())

  // Start tracking an operation
  const startOperation = useCallback((operation: OperationInput): string => {
    const id = operation.id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const op: Operation = {
      ...operation,
      id,
      progress: operation.progress ?? null,
    }
    setOperations(prev => {
      const next = new Map(prev)
      next.set(id, op)
      return next
    })
    return id
  }, [])

  // Update operation progress
  const updateOperation = useCallback((id: string, updates: OperationUpdate): void => {
    setOperations(prev => {
      const op = prev.get(id)
      if (!op) return prev
      const next = new Map(prev)
      next.set(id, { ...op, ...updates })
      return next
    })
  }, [])

  // Complete/remove an operation
  const completeOperation = useCallback((id: string): void => {
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
    const handleBeforeUnload = (e: BeforeUnloadEvent): string | undefined => {
      if (hasDestructiveOperation) {
        e.preventDefault()
        e.returnValue = 'An operation is in progress. Are you sure you want to leave?'
        return e.returnValue
      }
      return undefined
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasDestructiveOperation])

  const value: OperationContextValue = {
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

export function useOperation(): OperationContextValue {
  const context = useContext(OperationContext)
  if (!context) {
    throw new Error('useOperation must be used within OperationProvider')
  }
  return context
}

export default OperationContext
