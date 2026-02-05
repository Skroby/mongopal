import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import { useConnection } from './ConnectionContext'

const TabContext = createContext(null)

const DEFAULT_ACCENT_COLOR = '#4CC38A'
const SESSION_STORAGE_KEY = 'mongopal-session'

// Load session from localStorage
function loadSession() {
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (err) {
    console.error('Failed to load session:', err)
  }
  return null
}

// Save session to localStorage
function saveSession(session) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch (err) {
    console.error('Failed to save session:', err)
  }
}

export function TabProvider({ children }) {
  const { getConnectionById, connections } = useConnection()

  // Tab state - initialize from session if available
  const [tabs, setTabs] = useState(() => {
    const session = loadSession()
    if (session?.tabs) {
      // Restore tabs without document content (just metadata)
      // Mark as restored so CollectionView doesn't auto-execute queries
      return session.tabs.map(tab => ({
        ...tab,
        document: null, // Don't restore document content
        documentId: tab.documentId || null,
        restored: true, // Flag for restored tabs - don't auto-execute
      }))
    }
    return []
  })
  const [activeTab, setActiveTab] = useState(() => {
    const session = loadSession()
    return session?.activeTab || null
  })

  // Track connected connections for session
  const [sessionConnections, setSessionConnections] = useState(() => {
    const session = loadSession()
    return session?.connectedIds || []
  })

  // Save session when tabs change
  useEffect(() => {
    const session = {
      tabs: tabs.map(tab => ({
        id: tab.id,
        type: tab.type,
        connectionId: tab.connectionId,
        database: tab.database,
        collection: tab.collection,
        label: tab.label,
        color: tab.color,
        pinned: tab.pinned,
        documentId: tab.documentId || null,
      })),
      activeTab,
      connectedIds: sessionConnections,
    }
    saveSession(session)
  }, [tabs, activeTab, sessionConnections])

  // Update session connections when a connection is made
  const trackConnection = useCallback((connId) => {
    setSessionConnections(prev => {
      if (prev.includes(connId)) return prev
      return [...prev, connId]
    })
  }, [])

  // Remove connection from session when disconnected
  const untrackConnection = useCallback((connId) => {
    setSessionConnections(prev => prev.filter(id => id !== connId))
  }, [])

  // Derived state
  const currentTab = useMemo(() => tabs.find(t => t.id === activeTab), [tabs, activeTab])

  // Open a collection tab
  const openTab = useCallback((connectionId, database, collection) => {
    const tabId = `${connectionId}.${database}.${collection}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      // If tab was restored from session, clear the flag so it auto-executes
      if (existingTab.restored) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, restored: false } : t
        ))
      }
      setActiveTab(tabId)
    } else {
      const conn = getConnectionById(connectionId)
      const newTab = {
        id: tabId,
        type: 'collection',
        connectionId,
        database,
        collection,
        label: collection,
        color: conn?.color || DEFAULT_ACCENT_COLOR,
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }, [tabs, getConnectionById])

  // Open a new query tab (for + button)
  const openNewQueryTab = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab || tab.type === 'document') return

    const { connectionId, database, collection } = tab
    const conn = getConnectionById(connectionId)
    const tabId = `${connectionId}.${database}.${collection}.${Date.now()}`

    const newTab = {
      id: tabId,
      type: 'collection',
      connectionId,
      database,
      collection,
      label: collection,
      color: conn?.color || DEFAULT_ACCENT_COLOR,
      pinned: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveTab(tabId)
  }, [tabs, activeTab, getConnectionById])

  // Open document in a new tab
  const openDocumentTab = useCallback((connectionId, database, collection, document, documentId) => {
    const shortId = typeof documentId === 'string' ? documentId.slice(0, 8) : String(documentId).slice(0, 8)
    const tabId = `doc:${connectionId}.${database}.${collection}.${documentId}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      // Clear restored flag if present
      if (existingTab.restored) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, restored: false } : t
        ))
      }
      setActiveTab(tabId)
    } else {
      const conn = getConnectionById(connectionId)
      const newTab = {
        id: tabId,
        type: 'document',
        connectionId,
        database,
        collection,
        document,
        documentId,
        label: `${shortId}...`,
        color: conn?.color || DEFAULT_ACCENT_COLOR,
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }, [tabs, getConnectionById])

  // Open insert tab for new document
  const openInsertTab = useCallback((connectionId, database, collection) => {
    const conn = getConnectionById(connectionId)
    const tabId = `insert:${connectionId}.${database}.${collection}.${Date.now()}`

    const newTab = {
      id: tabId,
      type: 'insert',
      connectionId,
      database,
      collection,
      label: 'New Document',
      color: conn?.color || DEFAULT_ACCENT_COLOR,
      pinned: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveTab(tabId)
  }, [getConnectionById])

  // Open schema view tab
  const openSchemaTab = useCallback((connectionId, database, collection) => {
    const tabId = `schema:${connectionId}.${database}.${collection}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      // Clear restored flag if present
      if (existingTab.restored) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, restored: false } : t
        ))
      }
      setActiveTab(tabId)
    } else {
      const conn = getConnectionById(connectionId)
      const newTab = {
        id: tabId,
        type: 'schema',
        connectionId,
        database,
        collection,
        label: `Schema: ${collection}`,
        color: conn?.color || DEFAULT_ACCENT_COLOR,
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }, [tabs, getConnectionById])

  // Open index manager tab
  const openIndexTab = useCallback((connectionId, database, collection) => {
    const tabId = `indexes:${connectionId}.${database}.${collection}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
      // Clear restored flag if present
      if (existingTab.restored) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, restored: false } : t
        ))
      }
      setActiveTab(tabId)
    } else {
      const conn = getConnectionById(connectionId)
      const newTab = {
        id: tabId,
        type: 'indexes',
        connectionId,
        database,
        collection,
        label: collection,
        color: conn?.color || DEFAULT_ACCENT_COLOR,
        pinned: false,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
    }
  }, [tabs, getConnectionById])

  // Convert insert tab to document tab after successful insert
  const convertInsertToDocumentTab = useCallback((tabId, document, documentId) => {
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
  }, [tabs])

  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId)
      // Use functional update for activeTab to avoid stale closure
      setActiveTab(currentActiveTab => {
        if (currentActiveTab === tabId && filtered.length > 0) {
          return filtered[filtered.length - 1]?.id || null
        } else if (filtered.length === 0) {
          return null
        }
        return currentActiveTab
      })
      return filtered
    })
  }, [])

  const pinTab = useCallback((tabId) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, pinned: !t.pinned } : t
    ))
  }, [])

  const renameTab = useCallback((tabId, newLabel) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, label: newLabel } : t
    ))
  }, [])

  // Set dirty state for a tab (for unsaved changes indicator)
  const setTabDirty = useCallback((tabId, isDirty) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, dirty: isDirty } : t
    ))
  }, [])

  // Mark a restored tab as activated (clears restored flag)
  // Called when user explicitly runs a query on a restored tab
  const markTabActivated = useCallback((tabId) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, restored: false } : t
    ))
  }, [])

  // Update a tab's document (for document edit tabs after loading)
  const updateTabDocument = useCallback((tabId, document) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, document, restored: false } : t
    ))
  }, [])

  const reorderTabs = useCallback((draggedId, targetId) => {
    setTabs(prev => {
      const newTabs = [...prev]
      const draggedIndex = newTabs.findIndex(t => t.id === draggedId)
      const targetIndex = newTabs.findIndex(t => t.id === targetId)
      if (draggedIndex === -1 || targetIndex === -1) return prev

      const [dragged] = newTabs.splice(draggedIndex, 1)
      newTabs.splice(targetIndex, 0, dragged)
      return newTabs
    })
  }, [])

  // Close tabs for a specific connection (used when disconnecting)
  const closeTabsForConnection = useCallback((connectionId) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.connectionId !== connectionId)
      if (activeTab && !filtered.find(t => t.id === activeTab)) {
        setActiveTab(filtered[filtered.length - 1]?.id || null)
      }
      return filtered
    })
  }, [activeTab])

  // Close tabs for a specific database (used when dropping database)
  const closeTabsForDatabase = useCallback((connectionId, database) => {
    setTabs(prev => {
      const filtered = prev.filter(t => !(t.connectionId === connectionId && t.database === database))
      if (activeTab && !filtered.find(t => t.id === activeTab)) {
        setActiveTab(filtered[filtered.length - 1]?.id || null)
      }
      return filtered
    })
  }, [activeTab])

  // Close tabs for a specific collection (used when dropping collection)
  const closeTabsForCollection = useCallback((connectionId, database, collection) => {
    setTabs(prev => {
      const filtered = prev.filter(t => !(t.connectionId === connectionId && t.database === database && t.collection === collection))
      if (activeTab && !filtered.find(t => t.id === activeTab)) {
        setActiveTab(filtered[filtered.length - 1]?.id || null)
      }
      return filtered
    })
  }, [activeTab])

  // Close all tabs (used when disconnecting all)
  const closeAllTabs = useCallback(() => {
    setTabs([])
    setActiveTab(null)
  }, [])

  // Keep only tabs for a specific connection (used when disconnecting others)
  const keepOnlyConnectionTabs = useCallback((connectionId) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.connectionId === connectionId)
      if (activeTab && !filtered.find(t => t.id === activeTab)) {
        setActiveTab(filtered[filtered.length - 1]?.id || null)
      }
      return filtered
    })
  }, [activeTab])

  // Navigate to next tab
  const nextTab = useCallback(() => {
    if (tabs.length === 0) return
    const currentIndex = tabs.findIndex(t => t.id === activeTab)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % tabs.length : 0
    setActiveTab(tabs[nextIndex].id)
  }, [tabs, activeTab])

  // Navigate to previous tab
  const previousTab = useCallback(() => {
    if (tabs.length === 0) return
    const currentIndex = tabs.findIndex(t => t.id === activeTab)
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1
    setActiveTab(tabs[prevIndex].id)
  }, [tabs, activeTab])

  // Jump to tab by number (1-9)
  const goToTab = useCallback((number) => {
    if (number < 1 || number > tabs.length) return
    setActiveTab(tabs[number - 1].id)
  }, [tabs])

  // Close current active tab
  const closeActiveTab = useCallback(() => {
    if (!activeTab) return
    const tab = tabs.find(t => t.id === activeTab)
    // Don't close pinned tabs
    if (tab?.pinned) return
    closeTab(activeTab)
  }, [activeTab, tabs, closeTab])

  const value = {
    // State
    tabs,
    activeTab,
    currentTab,

    // Tab selection
    setActiveTab,

    // Tab operations
    openTab,
    openNewQueryTab,
    openDocumentTab,
    openInsertTab,
    openSchemaTab,
    openIndexTab,
    closeTab,
    pinTab,
    renameTab,
    reorderTabs,
    convertInsertToDocumentTab,
    setTabDirty,
    markTabActivated,
    updateTabDocument,

    // Bulk close operations
    closeTabsForConnection,
    closeTabsForDatabase,
    closeTabsForCollection,
    closeAllTabs,
    keepOnlyConnectionTabs,

    // Tab navigation
    nextTab,
    previousTab,
    goToTab,
    closeActiveTab,

    // Session persistence
    sessionConnections,
    trackConnection,
    untrackConnection,
  }

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  )
}

export function useTab() {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error('useTab must be used within TabProvider')
  }
  return context
}

export default TabContext
