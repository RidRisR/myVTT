import { useMemo } from 'react'
import type { LogEntryRendererProps } from '../../src/log/rendererRegistry'
import { isLogType } from '../../src/shared/logTypes'
import { CardShell } from '../../src/log/CardShell'
import { DiceAnimContent } from '../../src/chat/DiceResultCard'
import { dhGetJudgmentDisplay } from '../daggerheart/diceSystem'
import type { JudgmentResult } from '@myvtt/sdk'

export function DHJudgmentRenderer({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  const payload = isLogType(entry, 'dh:judgment') ? entry.payload : null

  const display = useMemo(() => {
    if (!payload) return { text: '', color: '' }
    return dhGetJudgmentDisplay(payload.judgment as JudgmentResult)
  }, [payload])

  const dieConfigs = useMemo(
    () => [
      { color: '#4fc3f7', label: 'Hope' },
      { color: '#ef5350', label: 'Fear' },
    ],
    [],
  )

  if (!payload) return null

  return (
    <CardShell entry={entry} isNew={isNew} animationStyle={animationStyle} variant="accent">
      <DiceAnimContent
        formula={payload.formula}
        rolls={payload.rolls}
        isNew={!!isNew}
        dieConfigs={dieConfigs}
        footer={{ text: display.text, color: display.color }}
        totalColor={display.color}
      />
    </CardShell>
  )
}
