// plugins/daggerheart/ui/ThresholdRow.tsx
// Compact three-cell row showing evasion, major, severe thresholds with click-to-edit.
import { useState, useCallback, useRef } from 'react'

interface ThresholdCellProps {
  label: string
  value: number
  highlight?: boolean
  onEdit: (value: number) => void
}

function ThresholdCell({ label, value, highlight, onEdit }: ThresholdCellProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCommit = useCallback(
    (raw: string) => {
      setEditing(false)
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed !== value) onEdit(parsed)
    },
    [value, onEdit],
  )

  return (
    <div
      className={`flex-1 text-center bg-white/[0.04] border rounded-md py-0.5 px-1 ${
        highlight ? 'border-info/20' : 'border-white/[0.04]'
      }`}
      data-testid="threshold-cell"
    >
      <div className="text-[7px] text-text-muted/40 tracking-wide leading-tight">{label}</div>
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          defaultValue={value}
          onBlur={(e) => {
            handleCommit(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-8 bg-black/30 border border-accent/30 rounded text-center text-sm font-bold text-text-primary outline-none tabular-nums"
          data-testid="threshold-input"
        />
      ) : (
        <div
          className={`text-[14px] font-bold tabular-nums cursor-text leading-tight ${
            highlight ? 'text-info/90' : 'text-text-muted/70'
          } hover:text-text-primary/90 transition-colors`}
          onClick={() => {
            setEditing(true)
            requestAnimationFrame(() => inputRef.current?.select())
          }}
          data-testid="threshold-value"
        >
          {value}
        </div>
      )}
    </div>
  )
}

interface ThresholdRowProps {
  evasion: number
  major: number
  severe: number
  labels: { evasion: string; major: string; severe: string }
  onEdit: (threshold: string, value: number) => void
}

export function ThresholdRow({ evasion, major, severe, labels, onEdit }: ThresholdRowProps) {
  return (
    <div className="flex gap-[3px]" data-testid="threshold-row">
      <ThresholdCell
        label={labels.evasion}
        value={evasion}
        highlight
        onEdit={(v) => {
          onEdit('evasion', v)
        }}
      />
      <ThresholdCell
        label={labels.major}
        value={major}
        onEdit={(v) => {
          onEdit('major', v)
        }}
      />
      <ThresholdCell
        label={labels.severe}
        value={severe}
        onEdit={(v) => {
          onEdit('severe', v)
        }}
      />
    </div>
  )
}
