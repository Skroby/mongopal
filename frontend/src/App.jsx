import { useState, useEffect } from 'react'
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import CollectionView from './components/CollectionView'
import DocumentEditView from './components/DocumentEditView'
import SchemaView from './components/SchemaView'
import ConnectionForm from './components/ConnectionForm'
import Settings from './components/Settings'
import ExportDatabasesModal from './components/ExportDatabasesModal'
import ImportDatabasesModal from './components/ImportDatabasesModal'
import ExportCollectionsModal from './components/ExportCollectionsModal'
import ImportCollectionsModal from './components/ImportCollectionsModal'
import ConfirmDialog from './components/ConfirmDialog'
import { useNotification } from './components/NotificationContext'
import { useConnection } from './components/contexts/ConnectionContext'
import { useTab } from './components/contexts/TabContext'

// Constants
const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500
const BINDINGS_CHECK_DELAY = 2000 // ms to wait before showing bindings error

// Wails runtime bindings will be available at window.go
const go = window.go?.main?.App

function App() {
  const { notify } = useNotification()

  const {
    connections,
    folders,
    activeConnections,
    deleteConnection,
    saveConnection,
  } = useConnection()

  const {
    currentTab,
    convertInsertToDocumentTab,
    openDocumentTab,
    openInsertTab,
  } = useTab()

  // Wails bindings state
  const [bindingsReady, setBindingsReady] = useState(!!go)
  const [bindingsError, setBindingsError] = useState(false)

  // UI state
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [exportModal, setExportModal] = useState(null) // { connectionId, connectionName }
  const [importModal, setImportModal] = useState(null) // { connectionId, connectionName }
  const [exportCollectionsModal, setExportCollectionsModal] = useState(null) // { connectionId, connectionName, databaseName }
  const [importCollectionsModal, setImportCollectionsModal] = useState(null) // { connectionId, connectionName, databaseName }
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
      // Cmd+N: New document (if a tab is open)
      if (e.key === 'n' && (e.metaKey || e.ctrlKey) && currentTab) {
        e.preventDefault()
        // Trigger insert in CollectionView - handled there
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTab])

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
        <div className="h-7 bg-surface-secondary titlebar-drag flex-shrink-0" />
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
      {/* macOS title bar spacer */}
      <div className="h-7 bg-surface-secondary titlebar-drag flex-shrink-0" />

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

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {currentTab?.type === 'document' ? (
              <DocumentEditView
                connectionId={currentTab.connectionId}
                database={currentTab.database}
                collection={currentTab.collection}
                document={currentTab.document}
                documentId={currentTab.documentId}
                onSave={() => {
                  // Could refresh the collection tab if open
                }}
              />
            ) : currentTab?.type === 'insert' ? (
              <DocumentEditView
                key={currentTab.id}
                connectionId={currentTab.connectionId}
                database={currentTab.database}
                collection={currentTab.collection}
                mode="insert"
                onInsertComplete={(document, documentId) => {
                  convertInsertToDocumentTab(currentTab.id, document, documentId)
                }}
              />
            ) : currentTab?.type === 'schema' ? (
              <SchemaView
                key={currentTab.id}
                connectionId={currentTab.connectionId}
                database={currentTab.database}
                collection={currentTab.collection}
              />
            ) : currentTab ? (
              <CollectionView
                connectionId={currentTab.connectionId}
                database={currentTab.database}
                collection={currentTab.collection}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500">
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
      <div className="h-6 bg-surface-secondary border-t border-border flex items-center justify-between px-3 text-xs text-zinc-500 flex-shrink-0">
        <div className="flex items-center">
          <span>Connected: {activeConnections.length}</span>
          <span className="mx-3">|</span>
          <span>
            {currentTab
              ? `${currentTab.database} > ${currentTab.collection}`
              : 'No selection'}
          </span>
        </div>
        <button
          className="p-1 rounded hover:bg-zinc-700 hover:text-zinc-300"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
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
    </div>
  )
}

export default App
