import { useState, useEffect } from 'react'
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

// Wails runtime bindings will be available at window.go
const go = window.go?.main?.App

function App() {
  const { notify } = useNotification()

  // Connection state
  const [connections, setConnections] = useState([])
  const [folders, setFolders] = useState([])
  const [activeConnections, setActiveConnections] = useState([]) // Connected connection IDs

  // Navigation state
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [selectedDatabase, setSelectedDatabase] = useState(null)
  const [selectedCollection, setSelectedCollection] = useState(null)

  // Tab state
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState(null)

  // UI state
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [connectingId, setConnectingId] = useState(null) // Currently connecting
  const [exportModal, setExportModal] = useState(null) // { connectionId, connectionName }
  const [importModal, setImportModal] = useState(null) // { connectionId, connectionName }
  const [exportCollectionsModal, setExportCollectionsModal] = useState(null) // { connectionId, connectionName, databaseName }
  const [importCollectionsModal, setImportCollectionsModal] = useState(null) // { connectionId, connectionName, databaseName }
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm, danger }

  // Get current tab data (must be before useEffects that reference it)
  const currentTab = tabs.find(t => t.id === activeTab)

  // Load saved connections on mount
  useEffect(() => {
    loadConnections()
  }, [])

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

  const loadConnections = async () => {
    try {
      if (go?.ListSavedConnections) {
        const saved = await go.ListSavedConnections()
        setConnections(saved || [])
      }
      if (go?.ListFolders) {
        const savedFolders = await go.ListFolders()
        setFolders(savedFolders || [])
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
    }
  }

  // Connection actions
  const handleConnect = async (connId) => {
    if (connectingId) return // Already connecting
    setConnectingId(connId)
    try {
      if (go?.Connect) {
        await go.Connect(connId)
        setActiveConnections(prev => [...prev, connId])
        notify.success('Connected successfully')
      }
    } catch (err) {
      console.error('Failed to connect:', err)
      notify.error(`Connection failed: ${err.message || err}`)
    } finally {
      setConnectingId(null)
    }
  }

  const handleDisconnect = async (connId) => {
    try {
      if (go?.Disconnect) {
        await go.Disconnect(connId)
        setActiveConnections(prev => prev.filter(id => id !== connId))
        // Close any tabs for this connection
        setTabs(prev => prev.filter(t => t.connectionId !== connId))
      }
    } catch (err) {
      console.error('Failed to disconnect:', err)
      notify.error(`Failed to disconnect: ${err.message || err}`)
    }
  }

  const handleDisconnectAll = async () => {
    try {
      if (go?.DisconnectAll) {
        await go.DisconnectAll()
      }
      setActiveConnections([])
      setTabs([])
      setActiveTab(null)
    } catch (err) {
      console.error('Failed to disconnect all:', err)
      notify.error(`Failed to disconnect all: ${err.message || err}`)
    }
  }

  const handleDisconnectOthers = async (keepConnId) => {
    try {
      for (const connId of activeConnections) {
        if (connId !== keepConnId && go?.Disconnect) {
          await go.Disconnect(connId)
        }
      }
      setActiveConnections([keepConnId])
      setTabs(prev => prev.filter(t => t.connectionId === keepConnId))
      notify.success('Other connections disconnected')
    } catch (err) {
      console.error('Failed to disconnect others:', err)
      notify.error(`Failed to disconnect others: ${err.message || err}`)
    }
  }

  const handleDropDatabase = async (connId, dbName) => {
    if (go?.DropDatabase) {
      await go.DropDatabase(connId, dbName)
      // Close any tabs for this database
      setTabs(prev => prev.filter(t => !(t.connectionId === connId && t.database === dbName)))
    }
  }

  const handleDropCollection = async (connId, dbName, collName) => {
    if (go?.DropCollection) {
      await go.DropCollection(connId, dbName, collName)
      // Close any tabs for this collection
      setTabs(prev => prev.filter(t => !(t.connectionId === connId && t.database === dbName && t.collection === collName)))
    }
  }

  const handleClearCollection = async (connId, dbName, collName) => {
    if (go?.ClearCollection) {
      await go.ClearCollection(connId, dbName, collName)
    }
  }

  const handleDuplicateConnection = async (connId) => {
    try {
      const conn = connections.find(c => c.id === connId)
      if (conn && go?.DuplicateConnection) {
        await go.DuplicateConnection(connId, `${conn.name} (copy)`)
        await loadConnections()
        notify.success('Connection duplicated')
      }
    } catch (err) {
      console.error('Failed to duplicate connection:', err)
      notify.error(`Failed to duplicate connection: ${err.message || err}`)
    }
  }

  const handleRefreshConnection = async (connId) => {
    // Force reload databases for this connection
    if (go?.ListDatabases) {
      try {
        await go.ListDatabases(connId)
        notify.info('Connection refreshed')
      } catch (err) {
        console.error('Failed to refresh:', err)
        notify.error(`Failed to refresh: ${err.message || err}`)
      }
    }
  }

  // Tab management
  const openTab = (connectionId, database, collection) => {
    const tabId = `${connectionId}.${database}.${collection}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      setActiveTab(tabId)
    } else {
      const conn = connections.find(c => c.id === connectionId)
      const newTab = {
        id: tabId,
        type: 'collection',
        connectionId,
        database,
        collection,
        label: database,
        color: conn?.color || '#4CC38A',
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }

  // Open a new query tab (for + button)
  const openNewQueryTab = () => {
    if (!currentTab || currentTab.type === 'document') return

    const { connectionId, database, collection } = currentTab
    const conn = connections.find(c => c.id === connectionId)
    const tabId = `${connectionId}.${database}.${collection}.${Date.now()}`

    const newTab = {
      id: tabId,
      type: 'collection',
      connectionId,
      database,
      collection,
      label: database,
      color: conn?.color || '#4CC38A',
      pinned: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveTab(tabId)
  }

  // Open document in a new tab
  const openDocumentTab = (connectionId, database, collection, document, documentId) => {
    const shortId = typeof documentId === 'string' ? documentId.slice(0, 8) : String(documentId).slice(0, 8)
    const tabId = `doc:${connectionId}.${database}.${collection}.${documentId}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      setActiveTab(tabId)
    } else {
      const conn = connections.find(c => c.id === connectionId)
      const newTab = {
        id: tabId,
        type: 'document',
        connectionId,
        database,
        collection,
        document,
        documentId,
        label: `${shortId}...`,
        color: conn?.color || '#4CC38A',
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }

  // Open insert tab for new document
  const openInsertTab = (connectionId, database, collection) => {
    const conn = connections.find(c => c.id === connectionId)
    const tabId = `insert:${connectionId}.${database}.${collection}.${Date.now()}`

    const newTab = {
      id: tabId,
      type: 'insert',
      connectionId,
      database,
      collection,
      label: 'New Document',
      color: conn?.color || '#4CC38A',
      pinned: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveTab(tabId)
  }

  // Open schema view tab
  const openSchemaTab = (connectionId, database, collection) => {
    const tabId = `schema:${connectionId}.${database}.${collection}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      setActiveTab(tabId)
    } else {
      const conn = connections.find(c => c.id === connectionId)
      const newTab = {
        id: tabId,
        type: 'schema',
        connectionId,
        database,
        collection,
        label: `Schema: ${collection}`,
        color: conn?.color || '#4CC38A',
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }

  // Convert insert tab to document tab after successful insert
  const convertInsertToDocumentTab = (tabId, document, documentId) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    const shortId = typeof documentId === 'string' ? documentId.slice(0, 8) : String(documentId).slice(0, 8)
    const newTabId = `doc:${tab.connectionId}.${tab.database}.${tab.collection}.${documentId}`

    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        return {
          ...t,
          id: newTabId,
          type: 'document',
          document,
          documentId,
          label: `${shortId}...`,
        }
      }
      return t
    }))
    setActiveTab(newTabId)
  }

  const closeTab = (tabId) => {
    setTabs(prev => prev.filter(t => t.id !== tabId))
    if (activeTab === tabId) {
      setActiveTab(tabs.length > 1 ? tabs[tabs.length - 2]?.id : null)
    }
  }

  const pinTab = (tabId) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, pinned: !t.pinned } : t
    ))
  }

  const renameTab = (tabId, newLabel) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, label: newLabel } : t
    ))
  }

  const reorderTabs = (draggedId, targetId) => {
    setTabs(prev => {
      const newTabs = [...prev]
      const draggedIndex = newTabs.findIndex(t => t.id === draggedId)
      const targetIndex = newTabs.findIndex(t => t.id === targetId)
      if (draggedIndex === -1 || targetIndex === -1) return prev

      const [dragged] = newTabs.splice(draggedIndex, 1)
      newTabs.splice(targetIndex, 0, dragged)
      return newTabs
    })
  }

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
    try {
      if (go?.SaveConnection) {
        await go.SaveConnection(conn, password)
        await loadConnections()
        notify.success('Connection saved')
      }
      setShowConnectionForm(false)
    } catch (err) {
      console.error('Failed to save connection:', err)
      notify.error(`Failed to save connection: ${err.message || err}`)
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
        try {
          if (go?.DeleteSavedConnection) {
            await go.DeleteSavedConnection(connId)
            await loadConnections()
            notify.success('Connection deleted')
          }
        } catch (err) {
          console.error('Failed to delete connection:', err)
          notify.error(`Failed to delete connection: ${err.message || err}`)
        }
      },
    })
  }

  const handleCreateFolder = async (name) => {
    try {
      if (go?.CreateFolder) {
        await go.CreateFolder(name, '')
        await loadConnections()
      }
    } catch (err) {
      console.error('Failed to create folder:', err)
      throw err
    }
  }

  const handleDeleteFolder = async (folderId) => {
    try {
      if (go?.DeleteFolder) {
        await go.DeleteFolder(folderId)
        await loadConnections()
      }
    } catch (err) {
      console.error('Failed to delete folder:', err)
      throw err
    }
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
            connections={connections}
            folders={folders}
            activeConnections={activeConnections}
            connectingId={connectingId}
            selectedConnection={selectedConnection}
            selectedDatabase={selectedDatabase}
            selectedCollection={selectedCollection}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onDisconnectAll={handleDisconnectAll}
            onDisconnectOthers={handleDisconnectOthers}
            onSelectConnection={setSelectedConnection}
            onSelectDatabase={setSelectedDatabase}
            onSelectCollection={(connId, db, coll) => {
              setSelectedCollection(coll)
              openTab(connId, db, coll)
            }}
            onAddConnection={handleAddConnection}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
            onDuplicateConnection={handleDuplicateConnection}
            onRefreshConnection={handleRefreshConnection}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onDropDatabase={handleDropDatabase}
            onDropCollection={handleDropCollection}
            onClearCollection={handleClearCollection}
            onViewSchema={openSchemaTab}
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
              setSidebarWidth(Math.max(200, Math.min(500, newWidth)))
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
          <TabBar
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onCloseTab={closeTab}
            onAddTab={openNewQueryTab}
            onPinTab={pinTab}
            onRenameTab={renameTab}
            onReorderTabs={reorderTabs}
          />

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
                onEditDocument={openDocumentTab}
                onInsertDocument={() => openInsertTab(currentTab.connectionId, currentTab.database, currentTab.collection)}
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
