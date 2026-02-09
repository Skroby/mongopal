import { useEffect, useState } from 'react'
import MonacoDiffEditor from './MonacoDiffEditor'

interface IconProps {
  className?: string
}

const CloseIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const SwapIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
)

const SideBySideIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
  </svg>
)

const StackedIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

/**
 * MongoDB document ID types
 */
interface ObjectIdType {
  $oid: string
}

interface BinaryType {
  $binary: {
    base64: string
    subType: string
  }
}

interface UuidType {
  $uuid: string
}

type DocumentId = string | ObjectIdType | BinaryType | UuidType | unknown

/**
 * MongoDB document structure with optional _id field
 */
export interface MongoDocument {
  _id?: DocumentId
  [key: string]: unknown
}

/**
 * Props for the DocumentDiffView component.
 */
export interface DocumentDiffViewProps {
  /** Source document (original/left side) */
  sourceDocument: MongoDocument
  /** Target document (modified/right side) */
  targetDocument: MongoDocument
  /** Callback when the diff view is closed */
  onClose?: () => void
  /** Callback when source and target are swapped */
  onSwap?: () => void
}

// Format document ID for display
function formatDocId(docId: DocumentId): string {
  if (!docId) return 'unknown'
  if (typeof docId === 'string') return docId.slice(0, 12) + (docId.length > 12 ? '...' : '')
  if (typeof docId === 'object' && docId !== null) {
    if ('$oid' in docId) return (docId as ObjectIdType).$oid.slice(0, 12) + '...'
    if ('$binary' in docId) return `Binary(...)`
    if ('$uuid' in docId) return (docId as UuidType).$uuid.slice(0, 12) + '...'
  }
  return JSON.stringify(docId).slice(0, 16) + '...'
}

// Recursively sort object keys for consistent comparison
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }
  const sorted: Record<string, unknown> = {}
  // Sort keys alphabetically, but keep _id first if present
  const keys = Object.keys(obj as Record<string, unknown>).sort((a, b) => {
    if (a === '_id') return -1
    if (b === '_id') return 1
    return a.localeCompare(b)
  })
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
  }
  return sorted
}

export default function DocumentDiffView({
  sourceDocument,
  targetDocument,
  onClose,
  onSwap,
}: DocumentDiffViewProps) {
  const [sideBySide, setSideBySide] = useState(true)

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Sort keys for consistent comparison (same doc with different key order shows no diff)
  const sourceJson = JSON.stringify(sortObjectKeys(sourceDocument), null, 2)
  const targetJson = JSON.stringify(sortObjectKeys(targetDocument), null, 2)

  const sourceId = formatDocId(sourceDocument?._id)
  const targetId = formatDocId(targetDocument?._id)

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[80vh] bg-surface text-text border border-border rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium">Document Comparison</h2>
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span className="px-2 py-0.5 bg-error-dark text-error rounded font-mono">{sourceId}</span>
              <span>vs</span>
              <span className="px-2 py-0.5 bg-success-dark text-success rounded font-mono">{targetId}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center bg-surface rounded-md p-0.5">
              <button
                className={`p-1.5 rounded ${sideBySide ? 'bg-surface-active text-text' : 'text-text-muted hover:text-text'}`}
                onClick={() => setSideBySide(true)}
                title="Side by side view"
              >
                <SideBySideIcon className="w-4 h-4" />
              </button>
              <button
                className={`p-1.5 rounded ${!sideBySide ? 'bg-surface-active text-text' : 'text-text-muted hover:text-text'}`}
                onClick={() => setSideBySide(false)}
                title="Stacked view"
              >
                <StackedIcon className="w-4 h-4" />
              </button>
            </div>
            <button
              className="btn btn-ghost flex items-center gap-1.5 text-sm"
              onClick={onSwap}
              title="Swap left and right"
            >
              <SwapIcon className="w-4 h-4" />
              Swap
            </button>
            <button
              className="icon-btn p-1.5 hover:bg-surface-hover"
              onClick={onClose}
              title="Close (Escape)"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diff labels - only show in side-by-side mode */}
        {sideBySide && (
          <div className="flex-shrink-0 flex border-b border-border text-xs text-text-muted">
            <div className="flex-1 px-4 py-1.5 border-r border-border bg-error-dark/10">
              <span className="text-error">Original</span>
              <span className="ml-2 font-mono">{sourceId}</span>
            </div>
            <div className="flex-1 px-4 py-1.5 bg-success-dark/10">
              <span className="text-success">Modified</span>
              <span className="ml-2 font-mono">{targetId}</span>
            </div>
          </div>
        )}

        {/* Diff Editor */}
        <div className="flex-1 overflow-hidden">
          <MonacoDiffEditor
            key={`diff-${sideBySide}`}
            original={sourceJson}
            modified={targetJson}
            language="json"
            renderSideBySide={sideBySide}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-2 border-t border-border text-xs text-text-dim flex items-center justify-between">
          <span>
            {sideBySide
              ? 'Red = removed from original, Green = added in modified'
              : 'Red lines = removed, Green lines = added'
            }
          </span>
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
