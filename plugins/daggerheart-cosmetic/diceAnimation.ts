import type { WorkflowContext } from '@myvtt/sdk'
import { toastEvent, animationEvent } from '../../src/events/systemEvents'

export async function cosmeticDiceAnimationStep(ctx: WorkflowContext): Promise<void> {
  const rolls = ctx.state.rolls as number[][] | undefined
  if (!rolls || rolls.length === 0) return

  const judgment = ctx.state.judgment as { type: string; outcome: string } | undefined

  const outcome = judgment?.outcome ?? 'unknown'
  ctx.events.emit(toastEvent, {
    text: `🎲 Dice animation: ${JSON.stringify(rolls.flat())} — ${outcome}`,
    variant: 'info',
  })

  ctx.events.emit(animationEvent, {
    type: 'dice-roll',
    data: {
      rolls,
      judgment: judgment ?? null,
    },
    durationMs: 1500,
  })
}
