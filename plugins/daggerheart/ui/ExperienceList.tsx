// plugins/daggerheart/ui/ExperienceList.tsx
// Experience items with name roll-zone and value edit-zone (dual-zone like attributes).
import { useState, useCallback, useRef } from 'react'
import type { DHExperience } from '../types'

interface ExperienceItemProps {
  exp: DHExperience
  index: number
  onRoll: (name: string, modifier: number) => void
  onEditValue: (index: number, value: number) => void
}

function ExperienceItem({ exp, index, onRoll, onEditValue }: ExperienceItemProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCommit = useCallback(
    (raw: string) => {
      setEditing(false)
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed !== exp.modifier) onEditValue(index, parsed)
    },
    [exp.modifier, index, onEditValue],
  )

  const displayMod = `${exp.modifier >= 0 ? '+' : ''}${exp.modifier}`

  return (
    <div
      className="flex items-center justify-between py-1 px-2 bg-white/[0.03] border border-white/[0.03] rounded-[7px] overflow-hidden"
      data-testid="exp-item"
    >
      {/* Name = roll zone */}
      <div
        className="group/exp flex-1 flex items-center gap-1 cursor-pointer transition-colors"
        onClick={() => onRoll(exp.name, exp.modifier)}
        data-testid="exp-roll-zone"
      >
        <span className="text-[10px] text-text-muted/60 group-hover/exp:text-text-muted/90 transition-colors">
          {exp.name}
        </span>
        <span className="text-[7px] text-amber-400/50 opacity-0 group-hover/exp:opacity-100 transition-opacity">
          🎲
        </span>
      </div>
      {/* Value = edit zone */}
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          defaultValue={exp.modifier}
          onBlur={(e) => handleCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-7 bg-black/30 border border-accent/30 rounded text-center text-[10px] font-bold text-text-primary outline-none tabular-nums"
          data-testid="exp-input"
        />
      ) : (
        <span
          className="text-[12px] font-bold text-amber-300/80 tabular-nums cursor-text px-1 rounded transition-colors hover:bg-white/[0.06]"
          onClick={() => {
            setEditing(true)
            requestAnimationFrame(() => inputRef.current?.select())
          }}
          data-testid="exp-value"
        >
          {displayMod}
        </span>
      )}
    </div>
  )
}

interface ExperienceListProps {
  items: DHExperience[]
  onRoll: (name: string, modifier: number) => void
  onEditValue: (index: number, value: number) => void
}

export function ExperienceList({ items, onRoll, onEditValue }: ExperienceListProps) {
  if (items.length === 0) {
    return (
      <div className="text-[9px] text-text-muted/30 text-center py-2" data-testid="exp-empty">
        —
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[3px]" data-testid="exp-list">
      {items.map((exp, i) => (
        <ExperienceItem
          key={i}
          exp={exp}
          index={i}
          onRoll={onRoll}
          onEditValue={onEditValue}
        />
      ))}
    </div>
  )
}
