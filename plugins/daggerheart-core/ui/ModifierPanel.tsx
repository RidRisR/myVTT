import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useComponent } from '../../../src/data/hooks'
import type { InputHandlerProps } from '../../../src/ui-system/inputHandlerTypes'
import {
  DH_ATTRIBUTE_LABELS,
  DH_KEYS,
  type DHAttributeKey,
  type DHAttributes,
  type DHExperiences,
} from '../../daggerheart/types'
import { rollConfigToFormula, rollConfigToFormulaTokens } from '../rollConfigUtils'
import type { DiceGroup, RollConfig, SideEffectEntry } from '../rollTypes'
import { parseFormulaToRollConfig } from '../rollFormulaSync'
import { normalizeExperiences } from '../rollTemplateUtils'
import { FormulaBar } from './modifier/FormulaBar'
import { AttributeGrid } from './modifier/AttributeGrid'
import { ExperienceChips } from './modifier/ExperienceChips'
import { StepperRow } from './modifier/StepperRow'
import { DiceRow } from './modifier/DiceRow'
import { AdvancedOptions } from './modifier/AdvancedOptions'
import { SideEffects } from './modifier/SideEffects'

type AttributeKey = keyof DHAttributes
type ExtraDiceState = Map<number, { count: number; operator: '+' | '-' }>
type KeepState = Map<string, DiceGroup['keep']>

interface DerivedDiceGroup {
  id: string
  group: DiceGroup
}

export interface ModifierPanelContext {
  actorId?: string
  preselectedAttribute?: string
  defaultConfig?: RollConfig
}

const ATTRIBUTE_KEYS: AttributeKey[] = [
  'agility',
  'strength',
  'finesse',
  'instinct',
  'presence',
  'knowledge',
]

const EMPTY_ATTRIBUTES: DHAttributes = {
  agility: 0,
  strength: 0,
  finesse: 0,
  instinct: 0,
  presence: 0,
  knowledge: 0,
}

const EMPTY_EXPERIENCES: DHExperiences = { items: [] }
const SIDE_EFFECT_ORDER: SideEffectEntry['resource'][] = ['hope', 'hp', 'stress', 'armor']

function findDefaultAttribute(config?: RollConfig): string | null {
  const source = config?.modifiers.find((modifier) =>
    modifier.source.startsWith('attribute:'),
  )?.source
  if (!source) return null
  const attr = source.slice('attribute:'.length)
  return ATTRIBUTE_KEYS.includes(attr as AttributeKey) ? attr : null
}

function findDefaultExperienceKey(config?: RollConfig): string | null {
  const source = config?.modifiers.find((modifier) =>
    modifier.source.startsWith('experience:'),
  )?.source
  if (!source) return null
  const experienceKey = source.slice('experience:'.length)
  return experienceKey || null
}

function createDefaultSideEffects(config?: RollConfig): SideEffectEntry[] {
  return SIDE_EFFECT_ORDER.map((resource) => ({
    resource,
    delta: config?.sideEffects.find((effect) => effect.resource === resource)?.delta ?? 0,
  }))
}

function hydrateDiceState(config?: RollConfig): {
  advantage: number
  disadvantage: number
  extraDice: ExtraDiceState
  keepSettings: KeepState
} {
  const extraDice: ExtraDiceState = new Map()
  const keepSettings: KeepState = new Map()
  let advantage = 0
  let disadvantage = 0

  for (const group of config?.diceGroups ?? []) {
    if (group.label === '优势' && group.operator === '+' && group.sides === 6) {
      advantage = group.count
      keepSettings.set('advantage', group.keep ? { ...group.keep } : { mode: 'high', count: 1 })
      continue
    }

    if (group.label === '劣势' && group.operator === '-' && group.sides === 6) {
      disadvantage = group.count
      keepSettings.set(
        'disadvantage',
        group.keep ? { ...group.keep } : { mode: 'high', count: 1 },
      )
      continue
    }

    extraDice.set(group.sides, { count: group.count, operator: group.operator })
    if (group.keep) {
      keepSettings.set(`extra:${group.operator}:${group.sides}`, { ...group.keep })
    }
  }

  return { advantage, disadvantage, extraDice, keepSettings }
}

function getDualityLabel(hopeFace: number, fearFace: number): string {
  if (hopeFace === fearFace) return `2d${hopeFace}`
  return `d${hopeFace}+d${fearFace}`
}

function buildDerivedDiceGroups(
  advantage: number,
  disadvantage: number,
  extraDice: ExtraDiceState,
  keepSettings: KeepState,
): DerivedDiceGroup[] {
  const groups: DerivedDiceGroup[] = []

  if (advantage > 0) {
    groups.push({
      id: 'advantage',
      group: {
        sides: 6,
        count: advantage,
        operator: '+',
        label: '优势',
        keep: keepSettings.get('advantage') ?? { mode: 'high', count: 1 },
      },
    })
  }

  if (disadvantage > 0) {
    groups.push({
      id: 'disadvantage',
      group: {
        sides: 6,
        count: disadvantage,
        operator: '-',
        label: '劣势',
        keep: keepSettings.get('disadvantage') ?? { mode: 'high', count: 1 },
      },
    })
  }

  const orderedExtraDice = [...extraDice.entries()].sort((a, b) => a[0] - b[0])
  for (const [sides, spec] of orderedExtraDice) {
    if (spec.count <= 0) continue
    const id = `extra:${spec.operator}:${sides}`
    groups.push({
      id,
      group: {
        sides,
        count: spec.count,
        operator: spec.operator,
        label: spec.operator === '-' ? `减d${sides}` : `d${sides}`,
        keep: keepSettings.get(id),
      },
    })
  }

  return groups
}

export function ModifierPanel({
  context,
  resolve,
  cancel,
}: InputHandlerProps<ModifierPanelContext, RollConfig>) {
  const actorId = context.actorId ?? ''
  const attributes = useComponent<DHAttributes>(actorId, DH_KEYS.attributes) ?? EMPTY_ATTRIBUTES
  const rawExperiences = useComponent<DHExperiences>(actorId, DH_KEYS.experiences)
  const experiences = useMemo(
    () => normalizeExperiences(rawExperiences ?? EMPTY_EXPERIENCES),
    [rawExperiences],
  )
  const defaultDiceState = useMemo(
    () => hydrateDiceState(context.defaultConfig),
    [context.defaultConfig],
  )

  const [selectedAttr, setSelectedAttr] = useState<string | null>(
    context.preselectedAttribute ?? findDefaultAttribute(context.defaultConfig),
  )
  const [selectedExp, setSelectedExp] = useState<string | null>(
    findDefaultExperienceKey(context.defaultConfig),
  )
  const [advantage, setAdvantage] = useState(defaultDiceState.advantage)
  const [disadvantage, setDisadvantage] = useState(defaultDiceState.disadvantage)
  const [constant, setConstant] = useState(context.defaultConfig?.constantModifier ?? 0)
  const [dualityEnabled, setDualityEnabled] = useState(context.defaultConfig?.dualityDice !== null)
  const [hopeFace, setHopeFace] = useState(context.defaultConfig?.dualityDice?.hopeFace ?? 12)
  const [fearFace, setFearFace] = useState(context.defaultConfig?.dualityDice?.fearFace ?? 12)
  const [dcInput, setDcInput] = useState(
    context.defaultConfig?.dc !== undefined ? String(context.defaultConfig.dc) : '',
  )
  const [applyOutcomeEffects, setApplyOutcomeEffects] = useState(
    context.defaultConfig?.applyOutcomeEffects ?? true,
  )
  const [extraDice, setExtraDice] = useState<ExtraDiceState>(
    () => new Map(defaultDiceState.extraDice),
  )
  const [keepSettings, setKeepSettings] = useState<KeepState>(
    () => new Map(defaultDiceState.keepSettings),
  )
  const [sideEffects, setSideEffects] = useState<SideEffectEntry[]>(
    createDefaultSideEffects(context.defaultConfig),
  )
  const [formulaDirty, setFormulaDirty] = useState(false)

  const derivedDiceGroups = useMemo(
    () => buildDerivedDiceGroups(advantage, disadvantage, extraDice, keepSettings),
    [advantage, disadvantage, extraDice, keepSettings],
  )

  const dc = useMemo(() => {
    const trimmed = dcInput.trim()
    if (!trimmed) return undefined
    return Math.max(1, Math.min(30, Number(trimmed) || 12))
  }, [dcInput])

  const structuredRollConfig = useMemo<RollConfig>(() => {
    const modifiers: RollConfig['modifiers'] = []

    if (selectedAttr && ATTRIBUTE_KEYS.includes(selectedAttr as AttributeKey)) {
      const attrKey = selectedAttr as DHAttributeKey
      modifiers.push({
        source: `attribute:${attrKey}`,
        label: DH_ATTRIBUTE_LABELS[attrKey],
        value: attributes[attrKey],
      })
    }

    if (selectedExp) {
      const exp = experiences.items.find((item) => item.key === selectedExp)
      if (exp) {
        modifiers.push({
          source: `experience:${exp.key}`,
          label: exp.name,
          value: exp.modifier,
        })
      }
    }

    return {
      dualityDice: dualityEnabled ? { hopeFace, fearFace } : null,
      diceGroups: derivedDiceGroups.map((entry) => entry.group),
      modifiers,
      constantModifier: constant,
      sideEffects,
      dc,
      applyOutcomeEffects,
    }
  }, [
    applyOutcomeEffects,
    attributes,
    constant,
    dc,
    derivedDiceGroups,
    dualityEnabled,
    experiences.items,
    fearFace,
    hopeFace,
    selectedAttr,
    selectedExp,
    sideEffects,
  ])

  const [formulaInput, setFormulaInput] = useState(() => rollConfigToFormula(structuredRollConfig))

  useEffect(() => {
    if (!formulaDirty) {
      setFormulaInput(rollConfigToFormula(structuredRollConfig))
    }
  }, [formulaDirty, structuredRollConfig])

  const formulaConfig = useMemo(() => parseFormulaToRollConfig(formulaInput), [formulaInput])
  const formulaError =
    formulaInput.trim().length > 0 && !formulaConfig ? '公式无法解析，支持标准骰、常量与 kh/kl/dh/dl。' : null

  const rollConfig = useMemo<RollConfig>(() => {
    if (!formulaDirty) return structuredRollConfig
    if (!formulaConfig) return structuredRollConfig
    return {
      ...structuredRollConfig,
      dualityDice: formulaConfig.dualityDice,
      diceGroups: formulaConfig.diceGroups,
      constantModifier: formulaConfig.constantModifier,
    }
  }, [formulaConfig, formulaDirty, structuredRollConfig])

  const formulaTokens = useMemo(() => rollConfigToFormulaTokens(rollConfig), [rollConfig])
  const dualityLabel = getDualityLabel(hopeFace, fearFace)
  const actionLabel =
    selectedAttr && ATTRIBUTE_KEYS.includes(selectedAttr as AttributeKey)
      ? `${DH_ATTRIBUTE_LABELS[selectedAttr as DHAttributeKey]}检定`
      : '行动检定'

  function updateDieCount(sides: number, operator: '+' | '-'): void {
    setExtraDice((prev) => {
      const next = new Map(prev)
      const current = next.get(sides)
      const nextCount = current?.operator === operator ? Math.min(9, current.count + 1) : 1
      next.set(sides, { count: nextCount, operator })
      return next
    })
  }

  function updateKeep(index: number, keep: DiceGroup['keep']): void {
    const target = derivedDiceGroups[index]
    if (!target) return
    setKeepSettings((prev) => {
      const next = new Map(prev)
      if (keep) next.set(target.id, keep)
      else next.delete(target.id)
      return next
    })
  }

  function updateSideEffect(resource: SideEffectEntry['resource'], delta: number): void {
    setSideEffects((prev) =>
      prev.map((effect) => (effect.resource === resource ? { ...effect, delta } : effect)),
    )
  }

  return (
    <div className="w-[520px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-glass">
        <div>
          <span className="text-[13px] font-semibold text-accent">掷骰设定</span>
          <span className="ml-2 text-[11px] text-text-muted">{actionLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wide text-text-muted">DC</label>
          <input
            data-testid="modifier-dc-input"
            type="text"
            inputMode="numeric"
            value={dcInput}
            onChange={(e) => {
              const next = e.target.value.replace(/[^\d]/g, '')
              setDcInput(next)
            }}
            className="w-14 h-7 rounded border border-border-glass bg-black/20 text-text-primary text-[12px] font-mono text-center outline-none focus:border-accent/40"
            placeholder="--"
          />
          <button
            type="button"
            data-testid="modifier-reaction-toggle"
            onClick={() => {
              setApplyOutcomeEffects((prev) => !prev)
            }}
            className={`h-7 px-2 rounded border text-[10px] cursor-pointer transition-colors ${
              applyOutcomeEffects
                ? 'border-border-glass text-text-muted bg-transparent'
                : 'border-info/35 bg-info/10 text-info'
            }`}
          >
            反应掷骰
          </button>
          <button
            onClick={cancel}
            className="w-6 h-6 rounded-md border border-border-glass bg-transparent text-text-muted flex items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:text-text-primary transition-colors"
            aria-label="Close modifier panel"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="px-4 py-2.5 border-b border-border-glass">
        <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted/70 mb-1.5">
          公式
        </div>
        <FormulaBar
          value={formulaInput}
          tokens={formulaTokens}
          error={formulaError}
          onChange={(value) => {
            setFormulaDirty(true)
            setFormulaInput(value)
          }}
        />
      </div>

      <div className="px-4 py-2.5 border-b border-border-glass">
        <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted/70 mb-1.5">
          骰子
        </div>
        <DiceRow
          dualityEnabled={dualityEnabled}
          dualityLabel={dualityLabel}
          onDualityToggle={() => {
            setFormulaDirty(false)
            setDualityEnabled((prev) => !prev)
          }}
          extraDice={extraDice}
          onDiceClick={(sides) => {
            setFormulaDirty(false)
            updateDieCount(sides, '+')
          }}
          onDiceRightClick={(sides) => {
            setFormulaDirty(false)
            updateDieCount(sides, '-')
          }}
        />
      </div>

      <div className="px-4 py-2.5 border-b border-border-glass">
        <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted/70 mb-1.5">
          修正值
        </div>
        <div className="flex flex-col gap-1.5">
          <AttributeGrid
            attributes={attributes}
            selected={selectedAttr}
            onSelect={(value) => {
              setFormulaDirty(false)
              setSelectedAttr(value)
            }}
          />
          <ExperienceChips
            experiences={experiences}
            selected={selectedExp}
            onSelect={(value) => {
              setFormulaDirty(false)
              setSelectedExp(value)
            }}
          />
          <StepperRow
            advantage={advantage}
            disadvantage={disadvantage}
            constant={constant}
            onAdvantageChange={(value) => {
              setFormulaDirty(false)
              setAdvantage(value)
            }}
            onDisadvantageChange={(value) => {
              setFormulaDirty(false)
              setDisadvantage(value)
            }}
            onConstantChange={(value) => {
              setFormulaDirty(false)
              setConstant(value)
            }}
          />
        </div>
      </div>

      <AdvancedOptions
        hopeFace={hopeFace}
        fearFace={fearFace}
        onHopeFaceChange={(value) => {
          setFormulaDirty(false)
          setHopeFace(value)
        }}
        onFearFaceChange={(value) => {
          setFormulaDirty(false)
          setFearFace(value)
        }}
        diceGroups={derivedDiceGroups.map((entry) => entry.group)}
        onKeepChange={(index, keep) => {
          setFormulaDirty(false)
          updateKeep(index, keep)
        }}
        dualityLabel={dualityEnabled ? dualityLabel : undefined}
      />

      <SideEffects effects={sideEffects} onChange={updateSideEffect} />

      <div className="flex gap-2 px-4 py-3">
        <button
          onClick={cancel}
          className="flex-1 h-9 rounded-lg bg-transparent text-[11px] text-text-muted cursor-pointer hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (!formulaError) {
              resolve(rollConfig)
            }
          }}
          disabled={!!formulaError}
          className="flex-[2] h-9 rounded-lg bg-accent/90 text-[13px] font-bold text-deep cursor-pointer hover:bg-accent shadow-[0_0_20px_rgba(212,160,85,0.2)] hover:shadow-[0_0_28px_rgba(212,160,85,0.35)] transition-all"
        >
          Roll
        </button>
      </div>

      <div className="px-4 pb-2.5 text-[10px] text-center text-text-muted/50">
        左键添加正向骰组，右键添加减值骰组；Shift+点击角色卡属性可直接跳过此面板。
      </div>
    </div>
  )
}
