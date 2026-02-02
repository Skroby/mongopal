import { useState, useRef, useEffect } from 'react'
import { useTab } from './contexts/TabContext'

const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const PinIcon = ({ className = "w-4 h-4", filled = false }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
)

const DocumentIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const PlayIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const SchemaIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
)

const IndexIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6v12M15 6v12" />
  </svg>
)

export default function TabBar() {
  const {
    tabs,
    activeTab,
    setActiveTab,
    closeTab,
    openNewQueryTab,
    pinTab,
    renameTab,
    reorderTabs,
  } = useTab()

  const [draggedTab, setDraggedTab] = useState(null)
  const [dragOverTab, setDragOverTab] = useState(null)
  const [editingTabId, setEditingTabId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const editInputRef = useRef(null)
  const tabRefs = useRef({})

  // Scroll active tab into view
  useEffect(() => {
    if (activeTab && tabRefs.current[activeTab]) {
      const tab = tabRefs.current[activeTab]
      const container = tab.parentElement
      if (container) {
        const tabLeft = tab.offsetLeft
        const tabRight = tabLeft + tab.offsetWidth
        const containerLeft = container.scrollLeft
        const containerRight = containerLeft + container.clientWidth

        if (tabLeft < containerLeft) {
          container.scrollTo({ left: tabLeft - 8, behavior: 'smooth' })
        } else if (tabRight > containerRight) {
          container.scrollTo({ left: tabRight - container.clientWidth + 8, behavior: 'smooth' })
        }
      }
    }
  }, [activeTab])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  // Focus input when editing
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingTabId])

  if (tabs.length === 0) {
    return (
      <div className="h-9 bg-surface-secondary border-b border-border flex items-center px-2 titlebar-drag">
        <span className="text-xs text-zinc-400">No open tabs</span>
      </div>
    )
  }

  // Sort tabs: pinned first, then by order
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return 0
  })

  const handleDragStart = (e, tab) => {
    setDraggedTab(tab)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.id)
  }

  const handleDragOver = (e, tab) => {
    e.preventDefault()
    if (draggedTab && draggedTab.id !== tab.id) {
      if (draggedTab.pinned === tab.pinned) {
        setDragOverTab(tab.id)
      }
    }
  }

  const handleDragLeave = () => {
    setDragOverTab(null)
  }

  const handleDrop = (e, targetTab) => {
    e.preventDefault()
    if (draggedTab && draggedTab.id !== targetTab.id && reorderTabs) {
      if (draggedTab.pinned === targetTab.pinned) {
        reorderTabs(draggedTab.id, targetTab.id)
      }
    }
    setDraggedTab(null)
    setDragOverTab(null)
  }

  const handleDragEnd = () => {
    setDraggedTab(null)
    setDragOverTab(null)
  }

  const handleContextMenu = (e, tab) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tabId: tab.id,
      pinned: tab.pinned
    })
  }

  const handleDoubleClick = (tab) => {
    setEditingTabId(tab.id)
    setEditValue(tab.label)
  }

  const handleEditSubmit = (tabId) => {
    if (editValue.trim() && renameTab) {
      renameTab(tabId, editValue.trim())
    }
    setEditingTabId(null)
    setEditValue('')
  }

  const handleEditKeyDown = (e, tabId) => {
    if (e.key === 'Enter') {
      handleEditSubmit(tabId)
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
      setEditValue('')
    }
  }

  return (
    <div className="h-9 bg-surface-secondary border-b border-border flex items-center overflow-x-auto overflow-y-hidden titlebar-drag">
      {sortedTabs.map(tab => (
        <div
          key={tab.id}
          ref={el => tabRefs.current[tab.id] = el}
          className={`tab titlebar-no-drag ${activeTab === tab.id ? 'active' : ''} group ${
            dragOverTab === tab.id ? 'ring-2 ring-accent ring-inset' : ''
          } ${draggedTab?.id === tab.id ? 'opacity-50' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab)}
          onDoubleClick={() => handleDoubleClick(tab)}
          draggable={editingTabId !== tab.id}
          onDragStart={(e) => handleDragStart(e, tab)}
          onDragOver={(e) => handleDragOver(e, tab)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, tab)}
          onDragEnd={handleDragEnd}
          tabIndex={0}
          role="tab"
          aria-selected={activeTab === tab.id}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setActiveTab(tab.id)
            }
          }}
        >
          {/* Connection color indicator */}
          {tab.color && (
            <span
              className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
              style={{ backgroundColor: tab.color }}
            />
          )}

          {/* Pin indicator */}
          {tab.pinned && (
            <PinIcon className="w-3 h-3 text-accent flex-shrink-0" filled />
          )}

          {/* Tab type icon */}
          {tab.type === 'document' ? (
            <DocumentIcon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          ) : tab.type === 'insert' ? (
            <PlusIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          ) : tab.type === 'schema' ? (
            <SchemaIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          ) : tab.type === 'indexes' ? (
            <IndexIcon className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          ) : (
            <PlayIcon className="w-3 h-3 text-accent flex-shrink-0" />
          )}

          {/* Tab label - editable or static */}
          {editingTabId === tab.id ? (
            <input
              ref={editInputRef}
              type="text"
              className="bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded w-48 outline-none"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => handleEditKeyDown(e, tab.id)}
              onBlur={() => handleEditSubmit(tab.id)}
              onClick={(e) => e.stopPropagation()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          ) : (
            <span className="truncate max-w-[150px]">{tab.label}</span>
          )}

          {/* Dirty indicator dot - show when document has unsaved changes */}
          {tab.dirty && !tab.pinned && editingTabId !== tab.id && (
            <span
              className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
              title="Unsaved changes"
            />
          )}

          {/* Close button - always visible on active tab, hover on others, hidden for pinned */}
          {!tab.pinned && editingTabId !== tab.id && (
            <button
              className={`icon-btn p-0.5 hover:bg-zinc-600 rounded transition-opacity ${
                activeTab === tab.id
                  ? 'opacity-60 hover:opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              title="Close tab"
              aria-label={`Close ${tab.label}`}
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* Add tab button */}
      <button
        className="icon-btn p-1.5 mx-1 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 titlebar-no-drag"
        onClick={openNewQueryTab}
        title="New Query Tab"
      >
        <PlusIcon className="w-4 h-4" />
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="context-menu-item w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            onClick={() => {
              const tab = tabs.find(t => t.id === contextMenu.tabId)
              if (tab) handleDoubleClick(tab)
              setContextMenu(null)
            }}
          >
            Rename
          </button>
          <button
            className="context-menu-item w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            onClick={() => {
              if (pinTab) pinTab(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            {contextMenu.pinned ? 'Unpin' : 'Pin'}
          </button>
          <div className="border-t border-zinc-700 my-1" />
          <button
            className="context-menu-item w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            onClick={() => {
              // Close all unpinned tabs except the right-clicked one
              tabs.filter(t => !t.pinned && t.id !== contextMenu.tabId).forEach(t => closeTab(t.id))
              setContextMenu(null)
            }}
          >
            Close Others
          </button>
          <button
            className="context-menu-item w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            onClick={() => {
              // Close all unpinned tabs
              tabs.filter(t => !t.pinned).forEach(t => closeTab(t.id))
              setContextMenu(null)
            }}
          >
            Close All
          </button>
          <div className="border-t border-zinc-700 my-1" />
          <button
            className="context-menu-item w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-700"
            onClick={() => {
              closeTab(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            Close Tab
          </button>
        </div>
      )}
    </div>
  )
}
