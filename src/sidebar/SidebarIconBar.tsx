import { useState } from 'react'

export type PanelId = 'players' | 'dice' | 'token'

interface SidebarIconBarProps {
  activePanel: PanelId | null
  onToggle: (id: PanelId) => void
}

const icons: { id: PanelId; label: string; svg: JSX.Element }[] = [
  {
    id: 'players',
    label: 'Players',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'dice',
    label: 'Dice',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="3" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'token',
    label: 'Token',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
]

export function SidebarIconBar({ activePanel, onToggle }: SidebarIconBarProps) {
  const [hoveredId, setHoveredId] = useState<PanelId | null>(null)

  return (
    <div
      style={{
        width: 44,
        height: '100%',
        borderLeft: '1px solid #e5e7eb',
        background: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 4,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {icons.map(({ id, label, svg }) => {
        const isActive = activePanel === id
        const isHovered = hoveredId === id
        return (
          <button
            key={id}
            onClick={() => onToggle(id)}
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
            title={label}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: 'none',
              background: isActive ? '#e0e7ff' : isHovered ? '#f3f4f6' : 'transparent',
              color: isActive ? '#2563eb' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            {svg}
          </button>
        )
      })}
    </div>
  )
}
