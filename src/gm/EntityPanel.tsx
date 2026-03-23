import { useState, useMemo } from 'react'
import { Plus, Search, ClipboardList, Eye, EyeOff, MapPin, Swords } from 'lucide-react'
import type { Entity, SceneEntityEntry } from '../shared/entityTypes'
import { getName } from '../shared/coreComponents'
import { defaultNPCPermissions } from '../shared/permissions'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'
import { useToast } from '../ui/useToast'
import { generateTokenId } from '../shared/idUtils'
import { EntityRow } from './EntityRow'
import { useTranslation } from 'react-i18next'

const EMPTY_ENTRIES: SceneEntityEntry[] = []
const EMPTY_TACTICAL: Entity[] = []

type GroupType = 'onStage' | 'backstage' | 'tactical'

export function EntityPanel() {
  const { t } = useTranslation('gm')
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const sceneEntityMap = useWorldStore((s) => s.sceneEntityMap)
  const tacticalInfo = useWorldStore((s) => s.tacticalInfo)
  const addEntity = useWorldStore((s) => s.addEntity)
  const deleteEntity = useWorldStore((s) => s.deleteEntity)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const removeEntityFromScene = useWorldStore((s) => s.removeEntityFromScene)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const toggleEntityVisibility = useWorldStore((s) => s.toggleEntityVisibility)
  const seats = useIdentityStore((s) => s.seats)
  const onlineSeatIds = useIdentityStore((s) => s.onlineSeatIds)
  const openCard = useUiStore((s) => s.openCard)
  const { toast } = useToast()

  const [search, setSearch] = useState('')

  // Determine which entities are PCs (have an owner seat)
  const pcIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entity of Object.values(entities)) {
      for (const [seatId, perm] of Object.entries(entity.permissions.seats)) {
        if (perm === 'owner' && seats.some((s) => s.id === seatId)) {
          ids.add(entity.id)
          break
        }
      }
    }
    return ids
  }, [entities, seats])

  // Get scene entity entries
  const sceneEntries: SceneEntityEntry[] = useMemo(
    () => (activeSceneId ? (sceneEntityMap[activeSceneId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES),
    [activeSceneId, sceneEntityMap],
  )

  // Split into on-stage / backstage (exclude PCs)
  const { onStage, backstage } = useMemo(() => {
    const on: Entity[] = []
    const off: Entity[] = []
    for (const entry of sceneEntries) {
      const entity = entities[entry.entityId]
      if (!entity) continue
      if (pcIds.has(entity.id)) continue
      if (search && !getName(entity).toLowerCase().includes(search.toLowerCase())) continue
      if (entry.visible) on.push(entity)
      else off.push(entity)
    }
    return { onStage: on, backstage: off }
  }, [sceneEntries, entities, pcIds, search])

  // Tactical-only entities: have tokens but NO scene_entity_entry
  const tacticalOnlyEntities = useMemo(() => {
    if (!tacticalInfo) return EMPTY_TACTICAL
    const sceneEntityIdSet = new Set(sceneEntries.map((e) => e.entityId))
    const result: Entity[] = []
    for (const token of tacticalInfo.tokens) {
      if (sceneEntityIdSet.has(token.entityId)) continue
      if (pcIds.has(token.entityId)) continue
      const entity = entities[token.entityId]
      if (!entity) continue
      if (search && !getName(entity).toLowerCase().includes(search.toLowerCase())) continue
      result.push(entity)
    }
    return result
  }, [tacticalInfo, sceneEntries, entities, pcIds, search])

  // Check online status per entity
  const getOnlineStatus = (entity: Entity): boolean => {
    for (const [seatId, perm] of Object.entries(entity.permissions.seats)) {
      if (perm === 'owner' && onlineSeatIds.has(seatId)) return true
    }
    return false
  }

  const sceneEntityIds = useMemo(() => sceneEntries.map((e) => e.entityId), [sceneEntries])

  const handleCreateNpc = () => {
    const newEntity: Entity = {
      id: generateTokenId(),
      blueprintId: undefined,
      permissions: defaultNPCPermissions(),
      lifecycle: 'ephemeral',
      tags: [],
      components: {
        'core:identity': { name: t('entity.default_npc_name'), imageUrl: '', color: '#3b82f6' },
        'core:token': { width: 1, height: 1 },
        'core:notes': { text: '' },
      },
    }
    void addEntity(newEntity)
    if (activeSceneId) void addEntityToScene(activeSceneId, newEntity.id, false)
    openCard(newEntity.id)
  }

  const handleDelete = (entity: Entity) => {
    void deleteEntity(entity.id)
    toast('undo', t('entity.deleted', { name: getName(entity) }), { duration: 5000 })
  }

  const handleToggleVisibility = (entity: Entity, currentlyVisible: boolean) => {
    if (!activeSceneId) return
    void toggleEntityVisibility(activeSceneId, entity.id, !currentlyVisible)
  }

  // Promote tactical object -> scene entity
  const handlePromote = (entity: Entity) => {
    if (!activeSceneId) return
    void addEntityToScene(activeSceneId, entity.id)
  }

  // Demote scene entity -> tactical object (only ephemeral entities with tokens)
  const handleDemote = (entity: Entity) => {
    if (!activeSceneId) return
    void removeEntityFromScene(activeSceneId, entity.id)
  }

  // Check if entity can be demoted (ephemeral + has tactical token)
  const canDemote = (entity: Entity): boolean => {
    if (entity.lifecycle !== 'ephemeral') return false
    if (!tacticalInfo) return false
    return tacticalInfo.tokens.some((t) => t.entityId === entity.id)
  }

  const renderGroup = (title: string, icon: string, list: Entity[], groupType: GroupType) => {
    if (list.length === 0) return null
    return (
      <div className="mb-3">
        <div className="text-[10px] text-text-muted/50 uppercase tracking-wider font-semibold mb-1 px-1 flex items-center gap-1">
          <span>{icon}</span>
          <span>{title}</span>
          <span className="text-text-muted/30">({list.length})</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {list.map((entity) => (
            <div key={entity.id} className="group relative flex items-center">
              <EntityRow
                entity={entity}
                isPC={false}
                isOnline={getOnlineStatus(entity)}
                isInScene={sceneEntityIds.includes(entity.id)}
                onSelect={() => {
                  openCard(entity.id)
                }}
                onDelete={() => {
                  handleDelete(entity)
                }}
                onAddToScene={() => {
                  if (activeSceneId) void addEntityToScene(activeSceneId, entity.id)
                }}
                onUpdate={(updates) => {
                  void updateEntity(entity.id, updates)
                }}
              />
              {/* Action buttons based on group type */}
              {groupType === 'tactical' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePromote(entity)
                  }}
                  className="absolute right-7 opacity-0 group-hover:opacity-100 hover:!opacity-100 text-text-muted/40 hover:text-accent p-0.5 cursor-pointer transition-opacity duration-fast"
                  title={t('entity.promote_to_scene')}
                >
                  <MapPin size={12} strokeWidth={1.5} />
                </button>
              ) : (
                <>
                  {/* Visibility toggle for scene entities */}
                  <button
                    data-testid="toggle-visibility"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleVisibility(entity, groupType === 'onStage')
                    }}
                    className="absolute right-7 opacity-0 group-hover:opacity-100 hover:!opacity-100 text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer transition-opacity duration-fast"
                    title={
                      groupType === 'onStage' ? t('entity.exit_stage') : t('entity.enter_stage')
                    }
                  >
                    {groupType === 'onStage' ? (
                      <Eye size={12} strokeWidth={1.5} />
                    ) : (
                      <EyeOff size={12} strokeWidth={1.5} />
                    )}
                  </button>
                  {/* Demote button for ephemeral scene entities with tokens */}
                  {canDemote(entity) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDemote(entity)
                      }}
                      className="absolute right-14 opacity-0 group-hover:opacity-100 hover:!opacity-100 text-text-muted/40 hover:text-accent p-0.5 cursor-pointer transition-opacity duration-fast"
                      title={t('entity.demote_to_tactical')}
                    >
                      <Swords size={12} strokeWidth={1.5} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isEmpty =
    onStage.length === 0 && backstage.length === 0 && tacticalOnlyEntities.length === 0
  const noResults = !isEmpty || search.trim().length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="relative mb-1.5">
          <Search
            size={12}
            strokeWidth={1.5}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted/40"
          />
          <input
            data-testid="entity-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            placeholder={t('entity.search_placeholder')}
            className="w-full pl-6 pr-2 py-1 text-xs bg-surface/60 text-text-primary border border-border-glass rounded outline-none placeholder:text-text-muted/30"
          />
        </div>
      </div>

      {/* NPC list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isEmpty && !search.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
            <ClipboardList size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
            <span className="opacity-50">{t('entity.empty')}</span>
            <span className="opacity-30 text-[10px] mt-1">{t('entity.empty_hint')}</span>
          </div>
        ) : onStage.length === 0 &&
          backstage.length === 0 &&
          tacticalOnlyEntities.length === 0 &&
          noResults ? (
          <div className="text-center text-text-muted/40 text-xs py-8">{t('entity.no_match')}</div>
        ) : (
          <>
            {renderGroup(t('entity.group_on_stage'), '\u25CF', onStage, 'onStage')}
            {renderGroup(t('entity.group_off_stage'), '\u25D0', backstage, 'backstage')}
            {renderGroup(t('entity.group_tactical'), '\u2694', tacticalOnlyEntities, 'tactical')}
          </>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border-glass px-2 py-2">
        <button
          data-testid="create-npc-btn"
          onClick={handleCreateNpc}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
          title={t('entity.create_npc')}
        >
          <Plus size={12} strokeWidth={1.5} />
          {t('entity.create_npc')}
        </button>
      </div>
    </div>
  )
}
