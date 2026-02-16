import { useState, useRef, useCallback, MouseEvent } from 'react'

// =============================================================================
// Types
// =============================================================================

export interface UseEditorLayoutOptions {
  /** Minimum editor height in pixels (default: 60) */
  minHeight?: number
  /** Maximum editor height in pixels (default: 500) */
  maxHeight?: number
  /** localStorage key for persisting height (default: 'mongopal_editor_height') */
  storageKey?: string
  /** Default height if no saved value (default: 120) */
  defaultHeight?: number
}

export interface ResizerProps {
  onMouseDown: (e: MouseEvent<HTMLDivElement>) => void
}

export interface UseEditorLayoutReturn {
  /** Current editor height in pixels */
  editorHeight: number
  /** Props to spread onto the resizer div element */
  resizerProps: ResizerProps
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing a resizable editor panel height with localStorage persistence.
 * Returns the current height and props to spread onto a resize handle element.
 */
export function useEditorLayout(options: UseEditorLayoutOptions = {}): UseEditorLayoutReturn {
  const {
    minHeight = 60,
    maxHeight = 500,
    storageKey = 'mongopal_editor_height',
    defaultHeight = 120,
  } = options

  const [editorHeight, setEditorHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? parseInt(saved, 10) : defaultHeight
    } catch {
      return defaultHeight
    }
  })

  const resizingRef = useRef<boolean>(false)
  const startYRef = useRef<number>(0)
  const startHeightRef = useRef<number>(0)

  const handleResizerMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      e.preventDefault()
      resizingRef.current = true
      startYRef.current = e.clientY
      startHeightRef.current = editorHeight

      const onMouseMove = (moveEvent: globalThis.MouseEvent): void => {
        if (!resizingRef.current) return
        const deltaY = moveEvent.clientY - startYRef.current
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeightRef.current + deltaY))
        setEditorHeight(newHeight)
      }

      const onMouseUp = (): void => {
        resizingRef.current = false
        try {
          localStorage.setItem(storageKey, String(editorHeight))
        } catch {
          // Ignore storage errors
        }
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [editorHeight, minHeight, maxHeight, storageKey]
  )

  return {
    editorHeight,
    resizerProps: {
      onMouseDown: handleResizerMouseDown,
    },
  }
}

export default useEditorLayout
