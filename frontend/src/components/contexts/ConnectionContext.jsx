import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNotification } from '../NotificationContext'
import { getErrorSummary } from '../../utils/errorParser'

const ConnectionContext = createContext(null)

const go = window.go?.main?.App

export function ConnectionProvider({ children }) {
  const { notify } = useNotification()

  // Connection state
  const [connections, setConnections] = useState([])
  const [folders, setFolders] = useState([])
  const [activeConnections, setActiveConnections] = useState([])

  // Navigation state
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [selectedDatabase, setSelectedDatabase] = useState(null)
  const [selectedCollection, setSelectedCollection] = useState(null)

  // UI state - track multiple simultaneous connections
  const [connectingIds, setConnectingIds] = useState(new Set())

  // Load saved connections on mount
  useEffect(() => {
    loadConnections()
  }, [])

  const loadConnections = useCallback(async () => {
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
  }, [])

  const connect = useCallback(async (connId) => {
    if (connectingIds.has(connId)) return // This connection already in progress
    const conn = connections.find(c => c.id === connId)
    const connName = conn?.name || 'Unknown'
    setConnectingIds(prev => new Set(prev).add(connId))
    try {
      if (go?.Connect) {
        await go.Connect(connId)
        setActiveConnections(prev => [...prev, connId])
        notify.success(`Connected to ${connName}`)
      }
    } catch (err) {
      console.error('Failed to connect:', err)
      notify.error(`${connName}: ${getErrorSummary(err?.message || String(err))}`)
    } finally {
      setConnectingIds(prev => {
        const next = new Set(prev)
        next.delete(connId)
        return next
      })
    }
  }, [connections, connectingIds, notify])

  const disconnect = useCallback(async (connId, onTabsClose) => {
    try {
      if (go?.Disconnect) {
        await go.Disconnect(connId)
        setActiveConnections(prev => prev.filter(id => id !== connId))
        onTabsClose?.(connId)
      }
    } catch (err) {
      console.error('Failed to disconnect:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
    }
  }, [notify])

  const disconnectAll = useCallback(async (onAllTabsClose) => {
    try {
      if (go?.DisconnectAll) {
        await go.DisconnectAll()
      }
      setActiveConnections([])
      onAllTabsClose?.()
    } catch (err) {
      console.error('Failed to disconnect all:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
    }
  }, [notify])

  const disconnectOthers = useCallback(async (keepConnId, onOtherTabsClose) => {
    try {
      for (const connId of activeConnections) {
        if (connId !== keepConnId && go?.Disconnect) {
          await go.Disconnect(connId)
        }
      }
      setActiveConnections([keepConnId])
      onOtherTabsClose?.(keepConnId)
      notify.success('Other connections disconnected')
    } catch (err) {
      console.error('Failed to disconnect others:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
    }
  }, [activeConnections, notify])

  const saveConnection = useCallback(async (conn, password) => {
    try {
      if (go?.SaveConnection) {
        await go.SaveConnection(conn, password)
        await loadConnections()
        notify.success('Connection saved')
        return true
      }
    } catch (err) {
      console.error('Failed to save connection:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
    }
    return false
  }, [loadConnections, notify])

  const deleteConnection = useCallback(async (connId) => {
    try {
      if (go?.DeleteSavedConnection) {
        await go.DeleteSavedConnection(connId)
        await loadConnections()
        notify.success('Connection deleted')
        return true
      }
    } catch (err) {
      console.error('Failed to delete connection:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
    }
    return false
  }, [loadConnections, notify])

  const duplicateConnection = useCallback(async (connId) => {
    try {
      const conn = connections.find(c => c.id === connId)
      if (conn && go?.DuplicateConnection) {
        await go.DuplicateConnection(connId, `${conn.name} (copy)`)
        await loadConnections()
        notify.success('Connection duplicated')
      }
    } catch (err) {
      console.error('Failed to duplicate connection:', err)
      notify.error(getErrorSummary(err?.message || String(err)))
    }
  }, [connections, loadConnections, notify])

  const refreshConnection = useCallback(async (connId) => {
    if (go?.ListDatabases) {
      try {
        await go.ListDatabases(connId)
        notify.info('Connection refreshed')
      } catch (err) {
        console.error('Failed to refresh:', err)
        notify.error(getErrorSummary(err?.message || String(err)))
      }
    }
  }, [notify])

  const dropDatabase = useCallback(async (connId, dbName) => {
    if (go?.DropDatabase) {
      await go.DropDatabase(connId, dbName)
    }
  }, [])

  const dropCollection = useCallback(async (connId, dbName, collName) => {
    if (go?.DropCollection) {
      await go.DropCollection(connId, dbName, collName)
    }
  }, [])

  const clearCollection = useCallback(async (connId, dbName, collName) => {
    if (go?.ClearCollection) {
      await go.ClearCollection(connId, dbName, collName)
    }
  }, [])

  const createFolder = useCallback(async (name, parentId = '') => {
    try {
      if (go?.CreateFolder) {
        await go.CreateFolder(name, parentId)
        await loadConnections()
      }
    } catch (err) {
      console.error('Failed to create folder:', err)
      throw err
    }
  }, [loadConnections])

  const deleteFolder = useCallback(async (folderId) => {
    try {
      if (go?.DeleteFolder) {
        await go.DeleteFolder(folderId)
        await loadConnections()
      }
    } catch (err) {
      console.error('Failed to delete folder:', err)
      throw err
    }
  }, [loadConnections])

  const moveConnectionToFolder = useCallback(async (connId, folderId) => {
    try {
      if (go?.MoveConnectionToFolder) {
        await go.MoveConnectionToFolder(connId, folderId || '')
        await loadConnections()
      }
    } catch (err) {
      console.error('Failed to move connection:', err)
      throw err
    }
  }, [loadConnections])

  const moveFolderToFolder = useCallback(async (folderId, parentId) => {
    try {
      if (go?.UpdateFolder) {
        // Pass empty string for name to keep existing name
        await go.UpdateFolder(folderId, '', parentId || '')
        await loadConnections()
      }
    } catch (err) {
      console.error('Failed to move folder:', err)
      throw err
    }
  }, [loadConnections])

  const getConnectionById = useCallback((connId) => {
    return connections.find(c => c.id === connId)
  }, [connections])

  const isConnecting = useCallback((connId) => {
    return connectingIds.has(connId)
  }, [connectingIds])

  const value = {
    // State
    connections,
    folders,
    activeConnections,
    connectingIds,
    selectedConnection,
    selectedDatabase,
    selectedCollection,

    // Selection setters
    setSelectedConnection,
    setSelectedDatabase,
    setSelectedCollection,

    // Connection actions
    connect,
    disconnect,
    disconnectAll,
    disconnectOthers,
    saveConnection,
    deleteConnection,
    duplicateConnection,
    refreshConnection,

    // Database/collection actions
    dropDatabase,
    dropCollection,
    clearCollection,

    // Folder actions
    createFolder,
    deleteFolder,
    moveConnectionToFolder,
    moveFolderToFolder,

    // Helpers
    getConnectionById,
    loadConnections,
    isConnecting,
  }

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  )
}

export function useConnection() {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within ConnectionProvider')
  }
  return context
}

export default ConnectionContext
