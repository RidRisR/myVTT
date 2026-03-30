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
  RulePlugin,
} from '../../rules/types'
import type { ChatRollMessage } from '../../shared/chatTypes'
import type { ComponentType } from 'react'
import { tokenizeExpression, buildCompoundResult } from '../../shared/diceUtils'
import { _getUseRulePlugin, _getUsePluginTranslation } from './rollResultDeps'

type RollResultSlot = RollResultConfig | ComponentType<RollCardProps>

export function RollResultRenderer({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  if (!isLogType(entry, 'core:roll-result')) return null

  const plugin = _getUseRulePlugin()()
  const { t } = _getUsePluginTranslation()()
  const { formula, resolvedFormula, rolls, dice, rollType, actionName } = entry.payload

  // Compute total for judgment evaluation
  const total = useMemo(() => {
    const finalFormula = resolvedFormula ?? formula
    const terms = tokenizeExpression(finalFormula)
    return buildCompoundResult(terms ?? [], rolls).total
  }, [formula, resolvedFormula, rolls])

  // Query registry for plugin-registered slot
  const slot = useMemo(
    () =>
      rollType ? (getRenderer('rollResult', rollType) as RollResultSlot | undefined) : undefined,
    [rollType],
  )

  // Build renderDice callback for component escape hatch
  const renderDice = useCallback(
    (configs?: DieConfig[], options?: RenderDiceOptions) => (
      <DiceAnimContent
        formula={formula}
        resolvedFormula={resolvedFormula}
        rolls={rolls}
        isNew={!!isNew}
        dieConfigs={configs}
        footer={options?.footer}
        totalColor={options?.totalColor}
      />
    ),
    [formula, resolvedFormula, rolls, isNew],
  )

  // 1. Semantic config (simple path)
  if (slot && typeof slot !== 'function') {
    const config = slot as RollResultConfig
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
            dieConfigs={config.dieConfigs}
            footer={display ? { text: t(display.text), color: display.color } : undefined}
            totalColor={display?.color}
          />
        </div>
      </CardShell>
    )
  }

  // 2. Component override (escape hatch)
  if (slot && typeof slot === 'function') {
    const CustomCard = slot as ComponentType<RollCardProps>
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
