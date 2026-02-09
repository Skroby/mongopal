import { useEffect, useRef, ReactNode } from 'react'

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Dialog title */
  title: string
  /** Dialog message - can be a string or JSX */
  message: string | ReactNode
  /** Label for the confirm button */
  confirmLabel?: string
  /** Label for the cancel button */
  cancelLabel?: string
  /** Whether this is a dangerous action (affects styling and focus behavior) */
  danger?: boolean
  /** Callback when user confirms the action */
  onConfirm: () => void
  /** Callback when user cancels the action */
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      // For danger dialogs, focus Cancel button to prevent accidental confirmation
      if (danger && cancelRef.current) {
        cancelRef.current.focus()
      } else if (confirmRef.current) {
        confirmRef.current.focus()
      }
    }
  }, [open, danger])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter' && !danger) {
        // Only auto-confirm on Enter for non-danger dialogs
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, danger, onConfirm, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-surface-secondary text-text border border-border rounded-lg w-[400px] shadow-xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text">{title}</h2>
        </div>

        <div className="px-4 py-4 text-sm text-text-secondary">
          {typeof message === 'string' ? (
            <p className="whitespace-pre-line">{message}</p>
          ) : (
            message
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button ref={cancelRef} className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
