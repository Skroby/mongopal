import { useEffect } from 'react'

/** Props for the CloseIcon component */
interface CloseIconProps {
  className?: string
}

const CloseIcon = ({ className = "w-4 h-4" }: CloseIconProps): JSX.Element => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// Detect OS for correct modifier key display
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? 'Cmd' : 'Ctrl'

/** A single keyboard shortcut item */
interface ShortcutItem {
  /** Array of key combinations (e.g., ['Cmd+S'] or ['Cmd+1', 'Cmd+9'] for ranges) */
  keys: string[]
  /** Human-readable description of what the shortcut does */
  description: string
}

/** A category grouping related shortcuts */
interface ShortcutCategory {
  /** Name of the category (e.g., 'General', 'Tabs') */
  category: string
  /** List of shortcuts in this category */
  items: ShortcutItem[]
}

const shortcuts: ShortcutCategory[] = [
  {
    category: 'General',
    items: [
      { keys: [`${modKey}+N`], description: 'New document (insert)' },
      { keys: [`${modKey}+,`], description: 'Open settings' },
      { keys: [`${modKey}+?`], description: 'Show keyboard shortcuts' },
      { keys: ['Escape'], description: 'Close modal / Cancel' },
    ],
  },
  {
    category: 'Query Editor',
    items: [
      { keys: [`${modKey}+Enter`], description: 'Execute query' },
      { keys: [`${modKey}+F`], description: 'Find in editor' },
      { keys: [`${modKey}+H`], description: 'Find and replace' },
    ],
  },
  {
    category: 'Document Editor',
    items: [
      { keys: [`${modKey}+S`], description: 'Save document' },
      { keys: [`${modKey}+Enter`], description: 'Insert document (insert mode)' },
      { keys: [`${modKey}+F`], description: 'Find in document' },
    ],
  },
  {
    category: 'Tabs',
    items: [
      { keys: [`${modKey}+W`], description: 'Close current tab' },
      { keys: [`${modKey}+1`, `${modKey}+9`], description: 'Jump to tab by number' },
      { keys: [`${modKey}+Shift+]`], description: 'Next tab' },
      { keys: [`${modKey}+Shift+[`], description: 'Previous tab' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['Double-click'], description: 'Open collection in new tab' },
      { keys: ['Right-click'], description: 'Show context menu' },
    ],
  },
]

/** Props for the KeyboardShortcuts modal component */
export interface KeyboardShortcutsProps {
  /** Callback function invoked when the modal should be closed */
  onClose: () => void
}

export default function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps): JSX.Element {
  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary text-text rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-border max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-medium text-text">Keyboard Shortcuts</h2>
          <button
            className="p-1 rounded hover:bg-surface-hover"
            onClick={onClose}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-sm font-medium text-primary mb-3">
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-4 py-1"
                    >
                      <span className="text-sm text-text-secondary">
                        {item.description}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.keys.map((key, keyIdx) => (
                          <span key={keyIdx} className="flex items-center gap-1">
                            {keyIdx > 0 && (
                              <span className="text-text-dim text-xs">to</span>
                            )}
                            <kbd className="px-2 py-0.5 bg-surface border border-border rounded text-xs font-mono text-text-light">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface flex-shrink-0">
          <p className="text-xs text-text-dim">
            Press <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs font-mono">{modKey}+?</kbd> anytime to show this reference
          </p>
          <button
            className="btn btn-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
