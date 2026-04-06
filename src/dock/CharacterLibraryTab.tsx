import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Trash2, Users } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
import { getName, getColor, getImageUrl } from '../shared/coreComponents'
import { defaultNPCPermissions } from '../shared/permissions'
import { generateTokenId } from '../shared/idUtils'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'
import { useToast } from '../ui/useToast'
import { getDataTemplate } from '../log/entityBindings'

export function CharacterLibraryTab() {
  const { t } = useTranslation('dock')
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const addEntity = useWorldStore((s) => s.addEntity)
  const deleteEntity = useWorldStore((s) => s.deleteEntity)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const seats = useIdentityStore((s) => s.seats)
  const openCard = useUiStore((s) => s.openCard)
  const { toast } = useToast()
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  const [search, setSearch] = useState('')
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set())
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Filter: persistent only (exclude tactical and scene), no owner seat (not PCs), not pending delete
  const libraryEntities = useMemo(() => {
    const list = Object.values(entities).filter((e) => {
      if (e.lifecycle !== 'persistent') return false
      if (pendingDeletes.has(e.id)) return false
      const hasOwner = Object.entries(e.permissions.seats).some(
        ([seatId, perm]) => perm === 'owner' && seats.some((s) => s.id === seatId),
      )
      return !hasOwner
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      return list.filter((e) => getName(e).toLowerCase().includes(q))
    }
    return list
  }, [entities, seats, search, pendingDeletes])

  const handleCreate = () => {
    const defaultComponents = getDataTemplate(ruleSystemId)?.() ?? {}
    const newEntity: Entity = {
      id: generateTokenId(),
      blueprintId: undefined,
      permissions: defaultNPCPermissions(),
      lifecycle: 'persistent',
      tags: [],
      components: {
        'core:identity': { name: t('character.default_name'), imageUrl: '', color: '#3b82f6' },
        'core:token': { width: 1, height: 1 },
        'core:notes': { text: '' },
        ...defaultComponents,
      },
    }
    void addEntity(newEntity)
    if (activeSceneId) void addEntityToScene(activeSceneId, newEntity.id, true)
    openCard(newEntity.id)
  }

  const handleDelete = useCallback(
    (entity: Entity) => {
      const id = entity.id

      setPendingDeletes((prev) => new Set(prev).add(id))

      const timer = setTimeout(() => {
        deleteTimers.current.delete(id)
        setPendingDeletes((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        void deleteEntity(id)
      }, 5000)
      deleteTimers.current.set(id, timer)

      toast('undo', t('character.deleted', { name: getName(entity) }), {
        duration: 5000,
        action: {
          label: t('character.undo'),
          onClick: () => {
            const timer = deleteTimers.current.get(id)
            if (timer) clearTimeout(timer)
            deleteTimers.current.delete(id)
            setPendingDeletes((prev) => {
              const next = new Set(prev)
              next.delete(id)
              return next
            })
          },
        },
      })
    },
    [deleteEntity, toast, t],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Search + Create */}
      <div className="flex items-center gap-1 px-1 pt-1 pb-1 shrink-0">
        <div className="relative flex-1">
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
            placeholder={t('character.search_placeholder')}
            className="w-full pl-6 pr-2 py-1 text-xs bg-surface/60 text-text-primary border border-border-glass rounded outline-none placeholder:text-text-muted/30"
          />
        </div>
        <button
          onClick={handleCreate}
          className="shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
          title={t('character.create')}
          data-testid="create-character"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1">
        {libraryEntities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
            <Users size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
            <span className="opacity-50">{t('character.empty')}</span>
            <span className="opacity-30 text-[10px] mt-1">{t('character.empty_hint')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {libraryEntities.map((entity) => {
              const eName = getName(entity)
              const eColor = getColor(entity)
              const eImageUrl = getImageUrl(entity)
              return (
                <div key={entity.id} className="relative flex items-center group">
                  <button
                    onClick={() => {
                      if (activeSceneId) void addEntityToScene(activeSceneId, entity.id)
                    }}
                    onDoubleClick={() => {
                      openCard(entity.id)
                    }}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
                  >
                    <div
                      className="w-6 h-6 rounded-full shrink-0 border border-border-glass"
                      style={{
                        backgroundColor: eColor,
                        backgroundImage: eImageUrl ? `url(${eImageUrl})` : undefined,
                        backgroundSize: 'cover',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-primary truncate">{eName}</div>
                      <div className="text-[10px] text-text-muted/50">
                        {t('character.persistent')}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(entity)
                    }}
                    className="absolute right-1 opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted/40 hover:text-danger hover:bg-danger/10 cursor-pointer transition-all duration-fast"
                    title={t('character.delete_character')}
                    data-testid="delete-character"
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
