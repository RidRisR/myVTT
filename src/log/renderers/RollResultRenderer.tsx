import { useMemo, useCallback } from 'react'
import type { LogEntryRendererProps } from '../rendererRegistry'
import { getRenderer } from '../rendererRegistry'
import { isLogType } from '../../shared/logTypes'
import { CardShell } from '../CardShell'
import { DiceAnimContent } from '../../chat/DiceResultCard'
import type {
  RollResultConfig,
  RollCardProps,
  DieConfig,
  RenderDiceOptions,
} from '../../rules/types'
import type { ChatRollMessage } from '../../shared/chatTypes'
import type { ComponentType } from 'react'
import { tokenizeExpression, buildCompoundResult } from '../../shared/diceUtils'
import { _getUseRulePlugin, _getUsePluginTranslation } from './rollResultDeps'

type RollResultSlot = RollResultConfig | ComponentType<RollCardProps>

export function RollResultRenderer({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  const plugin = _getUseRulePlugin()()
  const { t } = _getUsePluginTranslation()()

  // Extract payload — hooks must be called unconditionally (rules-of-hooks)
  const rollPayload = isLogType(entry, 'core:roll-result') ? entry.payload : null

  // Compute total for judgment evaluation
  const total = useMemo(() => {
    if (!rollPayload) return 0
    const finalFormula = rollPayload.resolvedFormula ?? rollPayload.formula
    const terms = tokenizeExpression(finalFormula)
    return buildCompoundResult(terms ?? [], rollPayload.rolls).total
  }, [rollPayload])

  // Build renderDice callback for component escape hatch
  const renderDice = useCallback(
    (configs?: DieConfig[], options?: RenderDiceOptions) => (
      <DiceAnimContent
        formula={rollPayload?.formula ?? ''}
        resolvedFormula={rollPayload?.resolvedFormula}
        rolls={rollPayload?.rolls ?? []}
        isNew={!!isNew}
        dieConfigs={configs}
        footer={options?.footer}
        totalColor={options?.totalColor}
      />
    ),
    [rollPayload, isNew],
  )

  if (!rollPayload) return null

  const { formula, resolvedFormula, rolls, dice, rollType, actionName } = rollPayload

  // Query registry for plugin-registered slot (Map lookup — no memo needed)
  const slot = rollType
    ? (getRenderer('rollResult', rollType) as RollResultSlot | undefined)
    : undefined

  // 1. Semantic config (simple path)
  if (slot && typeof slot !== 'function') {
    const judgment = plugin.diceSystem?.evaluateRoll(rolls, total) ?? null
    const display = judgment ? plugin.diceSystem?.getJudgmentDisplay(judgment) : null
    return (
      <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
        <div data-testid="entry-roll-result">
          <DiceAnimContent
            formula={formula}
            resolvedFormula={resolvedFormula}
            rolls={rolls}
            isNew={!!isNew}
            dieConfigs={slot.dieConfigs}
            footer={display ? { text: t(display.text), color: display.color } : undefined}
            totalColor={display?.color}
          />
        </div>
      </CardShell>
    )
  }

  // 2. Component override (escape hatch — dynamic component from registry is intentional)
  if (slot && typeof slot === 'function') {
    const CustomCard = slot
    const chatMsg: ChatRollMessage = {
      type: 'roll',
      id: entry.id,
      origin: entry.origin,
      timestamp: entry.timestamp,
      formula,
      resolvedFormula,
      dice,
      rolls,
      rollType,
      actionName,
    }
    return (
      <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
        <div data-testid="entry-roll-result">
          <CustomCard message={chatMsg} isNew={isNew} renderDice={renderDice} />
        </div>
      </CardShell>
    )
  }

  // 3. Default plain dice
  return (
    <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
      <div data-testid="entry-roll-result">
        <DiceAnimContent
          formula={formula}
          resolvedFormula={resolvedFormula}
          rolls={rolls}
          isNew={!!isNew}
        />
      </div>
    </CardShell>
  )
}
