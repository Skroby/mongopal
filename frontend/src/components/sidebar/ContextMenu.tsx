import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { ContextMenuItem } from './types'

// =============================================================================
// SubmenuPopover
// =============================================================================

export function SubmenuPopover({ children }: { children: React.ReactNode }): React.ReactElement {
  const submenuRef = useRef<HTMLDivElement>(null)
  const [flipToLeft, setFlipToLeft] = useState(false)

  useLayoutEffect(() => {
    const el = submenuRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      setFlipToLeft(rect.right > window.innerWidth)
    }
  }, [])

  return (
    <div
      ref={submenuRef}
      className={`absolute ${flipToLeft ? 'right-full' : 'left-full'} top-0 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[160px] -mt-1 ml-0`}
    >
      {children}
    </div>
  )
}

// =============================================================================
// ContextMenuItems
// =============================================================================

export function ContextMenuItems({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }): React.ReactElement {
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null)

  return (
    <>
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={idx} className="border-t border-border my-1" />
        }
        if (item.children) {
          return (
            <div
              key={idx}
              className="relative"
              onMouseEnter={() => setOpenSubmenu(idx)}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                className="context-menu-item w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 text-text-light hover:bg-surface-hover"
              >
                {item.label}
                <span className="ml-auto text-xs text-text-dim">&#9656;</span>
              </button>
              {openSubmenu === idx && (
                <SubmenuPopover>
                  <ContextMenuItems items={item.children} onClose={onClose} />
                </SubmenuPopover>
              )}
            </div>
          )
        }
        return (
          <button
            key={idx}
            className={`context-menu-item w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
              ${item.danger ? 'text-error hover:bg-error-dark/30' : ''}
              ${item.disabled
                ? 'text-text-dim cursor-not-allowed'
                : item.danger ? '' : 'text-text-light hover:bg-surface-hover'}`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.()
                onClose()
              }
            }}
            disabled={item.disabled}
          >
            {item.label}
            {item.shortcut && (
              <span className="ml-auto text-xs text-text-dim">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </>
  )
}

// =============================================================================
// ContextMenu
// =============================================================================

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const adjustedStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  }

  return (
    <div
      ref={menuRef}
      className="bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
      style={adjustedStyle}
    >
      <ContextMenuItems items={items} onClose={onClose} />
    </div>
  )
}
