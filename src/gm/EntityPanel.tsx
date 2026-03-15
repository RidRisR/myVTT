import { useState, useMemo } from 'react'
import { Plus, Search, ClipboardList, Eye, EyeOff } from 'lucide-react'
import type { Entity, SceneEntityEntry } from '../shared/entityTypes'
import { defaultNPCPermissions } from '../shared/permissions'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'
import { useToast } from '../shared/ui/useToast'
import { generateTokenId } from '../shared/idUtils'
import { EntityRow } from './EntityRow'

const EMPTY_ENTRIES: SceneEntityEntry[] = []

export function EntityPanel() {
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const sceneEntityMap = useWorldStore((s) => s.sceneEntityMap)
  const addEntity = useWorldStore((s) => s.addEntity)
  const deleteEntity = useWorldStore((s) => s.deleteEntity)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const toggleEntityVisibility = useWorldStore((s) => s.toggleEntityVisibility)
  const seats = useIdentityStore((s) => s.seats)
  const onlineSeatIds = useIdentityStore((s) => s.onlineSeatIds)
  const setInspectedCharacterId = useUiStore((s) => s.setInspectedCharacterId)
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
      if (pcIds.has(entity.id)) continue
      if (search && !entity.name.toLowerCase().includes(search.toLowerCase())) continue
      if (entry.visible) on.push(entity)
      else off.push(entity)
    }
    return { onStage: on, backstage: off }
  }, [sceneEntries, entities, pcIds, search])

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
      name: '新NPC',
      imageUrl: '',
      color: '#3b82f6',
      width: 1,
      height: 1,
      notes: '',
      ruleData: null,
      permissions: defaultNPCPermissions(),
      lifecycle: 'ephemeral',
    }
    void addEntity(newEntity)
    if (activeSceneId) void addEntityToScene(activeSceneId, newEntity.id, false)
    setInspectedCharacterId(newEntity.id)
  }

  const handleDelete = (entity: Entity) => {
    void deleteEntity(entity.id)
    toast('undo', `已删除"${entity.name}"`, { duration: 5000 })
  }

  const handleToggleVisibility = (entity: Entity, currentlyVisible: boolean) => {
    if (!activeSceneId) return
    void toggleEntityVisibility(activeSceneId, entity.id, !currentlyVisible)
  }

  const renderGroup = (title: string, icon: string, list: Entity[], isVisible: boolean) => {
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
                  setInspectedCharacterId(entity.id)
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
              {/* Visibility toggle button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleVisibility(entity, isVisible)
                }}
                className="absolute right-7 opacity-0 group-hover:opacity-100 hover:!opacity-100 text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer transition-opacity duration-fast"
                title={isVisible ? '离场' : '上场'}
              >
                {isVisible ? (
                  <Eye size={12} strokeWidth={1.5} />
                ) : (
                  <EyeOff size={12} strokeWidth={1.5} />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isEmpty = onStage.length === 0 && backstage.length === 0
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
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            placeholder="搜索NPC..."
            className="w-full pl-6 pr-2 py-1 text-xs bg-surface/60 text-text-primary border border-border-glass rounded outline-none placeholder:text-text-muted/30"
          />
        </div>
      </div>

      {/* NPC list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isEmpty && !search.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
            <ClipboardList size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
            <span className="opacity-50">暂无NPC</span>
            <span className="opacity-30 text-[10px] mt-1">点击下方「+」创建</span>
          </div>
        ) : onStage.length === 0 && backstage.length === 0 && noResults ? (
          <div className="text-center text-text-muted/40 text-xs py-8">无匹配结果</div>
        ) : (
          <>
            {renderGroup('在场', '\u25CF', onStage, true)}
            {renderGroup('离场', '\u25D0', backstage, false)}
          </>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border-glass px-2 py-2">
        <button
          onClick={handleCreateNpc}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
          title="新建NPC"
        >
          <Plus size={12} strokeWidth={1.5} />
          新建NPC
        </button>
      </div>
    </div>
  )
}
