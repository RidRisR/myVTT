// plugins/daggerheart-core/ui/modifier/DiceRow.tsx

interface DiceRowProps {
  dualityEnabled: boolean
  dualityLabel: string // e.g. "2d12" or "d20+d12"
  onDualityToggle: () => void
  extraDice: Map<number, { count: number; operator: '+' | '-' }>
  onDiceClick: (sides: number) => void
  onDiceRightClick: (sides: number) => void
}

const STANDARD_DICE = [4, 6, 8, 10, 12, 20] as const

export function DiceRow({
  dualityEnabled,
  dualityLabel,
  onDualityToggle,
  extraDice,
  onDiceClick,
  onDiceRightClick,
}: DiceRowProps) {
  return (
    <div className="flex gap-1">
      {/* 二元骰 toggle */}
      <button
        onClick={onDualityToggle}
        className={`flex-1 h-[34px] rounded-md border text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
          dualityEnabled
            ? 'border-[#9070c0]/35 bg-[#9070c0]/[0.08] text-[#9070c0]'
            : 'border-border-glass bg-transparent text-text-muted hover:bg-white/[0.04]'
        }`}
      >
        <span className="flex gap-0.5">
          <span className="w-[6px] h-[6px] rounded-full bg-accent-bold" />
          <span className="w-[6px] h-[6px] rounded-full bg-[#9070c0]" />
        </span>
        {dualityLabel}
      </button>

      {/* 标准骰 */}
      {STANDARD_DICE.map((sides) => {
        const extra = extraDice.get(sides)
        return (
          <button
            key={sides}
            onClick={() => onDiceClick(sides)}
            onContextMenu={(e) => {
              e.preventDefault()
              onDiceRightClick(sides)
            }}
            className="flex-1 h-[34px] rounded-md border border-border-glass bg-transparent text-text-muted text-[11px] font-semibold flex items-center justify-center cursor-pointer transition-colors hover:bg-accent/[0.08] hover:border-accent/25 hover:text-accent relative"
          >
            d{sides}
            {extra && extra.count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full bg-accent text-deep text-[9px] font-extrabold flex items-center justify-center px-1">
                {extra.count}
              </span>
            )}
            {extra && extra.operator === '-' && (
              <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-extrabold flex items-center justify-center">
                -
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
