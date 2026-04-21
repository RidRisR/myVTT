import { useMemo } from 'react'
import type { LogEntryRendererProps } from '../../../src/log/rendererRegistry'
import { CardShell } from '../../../src/log/CardShell'
import { DiceAnimContent } from '../../../src/chat/DiceResultCard'
import type { DieConfig, JudgmentDisplay } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'
import type { FormulaToken } from '../rollConfigUtils'
import type { RollExecutionResult } from '../rollTypes'

interface ActionCheckPayload {
  formula: string
  formulaTokens?: FormulaToken[]
  rollResult?: RollExecutionResult
  total: number
  dc?: number
  judgment: { type: string; outcome: string } | null
  display: JudgmentDisplay | null
  dieConfigs: DieConfig[]
  // Legacy field — kept for backward compatibility with old log entries
  rolls?: number[][]
}

/**
 * Convert RollExecutionResult to the rolls format expected by DiceAnimContent.
 * DiceAnimContent pairs rolls arrays with tokenized formula terms,
 * so duality dice [hopeDie, fearDie] must be combined into a single array
 * when the formula is '2d12' (one term, count=2).
 */
function rollResultToRolls(result: RollExecutionResult): number[][] {
  const rolls: number[][] = []
  if (result.dualityRolls) {
    // Combine into one array to match '2d12' formula tokenization
    rolls.push([...result.dualityRolls])
  }
  for (const gr of result.groupResults) {
    rolls.push(gr.allRolls)
  }
  return rolls
}

export function DHActionCheckCard({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  const { t } = usePluginTranslation()
  const payload = entry.payload as unknown as ActionCheckPayload

  const { formula, rollResult, total, dc, display, dieConfigs } = payload

  // Backward compatible: use rollResult if available, fall back to legacy rolls
  const rolls = useMemo(
    () => (rollResult ? rollResultToRolls(rollResult) : (payload.rolls ?? [])),
    [rollResult, payload.rolls],
  )

  const footer = display ? { text: t(display.text), color: display.color } : undefined

  return (
    <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
      <div data-testid="entry-action-check">
        <DiceAnimContent
          formula={formula}
          rolls={rolls}
          isNew={!!isNew}
          dieConfigs={dieConfigs}
          footer={footer}
          totalColor={display?.color}
        />
        <div className="flex items-center justify-between mt-1 px-2 text-[10px] text-text-muted/50">
          {dc !== undefined && <span>DC {dc}</span>}
          <span>Total {total}</span>
        </div>
      </div>
    </CardShell>
  )
}
