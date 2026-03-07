import { useState, useEffect } from 'react'
import type { Seat } from '../identity/useIdentity'

interface HamburgerMenuProps {
  mySeat: Seat
  onLeaveSeat: () => void
}

export function HamburgerMenu({ mySeat, onLeaveSeat }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 16,
        zIndex: 10000,
        fontFamily: 'sans-serif',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 10px',
          background: open ? 'rgba(25, 25, 40, 0.92)' : 'rgba(15, 15, 25, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(25, 25, 40, 0.92)' }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.background = 'rgba(15, 15, 25, 0.75)'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: -1 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              background: 'rgba(15, 15, 25, 0.92)',
              backdropFilter: 'blur(16px)',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.08)',
              minWidth: 200,
              padding: 6,
              zIndex: 10001,
              animation: 'menuFadeIn 0.15s ease-out',
            }}
          >
            <style>{`
              @keyframes menuFadeIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>

            {/* Seat info */}
            <div style={{
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              {mySeat.portraitUrl ? (
                <img
                  src={mySeat.portraitUrl}
                  alt=""
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `2px solid ${mySeat.color}`,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: mySeat.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {mySeat.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {mySeat.name}
                </div>
                <div style={{
                  fontSize: 10,
                  color: mySeat.role === 'GM' ? '#fbbf24' : '#60a5fa',
                  fontWeight: 500,
                  marginTop: 1,
                }}>
                  {mySeat.role === 'GM' ? 'Game Master' : 'Player'}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 8px' }} />

            <button
              onClick={() => {
                setOpen(false)
                onLeaveSeat()
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                color: '#f87171',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Leave Seat
            </button>
          </div>
        </>
      )}
    </div>
  )
}
