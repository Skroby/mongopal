import { useState, useEffect } from 'react'
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import CollectionView from './components/CollectionView'
import DocumentEditView from './components/DocumentEditView'
import SchemaView from './components/SchemaView'
import IndexView from './components/IndexView'
import ConnectionForm from './components/ConnectionForm'
import Settings from './components/Settings'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import PerformancePanel from './components/PerformancePanel'
import ExportDatabasesModal from './components/ExportDatabasesModal'
import ImportDatabasesModal from './components/ImportDatabasesModal'
import ExportCollectionsModal from './components/ExportCollectionsModal'
import ImportCollectionsModal from './components/ImportCollectionsModal'
import CollectionStatsModal from './components/CollectionStatsModal'
import ConfirmDialog from './components/ConfirmDialog'
import { useNotification, NotificationHistoryButton, NotificationHistoryDrawer } from './components/NotificationContext'
import { useConnection } from './components/contexts/ConnectionContext'
import { useTab } from './components/contexts/TabContext'
import { useStatus } from './components/contexts/StatusContext'
import { useOperation } from './components/contexts/OperationContext'
import ExportManager from './components/ExportManager'

// Constants
const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500
const BINDINGS_CHECK_DELAY = 2000 // ms to wait before showing bindings error

// Wails runtime bindings will be available at window.go
const go = window.go?.main?.App

// Detect platform for OS-specific UI adjustments
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

function App() {
  const { notify } = useNotification()

  const {
    connections,
    folders,
    activeConnections,
    deleteConnection,
    saveConnection,
    getConnectionById,
  } = useConnection()

  const { documentCount, queryTime } = useStatus()
  const { activeOperations } = useOperation()

  const {
    tabs,
    activeTab,
    currentTab,
    setActiveTab,
    closeTab,
    closeAllTabs,
    convertInsertToDocumentTab,
    openDocumentTab,
    openInsertTab,
    openIndexTab,
    nextTab,
    previousTab,
    goToTab,
    closeActiveTab,
  } = useTab()

  // Wails bindings state
  const [bindingsReady, setBindingsReady] = useState(!!go)
  const [bindingsError, setBindingsError] = useState(false)

  // UI state
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [showPerformance, setShowPerformance] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [exportModal, setExportModal] = useState(null) // { connectionId, connectionName }
  const [importModal, setImportModal] = useState(null) // { connectionId, connectionName }
  const [exportCollectionsModal, setExportCollectionsModal] = useState(null) // { connectionId, connectionName, databaseName }
  const [importCollectionsModal, setImportCollectionsModal] = useState(null) // { connectionId, connectionName, databaseName }
  const [statsModal, setStatsModal] = useState(null) // { connectionId, database, collection }
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm, danger }

  // Check for Wails bindings availability
  useEffect(() => {
    // If bindings are already available, we're good
    if (window.go?.main?.App) {
      setBindingsReady(true)
      return
    }

    // Check again after a short delay (bindings might load async)
    const checkBindings = () => {
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
    const unsubscribe = EventsOn('app:warning', (data) => {
      if (data?.message) {
        notify.warning(data.message)
      }
    })
    return () => {
      EventsOff('app:warning')
    }
  }, [notify])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey
      const altKey = e.altKey

      // Cmd+N: New document (if a tab is open)
      if (e.key === 'n' && modKey && currentTab) {
        e.preventDefault()
        // Trigger insert in CollectionView - handled there
        return
      }

      // Cmd+W: Close current tab
      if (e.key === 'w' && modKey && !e.shiftKey) {
        e.preventDefault()
        if (activeTab) {
          closeTab(activeTab)
        }
        return
      }

      // Cmd+Shift+W: Close all tabs
      if (e.key === 'W' && modKey && e.shiftKey) {
        e.preventDefault()
        closeAllTabs()
        return
      }

      // Cmd+Option+Left (Mac) / Ctrl+Alt+Left (Win/Linux): Previous tab
      if (e.key === 'ArrowLeft' && modKey && altKey) {
        e.preventDefault()
        if (tabs.length > 1 && activeTab) {
          const currentIndex = tabs.findIndex(t => t.id === activeTab)
          if (currentIndex > 0) {
            setActiveTab(tabs[currentIndex - 1].id)
          } else {
            // Wrap to last tab
            setActiveTab(tabs[tabs.length - 1].id)
          }
        }
        return
      }

      // Cmd+Option+Right (Mac) / Ctrl+Alt+Right (Win/Linux): Next tab
      if (e.key === 'ArrowRight' && modKey && altKey) {
        e.preventDefault()
        if (tabs.length > 1 && activeTab) {
          const currentIndex = tabs.findIndex(t => t.id === activeTab)
          if (currentIndex < tabs.length - 1) {
            setActiveTab(tabs[currentIndex + 1].id)
          } else {
            // Wrap to first tab
            setActiveTab(tabs[0].id)
          }
        }
        return
      }

      // Cmd+1-9: Jump to tab by position
      if (modKey && !e.shiftKey && !altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const tabIndex = parseInt(e.key, 10) - 1
        if (tabIndex < tabs.length) {
          setActiveTab(tabs[tabIndex].id)
        }
        return
      }
      // Cmd+? or Cmd+/: Show keyboard shortcuts
      if ((e.key === '?' || e.key === '/') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setShowKeyboardShortcuts(true)
      }
      // Cmd+,: Open settings
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setShowSettings(true)
      }
      // Cmd+W: Close current tab
      if (e.key === 'w' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        closeActiveTab()
      }
      // Cmd+1 through Cmd+9: Jump to tab by number
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        goToTab(parseInt(e.key, 10))
      }
      // Cmd+Shift+]: Next tab
      if (e.key === ']' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        nextTab()
      }
      // Cmd+Shift+[: Previous tab
      if (e.key === '[' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        previousTab()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTab, closeActiveTab, goToTab, nextTab, previousTab])

  // Connection form actions
  const handleAddConnection = () => {
    setEditingConnection(null)
    setShowConnectionForm(true)
  }

  const handleEditConnection = (conn) => {
    setEditingConnection(conn)
    setShowConnectionForm(true)
  }

  const handleSaveConnection = async (conn, password) => {
    const success = await saveConnection(conn, password)
    if (success) {
      setShowConnectionForm(false)
    }
  }

  const handleDeleteConnection = (connId) => {
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
            onAddConnection={handleAddConnection}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
            onExportDatabases={(connId, connName) => setExportModal({ connectionId: connId, connectionName: connName })}
            onImportDatabases={(connId, connName) => setImportModal({ connectionId: connId, connectionName: connName })}
            onExportCollections={(connId, connName, dbName) => setExportCollectionsModal({ connectionId: connId, connectionName: connName, databaseName: dbName })}
            onImportCollections={(connId, connName, dbName) => setImportCollectionsModal({ connectionId: connId, connectionName: connName, databaseName: dbName })}
            onShowStats={(connId, dbName, collName) => setStatsModal({ connectionId: connId, database: dbName, collection: collName })}
            onManageIndexes={(connId, dbName, collName) => openIndexTab(connId, dbName, collName)}
          />
        </div>

        {/* Resizer */}
        <div
          className="resizer resizer-horizontal"
          onMouseDown={(e) => {
            const startX = e.clientX
            const startWidth = sidebarWidth
            const onMove = (e) => {
              const newWidth = startWidth + (e.clientX - startX)
              setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth)))
            }
            const onUp = () => {
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
              const tabStyle = isActive
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
                      document={tab.document}
                      documentId={tab.documentId}
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
                      onInsertComplete={(document, documentId) => {
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
              <div className="h-full flex items-center justify-center text-zinc-400">
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
      <div className="h-6 bg-surface-secondary border-t border-border flex items-center justify-between px-3 text-xs text-zinc-400 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Connection info */}
          {currentTab ? (
            <>
              <span className="text-zinc-400" title="Active connection">
                {getConnectionById(currentTab.connectionId)?.name || 'Unknown'}
              </span>
              <span className="text-zinc-600">:</span>
              <span title="Database and collection">
                {currentTab.database}.{currentTab.collection}
              </span>
              {/* Document count for collection views */}
              {currentTab.type === 'collection' && documentCount !== null && (
                <>
                  <span className="text-zinc-600">|</span>
                  <span title="Documents in result">
                    {documentCount.toLocaleString()} doc{documentCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {/* Query time */}
              {currentTab.type === 'collection' && queryTime !== null && (
                <>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-400" title="Query execution time">
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
          {/* Global operation indicator */}
          {activeOperations.length > 0 && (
            <>
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-700/50 cursor-pointer hover:bg-zinc-700"
                onClick={() => {
                  // Click to open related modal if available
                  const op = activeOperations[0]
                  if (op?.modalOpener) op.modalOpener()
                }}
                title={activeOperations.map(op => op.label).join(', ')}
              >
                {/* Spinner */}
                <svg className="w-3 h-3 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {/* Label */}
                <span className="text-zinc-300 max-w-[150px] truncate">
                  {activeOperations[0].label}
                </span>
                {/* Progress percentage */}
                {activeOperations[0].progress !== null && (
                  <span className="text-accent font-medium">
                    {activeOperations[0].progress}%
                  </span>
                )}
                {/* Additional operations count */}
                {activeOperations.length > 1 && (
                  <span className="text-zinc-500">
                    +{activeOperations.length - 1}
                  </span>
                )}
              </div>
              <span className="text-zinc-600">|</span>
            </>
          )}
          {/* Active connections count */}
          <span className="text-zinc-400" title="Number of active connections">
            {activeConnections.length} connection{activeConnections.length !== 1 ? 's' : ''}
          </span>
          {/* Notification history button */}
          <NotificationHistoryButton />
          <button
            className="p-1 rounded hover:bg-zinc-700 hover:text-zinc-300"
            onClick={() => setShowPerformance(true)}
            title="Performance"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <button
            className="p-1 rounded hover:bg-zinc-700 hover:text-zinc-300"
            onClick={() => setShowKeyboardShortcuts(true)}
            title="Keyboard Shortcuts (Cmd+?)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            className="p-1 rounded hover:bg-zinc-700 hover:text-zinc-300"
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

      {/* Connection form modal */}
      {showConnectionForm && (
        <ConnectionForm
          connection={editingConnection}
          folders={folders}
          onSave={handleSaveConnection}
          onCancel={() => setShowConnectionForm(false)}
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

      {/* Export databases modal */}
      {exportModal && (
        <ExportDatabasesModal
          connectionId={exportModal.connectionId}
          connectionName={exportModal.connectionName}
          onClose={() => setExportModal(null)}
        />
      )}

      {/* Import databases modal */}
      {importModal && (
        <ImportDatabasesModal
          connectionId={importModal.connectionId}
          connectionName={importModal.connectionName}
          onClose={() => setImportModal(null)}
          onComplete={() => {
            // Optionally refresh the connection tree after import
            if (go?.ListDatabases) {
              go.ListDatabases(importModal.connectionId).catch(console.error)
            }
          }}
        />
      )}

      {/* Export collections modal */}
      {exportCollectionsModal && (
        <ExportCollectionsModal
          connectionId={exportCollectionsModal.connectionId}
          connectionName={exportCollectionsModal.connectionName}
          databaseName={exportCollectionsModal.databaseName}
          onClose={() => setExportCollectionsModal(null)}
        />
      )}

      {/* Import collections modal */}
      {importCollectionsModal && (
        <ImportCollectionsModal
          connectionId={importCollectionsModal.connectionId}
          connectionName={importCollectionsModal.connectionName}
          databaseName={importCollectionsModal.databaseName}
          onClose={() => setImportCollectionsModal(null)}
          onComplete={() => {
            // Optionally refresh the database's collections after import
            if (go?.ListCollections) {
              go.ListCollections(importCollectionsModal.connectionId, importCollectionsModal.databaseName).catch(console.error)
            }
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

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        onConfirm={confirmDialog?.onConfirm}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* Notification history drawer */}
      <NotificationHistoryDrawer />
    </div>
  )
}

export default App
