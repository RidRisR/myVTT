// plugins/daggerheart/ui/DHRollCard.tsx
import { useMemo } from 'react'
import type { RollCardProps } from '@myvtt/sdk'
import { tokenizeExpression, buildCompoundResult } from '@myvtt/sdk'
import { dhEvaluateRoll, dhGetDieStyles, dhGetJudgmentDisplay } from '../diceSystem'

export function DHRollCard({ message }: RollCardProps) {
  const rolls = message.rolls ?? []

  const total = useMemo(() => {
    const formula = message.resolvedFormula ?? message.formula
    const terms = tokenizeExpression(formula) ?? []
    return buildCompoundResult(terms, rolls).total
  }, [message.formula, message.resolvedFormula, rolls])

  const [hopeDie, fearDie] = rolls[0] ?? []
  const judgment = useMemo(() => dhEvaluateRoll(rolls, total), [rolls, total])
  const dieStyles = dhGetDieStyles(rolls)
  const display = judgment ? dhGetJudgmentDisplay(judgment) : null

  return (
    <div className="flex flex-col gap-2 pt-1">
      {/* Dice values */}
      <div className="flex items-center gap-3">
        {hopeDie !== undefined && (
          <span
            className="flex flex-col items-center gap-0.5"
            style={{ color: dieStyles[0]?.color ?? '#fbbf24' }}
          >
            <span className="text-[10px] text-text-muted">{dieStyles[0]?.label ?? '希望'}</span>
            <span className="text-xl font-bold font-mono">{hopeDie}</span>
          </span>
        )}
        {fearDie !== undefined && (
          <span
            className="flex flex-col items-center gap-0.5"
            style={{ color: dieStyles[1]?.color ?? '#dc2626' }}
          >
            <span className="text-[10px] text-text-muted">{dieStyles[1]?.label ?? '恐惧'}</span>
            <span className="text-xl font-bold font-mono">{fearDie}</span>
          </span>
        )}
        <span className="text-text-muted/50 text-sm">=</span>
        <span className="text-xl font-bold font-mono text-accent">{total}</span>
      </div>

      {/* Judgment badge */}
      {display && (
        <div
          className="text-xs font-semibold px-2 py-1 rounded self-start"
          style={{ color: display.color, background: `${display.color}22` }}
        >
          {display.text}
        </div>
      )}
    </div>
  )
}
