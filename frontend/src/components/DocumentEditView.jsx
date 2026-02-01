import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useNotification } from './NotificationContext'
import { useTab } from './contexts/TabContext'
import ConfirmDialog from './ConfirmDialog'
import MonacoErrorBoundary from './MonacoErrorBoundary'
import { getErrorSummary } from '../utils/errorParser'

const go = window.go?.main?.App

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
}) {
  const { notify } = useNotification()
  const { setTabDirty } = useTab()
  const editorRef = useRef(null)
  const monacoRef = useRef(null)

  const isInsertMode = mode === 'insert'
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalContent, setOriginalContent] = useState('')
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false)

  // Format the document ID for display
  const displayId = isInsertMode ? 'New Document' : formatDocId(documentId)

  // Initialize content from document or empty for insert mode
  useEffect(() => {
    if (isInsertMode) {
      const initial = '{\n  \n}'
      setContent(initial)
      setOriginalContent(initial)
      setHasChanges(false)
    } else if (document) {
      const formatted = JSON.stringify(document, null, 2)
      setContent(formatted)
      setOriginalContent(formatted)
      setHasChanges(false)
    }
  }, [document, isInsertMode])

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
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost flex items-center gap-1.5 text-xs"
            onClick={openFind}
            title="Find (Cmd+F)"
          >
            <SearchIcon className="w-3.5 h-3.5" />
            Find
          </button>
          <button
            className="btn btn-ghost flex items-center gap-1.5 text-xs"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <CopyIcon className="w-3.5 h-3.5" />
            Copy
          </button>
          <button
            className="btn btn-ghost flex items-center gap-1.5 text-xs"
            onClick={handleFormat}
            title="Format JSON"
          >
            <FormatIcon className="w-3.5 h-3.5" />
            Format
          </button>
          {!isInsertMode && (
            <button
              className="btn btn-ghost flex items-center gap-1.5 text-xs"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Reload from database"
            >
              <RefreshIcon className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
          {isInsertMode ? (
            <button
              className="btn btn-primary flex items-center gap-1.5 text-xs"
              onClick={handleInsert}
              disabled={inserting}
              title="Insert document (Cmd+Enter)"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {inserting ? 'Inserting...' : 'Insert'}
            </button>
          ) : (
            <button
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                saved
                  ? 'bg-green-600 text-white'
                  : hasChanges && !saving
                  ? 'bg-accent text-zinc-900 hover:bg-accent/90'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
              onClick={handleSave}
              disabled={saving || saved || !hasChanges}
              title="Save (Cmd+S)"
            >
              {saved ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5" />
                  Saved
                </>
              ) : (
                <>
                  <SaveIcon className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
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
