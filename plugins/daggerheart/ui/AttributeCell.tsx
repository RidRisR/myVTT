// plugins/daggerheart/ui/AttributeCell.tsx
import { useState, useCallback, useRef } from 'react'

interface AttributeCellProps {
  labelCn: string
  labelEn: string
  value: number
  onRoll: () => void
  onEdit: (value: number) => void
}

export function AttributeCell({ labelCn, labelEn, value, onRoll, onEdit }: AttributeCellProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = `${value >= 0 ? '+' : ''}${value}`
  const valueColor = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-white/30'

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
    <div className="text-center bg-white/[0.05] border border-white/[0.04] rounded-lg overflow-hidden">
      {/* Roll zone: click label area triggers dice roll */}
      <div
        className="px-1 pt-1.5 pb-0.5 cursor-pointer transition-colors hover:bg-purple-500/10"
        onClick={onRoll}
        data-testid="attr-roll-zone"
      >
        <div className="text-[8px] text-white/45 tracking-wide">{labelCn}</div>
        <div className="text-[6px] text-white/20 uppercase tracking-widest">{labelEn}</div>
      </div>
      {/* Edit zone: click number area triggers inline edit */}
      <div
        className="px-1 pt-0.5 pb-1.5 cursor-text transition-colors border-t border-transparent hover:bg-white/[0.06] hover:border-white/[0.06]"
        onClick={editing ? undefined : handleEditStart}
        data-testid="attr-edit-zone"
      >
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={value}
            onBlur={(e) => handleEditCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-9 bg-black/30 border border-purple-500/30 rounded text-center text-base font-bold text-white outline-none"
            data-testid="attr-input"
          />
        ) : (
          <div className={`text-lg font-bold tabular-nums leading-tight ${valueColor}`} data-testid="attr-value">
            {displayValue}
          </div>
        )}
      </div>
    </div>
  )
}
