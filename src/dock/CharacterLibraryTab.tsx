import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'

export function CharacterLibraryTab() {
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const seats = useIdentityStore((s) => s.seats)
  const setInspectedCharacterId = useUiStore((s) => s.setInspectedCharacterId)
  const [search, setSearch] = useState('')

  // Filter: reusable or persistent, no owner seat (not PCs)
  const libraryEntities = useMemo(() => {
    const list = Object.values(entities).filter((e) => {
      if (e.lifecycle === 'ephemeral') return false
      const hasOwner = Object.entries(e.permissions.seats).some(
        ([seatId, perm]) => perm === 'owner' && seats.some((s) => s.id === seatId),
      )
      return !hasOwner
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      return list.filter((e) => e.name.toLowerCase().includes(q))
    }
    return list
  }, [entities, seats, search])

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="relative">
          <Search
            size={12}
            strokeWidth={1.5}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted/40"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索角色..."
            className="w-full pl-6 pr-2 py-1 text-xs bg-surface/60 text-text-primary border border-border-glass rounded outline-none placeholder:text-text-muted/30"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {libraryEntities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
            <Users size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
            <span className="opacity-50">暂无保存的角色</span>
            <span className="opacity-30 text-[10px] mt-1">
              将NPC标记为「保存为角色」后出现在这里
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {libraryEntities.map((entity) => (
              <button
                key={entity.id}
                onClick={() => {
                  if (activeSceneId) addEntityToScene(activeSceneId, entity.id)
                }}
                onDoubleClick={() => setInspectedCharacterId(entity.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-surface/60 cursor-pointer transition-colors duration-fast group"
              >
                <div
                  className="w-6 h-6 rounded-full shrink-0 border border-border-glass"
                  style={{
                    backgroundColor: entity.color,
                    backgroundImage: entity.imageUrl ? `url(${entity.imageUrl})` : undefined,
                    backgroundSize: 'cover',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{entity.name}</div>
                  <div className="text-[10px] text-text-muted/50">
                    {entity.lifecycle === 'persistent' ? '持久' : '可复用'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
