import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { TeamTracker } from '../stores/worldStore'
import { ResourceBar } from '../ui/ResourceBar'

interface TeamMetricsTabProps {
  trackers: TeamTracker[]
  expanded: boolean
  isGM: boolean
  onUpdateTracker: (id: string, updates: Partial<TeamTracker>) => void
  onAddTracker: (label: string) => void
  onDeleteTracker: (id: string) => void
}

const COLORS = [
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#ef4444',
  '#f97316',
]

const inputCls =
  'bg-surface text-text-primary border border-border-glass rounded outline-none font-inherit'

export function TeamMetricsTab({
  trackers,
  expanded,
  isGM,
  onUpdateTracker,
  onAddTracker,
  onDeleteTracker,
}: TeamMetricsTabProps) {
  const [addingNew, setAddingNew] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  // Close color picker on click outside
  useEffect(() => {
    if (colorPickerOpen === null) return
    const handler = (e: PointerEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
    }
  }, [colorPickerOpen])

  const commitNewTracker = (label: string) => {
    const trimmed = label.trim()
    if (trimmed) onAddTracker(trimmed)
    setNewLabel('')
    setAddingNew(false)
  }

  if (trackers.length === 0 && !isGM) return null

  // Compact mode: dual-column draggable bars
  if (!expanded) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: trackers.length >= 2 ? '1fr 1fr' : '1fr',
          gap: '10px 14px',
        }}
      >
        {trackers.map((t) => (
          <ResourceBar
            key={t.id}
            label={t.label}
            current={t.current}
            max={t.max}
            color={t.color}
            height={8}
            valueDisplay="outside"
            draggable={isGM}
            onChange={(val: number) => {
              onUpdateTracker(t.id, { current: val })
            }}
          />
        ))}
      </div>
    )
  }

  // Expanded mode: full editing controls
  return (
    <div>
      {trackers.map((t) => {
        return (
          <div key={t.id} style={{ marginBottom: 12 }}>
            {/* Header: name + current/max inputs + color + remove */}
            <div className="flex items-center gap-1 mb-1">
              <input
                value={t.label}
                onChange={(e) => {
                  onUpdateTracker(t.id, { label: e.target.value })
                }}
                placeholder="Name"
                className={`${inputCls} flex-1 text-[11px] px-1.5 py-1 font-semibold`}
              />
              <input
                key={`cur-${t.id}-${t.current}`}
                defaultValue={t.current}
                onBlur={(e) => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v)) onUpdateTracker(t.id, { current: Math.max(0, Math.min(v, t.max)) })
                  else e.target.value = String(t.current)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                className={`${inputCls} w-8 text-center text-[11px] px-0.5 py-1 font-bold`}
              />
              <span className="text-[10px] text-text-muted/30">/</span>
              <input
                key={`max-${t.id}-${t.max}`}
                defaultValue={t.max}
                onBlur={(e) => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v) && v > 0)
                    onUpdateTracker(t.id, { max: v, current: Math.min(t.current, v) })
                  else e.target.value = String(t.max)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                className={`${inputCls} w-8 text-center text-[11px] px-0.5 py-1 font-bold`}
              />
              <div
                onClick={() => {
                  setColorPickerOpen(colorPickerOpen === t.id ? null : t.id)
                }}
                className="w-3.5 h-3.5 rounded-full border-2 border-text-muted/25 cursor-pointer shrink-0 transition-colors duration-fast hover:border-text-muted/50"
                style={{ background: t.color }}
                title="Change color"
              />
              <button
                onClick={() => {
                  onDeleteTracker(t.id)
                }}
                className="bg-transparent border-none cursor-pointer text-text-muted/20 p-0.5 leading-none shrink-0 transition-colors duration-fast hover:text-danger"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Bar row: - draggable bar + */}
            <ResourceBar
              current={t.current}
              max={t.max}
              color={t.color}
              height={16}
              valueDisplay="inline"
              draggable
              showButtons
              onChange={(val: number) => {
                onUpdateTracker(t.id, { current: val })
              }}
            />

            {/* Color picker — collapsed by default */}
            {colorPickerOpen === t.id && (
              <div ref={colorPickerRef} className="flex gap-1 mt-1.5 justify-center">
                {COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => {
                      onUpdateTracker(t.id, { color: c })
                      setColorPickerOpen(null)
                    }}
                    className="w-4 h-4 rounded-full cursor-pointer transition-colors duration-fast"
                    style={{
                      background: c,
                      border: c === t.color ? '2px solid #fff' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Add tracker button (GM only) */}
      {isGM &&
        (!addingNew ? (
          <button
            onClick={() => {
              setAddingNew(true)
            }}
            className="mt-1.5 w-full py-[7px] bg-surface border border-border-glass rounded-lg cursor-pointer text-text-muted/40 text-[11px] font-semibold transition-colors duration-fast hover:bg-hover hover:text-text-muted/70"
          >
            + Add Metric
          </button>
        ) : (
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value)
            }}
            onBlur={() => {
              commitNewTracker(newLabel)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewTracker(newLabel)
              if (e.key === 'Escape') {
                setAddingNew(false)
                setNewLabel('')
              }
            }}
            placeholder="Metric name..."
            className="mt-1.5 w-full py-[7px] px-2.5 bg-surface text-text-primary border border-border-glass rounded-lg outline-none text-[11px] font-semibold font-inherit box-border"
          />
        ))}
    </div>
  )
}
