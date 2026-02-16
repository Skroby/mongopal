import { useState, useEffect, useCallback } from 'react'
import { useNotification } from '../components/NotificationContext'
import { useOperation, OperationInput } from '../components/contexts/OperationContext'
import { getErrorSummary } from '../utils/errorParser'
import { MongoDocument } from '../utils/tableViewUtils'
import type { WailsAppBindings, ExportEntry } from '../types/wails.d'

// =============================================================================
// Types
// =============================================================================

/**
 * Bulk delete progress tracking
 */
export interface BulkDeleteProgress {
  done: number
  total: number
}

export interface UseBulkActionsOptions {
  /** Connection ID */
  connectionId: string
  /** Database name */
  database: string
  /** Collection name */
  collection: string
  /** Current documents in view (used for export) */
  documents: MongoDocument[]
  /** Callback to refresh data after bulk operations */
  onRefresh: () => void
  /** Current query string (used to clear selection on change) */
  query: string
  /** Current skip value (used to clear selection on change) */
  skip: number
  /** Current limit value (used to clear selection on change) */
  limit: number
}

export interface UseBulkActionsReturn {
  // Selection state
  selectedIds: Set<string>
  setSelectedIds: (ids: Set<string>) => void

  // Delete state
  showBulkDeleteModal: boolean
  setShowBulkDeleteModal: (show: boolean) => void
  bulkDeleting: boolean
  bulkDeleteProgress: BulkDeleteProgress

  // Export state
  exporting: boolean

  // Actions
  handleBulkDelete: () => Promise<void>
  handleExport: () => Promise<void>

  // Single document delete
  deleteDoc: MongoDocument | null
  setDeleteDoc: (doc: MongoDocument | null) => void
  deleting: boolean
  handleConfirmDelete: () => Promise<void>
  handleDelete: (doc: MongoDocument) => void

  // Document comparison
  compareSourceDoc: MongoDocument | null
  setCompareSourceDoc: (doc: MongoDocument | null) => void
  showDiffView: boolean
  setShowDiffView: (show: boolean) => void
  diffTargetDoc: MongoDocument | null
  setDiffTargetDoc: (doc: MongoDocument | null) => void

  // ID helpers
  getDocIdForApi: (doc: MongoDocument) => string | null
  formatIdForShell: (idString: string) => string
}

// Get go bindings at runtime
const getGo = (): WailsAppBindings | undefined => window.go?.main?.App

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing bulk selection, deletion, export, single document delete,
 * and document comparison state in the CollectionView.
 */
export function useBulkActions({
  connectionId,
  database,
  collection,
  onRefresh,
  query,
  skip,
  limit,
}: UseBulkActionsOptions): UseBulkActionsReturn {
  const { notify } = useNotification()
  const { startOperation, updateOperation, completeOperation } = useOperation()

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Delete dialog state
  const [deleteDoc, setDeleteDoc] = useState<MongoDocument | null>(null)
  const [deleting, setDeleting] = useState<boolean>(false)

  // Bulk delete state
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false)
  const [bulkDeleting, setBulkDeleting] = useState<boolean>(false)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<BulkDeleteProgress>({
    done: 0,
    total: 0,
  })
  const [exporting, setExporting] = useState<boolean>(false)

  // Document comparison state
  const [compareSourceDoc, setCompareSourceDoc] = useState<MongoDocument | null>(null)
  const [showDiffView, setShowDiffView] = useState<boolean>(false)
  const [diffTargetDoc, setDiffTargetDoc] = useState<MongoDocument | null>(null)

  // Clear selection when query/pagination/collection changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [connectionId, database, collection, skip, limit, query])

  // Get document ID as string for API calls
  const getDocIdForApi = useCallback((doc: MongoDocument): string | null => {
    if (!doc._id) return null
    if (typeof doc._id === 'string') return doc._id
    if (typeof doc._id === 'object' && doc._id !== null && '$oid' in doc._id) {
      return (doc._id as { $oid: string }).$oid
    }
    return JSON.stringify(doc._id)
  }, [])

  // Format ID for shell-style display
  const formatIdForShell = useCallback((idString: string): string => {
    if (idString.startsWith('{')) {
      try {
        const parsed = JSON.parse(idString)
        if (parsed.$binary) {
          return `BinData(${parseInt(parsed.$binary.subType, 16) || 0}, "${parsed.$binary.base64}")`
        }
        if (parsed.$uuid) {
          return `UUID("${parsed.$uuid}")`
        }
        if (parsed.$oid) {
          return `ObjectId("${parsed.$oid}")`
        }
        return idString
      } catch {
        return idString
      }
    }
    if (/^[a-f0-9]{24}$/i.test(idString)) {
      return `ObjectId("${idString}")`
    }
    return `"${idString}"`
  }, [])

  // Open delete confirmation
  const handleDelete = useCallback((doc: MongoDocument): void => {
    setDeleteDoc(doc)
  }, [])

  // Execute single document delete
  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!deleteDoc) return
    setDeleting(true)
    try {
      const go = getGo()
      if (go?.DeleteDocument) {
        const docId = getDocIdForApi(deleteDoc)
        if (docId) {
          await go.DeleteDocument(connectionId, database, collection, docId)
          notify.success('Document deleted')
          setDeleteDoc(null)
          onRefresh()
        }
      }
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    } finally {
      setDeleting(false)
    }
  }, [deleteDoc, getDocIdForApi, connectionId, database, collection, notify, onRefresh])

  // Bulk delete - delete all selected documents sequentially
  const handleBulkDelete = useCallback(async (): Promise<void> => {
    setBulkDeleting(true)
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteProgress({ done: 0, total: idsToDelete.length })

    const opInput: OperationInput = {
      type: 'bulk-delete',
      label: `Deleting ${idsToDelete.length} docs...`,
      progress: 0,
      destructive: true,
    }
    const opId = startOperation(opInput)

    let successCount = 0
    let failCount = 0

    const go = getGo()
    for (let i = 0; i < idsToDelete.length; i++) {
      try {
        if (go?.DeleteDocument) {
          await go.DeleteDocument(connectionId, database, collection, idsToDelete[i])
          successCount++
        }
      } catch (err) {
        failCount++
        console.error(`Failed to delete ${idsToDelete[i]}:`, err)
      }
      const progress = Math.round(((i + 1) / idsToDelete.length) * 100)
      setBulkDeleteProgress({ done: i + 1, total: idsToDelete.length })
      updateOperation(opId, { progress, label: `Deleting ${i + 1}/${idsToDelete.length}...` })
    }

    completeOperation(opId)
    setBulkDeleting(false)
    setShowBulkDeleteModal(false)
    setSelectedIds(new Set())

    if (failCount === 0) {
      notify.success(`Deleted ${successCount} document${successCount !== 1 ? 's' : ''}`)
    } else {
      notify.warning(`Deleted ${successCount}, failed ${failCount}`)
    }

    onRefresh()
  }, [
    selectedIds,
    startOperation,
    connectionId,
    database,
    collection,
    updateOperation,
    completeOperation,
    notify,
    onRefresh,
  ])

  // Export selected documents as ZIP
  const handleExport = useCallback(async (): Promise<void> => {
    setExporting(true)
    try {
      const entries: ExportEntry[] = []
      const idsToExport = Array.from(selectedIds)

      const go = getGo()
      for (const docId of idsToExport) {
        try {
          if (go?.GetDocument) {
            const jsonStr = await go.GetDocument(connectionId, database, collection, docId)
            entries.push({
              database,
              collection,
              docId,
              json: jsonStr,
            })
          }
        } catch (err) {
          console.error(`Failed to fetch document ${docId}:`, err)
        }
      }

      if (entries.length === 0) {
        notify.error('No documents to export')
        return
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const defaultFilename = `${collection}-export-${timestamp}.zip`

      if (go?.ExportDocumentsAsZip) {
        await go.ExportDocumentsAsZip(entries, defaultFilename)
        notify.success(`Exported ${entries.length} document${entries.length !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      notify.error(getErrorSummary(err instanceof Error ? err.message : String(err)))
    } finally {
      setExporting(false)
    }
  }, [selectedIds, connectionId, database, collection, notify])

  return {
    // Selection
    selectedIds,
    setSelectedIds,

    // Bulk delete
    showBulkDeleteModal,
    setShowBulkDeleteModal,
    bulkDeleting,
    bulkDeleteProgress,

    // Export
    exporting,

    // Actions
    handleBulkDelete,
    handleExport,

    // Single document delete
    deleteDoc,
    setDeleteDoc,
    deleting,
    handleConfirmDelete,
    handleDelete,

    // Document comparison
    compareSourceDoc,
    setCompareSourceDoc,
    showDiffView,
    setShowDiffView,
    diffTargetDoc,
    setDiffTargetDoc,

    // ID helpers
    getDocIdForApi,
    formatIdForShell,
  }
}

export default useBulkActions
