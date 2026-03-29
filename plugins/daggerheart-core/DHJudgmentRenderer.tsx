import { useMemo } from 'react'
import type { LogEntryRendererProps } from '../../src/log/rendererRegistry'
import { isLogType } from '../../src/shared/logTypes'
import { CardShell } from '../../src/log/CardShell'
import { DiceAnimContent } from '../../src/chat/DiceResultCard'
import { dhGetJudgmentDisplay } from '../daggerheart/diceSystem'
import type { JudgmentResult } from '@myvtt/sdk'

export function DHJudgmentRenderer({ entry, isNew }: LogEntryRendererProps) {
  if (!isLogType(entry, 'dh:judgment')) return null

  const { formula, rolls, judgment } = entry.payload

  const display = useMemo(() => {
    return dhGetJudgmentDisplay(judgment as JudgmentResult)
  }, [judgment])

  const dieConfigs = useMemo(
    () => [
      { color: '#4fc3f7', label: 'Hope' },
      { color: '#ef5350', label: 'Fear' },
    ],
    [],
  )

  return (
    <CardShell entry={entry} isNew={isNew} variant="accent">
      <DiceAnimContent
        formula={formula}
        rolls={rolls}
        isNew={!!isNew}
        dieConfigs={dieConfigs}
        footer={{ text: display.text, color: display.color }}
        totalColor={display.color}
      />
    </CardShell>
  )
}
