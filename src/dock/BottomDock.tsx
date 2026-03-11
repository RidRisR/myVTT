import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Map, CircleUser, BookOpen, Trash2, Eye, EyeOff } from 'lucide-react'
import type { Scene } from '../yjs/useScenes'
import type { MapToken, Entity, Blueprint } from '../shared/entityTypes'
import { defaultNPCPermissions } from '../shared/permissions'
import { generateTokenId } from '../shared/idUtils'
import { nextNpcName } from '../shared/characterUtils'
import { MapDockTab } from './MapDockTab'
import { TokenDockTab } from './TokenDockTab'
import { HandoutDockTab } from './HandoutDockTab'
import type { HandoutAsset } from './useHandoutAssets'

type TabId = 'maps' | 'tokens' | 'handouts'

interface BottomDockProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onAddScene: (scene: Scene) => void
  onDeleteScene: (id: string) => void
  onSetAsTacticalMap?: (imageUrl: string) => void

  blueprints: Y.Map<unknown>

  handoutAssets: HandoutAsset[]
  onAddHandoutAsset: (asset: HandoutAsset) => void
  onEditHandoutAsset: (asset: HandoutAsset) => void
  onDeleteHandoutAsset: (id: string) => void
  onShowcaseHandout: (asset: HandoutAsset) => void

  entities: Entity[]
  onAddEntity: (entity: Entity) => void
  onAddEntityToScene: (entityId: string) => void
  isCombat: boolean

  selectedToken: MapToken | null
  onAddToken: (token: MapToken) => void
  onDeleteToken: (id: string) => void
  onUpdateToken: (id: string, updates: Partial<MapToken>) => void
  onSelectToken: (id: string | null) => void
}

export function BottomDock({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDeleteScene,
  onSetAsTacticalMap,
  blueprints: blueprintsYMap,
  handoutAssets,
  onAddHandoutAsset,
  onEditHandoutAsset,
  onDeleteHandoutAsset,
  onShowcaseHandout,
  entities,
  onAddEntity,
  onAddEntityToScene,
  isCombat,
  selectedToken,
  onAddToken,
  onDeleteToken,
  onUpdateToken,
  onSelectToken,
}: BottomDockProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  // Read blueprints from Y.Map into a plain array
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  useEffect(() => {
    const read = () => {
      const result: Blueprint[] = []
      blueprintsYMap.forEach((val) => {
        const bp = val as Blueprint
        if (bp && bp.id) result.push(bp)
      })
      setBlueprints(result)
    }
    read()
    blueprintsYMap.observe(read)
    return () => blueprintsYMap.unobserve(read)
  }, [blueprintsYMap])

  // Blueprint CRUD (operates directly on Y.Map)
  const handleAddBlueprint = useCallback(
    (bp: Blueprint) => {
      blueprintsYMap.set(bp.id, bp)
    },
    [blueprintsYMap],
  )

  const handleUpdateBlueprint = useCallback(
    (id: string, updates: Partial<Blueprint>) => {
      const existing = blueprintsYMap.get(id) as Blueprint | undefined
      if (existing) {
        blueprintsYMap.set(id, { ...existing, ...updates })
      }
    },
    [blueprintsYMap],
  )

  const handleDeleteBlueprint = useCallback(
    (id: string) => {
      blueprintsYMap.delete(id)
    },
    [blueprintsYMap],
  )

  // Click outside to collapse
  useEffect(() => {
    if (activeTab === null) return
    const handleClickOutside = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setActiveTab(null)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [activeTab])

  const toggleTab = (tab: TabId) => {
    setActiveTab((prev) => (prev === tab ? null : tab))
  }

  // Create a new Entity from a blueprint
  const createEntityFromBlueprint = (bp: Blueprint): Entity => {
    const name = nextNpcName(bp.name, entities, bp.id)
    const entity: Entity = {
      id: generateTokenId(),
      name,
      imageUrl: bp.imageUrl,
      color: bp.defaultColor,
      size: bp.defaultSize,
      notes: '',
      ruleData: bp.defaultRuleData ?? null,
      permissions: defaultNPCPermissions(),
      persistent: false,
      blueprintId: bp.id,
    }
    onAddEntity(entity)
    onAddEntityToScene(entity.id)
    return entity
  }

  const handleSpawnFromBlueprint = (bp: Blueprint) => {
    const entity = createEntityFromBlueprint(bp)
    const token: MapToken = {
      id: generateTokenId(),
      entityId: entity.id,
      x: 200,
      y: 200,
      size: bp.defaultSize,
      permissions: defaultNPCPermissions(),
    }
    onAddToken(token)
    onSelectToken(token.id)
  }

  const handleAddToActive = (bp: Blueprint) => {
    createEntityFromBlueprint(bp)
  }

  const handleDeleteSelected = () => {
    if (!selectedToken) return
    onDeleteToken(selectedToken.id)
    onSelectToken(null)
  }

  const handleToggleVisibility = () => {
    if (!selectedToken) return
    const isHidden = selectedToken.permissions.default === 'none'
    const newPerms = isHidden ? defaultNPCPermissions() : { default: 'none' as const, seats: {} }
    onUpdateToken(selectedToken.id, { permissions: newPerms })
  }

  return (
    <div
      ref={dockRef}
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-toast flex flex-col items-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Expanded content area */}
      {activeTab !== null && (
        <div className="mb-1.5 bg-glass backdrop-blur-[16px] rounded-xl border border-border-glass shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-w-[400px] max-h-[220px] overflow-y-auto p-3">
          {activeTab === 'maps' && (
            <MapDockTab
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSelectScene={onSelectScene}
              onAddScene={onAddScene}
              onDeleteScene={onDeleteScene}
              onSetAsTacticalMap={onSetAsTacticalMap}
            />
          )}
          {activeTab === 'tokens' && (
            <TokenDockTab
              blueprints={blueprints}
              onAddBlueprint={handleAddBlueprint}
              onUpdateBlueprint={handleUpdateBlueprint}
              onDeleteBlueprint={handleDeleteBlueprint}
              onSpawnToken={handleSpawnFromBlueprint}
              onAddToActive={handleAddToActive}
              isCombat={isCombat}
            />
          )}
          {activeTab === 'handouts' && (
            <HandoutDockTab
              assets={handoutAssets}
              onAddAsset={onAddHandoutAsset}
              onEditAsset={onEditHandoutAsset}
              onDeleteAsset={onDeleteHandoutAsset}
              onShowcase={onShowcaseHandout}
            />
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5">
        {/* Maps tab */}
        <button
          onClick={() => toggleTab('maps')}
          className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg backdrop-blur-[8px] border border-border-glass text-xs font-semibold cursor-pointer whitespace-nowrap font-sans transition-all duration-fast ${
            activeTab === 'maps'
              ? 'bg-hover border-b-2 border-b-accent text-text-primary'
              : 'bg-glass text-text-muted hover:bg-hover hover:text-text-primary'
          }`}
        >
          <Map size={14} strokeWidth={1.5} />
          Maps
        </button>

        {/* Tokens tab */}
        <button
          onClick={() => toggleTab('tokens')}
          className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg backdrop-blur-[8px] border border-border-glass text-xs font-semibold cursor-pointer whitespace-nowrap font-sans transition-all duration-fast ${
            activeTab === 'tokens'
              ? 'bg-hover border-b-2 border-b-accent text-text-primary'
              : 'bg-glass text-text-muted hover:bg-hover hover:text-text-primary'
          }`}
        >
          <CircleUser size={14} strokeWidth={1.5} />
          Tokens
        </button>

        {/* Handouts tab */}
        <button
          onClick={() => toggleTab('handouts')}
          className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg backdrop-blur-[8px] border border-border-glass text-xs font-semibold cursor-pointer whitespace-nowrap font-sans transition-all duration-fast ${
            activeTab === 'handouts'
              ? 'bg-hover border-b-2 border-b-accent text-text-primary'
              : 'bg-glass text-text-muted hover:bg-hover hover:text-text-primary'
          }`}
        >
          <BookOpen size={14} strokeWidth={1.5} />
          Handouts
        </button>

        {/* Action: Delete selected token */}
        {selectedToken && (
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 px-3 py-[7px] bg-glass backdrop-blur-[8px] border border-border-glass rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap font-sans text-danger hover:bg-danger/10 transition-colors duration-fast"
          >
            <Trash2 size={14} strokeWidth={1.5} />
            Delete
          </button>
        )}

        {/* Action: Toggle visibility */}
        {selectedToken &&
          (() => {
            const isHidden = selectedToken.permissions.default === 'none'
            return (
              <button
                onClick={handleToggleVisibility}
                className={`flex items-center gap-1.5 px-3 py-[7px] bg-glass backdrop-blur-[8px] border border-border-glass rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap font-sans transition-colors duration-fast ${
                  isHidden ? 'text-warning' : 'text-text-muted'
                }`}
              >
                {isHidden ? (
                  <EyeOff size={14} strokeWidth={1.5} />
                ) : (
                  <Eye size={14} strokeWidth={1.5} />
                )}
                {isHidden ? 'Hidden' : 'Visible'}
              </button>
            )
          })()}
      </div>
    </div>
  )
}
