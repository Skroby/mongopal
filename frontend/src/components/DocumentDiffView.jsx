import { useRef, useEffect } from 'react'
import { DiffEditor } from '@monaco-editor/react'

const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const SwapIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
)

// Format document ID for display
function formatDocId(docId) {
  if (!docId) return 'unknown'
  if (typeof docId === 'string') return docId.slice(0, 12) + (docId.length > 12 ? '...' : '')
  if (docId.$oid) return docId.$oid.slice(0, 12) + '...'
  if (docId.$binary) return `Binary(...)`
  if (docId.$uuid) return docId.$uuid.slice(0, 12) + '...'
  return JSON.stringify(docId).slice(0, 16) + '...'
}

export default function DocumentDiffView({
  sourceDocument,
  targetDocument,
  onClose,
  onSwap,
}) {
  const editorRef = useRef(null)

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const sourceJson = JSON.stringify(sourceDocument, null, 2)
  const targetJson = JSON.stringify(targetDocument, null, 2)

  const sourceId = formatDocId(sourceDocument?._id)
  const targetId = formatDocId(targetDocument?._id)

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor

    // Define custom theme matching app's zinc/dark palette
    monaco.editor.defineTheme('mongopal-diff-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json', foreground: '94a3b8' },
        { token: 'string.value.json', foreground: '4CC38A' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'keyword', foreground: 'a78bfa' },
      ],
      colors: {
        'editor.background': '#18181b',
        'editor.foreground': '#f4f4f5',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#a1a1aa',
        'editor.lineHighlightBackground': '#27272a',
        'editor.lineHighlightBorder': '#00000000',
        'diffEditor.insertedTextBackground': '#4CC38A20',
        'diffEditor.removedTextBackground': '#ef444420',
        'diffEditor.insertedLineBackground': '#4CC38A10',
        'diffEditor.removedLineBackground': '#ef444410',
        'editorGutter.background': '#18181b',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#52525b80',
        'scrollbarSlider.hoverBackground': '#71717a80',
        'scrollbarSlider.activeBackground': '#a1a1aa80',
      }
    })

    monaco.editor.setTheme('mongopal-diff-dark')
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[80vh] bg-surface border border-border rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium">Document Comparison</h2>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="px-2 py-0.5 bg-red-900/30 text-red-400 rounded font-mono">{sourceId}</span>
              <span>vs</span>
              <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded font-mono">{targetId}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost flex items-center gap-1.5 text-sm"
              onClick={onSwap}
              title="Swap left and right"
            >
              <SwapIcon className="w-4 h-4" />
              Swap
            </button>
            <button
              className="icon-btn p-1.5 hover:bg-zinc-700"
              onClick={onClose}
              title="Close (Escape)"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diff labels */}
        <div className="flex-shrink-0 flex border-b border-border text-xs text-zinc-400">
          <div className="flex-1 px-4 py-1.5 border-r border-border bg-red-900/10">
            <span className="text-red-400">Original</span>
            <span className="ml-2 font-mono">{sourceId}</span>
          </div>
          <div className="flex-1 px-4 py-1.5 bg-green-900/10">
            <span className="text-green-400">Modified</span>
            <span className="ml-2 font-mono">{targetId}</span>
          </div>
        </div>

        {/* Diff Editor */}
        <div className="flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            language="json"
            theme="vs-dark"
            original={sourceJson}
            modified={targetJson}
            onMount={handleEditorDidMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              renderSideBySide: true,
              enableSplitViewResizing: true,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-2 border-t border-border text-xs text-zinc-500 flex items-center justify-between">
          <span>Green highlights show additions in the right document. Red highlights show deletions.</span>
          <button
            className="btn btn-ghost text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
