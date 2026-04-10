// plugins/daggerheart-core/index.ts
import type React from 'react'
import i18next from 'i18next'
import type { VTTPlugin, IPluginSDK, WorkflowContext, WorkflowHandle } from '@myvtt/sdk'
import {
  MAIN_RESOURCE_POINT,
  PORTRAIT_RESOURCES_POINT,
  STATUS_POINT,
  FORMULA_TOKENS_POINT,
  ENTITY_CARD_POINT,
  DATA_TEMPLATE_POINT,
} from '@myvtt/sdk'
import { DiceJudge } from './DiceJudge'
import { FearManager } from './FearManager'
import { HopeResolver } from './HopeResolver'
import { CharCardManager } from './CharCardManager'
import { ModifierPanel } from './ui/ModifierPanel'
import type { ModifierResult } from './ui/ModifierPanel'
import { DHActionCheckCard } from './ui/DHActionCheckCard'
import { FearPanel } from './ui/FearPanel'
import { CharacterCard } from '../daggerheart/ui/CharacterCard'
import { daggerheartI18n } from '../daggerheart/i18n'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from '../daggerheart/adapters'
import { createDefaultDHEntityData } from '../daggerheart/templates'
import { DaggerHeartCard } from '../daggerheart/DaggerHeartCard'

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

interface FearSetData {
  [key: string]: unknown
  value: number
}

interface FearClearData {
  [key: string]: unknown
}

interface CharCardUpdateAttrData {
  [key: string]: unknown
  entityId: string
  attribute: string
  value: number
}

interface CharCardUpdateResData {
  [key: string]: unknown
  entityId: string
  resource: string
  field: 'current' | 'max'
  value: number
}

interface CharCardUpdateExtrasData {
  [key: string]: unknown
  entityId: string
  field: string
  value: number
}

interface CharCardUpdateThresholdData {
  [key: string]: unknown
  entityId: string
  threshold: string
  value: number
}

interface CharCardUpdateExpData {
  [key: string]: unknown
  entityId: string
  index: number
  field: 'name' | 'modifier'
  value: string | number
}

interface CharCardAddExpData {
  [key: string]: unknown
  entityId: string
  name: string
  modifier: number
}

interface CharCardRemoveExpData {
  [key: string]: unknown
  entityId: string
  index: number
}

export class DaggerHeartCorePlugin implements VTTPlugin {
  id = 'daggerheart-core'
  ruleSystemId = 'daggerheart'

  private dice = new DiceJudge()
  private fear = new FearManager()
  private hope = new HopeResolver()
  private charCard = new CharCardManager()
  private actionCheckHandle!: WorkflowHandle<ActionCheckData>
  private fearSetHandle!: WorkflowHandle<FearSetData>
  // fear-clear workflow is registered via defineWorkflow side effect; handle not needed

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

    // Register entity display bindings (adapter migration)
    sdk.ui.registerRenderer(MAIN_RESOURCE_POINT, { resolve: dhGetMainResource })
    sdk.ui.registerRenderer(PORTRAIT_RESOURCES_POINT, { resolve: dhGetPortraitResources })
    sdk.ui.registerRenderer(STATUS_POINT, { resolve: dhGetStatuses })
    sdk.ui.registerRenderer(FORMULA_TOKENS_POINT, { resolve: dhGetFormulaTokens })
    sdk.ui.registerRenderer(ENTITY_CARD_POINT, {
      ruleSystemId: 'daggerheart',
      component: DaggerHeartCard,
    })
    sdk.ui.registerRenderer(DATA_TEMPLATE_POINT, {
      ruleSystemId: 'daggerheart',
      createDefaultEntityData: createDefaultDHEntityData,
    })

    // Register Fear panel
    sdk.ui.registerRegion({
      id: 'daggerheart-core:fear-panel',
      component: FearPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 520, height: 50 },
      minSize: { width: 400, height: 42 },
      defaultPlacement: { anchor: 'top-left', offsetX: 200, offsetY: 12 },
      layer: 'standard',
    })

    // Register Character Card region — drawer-style panel on the left edge.
    // Starts collapsed (tab handle only), expands rightward to show card content.
    sdk.ui.registerRegion({
      id: 'daggerheart-core:character-card',
      component: CharacterCard as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 36, height: 60 },
      minSize: { width: 36, height: 60 },
      defaultPlacement: { anchor: 'top-left', offsetX: 0, offsetY: 200 },
      layer: 'standard',
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

    // Define fear mutation workflows
    this.fearSetHandle = sdk.defineWorkflow<FearSetData>('daggerheart-core:fear-set', [
      {
        id: 'set',
        run: (ctx) => {
          this.fear.setFear(ctx, ctx.vars.value)
        },
      },
    ])

    sdk.defineWorkflow<FearClearData>('daggerheart-core:fear-clear', [
      {
        id: 'clear',
        run: (ctx) => {
          this.fear.setFear(ctx, 0)
        },
      },
    ])

    // Register chat commands for fear adjustment
    sdk.registerCommand('.f+', this.fearSetHandle)
    sdk.registerCommand('.f-', this.fearSetHandle)

    // Character card workflows
    sdk.defineWorkflow<CharCardUpdateAttrData>('daggerheart-core:charcard-update-attr', [
      {
        id: 'update',
        run: (ctx) => {
          this.charCard.updateAttribute(ctx, ctx.vars.entityId, ctx.vars.attribute, ctx.vars.value)
        },
      },
    ])

    sdk.defineWorkflow<CharCardUpdateResData>('daggerheart-core:charcard-update-res', [
      {
        id: 'update',
        run: (ctx) => {
          this.charCard.updateResource(
            ctx,
            ctx.vars.entityId,
            ctx.vars.resource,
            ctx.vars.field,
            ctx.vars.value,
          )
        },
      },
    ])

    sdk.defineWorkflow<CharCardUpdateExtrasData>('daggerheart-core:charcard-update-extras', [
      {
        id: 'update',
        run: (ctx) => {
          this.charCard.updateExtras(ctx, ctx.vars.entityId, ctx.vars.field, ctx.vars.value)
        },
      },
    ])

    sdk.defineWorkflow<CharCardUpdateThresholdData>('daggerheart-core:charcard-update-threshold', [
      {
        id: 'update',
        run: (ctx) => {
          this.charCard.updateThreshold(
            ctx,
            ctx.vars.entityId,
            ctx.vars.threshold,
            ctx.vars.value,
          )
        },
      },
    ])

    sdk.defineWorkflow<CharCardUpdateExpData>('daggerheart-core:charcard-update-exp', [
      {
        id: 'update',
        run: (ctx) => {
          this.charCard.updateExperience(
            ctx,
            ctx.vars.entityId,
            ctx.vars.index,
            ctx.vars.field,
            ctx.vars.value,
          )
        },
      },
    ])

    sdk.defineWorkflow<CharCardAddExpData>('daggerheart-core:charcard-add-exp', [
      {
        id: 'add',
        run: (ctx) => {
          this.charCard.addExperience(ctx, ctx.vars.entityId, ctx.vars.name, ctx.vars.modifier)
        },
      },
    ])

    sdk.defineWorkflow<CharCardRemoveExpData>('daggerheart-core:charcard-remove-exp', [
      {
        id: 'remove',
        run: (ctx) => {
          this.charCard.removeExperience(ctx, ctx.vars.entityId, ctx.vars.index)
        },
      },
    ])
  }

  async onReady(ctx: WorkflowContext): Promise<void> {
    await this.fear.ensureEntity(ctx)
    await this.charCard.ensureCharacter(ctx)
  }
}

export const daggerheartCorePlugin = new DaggerHeartCorePlugin()

export const FEAR_SET_WORKFLOW = 'daggerheart-core:fear-set'
export const FEAR_CLEAR_WORKFLOW = 'daggerheart-core:fear-clear'
