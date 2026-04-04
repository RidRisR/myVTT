// plugins/daggerheart-core/index.ts
import type React from 'react'
import i18next from 'i18next'
import type { VTTPlugin, IPluginSDK, WorkflowContext, WorkflowHandle } from '@myvtt/sdk'
import { DiceJudge } from './DiceJudge'
import { FearManager } from './FearManager'
import { HopeResolver } from './HopeResolver'
import { ModifierPanel } from './ui/ModifierPanel'
import type { ModifierResult } from './ui/ModifierPanel'
import { DHActionCheckCard } from './ui/DHActionCheckCard'
import { FearPanel } from './ui/FearPanel'
import { daggerheartI18n } from '../daggerheart/i18n'

interface ActionCheckData {
  [key: string]: unknown
  formula: string
  actorId: string
  dc?: number
  skipModifier?: boolean
  rolls?: number[][]
  total?: number
  judgment?: import('@myvtt/sdk').JudgmentResult
}

export class DaggerHeartCorePlugin implements VTTPlugin {
  id = 'daggerheart-core'

  private dice = new DiceJudge()
  private fear = new FearManager()
  private hope = new HopeResolver()
  private actionCheckHandle!: WorkflowHandle<ActionCheckData>

  onActivate(sdk: IPluginSDK): void {
    // Load daggerheart i18n resources into i18next
    if (i18next.isInitialized) {
      for (const [lng, translations] of Object.entries(daggerheartI18n.resources)) {
        i18next.addResourceBundle(lng, 'plugin-daggerheart', translations, true, true)
      }
    }

    // Register input handler for modifier panel
    sdk.ui.registerInputHandler('daggerheart-core:modifier', {
      component: ModifierPanel as Parameters<typeof sdk.ui.registerInputHandler>[1]['component'],
    })

    // Register chat renderer for action-check log entries
    sdk.ui.registerRenderer(
      'chat',
      'daggerheart-core:action-check',
      DHActionCheckCard as unknown as React.ComponentType<{ entry: unknown; isNew?: boolean }>,
    )

    // Register Fear panel
    sdk.ui.registerComponent({
      id: 'daggerheart-core:fear-panel',
      component: FearPanel as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 160, height: 120 },
      minSize: { width: 120, height: 80 },
      defaultPlacement: { anchor: 'top-right', offsetX: -16, offsetY: 60 },
    })

    // Define workflow with 5 steps: modifier → roll → judge → emit → resolve
    this.actionCheckHandle = sdk.defineWorkflow<ActionCheckData>('daggerheart-core:action-check', [
      {
        id: 'modifier',
        run: async (ctx) => {
          if (ctx.vars.skipModifier || ctx.vars.dc != null) return
          const result = await ctx.requestInput<ModifierResult>('daggerheart-core:modifier', {
            context: { actorId: ctx.vars.actorId },
          })
          if (!result.ok) {
            ctx.abort('Modifier input cancelled')
            return
          }
          ctx.vars.dc = result.value.dc
        },
      },
      {
        id: 'roll',
        run: async (ctx) => {
          // Action check always rolls 2d12 — formula is fixed regardless of user input
          ctx.vars.formula = '2d12'
          const rolls = await ctx.serverRoll([{ sides: 12, count: 2 }])
          ctx.vars.rolls = rolls
          const total = rolls.flat().reduce((a, b) => a + b, 0)
          ctx.vars.total = total
        },
      },
      {
        id: 'judge',
        run: (ctx) => {
          const { rolls, total, dc } = ctx.vars
          if (!rolls || total == null) return
          const actualDc = dc ?? 12
          const judgment = this.dice.evaluate(rolls, total, actualDc)
          if (judgment) ctx.vars.judgment = judgment
        },
      },
      {
        id: 'emit',
        run: (ctx) => {
          const { rolls, total, dc, formula, judgment } = ctx.vars
          if (!rolls || total == null) return
          const display = judgment ? this.dice.getDisplay(judgment) : undefined
          ctx.emitEntry({
            type: 'daggerheart-core:action-check',
            payload: {
              formula,
              rolls,
              total,
              dc: dc ?? 12,
              judgment: judgment ?? null,
              display: display ?? null,
              dieConfigs: [
                { color: '#fbbf24', label: 'die.hope' },
                { color: '#dc2626', label: 'die.fear' },
              ],
            },
            triggerable: true,
          })
        },
      },
      {
        id: 'resolve',
        run: (ctx) => {
          const judgment = ctx.vars.judgment as { type: string; outcome: string } | undefined
          if (!judgment || judgment.type !== 'daggerheart') return
          const outcome = judgment.outcome
          if (outcome === 'success_hope' || outcome === 'failure_hope') {
            this.hope.addHope(ctx, ctx.vars.actorId)
          } else if (outcome === 'success_fear' || outcome === 'failure_fear') {
            this.fear.addFear(ctx)
          }
        },
      },
    ])

    // Register command
    sdk.registerCommand('.dd', this.actionCheckHandle)
  }

  async onReady(ctx: WorkflowContext): Promise<void> {
    await this.fear.ensureEntity(ctx)
  }
}

export const daggerheartCorePlugin = new DaggerHeartCorePlugin()
