import { useState } from 'react'
import { SEAT_COLORS, type Seat } from './useIdentity'

interface SeatSelectProps {
  seats: Seat[]
  onlineSeatIds: Set<string>
  onClaim: (seatId: string) => void
  onCreate: (name: string, role: 'GM' | 'PL', color: string) => void
  onDelete: (seatId: string) => void
}

export function SeatSelect({ seats, onlineSeatIds, onClaim, onCreate, onDelete }: SeatSelectProps) {
  const [mode, setMode] = useState<'choose' | 'create'>('choose')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'GM' | 'PL'>('PL')
  const usedColors = seats.map(s => s.color)
  const [color, setColor] = useState(() => SEAT_COLORS.find(c => !usedColors.includes(c)) ?? SEAT_COLORS[0])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'sans-serif', background: '#f5f5f5',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 32,
        minWidth: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 20, textAlign: 'center' }}>
          Join Session
        </h2>

        {/* Existing seats */}
        {seats.length > 0 && mode === 'choose' && (
          <>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              Claim an existing seat:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {seats.map((seat) => {
                const isOnline = onlineSeatIds.has(seat.id)
                return (
                  <button
                    key={seat.id}
                    onClick={() => !isOnline && onClaim(seat.id)}
                    disabled={isOnline}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px', border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      background: isOnline ? '#f9fafb' : '#fff',
                      cursor: isOnline ? 'not-allowed' : 'pointer',
                      fontSize: 14, textAlign: 'left',
                      opacity: isOnline ? 0.6 : 1,
                    }}
                  >
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: seat.color, flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{seat.name}</span>
                    {isOnline && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: '#dcfce7', color: '#166534',
                      }}>
                        Online
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: seat.role === 'GM' ? '#fef3c7' : '#dbeafe',
                      color: seat.role === 'GM' ? '#92400e' : '#1e40af',
                    }}>
                      {seat.role}
                    </span>
                    {!isOnline && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onDelete(seat.id) }}
                        style={{
                          fontSize: 12, color: '#999', cursor: 'pointer',
                          padding: '0 4px', lineHeight: 1,
                        }}
                        title="Delete seat"
                      >
                        x
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '12px 0' }}>or</div>
          </>
        )}

        {/* Create new seat button */}
        {mode === 'choose' && (
          <button
            onClick={() => setMode('create')}
            style={{
              width: '100%', padding: '10px 16px',
              background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Create New Seat
          </button>
        )}

        {/* Create form */}
        {mode === 'create' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Name
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name.trim(), role, color)}
                placeholder="Your character name"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Role
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['PL', 'GM'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      flex: 1, padding: '8px 12px', border: '2px solid',
                      borderColor: role === r ? '#2563eb' : '#e5e7eb',
                      borderRadius: 6, cursor: 'pointer', fontSize: 14,
                      fontWeight: 600,
                      background: role === r ? (r === 'GM' ? '#fef3c7' : '#dbeafe') : '#fff',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Color
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SEAT_COLORS.map((c) => {
                  const taken = usedColors.includes(c)
                  return (
                    <div
                      key={c}
                      onClick={() => !taken && setColor(c)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c,
                        cursor: taken ? 'not-allowed' : 'pointer',
                        border: color === c ? '3px solid #111' : '3px solid transparent',
                        opacity: taken ? 0.25 : 1,
                      }}
                    />
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setMode('choose')}
                style={{
                  flex: 1, padding: '10px', border: '1px solid #ddd',
                  borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14,
                }}
              >
                Back
              </button>
              <button
                onClick={() => name.trim() && onCreate(name.trim(), role, color)}
                disabled={!name.trim()}
                style={{
                  flex: 1, padding: '10px',
                  background: name.trim() ? '#2563eb' : '#ccc', color: '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: name.trim() ? 'pointer' : 'default',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                Join
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
