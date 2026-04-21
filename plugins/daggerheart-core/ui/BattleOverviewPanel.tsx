// plugins/daggerheart-core/ui/BattleOverviewPanel.tsx
import { useState, useMemo, useEffect, useRef } from 'react'
import { Heart, Zap, Shield, Diamond } from 'lucide-react'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { Entity } from '../../../src/shared/entityTypes'
import { getIdentity } from '../../../src/shared/coreComponents'
import {
  DH_KEYS,
  type DHHealth,
  type DHStress,
  type DHExtras,
  type DHMeta,
} from '../../daggerheart/types'

type TabKey = 'all' | 'ally' | 'enemy'

const TAB_BAR_HEIGHT = 40
const ROW_HEIGHT = 52
const DIVIDER_HEIGHT = 28
const PADDING_Y = 20
const PANEL_WIDTH = 480
const MAX_HEIGHT = 480
const MIN_HEIGHT = 140

/** Check if entity is a PC (has at least one seat with 'owner' permission) */
function isPlayerCharacter(entity: Entity): boolean {
  return Object.values(entity.permissions.seats).some((level) => level === 'owner')
}

// ── Arc ring SVG sub-component ──

const ARC_SIZE = 40
const ARC_RADIUS = ARC_SIZE / 2 - 3
const ARC_CIRC = 2 * Math.PI * ARC_RADIUS
const ARC_GAP = 4
const ARC_LEN = ARC_CIRC / 2 - ARC_GAP
const ARC_CENTER = ARC_SIZE / 2

function ArcRings({ hpRatio, stressRatio }: { hpRatio: number; stressRatio: number }) {
  const hpFill = ARC_LEN * Math.max(0, Math.min(1, hpRatio))
  const stressFill = ARC_LEN * Math.max(0, Math.min(1, stressRatio))
  return (
    <svg
      className="absolute inset-0"
      width={ARC_SIZE}
      height={ARC_SIZE}
      viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`}
    >
      {/* HP track (left arc) */}
      <circle
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        r={ARC_RADIUS}
        fill="none"
        stroke="rgba(192,64,64,0.08)"
        strokeWidth={2.5}
        strokeDasharray={`${ARC_LEN} ${ARC_CIRC - ARC_LEN}`}
        strokeDashoffset={-ARC_GAP / 2}
        transform={`rotate(90 ${ARC_CENTER} ${ARC_CENTER})`}
      />
      {/* HP fill */}
      <circle
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        r={ARC_RADIUS}
        fill="none"
        stroke="#C04040"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${hpFill} ${ARC_CIRC - hpFill}`}
        strokeDashoffset={-ARC_GAP / 2}
        transform={`rotate(90 ${ARC_CENTER} ${ARC_CENTER})`}
        style={{ filter: 'drop-shadow(0 0 3px rgba(192,64,64,0.4))' }}
      />
      {/* Stress track (right arc) */}
      <circle
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        r={ARC_RADIUS}
        fill="none"
        stroke="rgba(167,139,250,0.08)"
        strokeWidth={2.5}
        strokeDasharray={`${ARC_LEN} ${ARC_CIRC - ARC_LEN}`}
        strokeDashoffset={-ARC_GAP / 2}
        transform={`rotate(-90 ${ARC_CENTER} ${ARC_CENTER})`}
      />
      {/* Stress fill */}
      <circle
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        r={ARC_RADIUS}
        fill="none"
        stroke="#a78bfa"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${stressFill} ${ARC_CIRC - stressFill}`}
        strokeDashoffset={-ARC_GAP / 2}
        transform={`rotate(-90 ${ARC_CENTER} ${ARC_CENTER})`}
        style={{ filter: 'drop-shadow(0 0 3px rgba(167,139,250,0.35))' }}
      />
    </svg>
  )
}

// ── Unit row sub-component ──

function UnitRow({ entity, isAlly, sdk }: { entity: Entity; isAlly: boolean; sdk: IRegionSDK }) {
  const identity = getIdentity(entity)
  const health = sdk.data.useComponent<DHHealth>(entity.id, DH_KEYS.health)
  const stress = sdk.data.useComponent<DHStress>(entity.id, DH_KEYS.stress)
  const extras = sdk.data.useComponent<DHExtras>(entity.id, DH_KEYS.extras)
  const meta = sdk.data.useComponent<DHMeta>(entity.id, DH_KEYS.meta)

  const hpRatio = health && health.max > 0 ? health.current / health.max : 0
  const stressRatio = stress && stress.max > 0 ? stress.current / stress.max : 0
  const initial = identity.name.charAt(0) || '?'
  const hasImage = identity.imageUrl.length > 0

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-2.5 py-[7px] transition-fast hover:bg-white/[0.04] ${isAlly ? '' : 'enemy'}`}
      data-testid={isAlly ? 'unit-row-ally' : 'unit-row-enemy'}
    >
      {/* Avatar with arc rings */}
      <div className="relative size-10 shrink-0">
        <ArcRings hpRatio={hpRatio} stressRatio={stressRatio} />
        {hasImage ? (
          <img
            src={identity.imageUrl}
            alt=""
            className="absolute left-1/2 top-1/2 z-[2] size-6 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover"
            style={{
              boxShadow: isAlly
                ? 'inset 0 0 0 1.5px rgba(180,160,130,0.2)'
                : 'inset 0 0 0 1.5px rgba(192,64,64,0.2)',
            }}
          />
        ) : (
          <div
            className="absolute left-1/2 top-1/2 z-[2] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold leading-none text-text-primary/85"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${identity.color}, ${identity.color}99)`,
              boxShadow: isAlly
                ? 'inset 0 0 0 1.5px rgba(180,160,130,0.2)'
                : 'inset 0 0 0 1.5px rgba(192,64,64,0.2)',
            }}
          >
            {initial}
          </div>
        )}
      </div>

      {/* Name + class */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[12px] font-semibold leading-tight text-text-primary">
            {identity.name}
          </span>
          {isAlly && meta?.className && (
            <span className="shrink-0 text-[9px] italic text-text-muted/50">{meta.className}</span>
          )}
          {!isAlly && (
            <span
              className="shrink-0 rounded-[3px] border border-danger/10 bg-danger/[0.08] px-1.5 py-px text-[8px] leading-[1.4] text-danger/60"
              data-testid="enemy-badge"
            >
              敌
            </span>
          )}
        </div>
      </div>

      {/* Stats — right side */}
      <div className="flex shrink-0 items-center gap-3" data-testid="unit-stats">
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-text-muted/60">
          <Heart size={12} strokeWidth={2.5} className="text-danger" />
          {health?.current ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-text-muted/60">
          <Zap size={12} strokeWidth={2.5} className="text-[#a78bfa]" />
          {stress?.current ?? 0}
        </span>
        {isAlly && (
          <>
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-text-muted/60">
              <Shield size={12} strokeWidth={2.5} className="text-info" />
              {extras?.armor ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-text-muted/60">
              <Diamond size={12} strokeWidth={2.5} className="text-accent" />
              {extras?.hope ?? 0}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main panel ──

export function BattleOverviewPanel({ sdk }: { sdk: IRegionSDK }) {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const resizeRef = useRef<(size: { width?: number; height?: number }) => void>(() => {})

  // Query all entities with daggerheart:health component
  const allEntities = sdk.data.useQuery({ has: [DH_KEYS.health] })

  // Split into allies (PC) and enemies (NPC)
  const { allies, enemies } = useMemo(() => {
    const a: Entity[] = []
    const e: Entity[] = []
    for (const entity of allEntities) {
      if (isPlayerCharacter(entity)) a.push(entity)
      else e.push(entity)
    }
    return { allies: a, enemies: e }
  }, [allEntities])

  // Compute visible entities for current tab
  const showAllies = activeTab === 'all' || activeTab === 'ally'
  const showEnemies = activeTab === 'all' || activeTab === 'enemy'
  const showDivider = activeTab === 'all' && allies.length > 0 && enemies.length > 0

  // Dynamic resize
  useEffect(() => {
    resizeRef.current = (size) => {
      sdk.ui.resize(size)
    }
  }, [sdk.ui])

  useEffect(() => {
    const allyCount = showAllies ? allies.length : 0
    const enemyCount = showEnemies ? enemies.length : 0
    const dividerH = showDivider ? DIVIDER_HEIGHT : 0
    const contentH = TAB_BAR_HEIGHT + (allyCount + enemyCount) * ROW_HEIGHT + dividerH + PADDING_Y
    const clampedH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, contentH))
    resizeRef.current({ width: PANEL_WIDTH, height: clampedH })
  }, [allies.length, enemies.length, showAllies, showEnemies, showDivider])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'ally', label: '我方' },
    { key: 'enemy', label: '敌方' },
  ]

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border-glass bg-glass backdrop-blur-[16px]"
      style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)' }}
      data-testid="battle-overview-panel"
    >
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-white/[0.06] px-3 pt-2 pb-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            data-testid={`tab-${key}`}
            onClick={() => {
              setActiveTab(key)
            }}
            className={`flex-1 cursor-pointer border-b-2 pb-2 pt-1.5 text-[11px] font-semibold tracking-[0.3px] transition-fast ${
              activeTab === key
                ? 'border-b-accent text-accent'
                : 'border-b-transparent text-text-muted/50 hover:text-text-muted/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scrollable unit list */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5" data-testid="unit-list">
        {showAllies && allies.length === 0 && showEnemies && enemies.length === 0 && (
          <div
            className="py-8 text-center text-[11px] italic text-text-muted/30"
            data-testid="empty-state"
          >
            暂无在场单位
          </div>
        )}

        {showAllies &&
          allies.map((entity) => <UnitRow key={entity.id} entity={entity} isAlly sdk={sdk} />)}

        {showDivider && (
          <div className="mx-2 my-1.5 flex items-center gap-2.5" data-testid="section-divider">
            <div className="h-px flex-1 bg-border-glass" />
            <span className="text-[8px] italic tracking-[1.5px] text-text-muted/35">敌方</span>
            <div className="h-px flex-1 bg-border-glass" />
          </div>
        )}

        {showEnemies &&
          enemies.map((entity) => (
            <UnitRow key={entity.id} entity={entity} isAlly={false} sdk={sdk} />
          ))}

        {/* Tab-specific empty states */}
        {activeTab === 'ally' && allies.length === 0 && (
          <div
            className="py-8 text-center text-[11px] italic text-text-muted/30"
            data-testid="empty-state"
          >
            暂无我方单位
          </div>
        )}
        {activeTab === 'enemy' && enemies.length === 0 && (
          <div
            className="py-8 text-center text-[11px] italic text-text-muted/30"
            data-testid="empty-state"
          >
            暂无敌方单位
          </div>
        )}
      </div>
    </div>
  )
}
