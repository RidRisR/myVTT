import type { RollConfig } from '../../rollTypes'

const STANDARD_DICE = [4, 6, 8, 10, 12, 20] as const

interface DiceTabProps {
  onRoll: (config: RollConfig, skipModifier: boolean) => void
}

export function DiceTab({ onRoll }: DiceTabProps) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5">
        {STANDARD_DICE.map((sides) => (
          <button
            key={sides}
            onClick={(e) => {
              onRoll(
                {
                  dualityDice: null,
                  diceGroups: [{ sides, count: 1, operator: '+', label: `d${sides}` }],
                  modifiers: [],
                  constantModifier: 0,
                  sideEffects: [],
                  applyOutcomeEffects: true,
                },
                e.shiftKey,
              )
            }}
            className="flex flex-col items-center justify-center gap-0.5 px-1 py-2 min-h-[54px] rounded-md border border-white/[0.08] bg-white/[0.04] text-white/65 cursor-pointer transition-all hover:bg-white/[0.10] hover:border-accent/30 hover:shadow-[0_0_8px_rgba(251,191,36,0.08)]"
          >
            <span className="text-[10px] leading-none">d{sides}</span>
            <span className="text-[14px] font-bold leading-none text-[#a78bfa]">1</span>
            <span className="text-[7px] font-mono leading-none text-white/25">1-{sides}</span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-center text-[9px] text-white/20">
        点击带着预置骰组打开 Modifier Panel，Shift+点击可直接投掷该骰子。
      </div>
    </div>
  )
}
