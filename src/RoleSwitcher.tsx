import { useRef, useState, useCallback } from 'react'
import { useValue } from 'tldraw'
import type { Seat } from './identity/useIdentity'
import { currentRole } from './roleState'

interface IdentityBadgeProps {
  seat: Seat
  onLeave: () => void
}

export function IdentityBadge({ seat, onLeave }: IdentityBadgeProps) {
  const viewRole = useValue('currentRole', () => currentRole.get(), [])
  const [pos, setPos] = useState({ x: 60, y: 12 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't drag when clicking buttons
    if ((e.target as HTMLElement).closest('button')) {
      e.stopPropagation()
      return
    }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        padding: '6px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontFamily: 'sans-serif',
        fontSize: 13,
        cursor: dragRef.current ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: seat.color,
      }} />
      <span style={{ fontWeight: 600, color: '#333' }}>{seat.name}</span>
      <span style={{
        fontSize: 11, padding: '1px 6px', borderRadius: 4,
        background: seat.role === 'GM' ? '#fef3c7' : '#dbeafe',
        color: seat.role === 'GM' ? '#92400e' : '#1e40af',
      }}>
        {seat.role}
      </span>
      {seat.role === 'GM' && (
        <button
          onClick={() => currentRole.set(viewRole === 'GM' ? 'PL' : 'GM')}
          title={viewRole === 'GM' ? 'Switch to PL view' : 'Switch to GM view'}
          style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 4,
            border: '1px solid #d1d5db', cursor: 'pointer',
            background: viewRole === 'PL' ? '#fee2e2' : '#f3f4f6',
            color: viewRole === 'PL' ? '#dc2626' : '#666',
            fontWeight: 600,
          }}
        >
          {viewRole === 'PL' ? 'PL view' : 'GM view'}
        </button>
      )}
      <button
        onClick={onLeave}
        title="Leave seat"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#999', fontSize: 14, padding: '0 2px', lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
