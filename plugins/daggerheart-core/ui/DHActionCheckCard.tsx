import type { LogEntryRendererProps } from '../../../src/log/rendererRegistry'
import { CardShell } from '../../../src/log/CardShell'
import { DiceAnimContent } from '../../../src/chat/DiceResultCard'
import type { DieConfig, JudgmentDisplay } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'

interface ActionCheckPayload {
  formula: string
  rolls: number[][]
  total: number
  dc: number
  judgment: { type: string; outcome: string } | null
  display: JudgmentDisplay | null
  dieConfigs: DieConfig[]
}

export function DHActionCheckCard({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  const { t } = usePluginTranslation()
  const payload = entry.payload as unknown as ActionCheckPayload

  const { formula, rolls, total, dc, display, dieConfigs } = payload

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
          <span>DC {dc}</span>
          <span>Total {total}</span>
        </div>
      </div>
    </CardShell>
  )
}
