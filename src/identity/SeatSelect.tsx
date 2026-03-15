import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { SEAT_COLORS, type Seat } from '../stores/identityStore'

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
  const usedColors = seats.map((s) => s.color)
  const [color, setColor] = useState(
    () => SEAT_COLORS.find((c) => !usedColors.includes(c)) ?? SEAT_COLORS[0],
  )

  return (
    <div className="flex items-center justify-center h-screen font-sans bg-deep">
      <div className="bg-glass backdrop-blur-[16px] rounded-xl p-8 min-w-[360px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-border-glass">
        <h2 className="m-0 mb-6 text-xl text-center text-text-primary font-semibold">
          Join Session
        </h2>

        {/* Existing seats */}
        {seats.length > 0 && mode === 'choose' && (
          <>
            <div className="text-[13px] text-text-muted mb-2">Claim an existing seat:</div>
            <div className="flex flex-col gap-2 mb-4">
              {seats.map((seat) => {
                const isOnline = onlineSeatIds.has(seat.id)
                return (
                  <button
                    key={seat.id}
                    onClick={() => {
                      if (!isOnline) onClaim(seat.id)
                    }}
                    disabled={isOnline}
                    className={`flex items-center gap-3 px-4 py-2.5 border border-border-glass rounded-lg text-sm text-left transition-colors duration-fast ${
                      isOnline
                        ? 'bg-surface/50 cursor-not-allowed opacity-60'
                        : 'bg-surface cursor-pointer hover:bg-hover'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: seat.color }}
                    />
                    <span className="flex-1 font-semibold text-text-primary">{seat.name}</span>
                    {isOnline && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">
                        Online
                      </span>
                    )}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded ${
                        seat.role === 'GM' ? 'bg-warning/20 text-warning' : 'bg-info/20 text-info'
                      }`}
                    >
                      {seat.role}
                    </span>
                    {!isOnline && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(seat.id)
                        }}
                        className="text-text-muted/30 cursor-pointer transition-colors duration-fast hover:text-danger"
                        title="Delete seat"
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="text-center text-text-muted/40 text-xs my-3">or</div>
          </>
        )}

        {/* Create new seat button */}
        {mode === 'choose' && (
          <button
            onClick={() => {
              setMode('create')
            }}
            className="w-full px-4 py-2.5 bg-accent text-deep border-none rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-fast hover:bg-accent-bold"
          >
            Create New Seat
          </button>
        )}

        {/* Create form */}
        {mode === 'create' && (
          <>
            <div className="mb-3">
              <label className="text-xs text-text-muted block mb-1">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) onCreate(name.trim(), role, color)
                }}
                placeholder="Your character name"
                className="w-full px-3 py-2 border border-border-glass rounded-md text-sm bg-surface text-text-primary outline-none box-border placeholder:text-text-muted/40"
              />
            </div>

            <div className="mb-3">
              <label className="text-xs text-text-muted block mb-1">Role</label>
              <div className="flex gap-2">
                {(['PL', 'GM'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRole(r)
                    }}
                    className={`flex-1 px-3 py-2 border-2 rounded-md cursor-pointer text-sm font-semibold transition-colors duration-fast ${
                      role === r
                        ? r === 'GM'
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-info bg-info/20 text-info'
                        : 'border-border-glass bg-surface text-text-muted hover:bg-hover'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-text-muted block mb-1">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {SEAT_COLORS.map((c) => {
                  const taken = usedColors.includes(c)
                  return (
                    <div
                      key={c}
                      onClick={() => {
                        if (!taken) setColor(c)
                      }}
                      className="w-7 h-7 rounded-full transition-colors duration-fast"
                      style={{
                        background: c,
                        cursor: taken ? 'not-allowed' : 'pointer',
                        border: color === c ? '3px solid #F0E6D8' : '3px solid transparent',
                        opacity: taken ? 0.25 : 1,
                      }}
                    />
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode('choose')
                }}
                className="flex-1 py-2.5 border border-border-glass rounded-lg bg-surface cursor-pointer text-sm text-text-muted transition-colors duration-fast hover:bg-hover hover:text-text-primary"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (name.trim()) onCreate(name.trim(), role, color)
                }}
                disabled={!name.trim()}
                className={`flex-1 py-2.5 border-none rounded-lg text-sm font-semibold transition-colors duration-fast ${
                  name.trim()
                    ? 'bg-accent text-deep cursor-pointer hover:bg-accent-bold'
                    : 'bg-text-muted/30 text-text-muted/50 cursor-default'
                }`}
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
