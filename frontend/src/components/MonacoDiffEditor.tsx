import { useRef, useEffect, useCallback } from 'react'
import { monaco } from '../monacoConfig'
import type * as Monaco from 'monaco-editor'

/**
 * Result of computing line differences between original and modified text.
 */
interface LineDiffChanges {
  /** Line numbers (1-indexed) that differ in the original text */
  original: number[]
  /** Line numbers (1-indexed) that differ in the modified text */
  modified: number[]
}

/**
 * Compute simple line-by-line diff
 */
function computeLineDiff(original: string, modified: string): LineDiffChanges {
  const origLines = (original || '').split('\n')
  const modLines = (modified || '').split('\n')
  const changes: LineDiffChanges = { original: [], modified: [] }

  const maxLines = Math.max(origLines.length, modLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (origLines[i] !== modLines[i]) {
      if (i < origLines.length) {
        changes.original.push(i + 1) // 1-indexed line numbers
      }
      if (i < modLines.length) {
        changes.modified.push(i + 1)
      }
    }
  }
  return changes
}

/**
 * Monaco editor options that can be passed to the diff editor.
 */
export type MonacoEditorOptions = Monaco.editor.IStandaloneEditorConstructionOptions

/**
 * Props for the MonacoDiffEditor component.
 */
export interface MonacoDiffEditorProps {
  /** Original text content (left side) */
  original?: string
  /** Modified text content (right side) */
  modified?: string
  /** Language mode for syntax highlighting */
  language?: string
  /** Additional Monaco editor options */
  options?: MonacoEditorOptions
  /** Whether to render side-by-side (true) or stacked (false) */
  renderSideBySide?: boolean
}

/**
 * Custom Monaco Diff Editor using two side-by-side editors
 * with manual diff highlighting for reliable decoration application.
 */
export default function MonacoDiffEditor({
  original,
  modified,
  language = 'json',
  options = {},
  renderSideBySide = true,
}: MonacoDiffEditorProps) {
  const leftContainerRef = useRef<HTMLDivElement>(null)
  const rightContainerRef = useRef<HTMLDivElement>(null)
  const leftEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const rightEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const leftDecorationsRef = useRef<string[]>([])
  const rightDecorationsRef = useRef<string[]>([])

  // Apply decorations to highlight diff lines
  const applyDecorations = useCallback(() => {
    if (!leftEditorRef.current || !rightEditorRef.current) return

    const leftContent = leftEditorRef.current.getValue()
    const rightContent = rightEditorRef.current.getValue()
    const changes = computeLineDiff(leftContent, rightContent)

    // Apply decorations to left editor (original - red for removed/changed)
    if (changes.original.length > 0) {
      const leftDecorations: Monaco.editor.IModelDeltaDecoration[] = changes.original.map(lineNumber => ({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'diff-line-removed',
          glyphMarginClassName: 'diff-glyph-removed',
        }
      }))

      leftDecorationsRef.current = leftEditorRef.current.deltaDecorations(
        leftDecorationsRef.current,
        leftDecorations
      )
    }

    // Apply decorations to right editor (modified - green for added/changed)
    if (changes.modified.length > 0) {
      const rightDecorations: Monaco.editor.IModelDeltaDecoration[] = changes.modified.map(lineNumber => ({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'diff-line-added',
          glyphMarginClassName: 'diff-glyph-added',
        }
      }))

      rightDecorationsRef.current = rightEditorRef.current.deltaDecorations(
        rightDecorationsRef.current,
        rightDecorations
      )
    }
  }, [])

  // Create editors on mount
  useEffect(() => {
    if (!leftContainerRef.current || !rightContainerRef.current) return

    const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
      theme: 'mongopal-dark',
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: 'on',
      folding: true,
      wordWrap: 'on',
      automaticLayout: true,
      tabSize: 2,
      glyphMargin: true,
      renderLineHighlight: 'none',
      ...options,
    }

    // Create left editor (original)
    leftEditorRef.current = monaco.editor.create(leftContainerRef.current, {
      ...editorOptions,
      value: original || '',
      language,
    })

    // Create right editor (modified)
    rightEditorRef.current = monaco.editor.create(rightContainerRef.current, {
      ...editorOptions,
      value: modified || '',
      language,
    })

    // Sync scrolling between editors
    leftEditorRef.current.onDidScrollChange((e) => {
      if (rightEditorRef.current) {
        rightEditorRef.current.setScrollTop(e.scrollTop)
        rightEditorRef.current.setScrollLeft(e.scrollLeft)
      }
    })

    rightEditorRef.current.onDidScrollChange((e) => {
      if (leftEditorRef.current) {
        leftEditorRef.current.setScrollTop(e.scrollTop)
        leftEditorRef.current.setScrollLeft(e.scrollLeft)
      }
    })

    // Apply decorations after a short delay to ensure editors are ready
    setTimeout(() => applyDecorations(), 100)

    // Cleanup
    return () => {
      leftEditorRef.current?.dispose()
      rightEditorRef.current?.dispose()
    }
  }, [])

  // Update content when props change
  useEffect(() => {
    if (leftEditorRef.current && original !== undefined) {
      leftEditorRef.current.setValue(original)
      setTimeout(() => applyDecorations(), 50)
    }
  }, [original, applyDecorations])

  useEffect(() => {
    if (rightEditorRef.current && modified !== undefined) {
      rightEditorRef.current.setValue(modified)
      setTimeout(() => applyDecorations(), 50)
    }
  }, [modified, applyDecorations])

  // Stacked view (vertically arranged)
  if (!renderSideBySide) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <style>{diffStyles}</style>
        <div className="flex-1 border-b border-zinc-700" style={{ minHeight: '50%' }}>
          <div className="text-xs text-zinc-400 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500"></span>
            Original
          </div>
          <div ref={leftContainerRef} style={{ width: '100%', height: 'calc(100% - 28px)' }} />
        </div>
        <div className="flex-1" style={{ minHeight: '50%' }}>
          <div className="text-xs text-zinc-400 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-green-500/30 border border-green-500"></span>
            Modified
          </div>
          <div ref={rightContainerRef} style={{ width: '100%', height: 'calc(100% - 28px)' }} />
        </div>
      </div>
    )
  }

  // Side-by-side view
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
      <style>{diffStyles}</style>
      <div style={{ width: '50%', height: '100%', borderRight: '1px solid #3f3f46' }}>
        <div className="text-xs text-zinc-400 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500"></span>
          Original
        </div>
        <div ref={leftContainerRef} style={{ width: '100%', height: 'calc(100% - 28px)' }} />
      </div>
      <div style={{ width: '50%', height: '100%' }}>
        <div className="text-xs text-zinc-400 px-2 py-1 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-green-500/30 border border-green-500"></span>
          Modified
        </div>
        <div ref={rightContainerRef} style={{ width: '100%', height: 'calc(100% - 28px)' }} />
      </div>
    </div>
  )
}

// CSS styles for diff highlighting
const diffStyles = `
  /* Removed/changed lines in original (left) editor - red */
  .diff-line-removed {
    background-color: rgba(239, 68, 68, 0.2) !important;
  }
  .diff-glyph-removed {
    background-color: rgb(239, 68, 68) !important;
    width: 4px !important;
    margin-left: 3px !important;
  }

  /* Added/changed lines in modified (right) editor - green */
  .diff-line-added {
    background-color: rgba(34, 197, 94, 0.2) !important;
  }
  .diff-glyph-added {
    background-color: rgb(34, 197, 94) !important;
    width: 4px !important;
    margin-left: 3px !important;
  }
`
