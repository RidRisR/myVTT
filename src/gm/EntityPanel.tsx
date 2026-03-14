import { useState, useMemo } from 'react'
import { Plus, Search, ClipboardList } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
import { defaultNPCPermissions } from '../shared/permissions'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'
import { useToast } from '../shared/ui/ToastProvider'
import { generateTokenId } from '../shared/idUtils'
import { EntityRow } from './EntityRow'

type FilterMode = 'all' | 'pc' | 'npc'

export function EntityPanel() {
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const sceneEntityMap = useWorldStore((s) => s.sceneEntityMap)
  const addEntity = useWorldStore((s) => s.addEntity)
  const deleteEntity = useWorldStore((s) => s.deleteEntity)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const seats = useIdentityStore((s) => s.seats)
  const onlineSeatIds = useIdentityStore((s) => s.onlineSeatIds)
  const setInspectedCharacterId = useUiStore((s) => s.setInspectedCharacterId)
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')

  const entitiesArray = useMemo(() => Object.values(entities), [entities])

  // Determine which entities are PCs (have an owner seat)
  const pcIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entity of entitiesArray) {
      for (const [seatId, perm] of Object.entries(entity.permissions.seats)) {
        if (perm === 'owner' && seats[seatId]) {
          ids.add(entity.id)
          break
        }
      }
    }
    return ids
  }, [entitiesArray, seats])

  // Get scene entity IDs
  const sceneEntityIds = useMemo(
    () => (activeSceneId ? (sceneEntityMap[activeSceneId] ?? []) : []),
    [activeSceneId, sceneEntityMap],
  )

  // Filter and group entities
  const filteredEntities = useMemo(() => {
    let list = entitiesArray

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((e) => e.name.toLowerCase().includes(q))
    }

    // Type filter
    if (filter === 'pc') list = list.filter((e) => pcIds.has(e.id))
    if (filter === 'npc') list = list.filter((e) => !pcIds.has(e.id))

    return list
  }, [entitiesArray, search, filter, pcIds])

  // Group: party members (persistent) vs scene NPCs
  const partyMembers = useMemo(
    () => filteredEntities.filter((e) => e.persistent),
    [filteredEntities],
  )
  const sceneNpcs = useMemo(
    () => filteredEntities.filter((e) => !e.persistent && sceneEntityIds.includes(e.id)),
    [filteredEntities, sceneEntityIds],
  )
  const otherEntities = useMemo(
    () => filteredEntities.filter((e) => !e.persistent && !sceneEntityIds.includes(e.id)),
    [filteredEntities, sceneEntityIds],
  )

  // Check online status per entity
  const getOnlineStatus = (entity: Entity): boolean => {
    for (const [seatId, perm] of Object.entries(entity.permissions.seats)) {
      if (perm === 'owner' && onlineSeatIds.includes(seatId)) return true
    }
    return false
  }

  const handleCreateNpc = () => {
    const newEntity: Entity = {
      id: generateTokenId(),
      name: '新NPC',
      imageUrl: '',
      color: '#3b82f6',
      size: 1,
      notes: '',
      ruleData: null,
      permissions: defaultNPCPermissions(),
      persistent: false,
    }
    addEntity(newEntity)
    if (activeSceneId) addEntityToScene(activeSceneId, newEntity.id)
    setInspectedCharacterId(newEntity.id)
  }

  const handleDelete = (entity: Entity) => {
    deleteEntity(entity.id)
    toast('undo', `已删除"${entity.name}"`, { duration: 5000 })
  }

  const FILTERS: { id: FilterMode; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'pc', label: 'PC' },
    { id: 'npc', label: 'NPC' },
  ]

  const renderGroup = (title: string, list: Entity[]) => {
    if (list.length === 0) return null
    return (
      <div className="mb-3">
        <div className="text-[10px] text-text-muted/50 uppercase tracking-wider font-semibold mb-1 px-1">
          {title}
        </div>
        <div className="flex flex-col gap-0.5">
          {list.map((entity) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              isPC={pcIds.has(entity.id)}
              isOnline={getOnlineStatus(entity)}
              isInScene={sceneEntityIds.includes(entity.id)}
              onSelect={() => setInspectedCharacterId(entity.id)}
              onDelete={() => handleDelete(entity)}
              onAddToScene={() => {
                if (activeSceneId) addEntityToScene(activeSceneId, entity.id)
              }}
              onUpdate={(updates) => updateEntity(entity.id, updates)}
            />
          ))}
        </div>
      </div>
    )
  }

  const isEmpty = entitiesArray.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="relative mb-1.5">
          <Search
            size={12}
            strokeWidth={1.5}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted/40"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索实体..."
            className="w-full pl-6 pr-2 py-1 text-xs bg-surface/60 text-text-primary border border-border-glass rounded outline-none placeholder:text-text-muted/30"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors duration-fast ${
                filter === f.id
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'text-text-muted/50 hover:text-text-muted border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
            <ClipboardList size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
            <span className="opacity-50">暂无实体</span>
            <span className="opacity-30 text-[10px] mt-1">点击下方「+」创建</span>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="text-center text-text-muted/40 text-xs py-8">无匹配结果</div>
        ) : (
          <>
            {renderGroup('队伍成员', partyMembers)}
            {renderGroup('场景NPC', sceneNpcs)}
            {renderGroup('其他', otherEntities)}
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
