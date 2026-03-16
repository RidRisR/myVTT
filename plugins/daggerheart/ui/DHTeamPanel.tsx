// plugins/daggerheart/ui/DHTeamPanel.tsx
import { Minus, Plus } from 'lucide-react'
import type { TeamPanelProps } from '@myvtt/sdk'
import type { TeamTracker } from '../../../src/stores/worldStore'

const FEAR_COLOR = '#dc2626'
const HOPE_COLOR = '#f59e0b'
const FEAR_MAX = 12
const HOPE_MAX = 6

function findOrNull(trackers: TeamTracker[], label: string): TeamTracker | null {
  return trackers.find((t) => t.label === label) ?? null
}

function CounterCell({
  label,
  value,
  max,
  color,
  onDecrement,
  onIncrement,
}: {
  label: string
  value: number
  max: number
  color: string
  onDecrement: () => void
  onIncrement: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[9px] font-bold tracking-widest uppercase font-sans" style={{ color }}>
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onDecrement}
          disabled={value <= 0}
          className="w-6 h-6 rounded flex items-center justify-center bg-surface border border-border-glass cursor-pointer text-text-muted/50 transition-colors duration-fast hover:bg-hover hover:text-text-primary disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <Minus size={10} strokeWidth={2.5} />
        </button>
        <span
          className="w-8 text-center text-lg font-bold font-sans tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
        <button
          onClick={onIncrement}
          disabled={value >= max}
          className="w-6 h-6 rounded flex items-center justify-center bg-surface border border-border-glass cursor-pointer text-text-muted/50 transition-colors duration-fast hover:bg-hover hover:text-text-primary disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <Plus size={10} strokeWidth={2.5} />
        </button>
      </div>
      {/* pip track */}
      <div className="flex gap-[3px] flex-wrap justify-center" style={{ maxWidth: 80 }}>
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className="w-[7px] h-[7px] rounded-full transition-colors duration-fast"
            style={{
              background: i < value ? color : 'rgba(255,255,255,0.08)',
              border: `1px solid ${i < value ? color + '60' : 'rgba(255,255,255,0.05)'}`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function DHTeamPanel({ trackers, onUpdate, onCreate }: TeamPanelProps) {
  const fearTracker = findOrNull(trackers, 'Fear')
  const hopeTracker = findOrNull(trackers, 'Hope')

  const ensureTracker = (label: string, max: number, color: string) => {
    if (!findOrNull(trackers, label)) {
      onCreate({ label, current: 0, max, color })
    }
  }

  // Auto-create Fear and Hope trackers on first render if missing
  if (!fearTracker) {
    ensureTracker('Fear', FEAR_MAX, FEAR_COLOR)
    return null
  }
  if (!hopeTracker) {
    ensureTracker('Hope', HOPE_MAX, HOPE_COLOR)
    return null
  }

  const otherTrackers = trackers.filter((t) => t.label !== 'Fear' && t.label !== 'Hope')

  return (
    <div className="flex flex-col gap-3 font-sans text-text-primary">
      {/* Fear / Hope counters */}
      <div className="flex justify-around pt-1">
        <CounterCell
          label="Fear"
          value={fearTracker.current}
          max={fearTracker.max}
          color={FEAR_COLOR}
          onDecrement={() => {
            onUpdate(fearTracker.id, { current: Math.max(0, fearTracker.current - 1) })
          }}
          onIncrement={() => {
            onUpdate(fearTracker.id, {
              current: Math.min(fearTracker.max, fearTracker.current + 1),
            })
          }}
        />
        <div className="w-px bg-border-glass" />
        <CounterCell
          label="Hope"
          value={hopeTracker.current}
          max={hopeTracker.max}
          color={HOPE_COLOR}
          onDecrement={() => {
            onUpdate(hopeTracker.id, { current: Math.max(0, hopeTracker.current - 1) })
          }}
          onIncrement={() => {
            onUpdate(hopeTracker.id, {
              current: Math.min(hopeTracker.max, hopeTracker.current + 1),
            })
          }}
        />
      </div>

      {/* Other team trackers (e.g. armor, supplies) */}
      {otherTrackers.length > 0 && (
        <div className="border-t border-border-glass pt-2.5 flex flex-col gap-2">
          {otherTrackers.map((t) => {
            const pct = t.max > 0 ? t.current / t.max : 0
            return (
              <div key={t.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-semibold text-text-muted/70">{t.label}</span>
                  <span className="text-[10px] font-bold tabular-nums" style={{ color: t.color }}>
                    {t.current}/{t.max}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct * 100}%`, background: t.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
