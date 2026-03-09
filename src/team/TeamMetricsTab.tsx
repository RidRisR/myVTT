import { useState, useRef, useEffect } from 'react'
import type { TeamTracker } from './useTeamMetrics'
import { ResourceBar } from '../shared/ui/ResourceBar'

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

const inputStyle = {
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  outline: 'none',
  fontFamily: 'inherit',
}

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
    return () => document.removeEventListener('pointerdown', handler)
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
            onChange={(val: number) => onUpdateTracker(t.id, { current: val })}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input
                value={t.label}
                onChange={(e) => onUpdateTracker(t.id, { label: e.target.value })}
                placeholder="Name"
                style={{
                  ...inputStyle,
                  flex: 1,
                  fontSize: 11,
                  padding: '4px 6px',
                  fontWeight: 600,
                }}
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
                style={{
                  ...inputStyle,
                  width: 32,
                  textAlign: 'center',
                  fontSize: 11,
                  padding: '4px 2px',
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>/</span>
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
                style={{
                  ...inputStyle,
                  width: 32,
                  textAlign: 'center',
                  fontSize: 11,
                  padding: '4px 2px',
                  fontWeight: 700,
                }}
              />
              <div
                onClick={() => setColorPickerOpen(colorPickerOpen === t.id ? null : t.id)}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: t.color,
                  border: '2px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
                }}
                title="Change color"
              />
              <button
                onClick={() => onDeleteTracker(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.2)',
                  fontSize: 14,
                  fontWeight: 700,
                  padding: 2,
                  lineHeight: 1,
                  flexShrink: 0,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.2)'
                }}
              >
                ×
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
              onChange={(val: number) => onUpdateTracker(t.id, { current: val })}
            />

            {/* Color picker — collapsed by default */}
            {colorPickerOpen === t.id && (
              <div
                ref={colorPickerRef}
                style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'center' }}
              >
                {COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => {
                      onUpdateTracker(t.id, { color: c })
                      setColorPickerOpen(null)
                    }}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: c,
                      cursor: 'pointer',
                      border: c === t.color ? '2px solid #fff' : '2px solid transparent',
                      transition: 'border-color 0.15s',
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
            onClick={() => setAddingNew(true)}
            style={{
              marginTop: 6,
              width: '100%',
              padding: '7px 0',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 11,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
            }}
          >
            + Add Metric
          </button>
        ) : (
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onBlur={() => commitNewTracker(newLabel)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewTracker(newLabel)
              if (e.key === 'Escape') {
                setAddingNew(false)
                setNewLabel('')
              }
            }}
            placeholder="Metric name..."
            style={{
              marginTop: 6,
              width: '100%',
              padding: '7px 10px',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              outline: 'none',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        ))}
    </div>
  )
}
