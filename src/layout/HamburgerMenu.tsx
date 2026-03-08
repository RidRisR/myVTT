import { useState, useEffect, useRef } from 'react'
import type { Seat } from '../identity/useIdentity'
import { SEAT_COLORS } from '../identity/useIdentity'
import { uploadAsset } from '../shared/assetUpload'

interface HamburgerMenuProps {
  mySeat: Seat
  onUpdateSeat: (seatId: string, updates: Partial<Omit<Seat, 'id'>>) => void
  onLeaveSeat: () => void
}

export function HamburgerMenu({ mySeat, onUpdateSeat, onLeaveSeat }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(mySeat.name)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync editName when seat name changes externally
  useEffect(() => { setEditName(mySeat.name) }, [mySeat.name])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing) {
          setEditing(false)
          setEditName(mySeat.name)
        } else {
          setOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, editing, mySeat.name])

  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAsset(file)
      onUpdateSeat(mySeat.id, { portraitUrl: url })
    } catch (err) {
      console.error('Portrait upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== mySeat.name) {
      onUpdateSeat(mySeat.id, { name: trimmed })
    }
    setEditing(false)
  }

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
            onClick={() => { setOpen(false); setEditing(false) }}
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
              minWidth: 220,
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

            {/* Seat profile section */}
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Portrait — clickable to upload */}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePortraitUpload} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                  title="Click to change avatar"
                >
                  {mySeat.portraitUrl ? (
                    <img
                      src={mySeat.portraitUrl}
                      alt=""
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `2px solid ${mySeat.color}`,
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: mySeat.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 700,
                    }}>
                      {mySeat.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div
                    style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      background: uploading ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                      fontSize: 9, color: '#fff',
                    }}
                    onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0.4)' }}
                    onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0)' }}
                  >
                    {uploading ? '...' : ''}
                  </div>
                </div>

                {/* Name + role */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') { setEditing(false); setEditName(mySeat.name) }
                      }}
                      style={{
                        width: '100%',
                        padding: '3px 6px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => setEditing(true)}
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'text',
                      }}
                      title="Click to rename"
                    >
                      {mySeat.name}
                    </div>
                  )}
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

              {/* Color picker */}
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                {SEAT_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => onUpdateSeat(mySeat.id, { color: c })}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: c,
                      cursor: 'pointer',
                      border: c === mySeat.color ? '2px solid #fff' : '2px solid transparent',
                      transition: 'border-color 0.15s',
                    }}
                  />
                ))}
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
