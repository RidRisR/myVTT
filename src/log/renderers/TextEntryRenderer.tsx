import type { LogEntryRendererProps } from '../rendererRegistry'
import { isLogType } from '../../shared/logTypes'
import { CardShell } from '../CardShell'

export function TextEntryRenderer({ entry, isNew }: LogEntryRendererProps) {
  if (!isLogType(entry, 'core:text')) return null
  return (
    <CardShell entry={entry} isNew={isNew} variant="default">
      <div className="text-sm text-text-primary leading-relaxed break-words">
        {entry.payload.content}
      </div>
    </CardShell>
  )
}
