// plugins/daggerheart/ui/CharacterCard.tsx
// Drawer-style character card: left tab strip + single-column panel content revealed rightward.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Pin, PinOff, Heart, Zap, Shield, Diamond } from 'lucide-react'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { WorkflowHandle } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'
import { useIdentityStore } from '../../../src/stores/identityStore'
import { getName, getImageUrl, getColor } from '../../../src/shared/coreComponents'
import type {
  DHAttributes,
  DHMeta,
  DHHealth,
  DHStress,
  DHExtras,
  DHThresholds,
  DHExperiences,
} from '../types'
import { DH_KEYS } from '../types'
import { AttributeCell } from './AttributeCell'
import { ResourceBar } from './ResourceBar'
import { PipRow } from './PipRow'
import { ThresholdRow } from './ThresholdRow'
import { ExperienceList } from './ExperienceList'

const ATTR_KEYS = ['agility', 'strength', 'instinct', 'knowledge', 'presence', 'finesse'] as const

const ACTION_CHECK_HANDLE = { name: 'daggerheart-core:action-check' } as WorkflowHandle
const UPDATE_ATTR_HANDLE = { name: 'daggerheart-core:charcard-update-attr' } as WorkflowHandle
const UPDATE_RES_HANDLE = { name: 'daggerheart-core:charcard-update-res' } as WorkflowHandle
const UPDATE_EXTRAS_HANDLE = { name: 'daggerheart-core:charcard-update-extras' } as WorkflowHandle
const UPDATE_THRESHOLD_HANDLE = {
  name: 'daggerheart-core:charcard-update-threshold',
} as WorkflowHandle
const UPDATE_EXP_HANDLE = { name: 'daggerheart-core:charcard-update-exp' } as WorkflowHandle
const ADD_EXP_HANDLE = { name: 'daggerheart-core:charcard-add-exp' } as WorkflowHandle
const REMOVE_EXP_HANDLE = { name: 'daggerheart-core:charcard-remove-exp' } as WorkflowHandle

const COLLAPSED_SIZE = { width: 36, height: 60 }
const EXPANDED_SIZE = { width: 300, height: 480 }

export function CharacterCard({ sdk }: { sdk: IRegionSDK }) {
  const { t } = usePluginTranslation()
  const isGM = sdk.context.role === 'GM'
  const [expanded, setExpanded] = useState(false)
  const [pinned, setPinned] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get active character ID from identity store
  const activeCharacterId = useIdentityStore((s) => {
    const seat = s.seats.find((seat) => seat.id === s.mySeatId)
    return seat?.activeCharacterId ?? null
  })

  const entity = sdk.data.useEntity(activeCharacterId ?? '')
  const attrs = sdk.data.useComponent<DHAttributes>(activeCharacterId ?? '', DH_KEYS.attributes)
  const meta = sdk.data.useComponent<DHMeta>(activeCharacterId ?? '', DH_KEYS.meta)
  const health = sdk.data.useComponent<DHHealth>(activeCharacterId ?? '', DH_KEYS.health)
  const stress = sdk.data.useComponent<DHStress>(activeCharacterId ?? '', DH_KEYS.stress)
  const extras = sdk.data.useComponent<DHExtras>(activeCharacterId ?? '', DH_KEYS.extras)
  const thresholds = sdk.data.useComponent<DHThresholds>(
    activeCharacterId ?? '',
    DH_KEYS.thresholds,
  )
  const experiences = sdk.data.useComponent<DHExperiences>(
    activeCharacterId ?? '',
    DH_KEYS.experiences,
  )

  // Hover expand / collapse with debounce to avoid flicker
  const expand = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    if (!expanded) {
      setExpanded(true)
      sdk.ui.resize(EXPANDED_SIZE)
    }
  }, [expanded, sdk.ui])

  const collapse = useCallback(() => {
    if (pinned) return
    collapseTimer.current = setTimeout(() => {
      setExpanded(false)
      sdk.ui.resize(COLLAPSED_SIZE)
      collapseTimer.current = null
    }, 300)
  }, [pinned, sdk.ui])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [])

  // ── Handlers ──

  const handleRoll = useCallback(
    (attrKey: string, shiftKey = false) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
        actorId: activeCharacterId,
        preselectedAttribute: attrKey,
        skipModifier: shiftKey,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleEditAttr = useCallback(
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

  const handleUpdateRes = useCallback(
    (resource: string, field: 'current' | 'max', value: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_RES_HANDLE, {
        entityId: activeCharacterId,
        resource,
        field,
        value,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleUpdateExtras = useCallback(
    (field: string, value: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_EXTRAS_HANDLE, {
        entityId: activeCharacterId,
        field,
        value,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleUpdateThreshold = useCallback(
    (threshold: string, value: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_THRESHOLD_HANDLE, {
        entityId: activeCharacterId,
        threshold,
        value,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleExpEditValue = useCallback(
    (index: number, value: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_EXP_HANDLE, {
        entityId: activeCharacterId,
        index,
        field: 'modifier',
        value,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleExpEditName = useCallback(
    (index: number, name: string) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(UPDATE_EXP_HANDLE, {
        entityId: activeCharacterId,
        index,
        field: 'name',
        value: name,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  const handleExpAdd = useCallback(() => {
    if (!activeCharacterId) return
    void sdk.workflow.runWorkflow(ADD_EXP_HANDLE, {
      entityId: activeCharacterId,
      name: '',
      modifier: 0,
    })
  }, [activeCharacterId, sdk.workflow])

  const handleExpRemove = useCallback(
    (index: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(REMOVE_EXP_HANDLE, {
        entityId: activeCharacterId,
        index,
      })
    },
    [activeCharacterId, sdk.workflow],
  )

  // GM: hidden but mounted
  if (isGM) {
    return <div style={{ display: 'none' }} data-testid="charcard-gm-hidden" />
  }

  const charName = entity ? getName(entity) : ''
  const imageUrl = entity ? getImageUrl(entity) : null
  const color = entity ? getColor(entity) : '#6366f1'
  const initial = charName ? charName.charAt(0).toUpperCase() : '?'
  const hasCharacter = !!entity && !!activeCharacterId

  return (
    <div
      ref={rootRef}
      className="h-full bg-glass backdrop-blur-[16px] rounded-r-[14px] border border-border-glass border-l-0 shadow-[4px_0_32px_rgba(0,0,0,0.3)] flex"
      data-testid={expanded ? 'charcard' : 'charcard-handle'}
      onMouseEnter={expand}
      onMouseLeave={collapse}
    >
      {/* ── Tab handle (always visible at leftmost position) ── */}
      <div
        data-testid="charcard-tab"
        className="w-9 shrink-0 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors duration-fast hover:bg-surface/30"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover"
            style={{ border: `2px solid ${color}` }}
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold font-sans"
            style={{ background: color }}
          >
            {initial}
          </div>
        )}
        <ChevronRight
          size={10}
          strokeWidth={2.5}
          className="text-text-muted/40 transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </div>

      {/* ── Panel content (revealed by container overflow:hidden as width grows) ── */}
      <div className="flex-1 min-w-0 border-l border-border-glass overflow-y-auto">
        {!hasCharacter ? (
          <div
            className="h-full flex items-center justify-center text-text-muted text-xs p-3"
            data-testid="charcard-empty"
          >
            {t('charcard.noCharacter')}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 p-2 text-text-primary">
            {/* Header — compact */}
            <div className="flex items-center gap-2 pb-1.5 border-b border-border-glass">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                  style={{ border: `2px solid ${color}` }}
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                  style={{ background: color }}
                >
                  {initial}
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate leading-tight">{charName}</div>
                {meta?.className && (
                  <div className="text-[9px] text-text-muted/60 leading-tight">
                    {meta.className} · Tier {meta.tier}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setPinned((p) => !p)
                }}
                className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
                  pinned
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-muted/40 hover:text-text-muted/70 hover:bg-white/[0.06]'
                }`}
                data-testid="charcard-pin"
              >
                {pinned ? <Pin size={11} /> : <PinOff size={11} />}
              </button>
            </div>

            {/* ── Single-column body ── */}

            {/* Attributes 3x2 grid — no wrapper box, tight */}
            <div className="grid grid-cols-3 gap-[3px]">
              {ATTR_KEYS.map((key) => (
                <AttributeCell
                  key={key}
                  label={t(`attr.${key}`)}
                  value={attrs?.[key as keyof DHAttributes] ?? 0}
                  onRoll={(shiftKey) => {
                    handleRoll(key, shiftKey)
                  }}
                  onEdit={(v) => {
                    handleEditAttr(key, v)
                  }}
                />
              ))}
            </div>

            {/* Resources — full width, no wrapper box */}
            <div className="flex flex-col gap-0.5">
              <ResourceBar
                label={t('charcard.res.hp')}
                icon={<Heart size={10} />}
                color="#e74c3c"
                gradientFrom="#c0392b"
                gradientTo="#e74c3c"
                current={health?.current ?? 0}
                max={health?.max ?? 0}
                onUpdate={(field, value) => {
                  handleUpdateRes('health', field, value)
                }}
              />
              <ResourceBar
                label={t('charcard.res.stress')}
                icon={<Zap size={10} />}
                color="#9b59b6"
                gradientFrom="#7d3c98"
                gradientTo="#9b59b6"
                current={stress?.current ?? 0}
                max={stress?.max ?? 0}
                onUpdate={(field, value) => {
                  handleUpdateRes('stress', field, value)
                }}
              />
              <PipRow
                label={t('charcard.res.armor')}
                icon={<Shield size={10} />}
                color="rgba(130,195,240,0.7)"
                current={extras?.armor ?? 0}
                max={extras?.armorMax ?? 0}
                onUpdate={(field, v) => {
                  handleUpdateExtras(field === 'max' ? 'armorMax' : 'armor', v)
                }}
              />
              <PipRow
                label={t('charcard.res.hope')}
                icon={<Diamond size={10} />}
                color="#f1c40f"
                current={extras?.hope ?? 0}
                max={extras?.hopeMax ?? 6}
                onUpdate={(field, v) => {
                  handleUpdateExtras(field === 'max' ? 'hopeMax' : 'hope', v)
                }}
              />
            </div>

            {/* Thresholds */}
            <ThresholdRow
              evasion={thresholds?.evasion ?? 10}
              major={thresholds?.major ?? 7}
              severe={thresholds?.severe ?? 15}
              labels={{
                evasion: t('charcard.threshold.evasion'),
                major: t('charcard.threshold.major'),
                severe: t('charcard.threshold.severe'),
              }}
              onEdit={handleUpdateThreshold}
            />

            {/* Experiences — always visible */}
            <div>
              <div className="text-[7px] text-text-muted/30 uppercase tracking-widest mb-1">
                {t('charcard.section.experiences')}
              </div>
              <ExperienceList
                items={experiences?.items ?? []}
                onEditName={handleExpEditName}
                onEditValue={handleExpEditValue}
                onAdd={handleExpAdd}
                onRemove={handleExpRemove}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
