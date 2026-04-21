// plugins/daggerheart/ui/ResourceBar.tsx
// HP / Stress bar with label, current/max display, and +/- buttons on hover.
import { useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

interface ResourceBarProps {
  label: string
  icon: ReactNode
  color: string
  gradientFrom: string
  gradientTo: string
  current: number
  max: number
  onUpdate: (field: 'current' | 'max', value: number) => void
}

export function ResourceBar({
  label,
  icon,
  color,
  gradientFrom,
  gradientTo,
  current,
  max,
  onUpdate,
}: ResourceBarProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0

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
      // Support "15/20" format or just "15"
      const slash = raw.indexOf('/')
      if (slash >= 0) {
        const c = parseInt(raw.slice(0, slash), 10)
        const m = parseInt(raw.slice(slash + 1), 10)
        if (!isNaN(c)) onUpdate('current', c)
        if (!isNaN(m)) onUpdate('max', m)
      } else {
        const c = parseInt(raw, 10)
        if (!isNaN(c) && c !== current) onUpdate('current', c)
      }
    },
    [current, onUpdate],
  )

  return (
    <div
      className="group flex items-center gap-1 h-6 rounded-md transition-colors hover:bg-white/[0.03]"
      data-testid="res-bar"
    >
      {/* Label column — fixed width for alignment */}
      <div className="w-12 shrink-0 flex items-center gap-1 pl-0.5">
        <span className="text-[10px] leading-none" style={{ color }}>
          {icon}
        </span>
        <span className="text-[8px] text-text-muted/50 truncate">{label}</span>
      </div>

      {/* Bar */}
      <div className="flex-1 h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
          }}
        />
      </div>

      {/* Value — click to edit */}
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          defaultValue={`${current}/${max}`}
          onBlur={(e) => {
            handleEditCommit(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-[38px] shrink-0 bg-black/30 border border-accent/30 rounded text-center text-[9px] text-text-primary outline-none tabular-nums"
          data-testid="res-input"
        />
      ) : (
        <span
          className="w-[38px] shrink-0 text-[9px] text-right text-text-muted/60 tabular-nums cursor-text rounded transition-colors hover:bg-white/[0.06]"
          onClick={() => {
            setEditing(true)
            requestAnimationFrame(() => inputRef.current?.select())
          }}
          data-testid="res-text"
        >
          {current}/{max}
        </span>
      )}

      {/* +/- buttons — disabled when max=0 (no capacity set yet) */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="w-3.5 h-3.5 rounded bg-white/10 border border-white/[0.12] text-text-muted/80 text-[9px] flex items-center justify-center cursor-pointer hover:bg-white/[0.18] hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => {
            handleIncrement(-1)
          }}
          disabled={max === 0 || current <= 0}
          data-testid="res-dec"
        >
          −
        </button>
        <button
          className="w-3.5 h-3.5 rounded bg-white/10 border border-white/[0.12] text-text-muted/80 text-[9px] flex items-center justify-center cursor-pointer hover:bg-white/[0.18] hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => {
            handleIncrement(1)
          }}
          disabled={max === 0 || current >= max}
          data-testid="res-inc"
        >
          +
        </button>
      </div>
    </div>
  )
}
