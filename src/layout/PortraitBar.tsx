import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Users, ChevronRight, ChevronUp } from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import type { Entity, SceneEntityEntry } from '../shared/entityTypes'
import type { CombatInfo } from '../stores/worldStore'
import { useWorldStore } from '../stores/worldStore'
import { canSee, canEdit } from '../shared/permissions'
import { getEntityResources, getEntityStatuses } from '../shared/entityAdapters'
import { statusColor } from '../shared/tokenUtils'
import { api } from '../shared/api'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'
import { CharacterHoverPreview } from './CharacterHoverPreview'
import { CharacterDetailPanel } from './CharacterDetailPanel'
import { CharacterEditPanel } from './CharacterEditPanel'

type PortraitTabId = 'characters' | 'initiative'

interface PortraitBarProps {
  entities: Entity[]
  sceneEntityIds: string[]
  sceneEntityEntries: SceneEntityEntry[]
  activeSceneId: string | null
  mySeatId: string | null
  role: 'GM' | 'PL'
  isGM: boolean
  onlineSeatIds: Set<string>
  inspectedCharacterId: string | null
  activeCharacterId: string | null
  onInspectCharacter: (charId: string | null) => void
  onSetActiveCharacter: (charId: string) => void
  onRemoveFromScene: (entityId: string) => void
  onUpdateEntity: (id: string, updates: Partial<Entity>) => void
  isCombat: boolean
  combatInfo: CombatInfo | null
  onSetInitiativeOrder: (order: string[]) => void
  onAdvanceInitiative: () => void
}

const PORTRAIT_SIZE = 52
const IMG_SIZE = 36
const RING_GAP = 2
const RING_WIDTH = 3

function ResourceRing({
  index,
  pct,
  color,
  size,
}: {
  index: number
  pct: number
  color: string
  size: number
}) {
  const radius = size / 2 - RING_WIDTH / 2 - index * (RING_WIDTH + RING_GAP)
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, pct)))

  return (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={RING_WIDTH}
      strokeDasharray={circumference}
      strokeDashoffset={offset}
      strokeLinecap="round"
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      style={{ transition: 'stroke-dashoffset 0.3s ease' }}
    />
  )
}

function ResourceRingBg({ index, size }: { index: number; size: number }) {
  const radius = size / 2 - RING_WIDTH / 2 - index * (RING_WIDTH + RING_GAP)
  return (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke="rgba(255,255,255,0.08)"
      strokeWidth={RING_WIDTH}
    />
  )
}

export function PortraitBar({
  entities,
  sceneEntityIds,
  sceneEntityEntries,
  activeSceneId,
  mySeatId,
  role,
  isGM,
  onlineSeatIds,
  inspectedCharacterId,
  activeCharacterId,
  onInspectCharacter,
  onSetActiveCharacter,
  onRemoveFromScene,
  onUpdateEntity,
  isCombat,
  combatInfo,
  onSetInitiativeOrder,
  onAdvanceInitiative,
}: PortraitBarProps) {
  const portraitBarVisible = useUiStore((s) => s.portraitBarVisible)
  const setPortraitBarVisible = useUiStore((s) => s.setPortraitBarVisible)
  const toggleEntityVisibility = useWorldStore((s) => s.toggleEntityVisibility)
  const updateEntity = useWorldStore((s) => s.updateEntity)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entityId: string } | null>(
    null,
  )
  const [activeTab, setActiveTab] = useState<PortraitTabId>('characters')

  // Auto-switch to initiative tab when combat starts
  useEffect(() => {
    if (isCombat) setActiveTab('initiative')
    else setActiveTab('characters')
  }, [isCombat])

  // Drag state for initiative reorder
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null)

  // Hover state
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null)
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null)
  const [lockedRect, setLockedRect] = useState<DOMRect | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const popoverRef = useRef<HTMLDivElement>(null)
  const portraitBarRef = useRef<HTMLDivElement>(null)

  // Click-outside to close locked popover
  useEffect(() => {
    if (!inspectedCharacterId) return
    const handler = (e: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !portraitBarRef.current?.contains(e.target as Node)
      ) {
        onInspectCharacter(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [inspectedCharacterId, onInspectCharacter])

  // Clear hover when a portrait is locked
  useEffect(() => {
    if (inspectedCharacterId) {
      setHoveredCharId(null)
      clearTimeout(hoverTimeoutRef.current)
    }
  }, [inspectedCharacterId])

  const handlePortraitMouseEnter = useCallback(
    (entityId: string, el: HTMLElement) => {
      if (inspectedCharacterId) return // don't show hover when locked
      clearTimeout(hoverTimeoutRef.current)
      setHoveredCharId(entityId)
      setHoveredRect(el.getBoundingClientRect())
    },
    [inspectedCharacterId],
  )

  const handlePortraitMouseLeave = useCallback(() => {
    if (inspectedCharacterId) return
    hoverTimeoutRef.current = setTimeout(() => setHoveredCharId(null), 200)
  }, [inspectedCharacterId])

  const handlePopoverMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current)
  }, [])

  const handlePopoverMouseLeave = useCallback(() => {
    if (!inspectedCharacterId) {
      hoverTimeoutRef.current = setTimeout(() => setHoveredCharId(null), 200)
    }
  }, [inspectedCharacterId])

  const handlePortraitClick = useCallback(
    (entityId: string, el: HTMLElement) => {
      if (inspectedCharacterId === entityId) {
        onInspectCharacter(null)
      } else {
        setLockedRect(el.getBoundingClientRect())
        onInspectCharacter(entityId)
      }
    },
    [inspectedCharacterId, onInspectCharacter],
  )

  // Build a map of entityId → visible from scene entries
  const visibilityMap = new Map<string, boolean>()
  for (const entry of sceneEntityEntries) {
    visibilityMap.set(entry.entityId, entry.visible)
  }

  // Filter to entities in the current scene (or persistent lifecycle) and visible to this seat
  // For non-GM: only show entities with visible=true in scene entries
  const sceneIdSet = new Set(sceneEntityIds)
  const visibleEntities = entities.filter((e) => {
    const inScene = sceneIdSet.has(e.id)
    if (!inScene) return false
    const canSeeEntity = mySeatId ? canSee(e.permissions, mySeatId, role) : isGM
    if (!canSeeEntity) return false
    // Non-GM players only see entities with visible=true
    if (!isGM && visibilityMap.has(e.id) && !visibilityMap.get(e.id)) return false
    return true
  })

  // Collapsed state: show small expand button
  if (!portraitBarVisible) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-toast pointer-events-none flex flex-col items-center">
        <button
          onClick={() => setPortraitBarVisible(true)}
          className="pointer-events-auto flex items-center gap-1 bg-glass backdrop-blur-[12px] rounded-full px-3 py-1.5 border border-border-glass text-text-muted text-[10px] cursor-pointer hover:bg-hover transition-colors duration-fast shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
        >
          <ChevronUp size={12} strokeWidth={1.5} className="rotate-180" />
          Portraits
        </button>
      </div>
    )
  }

  if (visibleEntities.length === 0) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-toast pointer-events-none flex flex-col items-center">
        <div className="flex items-center gap-1.5 bg-glass backdrop-blur-[16px] rounded-[28px] px-4 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.25)] border border-border-glass pointer-events-auto">
          <Users size={14} strokeWidth={1.5} className="text-text-muted/40" />
          <span className="text-text-muted/40 text-[11px]">No characters yet</span>
        </div>
      </div>
    )
  }

  // Split by ownership: "party" entities (owner exists) vs scene entities (no owners)
  const partyEntities = visibleEntities.filter((e) =>
    Object.values(e.permissions.seats).includes('owner'),
  )
  const sceneEntities = visibleEntities.filter(
    (e) => !Object.values(e.permissions.seats).includes('owner'),
  )
  const hasSection = partyEntities.length > 0 && sceneEntities.length > 0

  const handleContextMenu = (e: React.MouseEvent, entityId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entityId })
  }

  const handleSaveAsBlueprint = async (entity: Entity) => {
    const roomId = useWorldStore.getState()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/assets`, {
      url: entity.imageUrl,
      name: entity.name,
      type: 'blueprint',
      extra: {
        blueprint: {
          defaultSize: entity.size,
          defaultColor: entity.color,
          defaultRuleData: entity.ruleData,
        },
      },
    })
  }

  const getContextMenuItems = (entity: Entity): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []

    if (mySeatId && canEdit(entity.permissions, mySeatId, role)) {
      items.push({
        label: 'Set as active',
        onClick: () => onSetActiveCharacter(entity.id),
        disabled: activeCharacterId === entity.id,
      })
    }

    items.push({
      label: 'Inspect',
      onClick: () => {
        const el = portraitBarRef.current?.querySelector(
          `[data-char-id="${entity.id}"]`,
        ) as HTMLElement | null
        if (el) setLockedRect(el.getBoundingClientRect())
        onInspectCharacter(entity.id)
      },
    })

    if (isGM) {
      // Backstage toggle — only for entities currently visible and in scene
      const isVisible = visibilityMap.get(entity.id) ?? true
      if (isVisible && activeSceneId && sceneIdSet.has(entity.id)) {
        items.push({
          label: '退到候场',
          onClick: () => {
            if (activeSceneId) toggleEntityVisibility(activeSceneId, entity.id, false)
          },
        })
      }

      // Save as blueprint
      items.push({
        label: '保存为蓝图',
        onClick: () => handleSaveAsBlueprint(entity),
      })

      // Save as reusable character (only for ephemeral entities)
      if (entity.lifecycle === 'ephemeral') {
        items.push({
          label: '保存为角色',
          onClick: () => updateEntity(entity.id, { lifecycle: 'reusable' }),
        })
      }

      // Remove from scene
      if (entity.lifecycle !== 'persistent') {
        items.push({
          label: '移除',
          onClick: () => onRemoveFromScene(entity.id),
          color: '#f87171',
        })
      }
    }

    return items
  }

  const renderPortrait = (entity: Entity) => {
    const isOwner = mySeatId ? canEdit(entity.permissions, mySeatId, role) : false
    const isInspected = inspectedCharacterId === entity.id
    const isActive = activeCharacterId === entity.id

    const resources = getEntityResources(entity).filter((r) => r.max > 0)
    const displayResources = resources.slice(0, 2) // max 2 rings
    const statuses = getEntityStatuses(entity)
    const maxStatusDots = 3

    // Check if entity has an owner seat that is online
    const ownerSeatId = Object.entries(entity.permissions.seats).find(([, v]) => v === 'owner')?.[0]
    const isOnline =
      ownerSeatId === mySeatId || (ownerSeatId ? onlineSeatIds.has(ownerSeatId) : false)
    const isPC = !!ownerSeatId

    return (
      <div
        key={entity.id}
        data-char-id={entity.id}
        draggable={isGM}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-entity-id', entity.id)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        className="relative cursor-pointer transition-transform duration-fast"
        onClick={(e) => {
          handlePortraitClick(entity.id, e.currentTarget as HTMLElement)
        }}
        onContextMenu={(e) => handleContextMenu(e, entity.id)}
        onMouseEnter={(e) => {
          if (!isOwner) (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'
          handlePortraitMouseEnter(entity.id, e.currentTarget as HTMLElement)
        }}
        onMouseLeave={(e) => {
          if (!isOwner) (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
          handlePortraitMouseLeave()
        }}
        title={`${entity.name}${statuses.length > 0 ? '\n' + statuses.map((s) => s.label).join(', ') : ''}`}
      >
        {/* SVG ring progress */}
        <svg
          width={PORTRAIT_SIZE}
          height={PORTRAIT_SIZE}
          className="absolute top-0 left-0 pointer-events-none"
        >
          {displayResources.map((_, i) => (
            <ResourceRingBg key={`bg-${i}`} index={i} size={PORTRAIT_SIZE} />
          ))}
          {displayResources.map((res, i) => {
            const pct = res.max > 0 ? res.current / res.max : 0
            return (
              <ResourceRing key={i} index={i} pct={pct} color={res.color} size={PORTRAIT_SIZE} />
            )
          })}
        </svg>

        {/* Portrait image */}
        <div
          style={{
            width: PORTRAIT_SIZE,
            height: PORTRAIT_SIZE,
          }}
          className="flex items-center justify-center"
        >
          {entity.imageUrl ? (
            <img
              src={entity.imageUrl}
              alt={entity.name}
              style={{
                width: IMG_SIZE,
                height: IMG_SIZE,
                border: isInspected
                  ? '2px solid #fff'
                  : isActive
                    ? `2px solid ${entity.color}`
                    : '2px solid rgba(255,255,255,0.15)',
                boxShadow: isInspected ? `0 0 12px ${entity.color}88` : 'none',
              }}
              className="rounded-full object-cover block transition-[border-color,box-shadow] duration-200"
            />
          ) : (
            <div
              style={{
                width: IMG_SIZE,
                height: IMG_SIZE,
                background: `linear-gradient(135deg, ${entity.color}, ${entity.color}aa)`,
                border: isInspected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                boxShadow: isInspected ? `0 0 12px ${entity.color}88` : 'none',
              }}
              className="rounded-full flex items-center justify-center text-white text-sm font-bold font-sans box-border transition-[border-color,box-shadow] duration-200"
            >
              {entity.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Online indicator (PC only) */}
        {isPC && isOnline && (
          <div className="absolute bottom-px right-px w-2.5 h-2.5 rounded-full bg-success border-2 border-glass shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
        )}

        {/* Status dots (top-right) */}
        {statuses.length > 0 && (
          <div className="absolute -top-px -right-0.5 flex gap-0.5">
            {statuses.slice(0, maxStatusDots).map((s, i) => {
              const sc = statusColor(s.label)
              return (
                <div
                  key={i}
                  className="w-[7px] h-[7px] rounded-full"
                  style={{
                    background: sc,
                    border: '1px solid rgba(15, 15, 25, 0.85)',
                    boxShadow: `0 0 4px ${sc}66`,
                  }}
                />
              )
            })}
            {statuses.length > maxStatusDots && (
              <div className="text-[7px] font-bold text-text-muted/60 font-sans leading-[7px]">
                +{statuses.length - maxStatusDots}
              </div>
            )}
          </div>
        )}

        {/* NPC indicator (small diamond) */}
        {!isPC && (
          <div
            className="absolute bottom-px left-px w-2 h-2 bg-warning rounded-[1px]"
            style={{
              transform: 'rotate(45deg)',
              border: '1px solid rgba(15, 15, 25, 0.85)',
            }}
          />
        )}
      </div>
    )
  }

  // Determine which entity to show in popover
  const popoverCharId = inspectedCharacterId ?? hoveredCharId
  const popoverEntity = popoverCharId ? visibleEntities.find((e) => e.id === popoverCharId) : null
  const isLocked = !!inspectedCharacterId

  // Resolve rect: use lockedRect/hoveredRect, fallback to querying the portrait element
  let rect = isLocked ? lockedRect : hoveredRect
  if (!rect && isLocked && popoverCharId && portraitBarRef.current) {
    const el = portraitBarRef.current.querySelector(
      `[data-char-id="${popoverCharId}"]`,
    ) as HTMLElement | null
    if (el) rect = el.getBoundingClientRect()
  }

  // Determine if the inspected entity is editable
  const isEditable =
    popoverEntity && isLocked && mySeatId && canEdit(popoverEntity.permissions, mySeatId, role)
  const popoverWidth = isLocked ? (isEditable ? 320 : 260) : 220

  // Calculate popover position
  let popoverLeft = 0
  let popoverTop = 0
  if (rect) {
    popoverLeft = Math.max(
      8,
      Math.min(window.innerWidth - popoverWidth - 8, rect.left + rect.width / 2 - popoverWidth / 2),
    )
    popoverTop = rect.bottom + 8
  }

  const popoverMaxHeight = rect ? `calc(100vh - ${rect.bottom + 8}px - 20px)` : '50vh'

  return (
    <div
      ref={portraitBarRef}
      className="fixed top-3 left-1/2 -translate-x-1/2 z-toast pointer-events-none flex flex-col items-center gap-[3px]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tab buttons + collapse */}
      <div className="flex gap-0.5 items-center pointer-events-auto">
        <button
          onClick={() => setActiveTab('characters')}
          className={`px-2.5 py-[3px] text-[10px] font-semibold font-sans bg-transparent border-none cursor-pointer transition-[color,border-color] duration-fast ${
            activeTab === 'characters'
              ? 'text-text-primary border-b-2 border-accent'
              : 'text-text-muted/40 border-b-2 border-transparent'
          }`}
        >
          Characters
        </button>
        <button
          onClick={() => setActiveTab('initiative')}
          className={`px-2.5 py-[3px] text-[10px] font-semibold font-sans bg-transparent border-none cursor-pointer transition-[color,border-color] duration-fast ${
            activeTab === 'initiative'
              ? 'text-text-primary border-b-2 border-accent'
              : 'text-text-muted/40 border-b-2 border-transparent'
          }`}
        >
          Initiative
        </button>
        <button
          onClick={() => setPortraitBarVisible(false)}
          className="ml-1 p-0.5 text-text-muted/30 hover:text-text-muted/60 bg-transparent border-none cursor-pointer transition-colors duration-fast"
          title="Hide portraits"
        >
          <ChevronUp size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'characters' && (
        <div className="flex gap-1.5 items-center bg-glass backdrop-blur-[16px] rounded-[28px] px-2.5 py-[5px] shadow-[0_4px_20px_rgba(0,0,0,0.25)] border border-border-glass pointer-events-auto">
          {partyEntities.map(renderPortrait)}

          {/* Separator between PCs and NPCs */}
          {hasSection && <div className="w-px h-8 bg-border-glass mx-0.5" />}

          {sceneEntities.map(renderPortrait)}
        </div>
      )}

      {activeTab === 'initiative' &&
        (() => {
          const initiativeOrder = combatInfo?.initiativeOrder ?? []
          const initiativeIndex = combatInfo?.initiativeIndex ?? 0

          // If no initiative order set, show setup button (GM) or empty state
          if (initiativeOrder.length === 0) {
            const handleInitSetup = () => {
              const ids = visibleEntities.map((e) => e.id)
              if (ids.length > 0) onSetInitiativeOrder(ids)
            }
            return (
              <div className="flex items-center gap-2 bg-glass backdrop-blur-[16px] rounded-[28px] px-2.5 py-[5px] shadow-[0_4px_20px_rgba(0,0,0,0.25)] border border-border-glass pointer-events-auto">
                {isGM ? (
                  <button
                    onClick={handleInitSetup}
                    className="px-3 py-1 text-[11px] font-semibold font-sans text-accent bg-transparent border border-accent/30 rounded-full cursor-pointer transition-colors duration-fast hover:bg-accent/10"
                  >
                    Set Initiative Order
                  </button>
                ) : (
                  <span className="text-xs text-text-muted/40 font-sans px-3 py-1">
                    No initiative order
                  </span>
                )}
              </div>
            )
          }

          // Resolve entities in initiative order
          const orderedEntities = initiativeOrder
            .map((id) => visibleEntities.find((e) => e.id === id))
            .filter((e): e is Entity => !!e)

          if (orderedEntities.length === 0) return null

          const currentTurnId = initiativeOrder[initiativeIndex % initiativeOrder.length]

          return (
            <div className="flex gap-1.5 items-center bg-glass backdrop-blur-[16px] rounded-[28px] px-2.5 py-[5px] shadow-[0_4px_20px_rgba(0,0,0,0.25)] border border-border-glass pointer-events-auto">
              {orderedEntities.map((entity) => {
                const isCurrent = entity.id === currentTurnId
                return (
                  <div
                    key={entity.id}
                    draggable={isGM}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', entity.id)
                      setDraggedEntityId(entity.id)
                    }}
                    onDragEnd={() => setDraggedEntityId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const fromId = e.dataTransfer.getData('text/plain')
                      if (!fromId || fromId === entity.id) return
                      const newOrder = [...initiativeOrder]
                      const fromIdx = newOrder.indexOf(fromId)
                      const toIdx = newOrder.indexOf(entity.id)
                      if (fromIdx === -1 || toIdx === -1) return
                      newOrder.splice(fromIdx, 1)
                      newOrder.splice(toIdx, 0, fromId)
                      onSetInitiativeOrder(newOrder)
                      setDraggedEntityId(null)
                    }}
                    style={{
                      opacity: draggedEntityId === entity.id ? 0.4 : 1,
                      border: isCurrent ? '2px solid #D4A055' : '2px solid transparent',
                      boxShadow: isCurrent ? '0 0 10px rgba(212,160,85,0.4)' : 'none',
                      borderRadius: '50%',
                      cursor: isGM ? 'grab' : 'pointer',
                      transition: 'opacity 0.15s, border-color 0.2s, box-shadow 0.2s',
                    }}
                    onClick={(e) => handlePortraitClick(entity.id, e.currentTarget as HTMLElement)}
                    onContextMenu={(e) => handleContextMenu(e, entity.id)}
                    onMouseEnter={(e) =>
                      handlePortraitMouseEnter(entity.id, e.currentTarget as HTMLElement)
                    }
                    onMouseLeave={() => handlePortraitMouseLeave()}
                  >
                    {renderPortrait(entity)}
                  </div>
                )
              })}

              {/* Next Turn button (GM only) */}
              {isGM && (
                <button
                  onClick={onAdvanceInitiative}
                  className="flex items-center justify-center rounded-full bg-accent text-deep cursor-pointer border-none transition-transform duration-fast hover:scale-110"
                  style={{ width: 28, height: 28, flexShrink: 0 }}
                  title="Next Turn"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )
        })()}

      {/* Context menu — rendered via portal to avoid transform offset */}
      {contextMenu &&
        (() => {
          const entity = visibleEntities.find((e) => e.id === contextMenu.entityId)
          if (!entity) return null
          return createPortal(
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={getContextMenuItems(entity)}
              onClose={() => setContextMenu(null)}
            />,
            document.body,
          )
        })()}

      {/* Entity popover — rendered via portal */}
      {popoverEntity &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: popoverLeft,
              top: popoverTop,
              zIndex: 10001,
              maxHeight: popoverMaxHeight,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handlePopoverMouseLeave}
          >
            {isLocked ? (
              isEditable ? (
                <CharacterEditPanel
                  character={popoverEntity}
                  onUpdateCharacter={onUpdateEntity}
                  onClose={() => onInspectCharacter(null)}
                />
              ) : (
                <CharacterDetailPanel
                  character={popoverEntity}
                  isOnline={false}
                  onClose={() => onInspectCharacter(null)}
                />
              )
            ) : (
              <CharacterHoverPreview
                character={popoverEntity}
                isOnline={false}
                editable={mySeatId ? canEdit(popoverEntity.permissions, mySeatId, role) : false}
                onUpdateCharacter={onUpdateEntity}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
