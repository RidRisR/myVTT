import type { LogEntryRendererProps } from '../rendererRegistry'
import { isLogType } from '../../shared/logTypes'
import { CardShell } from '../CardShell'
import { DiceAnimContent } from '../../chat/DiceResultCard'

export function RollResultRenderer({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  if (!isLogType(entry, 'core:roll-result')) return null
  return (
    <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
      <DiceAnimContent
        formula={entry.payload.formula}
        resolvedFormula={entry.payload.resolvedFormula}
        rolls={entry.payload.rolls}
        isNew={!!isNew}
      />
    </CardShell>
  )
}
