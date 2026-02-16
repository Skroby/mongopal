import { useState, useMemo, useCallback, RefObject } from 'react'
import type { VisibleNode, NodeAction } from './types'

interface TreeKeyboardNavigation {
  focusedNodeId: string | null
  setFocusedNodeId: React.Dispatch<React.SetStateAction<string | null>>
  handleKeyDown: (e: React.KeyboardEvent) => void
}

/**
 * Hook for managing tree keyboard navigation
 * Accepts external focusedNodeId for synchronization with click-based focus
 */
export function useTreeKeyboardNavigation(
  treeRef: RefObject<HTMLDivElement>,
  visibleNodes: VisibleNode[],
  onNodeAction: (node: VisibleNode, action: NodeAction) => void,
  externalFocusedNodeId?: string | null,
  setExternalFocusedNodeId?: React.Dispatch<React.SetStateAction<string | null>>
): TreeKeyboardNavigation {
  const [internalFocusedNodeId, setInternalFocusedNodeId] = useState<string | null>(null)
  const focusedNodeId = externalFocusedNodeId !== undefined ? externalFocusedNodeId : internalFocusedNodeId
  const setFocusedNodeId = setExternalFocusedNodeId || setInternalFocusedNodeId

  const focusedIndex = useMemo(() => {
    if (!focusedNodeId) return -1
    return visibleNodes.findIndex(n => n.id === focusedNodeId)
  }, [focusedNodeId, visibleNodes])

  const focusNodeByIndex = useCallback((index: number): void => {
    if (index >= 0 && index < visibleNodes.length) {
      const node = visibleNodes[index]
      setFocusedNodeId(node.id)
      const element = treeRef.current?.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement | null
      element?.focus()
    }
  }, [visibleNodes, treeRef, setFocusedNodeId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (visibleNodes.length === 0) return

    const currentIndex = focusedIndex >= 0 ? focusedIndex : 0
    const currentNode = visibleNodes[currentIndex]

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focusNodeByIndex(Math.min(currentIndex + 1, visibleNodes.length - 1))
        break

      case 'ArrowUp':
        e.preventDefault()
        focusNodeByIndex(Math.max(currentIndex - 1, 0))
        break

      case 'ArrowRight':
        e.preventDefault()
        if (currentNode) {
          if (currentNode.hasChildren && !currentNode.expanded) {
            onNodeAction(currentNode, 'expand')
          } else if (currentNode.hasChildren && currentNode.expanded) {
            focusNodeByIndex(currentIndex + 1)
          }
        }
        break

      case 'ArrowLeft':
        e.preventDefault()
        if (currentNode) {
          if (currentNode.hasChildren && currentNode.expanded) {
            onNodeAction(currentNode, 'collapse')
          } else if (currentNode.parentId) {
            const parentIndex = visibleNodes.findIndex(n => n.id === currentNode.parentId)
            if (parentIndex >= 0) {
              focusNodeByIndex(parentIndex)
            }
          }
        }
        break

      case 'Enter':
      case ' ':
        e.preventDefault()
        if (currentNode) {
          onNodeAction(currentNode, 'activate')
        }
        break

      case 'Home':
        e.preventDefault()
        focusNodeByIndex(0)
        break

      case 'End':
        e.preventDefault()
        focusNodeByIndex(visibleNodes.length - 1)
        break

      default:
        break
    }
  }, [focusedIndex, visibleNodes, focusNodeByIndex, onNodeAction])

  return {
    focusedNodeId,
    setFocusedNodeId,
    handleKeyDown,
  }
}
