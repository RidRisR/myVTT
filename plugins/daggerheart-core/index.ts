// plugins/daggerheart-core/index.ts
import type React from 'react'
import i18next from 'i18next'
import type {
  VTTPlugin,
  IPluginSDK,
  WorkflowContext,
  WorkflowHandle,
  JudgmentResult,
} from '@myvtt/sdk'
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
import type { RollConfig, RollExecutionResult, SideEffectEntry } from './rollTypes'
import {
  buildDiceSpecs,
  assembleRollResult,
  rollConfigToFormula,
  rollConfigToFormulaTokens,
} from './rollConfigUtils'
import { DH_KEYS } from '../daggerheart/types'
import type { DHAttributes, DHHealth, DHStress, DHExtras } from '../daggerheart/types'

interface ActionCheckData {
  [key: string]: unknown
  actorId: string
  formula?: string
  dc?: number
  skipModifier?: boolean
  preselectedAttribute?: string
  rollConfig?: RollConfig
  rollResult?: RollExecutionResult
  total?: number
  judgment?: JudgmentResult | null
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

function applySideEffect(ctx: WorkflowContext, actorId: string, fx: SideEffectEntry): void {
  switch (fx.resource) {
    case 'hope': {
      ctx.updateComponent(actorId, DH_KEYS.extras, (prev: unknown) => {
        const p = (prev ?? { hope: 0, hopeMax: 6, armor: 0, armorMax: 6 }) as DHExtras
        return { ...p, hope: Math.max(0, Math.min(p.hopeMax, p.hope + fx.delta)) }
      })
      break
    }
    case 'hp': {
      ctx.updateComponent(actorId, DH_KEYS.health, (prev: unknown) => {
        const p = (prev ?? { current: 0, max: 0 }) as DHHealth
        return { ...p, current: Math.max(0, Math.min(p.max, p.current + fx.delta)) }
      })
      break
    }
    case 'stress': {
      ctx.updateComponent(actorId, DH_KEYS.stress, (prev: unknown) => {
        const p = (prev ?? { current: 0, max: 0 }) as DHStress
        return { ...p, current: Math.max(0, Math.min(p.max, p.current + fx.delta)) }
      })
      break
    }
    case 'armor': {
      ctx.updateComponent(actorId, DH_KEYS.extras, (prev: unknown) => {
        const p = (prev ?? { hope: 0, hopeMax: 6, armor: 0, armorMax: 6 }) as DHExtras
        return { ...p, armor: Math.max(0, Math.min(p.armorMax, p.armor + fx.delta)) }
      })
      break
    }
  }
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
    sdk.ui.registerInputHandler('daggerheart-core:roll-modifier', {
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
          const actorId = ctx.vars.actorId

          // 构建默认 RollConfig
          const defaultConfig: RollConfig = {
            dualityDice: { hopeFace: 12, fearFace: 12 },
            diceGroups: [],
            modifiers: [],
            constantModifier: 0,
            sideEffects: [],
            dc: ctx.vars.dc,
          }

          if (ctx.vars.skipModifier) {
            // Shift+click：使用预选属性直接跳过
            const preAttr = ctx.vars.preselectedAttribute
            if (preAttr) {
              const attrs = ctx.read.component<DHAttributes>(actorId, DH_KEYS.attributes)
              if (attrs) {
                const val = attrs[preAttr as keyof DHAttributes]
                defaultConfig.modifiers.push({
                  source: `attribute:${preAttr}`,
                  label: preAttr,
                  value: val,
                })
              }
            }
            ctx.vars.rollConfig = defaultConfig
            return
          }

          const result = await ctx.requestInput<RollConfig>('daggerheart-core:roll-modifier', {
            context: {
              actorId,
              preselectedAttribute: ctx.vars.preselectedAttribute,
              defaultConfig,
            },
          })

          if (!result.ok) {
            ctx.abort('Roll cancelled')
            return
          }

          ctx.vars.rollConfig = result.value
          if (result.value.dc !== undefined) {
            ctx.vars.dc = result.value.dc
          }
        },
      },
      {
        id: 'roll',
        run: async (ctx) => {
          const config = ctx.vars.rollConfig
          if (!config) {
            ctx.abort('No roll config')
            return
          }

          const specs = buildDiceSpecs(config)
          const serverRolls = await ctx.serverRoll(specs)
          const rollResult = assembleRollResult(config, serverRolls)

          ctx.vars.rollResult = rollResult
          ctx.vars.total = rollResult.total
        },
      },
      {
        id: 'judge',
        run: (ctx) => {
          const rollResult = ctx.vars.rollResult
          const dc = ctx.vars.dc

          if (!rollResult?.dualityRolls || dc === undefined) {
            ctx.vars.judgment = null
            return
          }

          // DiceJudge needs [hopeDie, fearDie] and total
          const rolls = [rollResult.dualityRolls]
          ctx.vars.judgment = this.dice.evaluate(rolls, rollResult.total, dc)
        },
      },
      {
        id: 'emit',
        run: (ctx) => {
          const config = ctx.vars.rollConfig
          const rollResult = ctx.vars.rollResult
          const judgment = ctx.vars.judgment

          if (!config || !rollResult) return

          ctx.emitEntry({
            type: 'daggerheart-core:action-check',
            payload: {
              formula: rollConfigToFormula(config),
              formulaTokens: rollConfigToFormulaTokens(config),
              rollConfig: config,
              rollResult,
              total: rollResult.total,
              dc: ctx.vars.dc,
              judgment: judgment ?? null,
              display: judgment ? this.dice.getDisplay(judgment) : null,
              dieConfigs: rollResult.dualityRolls
                ? [
                    { color: '#fbbf24', label: 'die.hope' },
                    { color: '#dc2626', label: 'die.fear' },
                  ]
                : [],
            },
            triggerable: true,
          })
        },
      },
      {
        id: 'resolve',
        run: (ctx) => {
          const config = ctx.vars.rollConfig
          const judgment = ctx.vars.judgment
          const actorId = ctx.vars.actorId

          // 1. 判定后果：hope 增加 / fear 增加
          if (judgment && judgment.type === 'daggerheart') {
            const outcome = judgment.outcome
            if (outcome === 'success_hope' || outcome === 'failure_hope') {
              this.hope.addHope(ctx, actorId)
            } else if (outcome === 'success_fear' || outcome === 'failure_fear') {
              this.fear.addFear(ctx)
            }
          }

          // 2. 副作用：资源变动
          if (config) {
            for (const fx of config.sideEffects) {
              if (fx.delta === 0) continue
              applySideEffect(ctx, actorId, fx)
            }
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
          this.charCard.updateThreshold(ctx, ctx.vars.entityId, ctx.vars.threshold, ctx.vars.value)
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
