// plugins/daggerheart/ui/DHRollCard.tsx
import { useMemo } from 'react'
import type { RollCardProps } from '@myvtt/sdk'
import { tokenizeExpression, buildCompoundResult } from '@myvtt/sdk'
import { dhEvaluateRoll, dhGetJudgmentDisplay } from '../diceSystem'

const EMPTY_ROLLS: number[][] = []

export function DHRollCard({ message, renderDice }: RollCardProps) {
  const rolls = message.rolls ?? EMPTY_ROLLS

  const total = useMemo(() => {
    const formula = message.resolvedFormula ?? message.formula
    const terms = tokenizeExpression(formula) ?? []
    return buildCompoundResult(terms, rolls).total
  }, [message.formula, message.resolvedFormula, rolls])

  const judgment = useMemo(() => dhEvaluateRoll(rolls, total), [rolls, total])
  const display = judgment ? dhGetJudgmentDisplay(judgment) : null

  return renderDice(
    [
      { color: '#fbbf24', label: '希望' },
      { color: '#dc2626', label: '恐惧' },
    ],
    display ? { footer: { text: display.text, color: display.color } } : undefined,
  )
}
