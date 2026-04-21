import { DH_ATTRIBUTE_LABELS, type DHAttributes } from '../../../daggerheart/types'

interface AttributeTabProps {
  attributes: DHAttributes
  onRoll: (attrKey: keyof DHAttributes, shiftKey: boolean) => void
}

const ATTRIBUTE_KEYS: Array<keyof DHAttributes> = [
  'agility',
  'strength',
  'finesse',
  'instinct',
  'presence',
  'knowledge',
]

export function AttributeTab({ attributes, onRoll }: AttributeTabProps) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5">
        {ATTRIBUTE_KEYS.map((key) => {
          const value = attributes[key]
          const formula = `2d12${value >= 0 ? `+${value}` : value}`
          const valueTone = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-white/30'

          return (
            <button
              key={key}
              onClick={(e) => {
                onRoll(key, e.shiftKey)
              }}
              className="flex flex-col items-center justify-center gap-0.5 px-1 py-2 min-h-[54px] rounded-md border border-white/[0.08] bg-white/[0.04] cursor-pointer transition-all hover:bg-white/[0.10] hover:border-accent/30 hover:shadow-[0_0_8px_rgba(251,191,36,0.08)]"
            >
              <span className="text-[9px] text-white/45 leading-none">
                {DH_ATTRIBUTE_LABELS[key]}
              </span>
              <span className={`text-[15px] font-bold leading-none tabular-nums ${valueTone}`}>
                {value >= 0 ? `+${value}` : value}
              </span>
              <span className="text-[7px] text-white/30 font-mono leading-none">{formula}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 text-center text-[9px] text-white/20">
        点击打开 Modifier Panel，Shift+点击可直接掷骰。
      </div>
    </div>
  )
}
