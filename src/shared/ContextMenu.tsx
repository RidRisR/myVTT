import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  color?: string
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Adjust position to stay within viewport
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (left + rect.width > vw) left = vw - rect.width - 8
    if (top + rect.height > vh) top = y - rect.height
    if (top < 0) top = 8
    if (left < 0) left = 8
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    const handleClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="fixed z-toast bg-glass backdrop-blur-[16px] rounded-lg border border-border-glass shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1 min-w-[160px] font-sans"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          disabled={item.disabled}
          className={`block w-full px-3.5 py-2 bg-transparent border-none text-xs font-medium text-left font-sans transition-colors duration-100 ${
            item.disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-hover'
          }`}
          style={{
            color: item.disabled
              ? 'rgba(255,255,255,0.2)'
              : (item.color ?? 'rgba(255,255,255,0.85)'),
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
