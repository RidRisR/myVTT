// plugins/daggerheart/ui/DHRollCard.tsx
import { useMemo } from 'react'
import type { RollCardProps } from '@myvtt/sdk'
import { tokenizeExpression, buildCompoundResult, usePluginTranslation } from '@myvtt/sdk'
import { dhEvaluateRoll, dhGetJudgmentDisplay } from '../diceSystem'

export function DHRollCard({ message, renderDice }: RollCardProps) {
  const rolls = message.rolls
  const { t } = usePluginTranslation()

  const total = useMemo(() => {
    const formula = message.resolvedFormula ?? message.formula
    const terms = tokenizeExpression(formula) ?? []
    return buildCompoundResult(terms, rolls).total
  }, [message.formula, message.resolvedFormula, rolls])

  const judgment = useMemo(() => dhEvaluateRoll(rolls, total), [rolls, total])
  const display = judgment ? dhGetJudgmentDisplay(judgment) : null

  return renderDice(
    [
      { color: '#fbbf24', label: t('die.hope') },
      { color: '#dc2626', label: t('die.fear') },
    ],
    display
      ? { footer: { text: t(display.text), color: display.color }, totalColor: display.color }
      : undefined,
  )
}
