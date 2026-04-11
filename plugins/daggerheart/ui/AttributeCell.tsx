// plugins/daggerheart/ui/AttributeCell.tsx
// Compact attribute cell: label (roll zone) + value (edit zone).
import { useState, useCallback, useRef } from 'react'

interface AttributeCellProps {
  label: string
  value: number
  onRoll: () => void
  onEdit: (value: number) => void
}

export function AttributeCell({ label, value, onRoll, onEdit }: AttributeCellProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = `${value >= 0 ? '+' : ''}${value}`
  const valueColor = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-muted/40'

  const handleEditStart = useCallback(() => {
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  const handleEditCommit = useCallback(
    (raw: string) => {
      setEditing(false)
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed !== value) {
        onEdit(parsed)
      }
    },
    [value, onEdit],
  )

  return (
    <div className="text-center bg-black/20 border border-border-glass/50 rounded-lg overflow-hidden">
      {/* Roll zone: click label area triggers dice roll */}
      <div
        className="px-2 py-1.5 cursor-pointer transition-colors duration-fast hover:bg-accent/10 active:bg-accent/20"
        onClick={onRoll}
        data-testid="attr-roll-zone"
      >
        <div className="text-[9px] text-text-muted/60 tracking-wide leading-tight">{label}</div>
      </div>
      {/* Edit zone: click number area triggers inline edit */}
      <div
        className="px-2 py-1 cursor-text transition-colors duration-fast border-t border-transparent hover:bg-white/[0.06] hover:border-border-glass/30"
        onClick={editing ? undefined : handleEditStart}
        data-testid="attr-edit-zone"
      >
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={value}
            onBlur={(e) => {
              handleEditCommit(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-10 bg-black/30 border border-accent/30 rounded text-center text-base font-bold text-text-primary outline-none"
            data-testid="attr-input"
          />
        ) : (
          <div
            className={`text-lg font-bold tabular-nums leading-tight ${valueColor}`}
            data-testid="attr-value"
          >
            {displayValue}
          </div>
        )}
      </div>
    </div>
  )
}
