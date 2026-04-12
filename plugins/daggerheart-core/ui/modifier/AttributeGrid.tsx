// plugins/daggerheart-core/ui/modifier/AttributeGrid.tsx
import type { DHAttributes } from '../../../daggerheart/types'

interface AttributeGridProps {
  attributes: DHAttributes
  selected: string | null
  onSelect: (key: string | null) => void
}

const ATTR_KEYS: Array<{ key: keyof DHAttributes; label: string }> = [
  { key: 'agility', label: '敏捷' },
  { key: 'strength', label: '力量' },
  { key: 'finesse', label: '灵巧' },
  { key: 'instinct', label: '直觉' },
  { key: 'presence', label: '风度' },
  { key: 'knowledge', label: '学识' },
]

export function AttributeGrid({ attributes, selected, onSelect }: AttributeGridProps) {
  return (
    <div className="flex gap-1">
      {ATTR_KEYS.map(({ key, label }) => {
        const val = attributes[key] ?? 0
        const isSel = selected === key
        return (
          <button
            key={key}
            onClick={() => onSelect(isSel ? null : key)}
            className={`flex-1 flex flex-col items-center justify-center h-11 rounded-md border transition-colors cursor-pointer ${
              isSel
                ? 'bg-success/[0.08] border-success/30 text-success'
                : 'bg-transparent border-border-glass text-text-muted hover:bg-white/[0.04]'
            }`}
          >
            <span className="text-[9px] leading-none opacity-60">{label}</span>
            <span className="text-[15px] font-bold tabular-nums leading-tight">
              {val >= 0 ? `+${val}` : `${val}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
