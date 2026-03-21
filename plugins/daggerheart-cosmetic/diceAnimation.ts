import type { WorkflowContext } from '@myvtt/sdk'

export async function cosmeticDiceAnimationStep(ctx: WorkflowContext): Promise<void> {
  const rolls = ctx.data.rolls as number[][] | undefined
  if (!rolls || rolls.length === 0) return

  const judgment = ctx.data.judgment as { type: string; outcome: string } | undefined

  const outcome = judgment?.outcome ?? 'unknown'
  ctx.showToast(`🎲 Dice animation: ${JSON.stringify(rolls.flat())} — ${outcome}`, {
    variant: 'info',
  })

  await ctx.playAnimation({
    type: 'dice-roll',
    data: {
      rolls,
      judgment: judgment ?? null,
    },
    durationMs: 1500,
  })
}