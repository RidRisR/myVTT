import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkflowHandle } from '@myvtt/sdk'
import type { IRegionSDK } from '../../../src/ui-system/types'
import { useIdentityStore } from '../../../src/stores/identityStore'
import {
  DH_KEYS,
  type DHAttributes,
  type DHExperiences,
  type DHExtras,
  type DHHealth,
  type DHRollTemplates,
  type DHStress,
} from '../../daggerheart/types'
import type { RollConfig } from '../rollTypes'
import { CollapsedBar } from './bottom/CollapsedBar'
import { AttributeTab } from './bottom/AttributeTab'
import { CustomTab } from './bottom/CustomTab'
import { DiceTab } from './bottom/DiceTab'
import { ResourceSection } from './bottom/ResourceSection'

type BottomTab = 'attributes' | 'custom' | 'dice'

const ACTION_CHECK_HANDLE = { name: 'daggerheart-core:action-check' } as WorkflowHandle
const UPDATE_RES_HANDLE = { name: 'daggerheart-core:charcard-update-res' } as WorkflowHandle
const UPDATE_EXTRAS_HANDLE = { name: 'daggerheart-core:charcard-update-extras' } as WorkflowHandle
const ADD_TEMPLATE_HANDLE = { name: 'daggerheart-core:roll-template-add' } as WorkflowHandle
const UPDATE_TEMPLATE_HANDLE = { name: 'daggerheart-core:roll-template-update' } as WorkflowHandle
const REMOVE_TEMPLATE_HANDLE = { name: 'daggerheart-core:roll-template-remove' } as WorkflowHandle
const EDIT_TEMPLATE_CONFIG_HANDLE = {
  name: 'daggerheart-core:roll-template-edit-config',
} as WorkflowHandle

const COLLAPSED_SIZE = { width: 480, height: 28 }
const EXPANDED_SIZE = { width: 480, height: 188 }

const EMPTY_ATTRIBUTES: DHAttributes = {
  agility: 0,
  strength: 0,
  finesse: 0,
  instinct: 0,
  presence: 0,
  knowledge: 0,
}

const EMPTY_EXPERIENCES: DHExperiences = { items: [] }
const EMPTY_TEMPLATES: DHRollTemplates = { items: [] }

export function PlayerBottomPanel({ sdk }: { sdk: IRegionSDK }) {
  const isGM = sdk.context.role === 'GM'
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<BottomTab>('attributes')
  const resizeRegionRef = useRef<(size: { width?: number; height?: number }) => void>(() => {})

  const activeCharacterId = useIdentityStore((s) => {
    const seat = s.seats.find((entry) => entry.id === s.mySeatId)
    return seat?.activeCharacterId ?? null
  })

  const health = sdk.data.useComponent<DHHealth>(activeCharacterId ?? '', DH_KEYS.health)
  const stress = sdk.data.useComponent<DHStress>(activeCharacterId ?? '', DH_KEYS.stress)
  const extras = sdk.data.useComponent<DHExtras>(activeCharacterId ?? '', DH_KEYS.extras)
  const attributes = sdk.data.useComponent<DHAttributes>(
    activeCharacterId ?? '',
    DH_KEYS.attributes,
  )
  const experiences =
    sdk.data.useComponent<DHExperiences>(activeCharacterId ?? '', DH_KEYS.experiences) ??
    EMPTY_EXPERIENCES
  const rollTemplates =
    sdk.data.useComponent<DHRollTemplates>(activeCharacterId ?? '', DH_KEYS.rollTemplates) ??
    EMPTY_TEMPLATES

  useEffect(() => {
    resizeRegionRef.current = (size) => {
      sdk.ui.resize(size)
    }
  }, [sdk.ui])

  useEffect(() => {
    resizeRegionRef.current(expanded ? EXPANDED_SIZE : COLLAPSED_SIZE)
  }, [expanded])

  const handleAttributeRoll = useCallback(
    (attrKey: keyof DHAttributes, shiftKey: boolean) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
        actorId: activeCharacterId,
        preselectedAttribute: attrKey,
        skipModifier: shiftKey,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleDiceRoll = useCallback(
    (initialRollConfig: RollConfig, skipModifier: boolean) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
        actorId: activeCharacterId,
        initialRollConfig,
        skipModifier,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleTemplateUse = useCallback(
    (templateId: string, skipModifier: boolean) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
        actorId: activeCharacterId,
        rollTemplateId: templateId,
        skipModifier,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleTemplateAdd = useCallback(() => {
    if (!activeCharacterId) return
    void sdk.workflow.runWorkflow(ADD_TEMPLATE_HANDLE, {
      entityId: activeCharacterId,
    })
  }, [activeCharacterId, sdk.workflow])

  const handleTemplateSaveMeta = useCallback(
    (templateId: string, patch: { name: string; icon?: string }) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_TEMPLATE_HANDLE, {
        entityId: activeCharacterId,
        templateId,
        patch,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleTemplateRemove = useCallback(
    (templateId: string) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(REMOVE_TEMPLATE_HANDLE, {
        entityId: activeCharacterId,
        templateId,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleTemplateEditConfig = useCallback(
    (templateId: string) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(EDIT_TEMPLATE_CONFIG_HANDLE, {
        entityId: activeCharacterId,
        templateId,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleAdjustResource = useCallback(
    (resource: 'health' | 'stress' | 'hope' | 'armor', delta: number) => {
      if (!activeCharacterId || delta === 0) return

      if (resource === 'health') {
        const current = health?.current ?? 0
        const max = health?.max ?? 0
        const next = Math.max(0, Math.min(max, current + delta))
        if (next !== current) {
          void sdk.workflow.runWorkflow(UPDATE_RES_HANDLE, {
            entityId: activeCharacterId,
            resource: 'health',
            field: 'current',
            value: next,
          })
        }
        return
      }

      if (resource === 'stress') {
        const current = stress?.current ?? 0
        const max = stress?.max ?? 0
        const next = Math.max(0, Math.min(max, current + delta))
        if (next !== current) {
          void sdk.workflow.runWorkflow(UPDATE_RES_HANDLE, {
            entityId: activeCharacterId,
            resource: 'stress',
            field: 'current',
            value: next,
          })
        }
        return
      }

      if (resource === 'hope') {
        const current = extras?.hope ?? 0
        const max = extras?.hopeMax ?? 0
        const next = Math.max(0, Math.min(max, current + delta))
        if (next !== current) {
          void sdk.workflow.runWorkflow(UPDATE_EXTRAS_HANDLE, {
            entityId: activeCharacterId,
            field: 'hope',
            value: next,
          })
        }
        return
      }

      const current = extras?.armor ?? 0
      const max = extras?.armorMax ?? 0
      const next = Math.max(0, Math.min(max, current + delta))
      if (next !== current) {
        void sdk.workflow.runWorkflow(UPDATE_EXTRAS_HANDLE, {
          entityId: activeCharacterId,
          field: 'armor',
          value: next,
        })
      }
    },
    [activeCharacterId, extras, health, sdk.workflow, stress],
  )

  if (isGM || !activeCharacterId) {
    return <div style={{ display: 'none' }} data-testid="player-bottom-panel-hidden" />
  }

  const safeAttributes = attributes ?? EMPTY_ATTRIBUTES
  const hp = { current: health?.current ?? 0, max: health?.max ?? 0 }
  const stressValue = { current: stress?.current ?? 0, max: stress?.max ?? 0 }
  const hope = { current: extras?.hope ?? 0, max: extras?.hopeMax ?? 0 }
  const armor = { current: extras?.armor ?? 0, max: extras?.armorMax ?? 0 }

  if (!expanded) {
    return (
      <CollapsedBar
        hp={hp}
        stress={stressValue}
        hope={hope}
        armor={armor}
        onExpand={() => {
          setExpanded(true)
        }}
        onRollClick={() => {
          setActiveTab('dice')
          setExpanded(true)
        }}
        onAdjustResource={handleAdjustResource}
      />
    )
  }

  return (
    <div
      className="h-full bg-[linear-gradient(180deg,#1e1a14f5_0%,#151210fa_100%)] backdrop-blur-[20px] rounded-t-xl border border-border-glass border-b-0 overflow-hidden"
      data-testid="player-bottom-panel-expanded"
    >
      <button
        onClick={() => {
          setExpanded(false)
        }}
        className="w-full flex items-center justify-center py-1 text-[8px] text-white/25 cursor-pointer hover:text-white/70 transition-colors"
        data-testid="player-bottom-panel-collapse"
      >
        ▼
      </button>

      <div className="flex px-4 border-b border-white/[0.08]">
        {[
          ['attributes', '属性'],
          ['custom', '自定义'],
          ['dice', '骰子'],
        ].map(([key, label]) => {
          const selected = activeTab === key
          return (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key as BottomTab)
              }}
              className={`px-3.5 py-1.5 text-[11px] font-medium border-b-2 cursor-pointer transition-colors ${
                selected
                  ? 'text-accent border-b-accent'
                  : 'text-white/40 border-b-transparent hover:text-white/70'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-2.5 pb-2">
        {activeTab === 'attributes' && (
          <AttributeTab attributes={safeAttributes} onRoll={handleAttributeRoll} />
        )}
        {activeTab === 'custom' && (
          <CustomTab
            attributes={safeAttributes}
            experiences={experiences}
            templates={rollTemplates}
            onAdd={handleTemplateAdd}
            onEditConfig={handleTemplateEditConfig}
            onRemove={handleTemplateRemove}
            onSaveMeta={handleTemplateSaveMeta}
            onUse={handleTemplateUse}
          />
        )}
        {activeTab === 'dice' && <DiceTab onRoll={handleDiceRoll} />}
      </div>

      <div className="h-px mx-4 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]" />

      <ResourceSection
        hp={hp}
        stress={stressValue}
        hope={hope}
        armor={armor}
        onAdjustResource={handleAdjustResource}
      />
    </div>
  )
}
