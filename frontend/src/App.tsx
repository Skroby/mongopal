import { useState, useEffect, CSSProperties } from 'react'
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime'
import Sidebar from './components/sidebar'
import TabBar from './components/TabBar'
import CollectionView from './components/CollectionView'
import DocumentEditView from './components/DocumentEditView'
import SchemaView from './components/SchemaView'
import IndexView from './components/IndexView'
import { ConnectionFormV2 } from './components/connection-form/ConnectionFormV2'
import Settings from './components/Settings'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import PerformancePanel from './components/PerformancePanel'
import ConnectionManager from './components/ConnectionManager'
import UnifiedExportModal from './components/UnifiedExportModal'
import UnifiedImportModal from './components/UnifiedImportModal'
import ImportDialog from './components/ImportDialog'
import CollectionStatsModal from './components/CollectionStatsModal'
import ServerInfoModal from './components/ServerInfoModal'
import ConfirmDialog from './components/ConfirmDialog'
import { useNotification, NotificationHistoryButton, NotificationHistoryDrawer } from './components/NotificationContext'
import { useConnection, SavedConnection } from './components/contexts/ConnectionContext'
import { useTab } from './components/contexts/TabContext'
import { useStatus } from './components/contexts/StatusContext'
import { useOperation } from './components/contexts/OperationContext'
import ExportManager from './components/ExportManager'
import type { WailsAppBindings } from './types/wails.d'

// Constants
const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500
const BINDINGS_CHECK_DELAY = 2000 // ms to wait before showing bindings error

// Wails runtime bindings will be available at window.go
const go: WailsAppBindings | undefined = window.go?.main?.App

// Detect platform for OS-specific UI adjustments
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

// Modal state types
interface ExportModalState {
  connectionId: string
  connectionName: string
  databaseName?: string
  collectionName?: string
  visible: boolean
}

interface ZipImportModalState {
  connectionId: string
  connectionName: string
  databaseName?: string
  visible: boolean
  filePath?: string
}

interface UnifiedImportModalState {
  connectionId: string
  connectionName: string
  databaseName?: string
  visible: boolean
}

interface StatsModalState {
  connectionId: string
  database: string
  collection: string
}

interface ServerInfoModalState {
  connectionId: string
  connectionName: string
}

interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

interface AppWarningEvent {
  message?: string
}

function App(): JSX.Element {
  const { notify } = useNotification()

  const {
    connections,
    folders,
    activeConnections,
    deleteConnection,
    getConnectionById,
    loadConnections,
  } = useConnection()

  const { documentCount, queryTime } = useStatus()
  const { activeOperations } = useOperation()

  const {
    tabs,
    activeTab,
    currentTab,
    closeAllTabs,
    convertInsertToDocumentTab,
    openIndexTab,
    nextTab,
    previousTab,
    goToTab,
    closeActiveTab,
  } = useTab()

  const [, setBindingsReady] = useState<boolean>(!!go)
  const [bindingsError, setBindingsError] = useState<boolean>(false)

  // UI state
  const [showConnectionManager, setShowConnectionManager] = useState<boolean>(false)
  const [showConnectionForm, setShowConnectionForm] = useState<boolean>(false)
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState<boolean>(false)
  const [showPerformance, setShowPerformance] = useState<boolean>(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH)
  const [exportModal, setExportModal] = useState<ExportModalState | null>(null)
  const [zipImportModal, setZipImportModal] = useState<ZipImportModalState | null>(null)
  const [unifiedImportModal, setUnifiedImportModal] = useState<UnifiedImportModalState | null>(null)
  const [statsModal, setStatsModal] = useState<StatsModalState | null>(null)
  const [serverInfoModal, setServerInfoModal] = useState<ServerInfoModalState | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  // Check for Wails bindings availability
  useEffect(() => {
    // If bindings are already available, we're good
    if (window.go?.main?.App) {
      setBindingsReady(true)
      return
    }

    // Check again after a short delay (bindings might load async)
    const checkBindings = (): void => {
      if (window.go?.main?.App) {
        setBindingsReady(true)
        setBindingsError(false)
      } else {
        setBindingsError(true)
      }
    }

    // Wait 2 seconds before showing error (give bindings time to load)
    const timer = setTimeout(checkBindings, BINDINGS_CHECK_DELAY)
    return () => clearTimeout(timer)
  }, [])

  // Listen for app warnings (e.g., keyring errors)
  useEffect(() => {
    const _unsubscribe = EventsOn('app:warning', (data: AppWarningEvent) => {
      if (data?.message) {
        notify.warning(data.message)
      }
    })
    void _unsubscribe // Suppress unused warning - cleanup uses EventsOff
    return () => {
      EventsOff('app:warning')
    }
  }, [notify])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Cmd+N: New document (if a tab is open)
      if (e.key === 'n' && modKey && currentTab) {
        e.preventDefault()
        // Trigger insert in CollectionView - handled there
        return
      }

      // Cmd+Shift+W: Close all tabs
      if (e.key === 'W' && modKey && e.shiftKey) {
        e.preventDefault()
        closeAllTabs()
        return
      }

      // Cmd+W: Close current tab
      if (e.key === 'w' && modKey) {
        e.preventDefault()
        closeActiveTab()
        return
      }

      // Cmd+1 through Cmd+9: Jump to tab by number
      if (modKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        goToTab(parseInt(e.key, 10))
        return
      }

      // Cmd+Shift+]: Next tab
      if (e.key === ']' && modKey && e.shiftKey) {
        e.preventDefault()
        nextTab()
        return
      }

      // Cmd+Shift+[: Previous tab
      if (e.key === '[' && modKey && e.shiftKey) {
        e.preventDefault()
        previousTab()
        return
      }

      // Cmd+Option+Left: Previous tab (alternative binding)
      if (e.key === 'ArrowLeft' && modKey && e.altKey) {
        e.preventDefault()
        previousTab()
        return
      }

      // Cmd+Option+Right: Next tab (alternative binding)
      if (e.key === 'ArrowRight' && modKey && e.altKey) {
        e.preventDefault()
        nextTab()
        return
      }

      // Cmd+? or Cmd+/: Show keyboard shortcuts
      if ((e.key === '?' || e.key === '/') && modKey) {
        e.preventDefault()
        setShowKeyboardShortcuts(true)
        return
      }

      // Cmd+,: Open settings
      if (e.key === ',' && modKey) {
        e.preventDefault()
        setShowSettings(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTab, closeActiveTab, closeAllTabs, goToTab, nextTab, previousTab])

  // Connection form actions
  const handleAddConnection = (): void => {
    setEditingConnection(null)
    setShowConnectionForm(true)
  }

  const handleEditConnection = (conn: SavedConnection): void => {
    setEditingConnection(conn)
    setShowConnectionForm(true)
  }

  const handleSaveConnection = async (extendedConn: any): Promise<void> => {
    try {
      // @ts-ignore - Wails binding
      await window.go.main.App.SaveExtendedConnection(extendedConn)

      notify.success('Connection saved successfully')
      setShowConnectionForm(false)
      setEditingConnection(null)
      await loadConnections()
    } catch (error) {
      console.error('Failed to save connection:', error)
      notify.error(`Failed to save connection: ${error}`)
    }
  }

  const handleDeleteConnection = (connId: string): void => {
    const conn = connections.find(c => c.id === connId)
    const connName = conn?.name || 'this connection'

    setConfirmDialog({
      title: 'Delete Connection',
      message: `Delete "${connName}"?\n\nThis action cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null)
        await deleteConnection(connId)
      },
    })
  }

  // Show error if Wails bindings failed to load
  if (bindingsError) {
    return (
      <div className="h-screen flex flex-col bg-surface">
        {isMac && <div className="h-7 bg-surface-secondary titlebar-drag flex-shrink-0" />}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="text-red-500 text-4xl mb-4">⚠</div>
            <h1 className="text-xl font-semibold text-primary mb-2">
              Failed to Initialize
            </h1>
            <p className="text-secondary mb-4">
              The application backend failed to load. This usually means the Wails runtime
              didn't initialize properly.
            </p>
            <p className="text-tertiary text-sm">
              Try restarting the application. If the problem persists, check the console for errors.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-surface">
      {/* macOS title bar spacer - only needed on macOS for traffic light buttons */}
      {isMac && <div className="h-7 bg-surface-secondary titlebar-drag flex-shrink-0" />}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className="flex-shrink-0 border-r border-border overflow-hidden flex flex-col"
          style={{ width: sidebarWidth }}
        >
          <Sidebar
            onManageConnections={() => setShowConnectionManager(true)}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
            onExportDatabases={(connId: string, connName: string) => setExportModal({ connectionId: connId, connectionName: connName, visible: true })}
            onImportDatabases={(connId: string, connName: string) => setUnifiedImportModal({ connectionId: connId, connectionName: connName, visible: true })}
            onExportCollections={(connId: string, connName: string, dbName: string) => setExportModal({ connectionId: connId, connectionName: connName, databaseName: dbName, visible: true })}
            onExportCollection={(connId: string, connName: string, dbName: string, collName: string) => setExportModal({ connectionId: connId, connectionName: connName, databaseName: dbName, collectionName: collName, visible: true })}
            onImportCollections={(connId: string, connName: string, dbName: string) => setUnifiedImportModal({ connectionId: connId, connectionName: connName, databaseName: dbName, visible: true })}
            onShowStats={(connId: string, dbName: string, collName: string) => setStatsModal({ connectionId: connId, database: dbName, collection: collName })}
            onShowServerInfo={(connId: string, connName: string) => setServerInfoModal({ connectionId: connId, connectionName: connName })}
            onManageIndexes={(connId: string, dbName: string, collName: string) => openIndexTab(connId, dbName, collName)}
          />
        </div>

        {/* Resizer */}
        <div
          className="resizer resizer-horizontal"
          onMouseDown={(e: React.MouseEvent) => {
            const startX = e.clientX
            const startWidth = sidebarWidth
            const onMove = (e: MouseEvent): void => {
              const newWidth = startWidth + (e.clientX - startX)
              setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth)))
            }
            const onUp = (): void => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <TabBar />

          {/* Content area - render all tabs, hide inactive ones to preserve state */}
          <div className="flex-1 overflow-hidden relative">
            {tabs.map(tab => {
              const isActive = tab.id === activeTab
              const tabStyle: CSSProperties = isActive
                ? { display: 'flex', flexDirection: 'column', height: '100%' }
                : { display: 'none' }

              if (tab.type === 'document') {
                return (
                  <div key={tab.id} style={tabStyle}>
                    <DocumentEditView
                      tabId={tab.id}
                      connectionId={tab.connectionId}
                      database={tab.database}
                      collection={tab.collection}
                      document={tab.document as Record<string, unknown> | null | undefined}
                      documentId={tab.documentId}
                      mode={tab.viewOnly ? 'view' : 'edit'}
                      onSave={() => {
                        // Could refresh the collection tab if open
                      }}
                    />
                  </div>
                )
              } else if (tab.type === 'insert') {
                return (
                  <div key={tab.id} style={tabStyle}>
                    <DocumentEditView
                      tabId={tab.id}
                      connectionId={tab.connectionId}
                      database={tab.database}
                      collection={tab.collection}
                      mode="insert"
                      onInsertComplete={(document: Record<string, unknown>, documentId: string) => {
                        convertInsertToDocumentTab(tab.id, document, documentId)
                      }}
                    />
                  </div>
                )
              } else if (tab.type === 'schema') {
                return (
                  <div key={tab.id} style={tabStyle}>
                    <SchemaView
                      connectionId={tab.connectionId}
                      database={tab.database}
                      collection={tab.collection}
                    />
                  </div>
                )
              } else if (tab.type === 'indexes') {
                return (
                  <div key={tab.id} style={tabStyle}>
                    <IndexView
                      connectionId={tab.connectionId}
                      database={tab.database}
                      collection={tab.collection}
                    />
                  </div>
                )
              } else {
                // collection tab
                return (
                  <div key={tab.id} style={tabStyle}>
                    <CollectionView
                      connectionId={tab.connectionId}
                      database={tab.database}
                      collection={tab.collection}
                      tabId={tab.id}
                      restored={tab.restored}
                    />
                  </div>
                )
              }
            })}
            {tabs.length === 0 && (
              <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <p className="text-lg mb-2">No collection selected</p>
                  <p className="text-sm">Select a collection from the sidebar to view documents</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="h-6 bg-surface-secondary border-t border-border flex items-center justify-between px-3 text-xs text-text-muted flex-shrink-0">
        <div className="flex items-center gap-2 select-text">
          {/* Connection info */}
          {currentTab ? (
            <>
              <span className="text-text-muted" title="Active connection">
                {getConnectionById(currentTab.connectionId)?.name || 'Unknown'}
              </span>
              <span className="text-text-dim">:</span>
              <span title="Database and collection">
                {currentTab.database}.{currentTab.collection}
              </span>
              {/* Document count for collection views */}
              {currentTab.type === 'collection' && documentCount !== null && (
                <>
                  <span className="text-text-dim">|</span>
                  <span title="Documents in result">
                    {documentCount.toLocaleString()} doc{documentCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {/* Query time */}
              {currentTab.type === 'collection' && queryTime !== null && (
                <>
                  <span className="text-text-dim">|</span>
                  <span className="text-text-muted" title="Query execution time">
                    {queryTime}ms
                  </span>
                </>
              )}
            </>
          ) : (
            <span>No selection</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Export manager */}
          <ExportManager />
          {/* Global operation indicator (bulk-delete only — exports/imports tracked in ExportManager) */}
          {(() => {
            const bulkDeleteOps = activeOperations.filter(op => op.type === 'bulk-delete')
            return bulkDeleteOps.length > 0 ? (
              <>
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-hover/50 cursor-pointer hover:bg-surface-hover"
                  onClick={() => {
                    const op = bulkDeleteOps[0]
                    if (op?.modalOpener) op.modalOpener()
                  }}
                  title={bulkDeleteOps.map(op => op.label).join(', ')}
                >
                  {/* Spinner */}
                  <svg className="w-3 h-3 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {/* Label */}
                  <span className="text-text-secondary max-w-[150px] truncate">
                    {bulkDeleteOps[0].label}
                  </span>
                  {/* Progress percentage */}
                  {bulkDeleteOps[0].progress !== null && (
                    <span className="text-primary font-medium">
                      {bulkDeleteOps[0].progress}%
                    </span>
                  )}
                  {/* Additional operations count */}
                  {bulkDeleteOps.length > 1 && (
                    <span className="text-text-dim">
                      +{bulkDeleteOps.length - 1}
                    </span>
                  )}
                </div>
                <span className="text-text-dim">|</span>
              </>
            ) : null
          })()}
          {/* Active connections count */}
          <span className="text-text-muted" title="Number of active connections">
            {activeConnections.length} connection{activeConnections.length !== 1 ? 's' : ''}
          </span>
          {/* Notification history button */}
          <NotificationHistoryButton />
          <button
            className="p-1 rounded hover:bg-surface-hover hover:text-text-secondary"
            onClick={() => setShowPerformance(true)}
            title="Performance"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <button
            className="p-1 rounded hover:bg-surface-hover hover:text-text-secondary"
            onClick={() => setShowKeyboardShortcuts(true)}
            title="Keyboard Shortcuts (Cmd+?)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            className="p-1 rounded hover:bg-surface-hover hover:text-text-secondary"
            onClick={() => setShowSettings(true)}
            title="Settings (Cmd+,)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Connection manager modal - kept mounted to preserve state */}
      {showConnectionManager && (
        <div style={{ display: showConnectionForm ? 'none' : undefined }}>
          <ConnectionManager
            onAddConnection={() => { handleAddConnection() }}
            onEditConnection={(conn) => { handleEditConnection(conn) }}
            onClose={() => setShowConnectionManager(false)}
          />
        </div>
      )}

      {/* Connection form modal */}
      {showConnectionForm && (
        <ConnectionFormV2
          connection={editingConnection ?? undefined}
          folders={folders}
          onSave={handleSaveConnection}
          onCancel={() => {
            setShowConnectionForm(false)
          }}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}

      {/* Keyboard shortcuts modal */}
      {showKeyboardShortcuts && (
        <KeyboardShortcuts onClose={() => setShowKeyboardShortcuts(false)} />
      )}

      {/* Performance panel modal */}
      {showPerformance && (
        <PerformancePanel onClose={() => setShowPerformance(false)} />
      )}

      {/* Export modal (databases, collections, or single collection) */}
      {exportModal && (
        <div style={{ display: exportModal.visible ? undefined : 'none' }}>
          <UnifiedExportModal
            connectionId={exportModal.connectionId}
            connectionName={exportModal.connectionName}
            databaseName={exportModal.databaseName}
            collectionName={exportModal.collectionName}
            onClose={() => setExportModal(null)}
            onHide={() => setExportModal(prev => prev ? { ...prev, visible: false } : null)}
            onShow={() => setExportModal(prev => prev ? { ...prev, visible: true } : null)}
          />
        </div>
      )}

      {/* ZIP import modal (unified for both connection and database scope) */}
      {zipImportModal && (
        <div style={{ display: zipImportModal.visible ? undefined : 'none' }}>
          <UnifiedImportModal
            connectionId={zipImportModal.connectionId}
            connectionName={zipImportModal.connectionName}
            databaseName={zipImportModal.databaseName}
            initialFilePath={zipImportModal.filePath}
            onClose={() => setZipImportModal(null)}
            onHide={() => setZipImportModal(prev => prev ? { ...prev, visible: false } : null)}
            onShow={() => setZipImportModal(prev => prev ? { ...prev, visible: true } : null)}
            onComplete={() => {
              if (go?.ListDatabases) {
                go.ListDatabases(zipImportModal.connectionId).catch(console.error)
              }
            }}
          />
        </div>
      )}

      {/* Unified import dialog (JSON, CSV, with ZIP delegation) */}
      {unifiedImportModal && (
        <ImportDialog
          open={unifiedImportModal.visible}
          connectionId={unifiedImportModal.connectionId}
          connectionName={unifiedImportModal.connectionName}
          databaseName={unifiedImportModal.databaseName}
          onClose={() => setUnifiedImportModal(null)}
          onHide={() => setUnifiedImportModal(prev => prev ? { ...prev, visible: false } : null)}
          onComplete={() => {
            if (go?.ListDatabases) {
              go.ListDatabases(unifiedImportModal.connectionId).catch(console.error)
            }
          }}
          onZipDetected={(filePath: string) => {
            const { connectionId, connectionName, databaseName } = unifiedImportModal
            setUnifiedImportModal(null)
            setZipImportModal({ connectionId, connectionName, databaseName, visible: true, filePath })
          }}
        />
      )}

      {/* Collection stats modal */}
      {statsModal && (
        <CollectionStatsModal
          connectionId={statsModal.connectionId}
          database={statsModal.database}
          collection={statsModal.collection}
          onClose={() => setStatsModal(null)}
        />
      )}

      {/* Server info modal */}
      {serverInfoModal && (
        <ServerInfoModal
          connectionId={serverInfoModal.connectionId}
          connectionName={serverInfoModal.connectionName}
          onClose={() => setServerInfoModal(null)}
        />
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* Notification history drawer */}
      <NotificationHistoryDrawer />
    </div>
  )
}

export default App
