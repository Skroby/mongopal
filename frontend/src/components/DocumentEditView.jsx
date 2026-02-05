import { useState, useEffect, useRef, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import MonacoDiffEditor from './MonacoDiffEditor'
import { useNotification } from './NotificationContext'
import { useConnection } from './contexts/ConnectionContext'
import { useTab } from './contexts/TabContext'
import ConfirmDialog from './ConfirmDialog'
import MonacoErrorBoundary from './MonacoErrorBoundary'
import { getErrorSummary } from '../utils/errorParser'

const go = window.go?.main?.App

// Maximum number of history entries to keep
const MAX_HISTORY_ENTRIES = 50

// Recursively sort object keys for consistent comparison
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }
  const sorted = {}
  // Sort keys alphabetically, but keep _id first if present
  const keys = Object.keys(obj).sort((a, b) => {
    if (a === '_id') return -1
    if (b === '_id') return 1
    return a.localeCompare(b)
  })
  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key])
  }
  return sorted
}

// Sort JSON string keys for consistent diff comparison
// Returns original string if parsing fails (invalid JSON)
function sortJsonString(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr)
    return JSON.stringify(sortObjectKeys(parsed), null, 2)
  } catch {
    return jsonStr
  }
}

// Compute a human-readable diff summary between two JSON documents
// Returns a string like "updated name", "added 2 fields", "removed status, updated count"
// Exported for testing
export function computeDiffSummary(oldContent, newContent) {
  try {
    const oldDoc = typeof oldContent === 'string' ? JSON.parse(oldContent) : oldContent
    const newDoc = typeof newContent === 'string' ? JSON.parse(newContent) : newContent

    const added = []
    const removed = []
    const updated = []

    // Get all keys from both documents (excluding _id which shouldn't change)
    const oldKeys = new Set(Object.keys(oldDoc).filter(k => k !== '_id'))
    const newKeys = new Set(Object.keys(newDoc).filter(k => k !== '_id'))

    // Find added fields (in new but not in old)
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        added.push(key)
      }
    }

    // Find removed fields (in old but not in new)
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        removed.push(key)
      }
    }

    // Find updated fields (in both but with different values)
    for (const key of oldKeys) {
      if (newKeys.has(key)) {
        const oldVal = JSON.stringify(sortObjectKeys(oldDoc[key]))
        const newVal = JSON.stringify(sortObjectKeys(newDoc[key]))
        if (oldVal !== newVal) {
          updated.push(key)
        }
      }
    }

    // No changes
    if (added.length === 0 && removed.length === 0 && updated.length === 0) {
      return 'no changes'
    }

    // Build summary parts
    const parts = []

    // If total changes are small (≤2), show field names
    const totalChanges = added.length + removed.length + updated.length
    if (totalChanges <= 2) {
      if (updated.length > 0) parts.push(`updated ${updated.join(', ')}`)
      if (added.length > 0) parts.push(`added ${added.join(', ')}`)
      if (removed.length > 0) parts.push(`removed ${removed.join(', ')}`)
    } else {
      // Many changes - show counts
      if (updated.length > 0) parts.push(`${updated.length} updated`)
      if (added.length > 0) parts.push(`${added.length} added`)
      if (removed.length > 0) parts.push(`${removed.length} removed`)
    }

    return parts.join(', ')
  } catch {
    return 'changes detected'
  }
}

// Icons
const SaveIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
)

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const CopyIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const FormatIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
  </svg>
)

const SearchIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const RefreshIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const HistoryIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ChevronDownIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const RevertIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
  </svg>
)

// Format document ID for display (handles ObjectId, Binary, etc.)
function formatDocId(docId) {
  if (!docId) return 'unknown'
  if (typeof docId === 'string') return docId
  if (docId.$oid) return docId.$oid
  if (docId.$binary) return `Binary(${docId.$binary.subType || ''})`
  if (docId.$uuid) return docId.$uuid
  return JSON.stringify(docId)
}

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

export default function DocumentEditView({
  connectionId,
  database,
  collection,
  document,
  documentId,
  onSave,
  mode = 'edit', // 'edit' or 'insert'
  onInsertComplete,
  tabId,
  readOnly = false,
}) {
  const { notify } = useNotification()
  const { activeConnections, connectingIds, connect } = useConnection()
  const { setTabDirty, markTabActivated, updateTabDocument, tabs } = useTab()
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const historyDropdownRef = useRef(null)

  // Get current tab to check if it was restored from session
  const currentTab = tabs.find(t => t.id === tabId)
  const isRestoredTab = currentTab?.restored === true

  // Connection state
  const isConnected = activeConnections.includes(connectionId)
  const isConnecting = connectingIds.has(connectionId)

  const isInsertMode = mode === 'insert'
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalContent, setOriginalContent] = useState('')
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false)

  // Document loading state (for restored sessions)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [loadedDocument, setLoadedDocument] = useState(null)
  const [documentNotFound, setDocumentNotFound] = useState(false)

  // Edit history state
  const [editHistory, setEditHistory] = useState([]) // Array of { content, timestamp } - previous saves (not current)
  const [baselineEntry, setBaselineEntry] = useState(null) // Original document state
  const [hasSavedOnce, setHasSavedOnce] = useState(false) // Track if at least one save occurred
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [previewHistoryIndex, setPreviewHistoryIndex] = useState(null)
  const [historyDiffSideBySide, setHistoryDiffSideBySide] = useState(true)
  const baselineSetRef = useRef(false) // Track if baseline has been set for this document
  const lastDocumentIdRef = useRef(documentId) // Track document ID to detect changes

  // Reset baseline tracking when document ID changes (different document opened)
  useEffect(() => {
    if (documentId !== lastDocumentIdRef.current) {
      baselineSetRef.current = false
      lastDocumentIdRef.current = documentId
    }
  }, [documentId])

  // Close history dropdown on click outside
  useEffect(() => {
    if (!showHistoryDropdown) return
    // Guard against document being null/undefined in Wails WebKit
    if (typeof window === 'undefined' || !window.document) return
    const handleClickOutside = (e) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target)) {
        setShowHistoryDropdown(false)
        setPreviewHistoryIndex(null)
      }
    }
    window.document.addEventListener('mousedown', handleClickOutside)
    return () => window.document.removeEventListener('mousedown', handleClickOutside)
  }, [showHistoryDropdown])

  // Generate storage key for document history
  const getHistoryStorageKey = () => {
    const docIdStr = typeof documentId === 'object'
      ? JSON.stringify(documentId)
      : String(documentId)
    return `mongopal:history:${connectionId}:${database}:${collection}:${docIdStr}`
  }

  // Load history from storage on mount
  useEffect(() => {
    if (!connectionId || !database || !collection || !documentId) return

    try {
      const key = getHistoryStorageKey()
      const stored = sessionStorage.getItem(key)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEditHistory(parsed)
          setHasSavedOnce(true) // History exists, so saves occurred
        }
      }
    } catch (err) {
      console.warn('[DocumentEditView] Failed to load history from storage:', err)
    }
  }, [connectionId, database, collection, documentId])

  // Save history to storage when it changes
  useEffect(() => {
    if (!connectionId || !database || !collection || !documentId) return
    if (editHistory.length === 0) return

    try {
      const key = getHistoryStorageKey()
      sessionStorage.setItem(key, JSON.stringify(editHistory))
    } catch (err) {
      console.warn('[DocumentEditView] Failed to save history to storage:', err)
    }
  }, [editHistory, connectionId, database, collection, documentId])

  // Add saved content to history (called from handleSave after successful save)
  const addToHistory = (savedContent) => {
    if (!savedContent) return

    setEditHistory(prev => {
      // Don't add duplicate entries (same content as most recent save)
      if (prev.length > 0 && prev[0].content === savedContent) {
        return prev
      }
      const newEntry = {
        content: savedContent,
        timestamp: Date.now(),
      }
      // Keep one slot for baseline, so limit to MAX_HISTORY_ENTRIES - 1
      return [newEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES - 1)
    })
  }

  // Format timestamp for display - returns { relative, exact } for tooltip support
  const formatTimestamp = (ts) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    let relative
    if (diffMins < 1) relative = 'Just now'
    else if (diffMins < 60) relative = `${diffMins}m ago`
    else if (diffHours < 24) relative = `${diffHours}h ago`
    else if (diffDays < 7) relative = `${diffDays}d ago`
    else relative = date.toLocaleDateString()

    const exact = date.toLocaleString()
    return { relative, exact }
  }

  // Get version label for history entry (V2, V3, etc. - Baseline is handled separately)
  const getVersionLabel = (index, total) => {
    // Index 0 is most recent save, last entry is baseline
    // Version numbers: most recent = highest version
    // V2 is first save after baseline, V3 is second save, etc.
    const version = total - index
    return `V${version}`
  }

  // Combined history entries - only include baseline if there are saved versions
  // (baseline only makes sense to show when you have something to compare/revert from)
  const allHistoryEntries = useMemo(() => {
    if (!baselineEntry) return editHistory
    // Only show history (including baseline) after at least one save
    if (!hasSavedOnce) return []
    return [...editHistory, baselineEntry]
  }, [editHistory, baselineEntry, hasSavedOnce])

  // Revert to a history entry
  const revertToHistory = (index) => {
    const entry = allHistoryEntries[index]
    if (entry) {
      setContent(entry.content)
      editorRef.current?.setValue(entry.content)
      setShowHistoryDropdown(false)
      setPreviewHistoryIndex(null)
      notify.info(entry.isBaseline ? 'Reverted to baseline' : 'Reverted to previous state')
    }
  }

  // Load document from database (for restored sessions or when connection restored)
  const loadDocument = async () => {
    if (!documentId || !go?.GetDocument) return

    setLoadingDocument(true)
    setDocumentNotFound(false)
    try {
      const jsonStr = await go.GetDocument(connectionId, database, collection, documentId)
      const doc = JSON.parse(jsonStr)
      // Store in tab context so it persists across tab switches
      if (updateTabDocument) updateTabDocument(tabId, doc)
    } catch (err) {
      const errorMsg = err?.message || String(err)
      if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('no document')) {
        setDocumentNotFound(true)
        notify.error('Document not found in database')
      } else {
        notify.error(getErrorSummary(errorMsg))
      }
    } finally {
      setLoadingDocument(false)
    }
  }

  // Format the document ID for display
  const displayId = isInsertMode ? 'New Document' : formatDocId(documentId)

  // Use the document from props, or loaded document for restored sessions
  const effectiveDocument = document || loadedDocument

  // Initialize content from document or empty for insert mode
  useEffect(() => {
    if (isInsertMode) {
      const initial = '{\n  \n}'
      setContent(initial)
      setOriginalContent(initial)
      setHasChanges(false)
      // Set baseline only once for insert mode
      if (!baselineSetRef.current) {
        setBaselineEntry({ content: initial, timestamp: Date.now(), isBaseline: true })
        // Note: don't clear editHistory here - it may have been loaded from storage
        baselineSetRef.current = true
      }
    } else if (effectiveDocument) {
      const formatted = JSON.stringify(effectiveDocument, null, 2)
      setContent(formatted)
      setOriginalContent(formatted)
      setHasChanges(false)
      // Set baseline only once when document first loads
      if (!baselineSetRef.current) {
        setBaselineEntry({ content: formatted, timestamp: Date.now(), isBaseline: true })
        // Note: don't clear editHistory here - it may have been loaded from storage
        baselineSetRef.current = true
      }
    }
  }, [effectiveDocument, isInsertMode])

  // Track changes and update tab dirty state
  useEffect(() => {
    const isDirty = content !== originalContent
    setHasChanges(isDirty)
    // Update tab dirty indicator if tabId is provided
    if (tabId && setTabDirty) {
      setTabDirty(tabId, isDirty)
    }
  }, [content, originalContent, tabId, setTabDirty])

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Define custom theme matching app's zinc/dark palette
    monaco.editor.defineTheme('mongopal-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // JSON-specific syntax highlighting
        { token: 'string.key.json', foreground: '94a3b8' },  // slate-400 for keys
        { token: 'string.value.json', foreground: '4CC38A' }, // accent green for string values
        { token: 'number', foreground: 'f59e0b' },           // amber-500 for numbers
        { token: 'keyword', foreground: 'a78bfa' },          // violet-400 for true/false/null
      ],
      colors: {
        // Editor backgrounds
        'editor.background': '#18181b',                      // zinc-900
        'editor.foreground': '#f4f4f5',                      // zinc-100
        'editorLineNumber.foreground': '#52525b',            // zinc-600
        'editorLineNumber.activeForeground': '#a1a1aa',      // zinc-400
        'editor.lineHighlightBackground': '#27272a',         // zinc-800
        'editor.lineHighlightBorder': '#00000000',           // transparent

        // Selection colors
        'editor.selectionBackground': '#4CC38A40',           // accent with 25% opacity
        'editor.selectionHighlightBackground': '#4CC38A20',  // accent with 12% opacity
        'editor.wordHighlightBackground': '#4CC38A30',       // accent with 19% opacity
        'editor.findMatchBackground': '#4CC38A40',           // accent with 25% opacity
        'editor.findMatchHighlightBackground': '#4CC38A20',  // accent with 12% opacity

        // Cursor
        'editorCursor.foreground': '#4CC38A',                // accent green

        // Gutter and margins
        'editorGutter.background': '#18181b',                // zinc-900

        // Scrollbar
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#52525b80',           // zinc-600 with 50% opacity
        'scrollbarSlider.hoverBackground': '#71717a80',      // zinc-500 with 50% opacity
        'scrollbarSlider.activeBackground': '#a1a1aa80',     // zinc-400 with 50% opacity

        // Widget backgrounds (find/replace dialog, autocomplete, etc.)
        'editorWidget.background': '#27272a',                // zinc-800
        'editorWidget.border': '#3f3f46',                    // zinc-700
        'input.background': '#18181b',                       // zinc-900
        'input.border': '#3f3f46',                           // zinc-700
        'input.foreground': '#f4f4f5',                       // zinc-100
        'inputOption.activeBorder': '#4CC38A',               // accent
        'inputOption.activeBackground': '#4CC38A40',         // accent with 25% opacity

        // Focus border
        'focusBorder': '#4CC38A',                            // accent

        // Bracket matching
        'editorBracketMatch.background': '#4CC38A30',        // accent with 19% opacity
        'editorBracketMatch.border': '#4CC38A',              // accent

        // Indent guides
        'editorIndentGuide.background': '#3f3f46',           // zinc-700
        'editorIndentGuide.activeBackground': '#52525b',     // zinc-600

        // Overview ruler (right edge minimap markers)
        'editorOverviewRuler.border': '#3f3f46',             // zinc-700
      }
    })

    // Apply the custom theme
    monaco.editor.setTheme('mongopal-dark')

    // Configure editor
    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: 'on',
      folding: true,
      renderWhitespace: 'selection',
      wordWrap: 'on',
      automaticLayout: true,
    })

    if (isInsertMode) {
      // Add Cmd+Enter insert shortcut
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => handleInsert()
      )
    } else {
      // Add Cmd+S save shortcut
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => handleSave()
      )
    }
  }

  const handleSave = async () => {
    const currentContent = editorRef.current?.getValue() || content

    try {
      JSON.parse(currentContent)
    } catch (err) {
      notify.error(`Invalid JSON: ${err.message}`)
      return
    }

    setSaving(true)
    try {
      if (go?.UpdateDocument) {
        await go.UpdateDocument(connectionId, database, collection, documentId, currentContent)
        notify.success('Document saved')
        // Add the PREVIOUS saved version to history (what we're replacing)
        // Don't add if it's the baseline (that's shown separately in history)
        if (originalContent && originalContent !== baselineEntry?.content) {
          addToHistory(originalContent)
        }
        setHasSavedOnce(true)
        setOriginalContent(currentContent)
        setHasChanges(false)
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        if (onSave) onSave()
      }
    } catch (err) {
      notify.error(getErrorSummary(err?.message || String(err)))
      setSaving(false)
    }
  }

  const handleInsert = async () => {
    const currentContent = editorRef.current?.getValue() || content

    try {
      JSON.parse(currentContent)
    } catch (err) {
      notify.error(`Invalid JSON: ${err.message}`)
      return
    }

    setInserting(true)
    try {
      if (go?.InsertDocument) {
        const newId = await go.InsertDocument(connectionId, database, collection, currentContent)
        notify.success(`Document inserted: ${newId}`)

        // Fetch the inserted document and convert tab to edit mode
        if (go?.GetDocument && onInsertComplete) {
          const docJson = await go.GetDocument(connectionId, database, collection, newId)
          const doc = JSON.parse(docJson)
          onInsertComplete(doc, newId)
        }
      }
    } catch (err) {
      notify.error(getErrorSummary(err?.message || String(err)))
    } finally {
      setInserting(false)
    }
  }

  const handleFormat = () => {
    const currentContent = editorRef.current?.getValue() || content
    try {
      const parsed = JSON.parse(currentContent)
      const formatted = JSON.stringify(parsed, null, 2)
      setContent(formatted)
      editorRef.current?.setValue(formatted)
    } catch (err) {
      notify.error(`Cannot format: Invalid JSON`)
    }
  }

  const doRefresh = async () => {
    setRefreshing(true)
    try {
      if (go?.GetDocument) {
        const jsonStr = await go.GetDocument(connectionId, database, collection, documentId)
        const formatted = JSON.stringify(JSON.parse(jsonStr), null, 2)
        setContent(formatted)
        setOriginalContent(formatted)
        editorRef.current?.setValue(formatted)
        setHasChanges(false)
        notify.success('Document refreshed')
      }
    } catch (err) {
      notify.error(getErrorSummary(err?.message || String(err)))
    } finally {
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    if (hasChanges) {
      setShowRefreshConfirm(true)
    } else {
      doRefresh()
    }
  }

  const handleCopy = async () => {
    const currentContent = editorRef.current?.getValue() || content
    try {
      await navigator.clipboard.writeText(currentContent)
      notify.success('Copied to clipboard')
    } catch (err) {
      notify.error('Failed to copy')
    }
  }

  const openFind = () => {
    // Trigger Monaco's built-in find widget
    editorRef.current?.getAction('actions.find')?.run()
  }

  const openFindReplace = () => {
    // Trigger Monaco's built-in find and replace widget
    editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run()
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border flex items-center justify-between gap-4 bg-surface-secondary">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-zinc-400 truncate max-w-[150px]" title={database}>{database}</span>
          <span className="text-zinc-600 flex-shrink-0">&gt;</span>
          <span className="text-zinc-400 truncate max-w-[150px]" title={collection}>{collection}</span>
          <span className="text-zinc-600 flex-shrink-0">&gt;</span>
          <span className="text-zinc-200 font-mono truncate max-w-[200px]" title={displayId}>{displayId}</span>
          {hasChanges && (
            <span className="text-amber-400 text-xs flex-shrink-0">(modified)</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost p-1.5"
            onClick={openFind}
            title="Find (Cmd+F)"
          >
            <SearchIcon className="w-4 h-4" />
          </button>
          <button
            className="btn btn-ghost p-1.5"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <CopyIcon className="w-4 h-4" />
          </button>
          <button
            className="btn btn-ghost p-1.5"
            onClick={handleFormat}
            title="Format JSON"
          >
            <FormatIcon className="w-4 h-4" />
          </button>
          {!isInsertMode && (
            <>
              <div className="relative" ref={historyDropdownRef}>
                <button
                  className={`btn btn-ghost p-1.5 flex items-center gap-1 ${allHistoryEntries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => allHistoryEntries.length > 0 && setShowHistoryDropdown(!showHistoryDropdown)}
                  disabled={allHistoryEntries.length === 0}
                  title={allHistoryEntries.length > 0 ? `${allHistoryEntries.length} history entries` : 'No history yet'}
                >
                  <HistoryIcon className="w-4 h-4" />
                  {allHistoryEntries.length > 0 && (
                    <span className="text-xs text-zinc-400">({allHistoryEntries.length})</span>
                  )}
                </button>

                {showHistoryDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-auto">
                    <div className="px-3 py-2 border-b border-zinc-700 text-xs text-zinc-400 sticky top-0 bg-zinc-800">
                      Edit History - Click to preview, double-click to revert
                    </div>
                    {allHistoryEntries.map((entry, idx) => {
                      const ts = entry.isBaseline ? null : formatTimestamp(entry.timestamp)
                      const versionLabel = entry.isBaseline ? 'Baseline' : getVersionLabel(idx, allHistoryEntries.length)
                      return (
                        <button
                          key={idx}
                          className={`w-full px-3 py-2 text-left text-sm border-b border-zinc-700 last:border-0 hover:bg-zinc-700 ${previewHistoryIndex === idx ? 'bg-zinc-600' : ''}`}
                          onClick={() => {
                            const newIndex = previewHistoryIndex === idx ? null : idx
                            setPreviewHistoryIndex(newIndex)
                            // Close dropdown when opening preview
                            if (newIndex !== null) {
                              setShowHistoryDropdown(false)
                            }
                          }}
                          onDoubleClick={() => revertToHistory(idx)}
                          title={ts ? ts.exact : 'Original document state'}
                        >
                          <div className="flex items-center justify-between">
                            <span className={entry.isBaseline ? 'text-amber-400 font-medium' : 'text-zinc-300'}>
                              {versionLabel}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {ts ? ts.relative : ''}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500 truncate mt-0.5">
                            {computeDiffSummary(entry.content, content)}
                          </div>
                          {previewHistoryIndex === idx && (
                            <div className="mt-1 flex justify-end">
                              <button
                                className="p-1 hover:bg-zinc-600 rounded flex items-center gap-1 text-xs text-accent"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  revertToHistory(idx)
                                }}
                                title="Revert to this state"
                              >
                                <RevertIcon className="w-3.5 h-3.5" />
                                Revert
                              </button>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* History diff preview */}
                {previewHistoryIndex !== null && allHistoryEntries[previewHistoryIndex] && (() => {
                  const previewEntry = allHistoryEntries[previewHistoryIndex]
                  const previewTs = previewEntry.isBaseline ? null : formatTimestamp(previewEntry.timestamp)
                  const previewVersionLabel = previewEntry.isBaseline ? 'Baseline' : getVersionLabel(previewHistoryIndex, allHistoryEntries.length)
                  return (
                  <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={() => setPreviewHistoryIndex(null)}>
                    <div className="w-full max-w-5xl h-[70vh] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-medium text-zinc-200">History Preview</h3>
                          <span className="text-xs text-zinc-500" title={previewTs ? previewTs.exact : 'Original document state'}>
                            {previewVersionLabel}{previewTs ? ` (${previewTs.relative})` : ''} vs Current
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* View mode toggle */}
                          <div className="flex items-center bg-zinc-800 rounded-md p-0.5">
                            <button
                              className={`p-1 rounded text-xs ${historyDiffSideBySide ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                              onClick={() => setHistoryDiffSideBySide(true)}
                              title="Side by side"
                            >
                              Side
                            </button>
                            <button
                              className={`p-1 rounded text-xs ${!historyDiffSideBySide ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                              onClick={() => setHistoryDiffSideBySide(false)}
                              title="Stacked"
                            >
                              Stacked
                            </button>
                          </div>
                          <button
                            className="btn btn-primary text-xs flex items-center gap-1"
                            onClick={() => revertToHistory(previewHistoryIndex)}
                          >
                            <RevertIcon className="w-3.5 h-3.5" />
                            Restore this version
                          </button>
                          <button
                            className="icon-btn p-1.5 hover:bg-zinc-700"
                            onClick={() => setPreviewHistoryIndex(null)}
                            title="Close preview (Escape)"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {historyDiffSideBySide && (
                        <div className="flex-shrink-0 flex border-b border-zinc-700 text-xs text-zinc-400">
                          <div className="flex-1 px-4 py-1.5 border-r border-zinc-700 bg-red-900/10">
                            <span className="text-red-400">Previous</span>
                            <span className="ml-2">{previewVersionLabel}{previewTs ? ` (${previewTs.relative})` : ''}</span>
                          </div>
                          <div className="flex-1 px-4 py-1.5 bg-green-900/10">
                            <span className="text-green-400">Current</span>
                          </div>
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <MonacoDiffEditor
                          key={`diff-${previewHistoryIndex}-${historyDiffSideBySide}`}
                          original={sortJsonString(previewEntry.content)}
                          modified={sortJsonString(content)}
                          language="json"
                          renderSideBySide={historyDiffSideBySide}
                        />
                      </div>
                    </div>
                  </div>
                  )
                })()}
              </div>

              <button
                className="btn btn-ghost p-1.5"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Reload from database"
              >
                <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          {isInsertMode ? (
            <button
              className={`btn btn-primary flex items-center gap-1.5 text-xs ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleInsert}
              disabled={inserting || readOnly}
              title={readOnly ? 'Read-only mode' : 'Insert document (Cmd+Enter)'}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {inserting ? 'Inserting...' : 'Insert'}
            </button>
          ) : (
            <button
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                readOnly
                  ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : saved
                  ? 'bg-green-600 text-white'
                  : hasChanges && !saving
                  ? 'bg-accent text-zinc-900 hover:bg-accent/90'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
              onClick={handleSave}
              disabled={saving || saved || !hasChanges || readOnly}
              title={readOnly ? 'Read-only mode' : 'Save (Cmd+S)'}
            >
              {saved ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5" />
                  Saved
                </>
              ) : (
                <>
                  <SaveIcon className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : readOnly ? 'Read-only' : 'Save'}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Monaco Editor or Connection States */}
      <div className="flex-1 overflow-hidden">
        {/* Connection states for edit mode (not insert mode) */}
        {!isInsertMode && !isConnected && !isConnecting ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
            <svg className="w-12 h-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span>Not connected to database</span>
            <button
              onClick={() => connect(connectionId)}
              className="px-4 py-2 bg-accent hover:bg-accent/90 text-zinc-900 rounded-lg font-medium"
            >
              Connect
            </button>
          </div>
        ) : !isInsertMode && isConnecting ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3">
            <div className="spinner" />
            <span>Connecting to database...</span>
          </div>
        ) : !isInsertMode && documentNotFound ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
            <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Document not found</span>
            <p className="text-sm text-zinc-500">The document may have been deleted</p>
          </div>
        ) : !isInsertMode && loadingDocument ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3">
            <div className="spinner" />
            <span>Loading document...</span>
          </div>
        ) : !isInsertMode && !effectiveDocument ? (
          // Connected but document not loaded yet (restored session or connection was restored externally)
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
            <svg className="w-12 h-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{isRestoredTab ? 'Session restored' : 'Document not loaded'}</span>
            <p className="text-sm text-zinc-500">Click Load to fetch document from database</p>
            <button
              onClick={loadDocument}
              className="px-4 py-2 bg-accent hover:bg-accent/90 text-zinc-900 rounded-lg font-medium flex items-center gap-2"
            >
              <RefreshIcon className="w-4 h-4" />
              Load Document
            </button>
          </div>
        ) : (
          <MonacoErrorBoundary value={content} onChange={(value) => setContent(value || '')} readOnly={isInsertMode && saving}>
            <Editor
              height="100%"
              language="json"
              theme="vs-dark"
              value={content}
              onChange={(value) => setContent(value || '')}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                lineNumbers: 'on',
                folding: true,
                renderWhitespace: 'selection',
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                formatOnPaste: true,
              }}
            />
          </MonacoErrorBoundary>
        )}
      </div>

      {/* Refresh confirmation dialog */}
      <ConfirmDialog
        open={showRefreshConfirm}
        title="Discard Changes?"
        message="You have unsaved changes. Refreshing will discard them."
        confirmLabel="Refresh"
        cancelLabel="Cancel"
        danger={true}
        onConfirm={() => {
          setShowRefreshConfirm(false)
          doRefresh()
        }}
        onCancel={() => setShowRefreshConfirm(false)}
      />
    </div>
  )
}
