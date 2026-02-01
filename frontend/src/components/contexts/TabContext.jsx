import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { useConnection } from './ConnectionContext'

const TabContext = createContext(null)

const DEFAULT_ACCENT_COLOR = '#4CC38A'

export function TabProvider({ children }) {
  const { getConnectionById } = useConnection()

  // Tab state
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState(null)

  // Derived state
  const currentTab = useMemo(() => tabs.find(t => t.id === activeTab), [tabs, activeTab])

  // Open a collection tab
  const openTab = useCallback((connectionId, database, collection) => {
    const tabId = `${connectionId}.${database}.${collection}`
    const existingTab = tabs.find(t => t.id === tabId)

    if (existingTab) {
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
      // If we're closing the active tab, select another
      if (activeTab === tabId && filtered.length > 0) {
        // Select the last tab or the one before the closed tab
        setActiveTab(filtered[filtered.length - 1]?.id || null)
      } else if (filtered.length === 0) {
        setActiveTab(null)
      }
      return filtered
    })
  }, [activeTab])

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
    closeTab,
    pinTab,
    renameTab,
    reorderTabs,
    convertInsertToDocumentTab,

    // Bulk close operations
    closeTabsForConnection,
    closeTabsForDatabase,
    closeTabsForCollection,
    closeAllTabs,
    keepOnlyConnectionTabs,
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
