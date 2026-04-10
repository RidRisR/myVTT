// plugins/daggerheart/ui/CharacterCard.tsx
import { useCallback } from 'react'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { WorkflowHandle } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'
import { useIdentityStore } from '../../../src/stores/identityStore'
import { getName } from '../../../src/shared/coreComponents'
import type { DHAttributes, DHMeta } from '../types'
import { DH_KEYS } from '../types'
import { AttributeCell } from './AttributeCell'

const ATTRS = [
  { key: 'agility', en: 'Agility' },
  { key: 'strength', en: 'Strength' },
  { key: 'instinct', en: 'Instinct' },
  { key: 'knowledge', en: 'Knowledge' },
  { key: 'presence', en: 'Presence' },
  { key: 'finesse', en: 'Finesse' },
] as const

const ACTION_CHECK_HANDLE = { name: 'daggerheart-core:action-check' } as WorkflowHandle
const UPDATE_ATTR_HANDLE = { name: 'daggerheart-core:charcard-update-attr' } as WorkflowHandle

export function CharacterCard({ sdk }: { sdk: IRegionSDK }) {
  const { t } = usePluginTranslation()
  const isGM = sdk.context.role === 'GM'

  // Get active character ID from identity store (seats is an array!)
  const activeCharacterId = useIdentityStore((s) => {
    const seat = s.seats.find((seat) => seat.id === s.mySeatId)
    return seat?.activeCharacterId ?? null
  })

  const entity = sdk.data.useEntity(activeCharacterId ?? '')
  const attrs = sdk.data.useComponent<DHAttributes>(activeCharacterId ?? '', DH_KEYS.attributes)
  const meta = sdk.data.useComponent<DHMeta>(activeCharacterId ?? '', DH_KEYS.meta)

  const handleRoll = useCallback(
    (attrKey: string) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
        formula: `2d12+@${attrKey}`,
        actorId: activeCharacterId,
        rollType: 'daggerheart:dd',
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleEdit = useCallback(
    (attrKey: string, value: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_ATTR_HANDLE, {
        entityId: activeCharacterId,
        attribute: attrKey,
        value,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  // GM: hidden but mounted (future: preview player view toggle)
  if (isGM) {
    return <div style={{ display: 'none' }} data-testid="charcard-gm-hidden" />
  }

  if (!entity || !activeCharacterId) {
    return (
      <div className="h-full flex items-center justify-center text-white/30 text-xs" data-testid="charcard-empty">
        {t('charcard.noCharacter')}
      </div>
    )
  }

  const charName = getName(entity)

  return (
    <div className="h-full flex flex-col gap-2 p-3 text-white" data-testid="charcard">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-700 to-blue-600 border-2 border-amber-400/25 flex items-center justify-center text-sm font-bold shrink-0">
          {charName.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-semibold truncate">{charName}</div>
          {meta?.className && (
            <div className="text-[9px] text-white/38">
              {meta.className} · Tier {meta.tier ?? 1}
            </div>
          )}
        </div>
      </div>

      {/* Attributes 3x2 grid */}
      <div className="text-[7px] text-white/28 uppercase tracking-widest">
        {t('charcard.section.attributes')}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {ATTRS.map(({ key, en }) => (
          <AttributeCell
            key={key}
            labelCn={t(`attr.${key}`)}
            labelEn={en}
            value={attrs?.[key as keyof DHAttributes] ?? 0}
            onRoll={() => handleRoll(key)}
            onEdit={(v) => handleEdit(key, v)}
          />
        ))}
      </div>
    </div>
  )
}
