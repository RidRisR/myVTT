// plugins/daggerheart/DaggerHeartCard.tsx
import type { EntityCardProps } from '@myvtt/sdk'
import {
  usePluginPanels,
  usePluginTranslation,
  useWorkflowRunner,
  getRollWorkflow,
} from '@myvtt/sdk'
import type { DHHealth, DHStress, DHAttributes, DHMeta, DHExtras } from './types'
import { DH_KEYS } from './types'
import { getName } from '../../src/shared/coreComponents'

const ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export function DaggerHeartCard({ entity, readonly }: EntityCardProps) {
  const hp = entity.components[DH_KEYS.health] as DHHealth | undefined
  const stress = entity.components[DH_KEYS.stress] as DHStress | undefined
  const attrs = entity.components[DH_KEYS.attributes] as DHAttributes | undefined
  const meta = entity.components[DH_KEYS.meta] as DHMeta | undefined
  const extras = entity.components[DH_KEYS.extras] as DHExtras | undefined
  const hasDHData = !!(hp || stress || attrs || meta || extras)

  const { openPanel } = usePluginPanels()
  const { t } = usePluginTranslation()
  const runner = useWorkflowRunner()

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-text-primary font-semibold">{getName(entity)}</span>
        {meta?.className && <span className="text-xs text-text-muted">{meta.className}</span>}
      </div>
      {hasDHData && (
        <>
          <div className="flex gap-4 text-sm">
            <span className="text-red-500">
              {t('card.hp')} {hp?.current ?? 0}/{hp?.max ?? 0}
            </span>
            <span className="text-orange-400">
              {t('card.stress')} {stress?.current ?? 0}/{stress?.max ?? 0}
            </span>
            <span className="text-accent">
              {t('card.hope')} {extras?.hope ?? 0}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs">
            {ATTRS.map((k) => {
              const val = attrs?.[k] ?? 0
              return (
                <div key={k} className="flex flex-col items-center bg-black/20 rounded p-1">
                  <span className="text-text-muted capitalize">{k}</span>
                  <span className="text-text-primary font-bold">
                    {val >= 0 ? '+' : ''}
                    {val}
                  </span>
                </div>
              )
            })}
          </div>
          {!readonly && (
            <div className="grid grid-cols-3 gap-1">
              {ATTRS.map((k) => (
                <button
                  key={`roll-${k}`}
                  onClick={() => {
                    runner
                      .runWorkflow(getRollWorkflow(), {
                        formula: `2d12+@${k}`,
                        actorId: entity.id,
                      })
                      .catch((err: unknown) => {
                        console.error('[Workflow] roll failed:', err)
                      })
                  }}
                  className="py-1.5 text-[10px] text-text-muted/50 bg-black/20 hover:bg-black/40 rounded transition-colors duration-fast capitalize"
                >
                  {t(`roll.action.${k}`)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {!readonly && (
        <button
          onClick={() => {
            openPanel('dh-full-sheet', entity.id)
          }}
          className="mt-2 w-full py-1.5 text-[11px] text-text-muted/50 bg-black/20 hover:bg-black/40 rounded-md transition-colors duration-fast"
        >
          {t('card.fullSheet')}
        </button>
      )}
    </div>
  )
}
