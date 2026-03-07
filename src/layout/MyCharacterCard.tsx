import { useRef, useState } from 'react'
import type { Seat } from '../identity/useIdentity'
import { uploadAsset } from '../shared/assetUpload'

interface MyCharacterCardProps {
  seat: Seat
  seatId: string
  onUpdateSeat: (seatId: string, updates: Partial<Seat>) => void
}

export function MyCharacterCard({ seat, seatId, onUpdateSeat }: MyCharacterCardProps) {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const properties = seat.properties ?? []

  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAsset(file)
      onUpdateSeat(seatId, { portraitUrl: url })
    } catch (err) {
      console.error('Portrait upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const updateProperty = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...properties]
    next[index] = { ...next[index], [field]: val }
    onUpdateSeat(seatId, { properties: next })
  }

  const addProperty = () => {
    onUpdateSeat(seatId, { properties: [...properties, { key: '', value: '' }] })
  }

  const removeProperty = (index: number) => {
    onUpdateSeat(seatId, { properties: properties.filter((_, i) => i !== index) })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: 0,
        transform: 'translateY(-50%)',
        zIndex: 10000,
        display: 'flex',
        pointerEvents: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Sliding container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          transform: open ? 'translateX(0)' : 'translateX(-268px)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'auto',
        }}
      >
        {/* Card panel */}
        <div
          style={{
            width: 260,
            padding: '20px 16px',
            background: 'rgba(15, 15, 25, 0.88)',
            backdropFilter: 'blur(16px)',
            borderRadius: '0 14px 14px 0',
            boxShadow: '4px 0 32px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderLeft: 'none',
            fontFamily: 'sans-serif',
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
            color: '#e4e4e7',
          }}
        >
          {/* Portrait */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
            <div
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {seat.portraitUrl ? (
                <img
                  src={seat.portraitUrl}
                  alt={seat.name}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `3px solid ${seat.color}`,
                    boxShadow: `0 0 20px ${seat.color}33`,
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${seat.color}, ${seat.color}99)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 36,
                    fontWeight: 700,
                    boxShadow: `0 0 20px ${seat.color}33`,
                  }}
                >
                  {seat.name.charAt(0).toUpperCase()}
                </div>
              )}
              {uploading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                </div>
              )}
              {/* Hover overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.3)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePortraitUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Name + Role */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: 0.3 }}>
              {seat.name}
            </div>
            <span
              style={{
                display: 'inline-block',
                marginTop: 6,
                fontSize: 10,
                padding: '3px 10px',
                borderRadius: 10,
                background: seat.role === 'GM' ? 'rgba(251,191,36,0.2)' : 'rgba(96,165,250,0.2)',
                color: seat.role === 'GM' ? '#fbbf24' : '#60a5fa',
                fontWeight: 600,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              {seat.role === 'GM' ? 'Game Master' : 'Player'}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 -16px 16px' }} />

          {/* Properties */}
          <div>
            <div style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              fontWeight: 600,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              Properties
            </div>
            {properties.map((prop, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <input
                  value={prop.key}
                  onChange={(e) => updateProperty(i, 'key', e.target.value)}
                  placeholder="key"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '6px 8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    fontSize: 12,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e4e4e7',
                    outline: 'none',
                  }}
                />
                <input
                  value={prop.value}
                  onChange={(e) => updateProperty(i, 'value', e.target.value)}
                  placeholder="value"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '6px 8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    fontSize: 12,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e4e4e7',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => removeProperty(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.25)',
                    fontSize: 16,
                    padding: '0 4px',
                    lineHeight: 1,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)' }}
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={addProperty}
              style={{
                width: '100%',
                padding: '6px',
                background: 'transparent',
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                color: 'rgba(255,255,255,0.35)',
                marginTop: 4,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)'
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'
              }}
            >
              + Add property
            </button>
          </div>
        </div>

        {/* Tab handle — always visible */}
        <div
          onClick={() => setOpen(!open)}
          style={{
            width: 36,
            padding: '12px 0',
            background: 'rgba(15, 15, 25, 0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '0 10px 10px 0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            border: '1px solid rgba(255,255,255,0.08)',
            borderLeft: 'none',
            boxShadow: '4px 0 16px rgba(0,0,0,0.2)',
            transition: 'background 0.15s',
            marginLeft: -1,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(25, 25, 40, 0.92)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(15, 15, 25, 0.85)' }}
        >
          {/* Mini portrait */}
          {seat.portraitUrl ? (
            <img
              src={seat.portraitUrl}
              alt=""
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${seat.color}`,
              }}
            />
          ) : (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: seat.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'sans-serif',
              }}
            >
              {seat.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Arrow indicator */}
          <svg
            width="10" height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease',
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
