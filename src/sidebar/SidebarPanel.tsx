import type { ReactNode } from 'react'

interface SidebarPanelProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function SidebarPanel({ isOpen, title, onClose, children }: SidebarPanelProps) {
  return (
    <div
      style={{
        width: isOpen ? 280 : 0,
        transition: 'width 200ms ease-out',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 280,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e5e7eb',
          background: '#fff',
          transform: isOpen ? 'translateX(0)' : 'translateX(280px)',
          transition: 'transform 200ms ease-out',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'sans-serif' }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: '#666',
              padding: '0 4px',
              fontFamily: 'sans-serif',
            }}
          >
            x
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
