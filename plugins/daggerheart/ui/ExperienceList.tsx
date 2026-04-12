// plugins/daggerheart/ui/ExperienceList.tsx
// Experience items: "name: +modifier" per row, with edit/add/remove (no dice roll).
import { useState, useCallback, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import type { DHExperience } from '../types'

interface ExperienceItemProps {
  exp: DHExperience
  index: number
  onEditName: (index: number, name: string) => void
  onEditValue: (index: number, value: number) => void
  onRemove: (index: number) => void
}

function ExperienceItem({ exp, index, onEditName, onEditValue, onRemove }: ExperienceItemProps) {
  const [editingValue, setEditingValue] = useState(false)
  const [editingName, setEditingName] = useState(!exp.name)
  const valueRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const handleValueCommit = useCallback(
    (raw: string) => {
      setEditingValue(false)
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed !== exp.modifier) onEditValue(index, parsed)
    },
    [exp.modifier, index, onEditValue],
  )

  const handleNameCommit = useCallback(
    (raw: string) => {
      setEditingName(false)
      const trimmed = raw.trim()
      if (trimmed && trimmed !== exp.name) onEditName(index, trimmed)
      // If name is still empty after commit, remove the item
      if (!trimmed && !exp.name) onRemove(index)
    },
    [exp.name, index, onEditName, onRemove],
  )

  const displayMod = `${exp.modifier >= 0 ? '+' : ''}${exp.modifier}`

  return (
    <div
      className="group/row flex items-center gap-1 py-0.5 px-2 bg-white/[0.03] border border-white/[0.03] rounded-[7px] overflow-hidden"
      data-testid="exp-item"
    >
      {/* Name: click to edit */}
      {editingName ? (
        <input
          ref={nameRef}
          autoFocus
          defaultValue={exp.name}
          placeholder="Experience name"
          onBlur={(e) => { handleNameCommit(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setEditingName(false)
              if (!exp.name) onRemove(index)
            }
          }}
          className="flex-1 min-w-0 bg-black/30 border border-accent/30 rounded px-1 text-[10px] text-text-primary outline-none"
          data-testid="exp-name-input"
        />
      ) : (
        <span
          className="flex-1 text-[10px] text-text-muted/60 hover:text-text-muted/90 transition-colors truncate cursor-text min-w-0"
          onClick={() => {
            setEditingName(true)
            requestAnimationFrame(() => nameRef.current?.select())
          }}
          data-testid="exp-name"
        >
          {exp.name}
        </span>
      )}
      {/* Value: click to edit */}
      {editingValue ? (
        <input
          ref={valueRef}
          autoFocus
          defaultValue={exp.modifier}
          onBlur={(e) => { handleValueCommit(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditingValue(false)
          }}
          className="w-7 bg-black/30 border border-accent/30 rounded text-center text-[10px] font-bold text-text-primary outline-none tabular-nums"
          data-testid="exp-input"
        />
      ) : (
        <span
          className="text-[12px] font-bold text-amber-300/80 tabular-nums cursor-text px-1 rounded transition-colors hover:bg-white/[0.06]"
          onClick={() => {
            setEditingValue(true)
            requestAnimationFrame(() => valueRef.current?.select())
          }}
          data-testid="exp-value"
        >
          {displayMod}
        </span>
      )}
      {/* Remove button */}
      <button
        className="opacity-0 group-hover/row:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20"
        onClick={() => { onRemove(index); }}
        data-testid="exp-remove"
      >
        <X size={8} className="text-text-muted" />
      </button>
    </div>
  )
}

interface ExperienceListProps {
  items: DHExperience[]
  onEditName: (index: number, name: string) => void
  onEditValue: (index: number, value: number) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function ExperienceList({
  items,
  onEditName,
  onEditValue,
  onAdd,
  onRemove,
}: ExperienceListProps) {
  return (
    <div className="flex flex-col gap-[3px]" data-testid="exp-list">
      {items.map((exp, i) => (
        <ExperienceItem
          key={exp.key}
          exp={exp}
          index={i}
          onEditName={onEditName}
          onEditValue={onEditValue}
          onRemove={onRemove}
        />
      ))}
      <button
        className="flex items-center justify-center gap-1 py-1 px-2 rounded-[7px] border border-dashed border-white/10 text-[9px] text-text-muted/40 hover:text-text-muted/70 hover:border-white/20 hover:bg-white/[0.03] transition-colors"
        onClick={onAdd}
        data-testid="exp-add"
      >
        <Plus size={10} />
      </button>
    </div>
  )
}
