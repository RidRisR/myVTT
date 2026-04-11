// plugins/daggerheart/ui/PipRow.tsx
// Pip-style toggle row for armor and hope.
// When max ≤ 8: clickable pip circles. When max > 8: falls back to a progress bar.
import { useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

const PIP_THRESHOLD = 8

interface PipRowProps {
  label: string
  icon: ReactNode
  color: string
  current: number
  max: number
  onUpdate: (field: 'current' | 'max', value: number) => void
}

export function PipRow({ label, icon, color, current, max, onUpdate }: PipRowProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePipClick = useCallback(
    (index: number) => {
      const next = index + 1 === current ? current - 1 : index + 1
      onUpdate('current', Math.max(0, Math.min(next, max)))
    },
    [current, max, onUpdate],
  )

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (max <= 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const next = Math.round(pct * max)
      if (next !== current) onUpdate('current', next)
    },
    [current, max, onUpdate],
  )

  const handleIncrement = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(current + delta, max))
      if (next !== current) onUpdate('current', next)
    },
    [current, max, onUpdate],
  )

  const handleEditCommit = useCallback(
    (raw: string) => {
      setEditing(false)
      const slash = raw.indexOf('/')
      if (slash >= 0) {
        const c = parseInt(raw.slice(0, slash), 10)
        const m = parseInt(raw.slice(slash + 1), 10)
        if (!isNaN(c)) onUpdate('current', c)
        if (!isNaN(m)) onUpdate('max', m)
      } else {
        const parsed = parseInt(raw, 10)
        if (!isNaN(parsed) && parsed !== max) onUpdate('max', parsed)
      }
    },
    [max, onUpdate],
  )

  const startEdit = useCallback(() => {
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  const usePips = max <= PIP_THRESHOLD
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0

  return (
    <div
      className="group flex items-center gap-1 h-6 rounded-md transition-colors hover:bg-white/[0.03]"
      data-testid="pip-row"
    >
      {/* Label column — same width as ResourceBar for alignment */}
      <div className="w-12 shrink-0 flex items-center gap-1 pl-0.5">
        <span className="text-[10px] leading-none" style={{ color }}>
          {icon}
        </span>
        <span className="text-[8px] text-text-muted/50 truncate">{label}</span>
      </div>

      {/* Pips or bar */}
      {usePips ? (
        <div className="flex-1 flex gap-[3px] items-center">
          {Array.from({ length: max }, (_, i) => {
            const filled = i < current
            return (
              <div
                key={i}
                className="w-[9px] h-[9px] rounded-full cursor-pointer transition-all hover:scale-[1.3]"
                style={
                  filled
                    ? { background: color, boxShadow: `0 0 4px ${color}50` }
                    : { background: `${color}10`, border: `1px solid ${color}20` }
                }
                onClick={() => { handlePipClick(i); }}
                data-testid="pip"
              />
            )
          })}
        </div>
      ) : (
        <div
          className="flex-1 h-[6px] bg-white/[0.06] rounded-full overflow-hidden cursor-pointer"
          onClick={handleBarClick}
          data-testid="pip-bar"
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      )}

      {/* Value — click to edit */}
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          defaultValue={`${current}/${max}`}
          onBlur={(e) => { handleEditCommit(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-[38px] shrink-0 bg-black/30 border border-accent/30 rounded text-center text-[9px] text-text-primary outline-none tabular-nums"
          data-testid="pip-input"
        />
      ) : (
        <span
          className="w-[38px] shrink-0 text-[9px] text-right text-text-muted/60 tabular-nums cursor-text rounded transition-colors hover:bg-white/[0.06]"
          onClick={startEdit}
          data-testid="pip-text"
        >
          {current}/{max}
        </span>
      )}

      {/* +/- buttons — disabled when max=0 (no capacity set yet) */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="w-3.5 h-3.5 rounded bg-white/10 border border-white/[0.12] text-text-muted/80 text-[9px] flex items-center justify-center cursor-pointer hover:bg-white/[0.18] hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => { handleIncrement(-1); }}
          disabled={max === 0 || current <= 0}
          data-testid="pip-dec"
        >
          −
        </button>
        <button
          className="w-3.5 h-3.5 rounded bg-white/10 border border-white/[0.12] text-text-muted/80 text-[9px] flex items-center justify-center cursor-pointer hover:bg-white/[0.18] hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => { handleIncrement(1); }}
          disabled={max === 0 || current >= max}
          data-testid="pip-inc"
        >
          +
        </button>
      </div>
    </div>
  )
}
