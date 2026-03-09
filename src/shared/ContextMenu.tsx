import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    const handleClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [onClose])

  // Prevent menu from going off-screen
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 20000,
    background: 'rgba(15, 15, 25, 0.95)',
    backdropFilter: 'blur(16px)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    padding: '4px 0',
    minWidth: 160,
    fontFamily: 'sans-serif',
  }

  return (
    <div ref={ref} style={style} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          disabled={item.disabled}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 14px',
            background: 'transparent',
            border: 'none',
            cursor: item.disabled ? 'default' : 'pointer',
            color: item.disabled
              ? 'rgba(255,255,255,0.2)'
              : (item.color ?? 'rgba(255,255,255,0.85)'),
            fontSize: 12,
            fontWeight: 500,
            textAlign: 'left',
            fontFamily: 'sans-serif',
            transition: 'background 0.1s',
            opacity: item.disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
