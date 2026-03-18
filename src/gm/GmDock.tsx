import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  CircleUser,
  BookOpen,
  Dice5,
  Swords,
  X,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  Users,
} from 'lucide-react'
import type { MapToken, Entity, Blueprint, Atmosphere } from '../shared/entityTypes'
import { useToast } from '../ui/useToast'
import { defaultNPCPermissions } from '../shared/permissions'
import { useWorldStore } from '../stores/worldStore'
import { useUiStore } from '../stores/uiStore'
import { MapDockTab } from '../dock/MapDockTab'
import { BlueprintDockTab } from '../dock/BlueprintDockTab'
import { HandoutDockTab } from '../dock/HandoutDockTab'
import { CharacterLibraryTab } from '../dock/CharacterLibraryTab'
import type { HandoutAsset } from '../stores/worldStore'

import type { GmDockTab } from '../stores/uiStore'

// Wrap tab content components with React.memo to avoid re-renders on tab switch
const MemoMapDockTab = memo(MapDockTab)
const MemoBlueprintDockTab = memo(BlueprintDockTab)
const MemoHandoutDockTab = memo(HandoutDockTab)
const MemoCharacterLibraryTab = memo(CharacterLibraryTab)

interface GmDockProps {
  activeSceneId: string | null
  isTactical: boolean
  onUpdateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => void
  onToggleCombat: () => void
  onShowcaseImage?: (imageUrl: string) => void

  handoutAssets: HandoutAsset[]
  onAddHandoutAsset: (asset: HandoutAsset) => void
  onEditHandoutAsset: (asset: HandoutAsset) => void
  onDeleteHandoutAsset: (id: string) => void
  onShowcaseHandout: (asset: HandoutAsset) => void

  entities: Entity[]
  onAddEntity: (entity: Entity) => void
  onAddEntityToScene: (entityId: string) => void

  selectedToken: MapToken | null
  onAddToken: (token: MapToken) => void
  onDeleteToken: (id: string) => void
  onSelectToken: (id: string | null) => void
  onSetAsTacticalMap?: (imageUrl: string) => void
}

export function GmDock({
  activeSceneId,
  isTactical,
  onUpdateScene,
  onToggleCombat,
  onShowcaseImage,
  handoutAssets,
  onAddHandoutAsset,
  onEditHandoutAsset,
  onDeleteHandoutAsset,
  onShowcaseHandout,
  selectedToken,
  onAddToken,
  onDeleteToken,
  onSelectToken,
  onSetAsTacticalMap,
}: GmDockProps) {
  const { t } = useTranslation('gm')
  const activeTab = useUiStore((s) => s.gmDockTab)
  const setActiveTab = useUiStore((s) => s.setGmDockTab)
  const [collapsed, setCollapsed] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Auto-expand when a tab is set externally (e.g. from SceneViewer)
  useEffect(() => {
    if (activeTab !== null && collapsed) {
      setCollapsed(false)
    }
  }, [activeTab, collapsed])

  // Click outside to collapse
  useEffect(() => {
    if (activeTab === null) return
    const handleClickOutside = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setActiveTab(null)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [activeTab, setActiveTab])

  const toggleTab = (tab: GmDockTab) => {
    setActiveTab(activeTab === tab ? null : tab)
  }

  const handleSpawnFromBlueprint = async (bp: Blueprint) => {
    if (!activeSceneId) return
    const entity = await useWorldStore.getState().spawnFromBlueprint(activeSceneId, bp.id, {
      tacticalOnly: isTactical,
    })
    if (!entity) return
    if (isTactical) {
      void useWorldStore
        .getState()
        .placeEntityOnMap(
          entity.id,
          Math.round(window.innerWidth / 2),
          Math.round(window.innerHeight / 2),
        )
    }
  }

  const handleAddToActive = async (bp: Blueprint) => {
    if (!activeSceneId) return
    await useWorldStore.getState().spawnFromBlueprint(activeSceneId, bp.id)
  }

  const handleDeleteSelected = () => {
    if (!selectedToken) return
    const cached = structuredClone(selectedToken)
    onDeleteToken(selectedToken.id)
    onSelectToken(null)
    toast('undo', 'Token deleted', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          onAddToken(cached)
        },
      },
    })
  }

  const handleToggleVisibility = () => {
    if (!selectedToken) return
    const entity = useWorldStore.getState().entities[selectedToken.entityId]
    if (!entity) return
    const isHidden = entity.permissions.default === 'none'
    const newPerms = isHidden ? defaultNPCPermissions() : { default: 'none' as const, seats: {} }
    void useWorldStore.getState().updateEntity(entity.id, { permissions: newPerms })
  }

  if (collapsed) {
    return (
      <div
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-toast"
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        <button
          onClick={() => {
            setCollapsed(false)
          }}
          className="flex items-center gap-1 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3 py-1.5 text-xs text-text-muted cursor-pointer hover:bg-hover transition-colors duration-fast"
        >
          <ChevronDown size={14} strokeWidth={1.5} className="rotate-180" />
          {t('dock.gm_tools')}
        </button>
      </div>
    )
  }

  const tabBtnClass = (tab: GmDockTab) =>
    `flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg backdrop-blur-[8px] border border-border-glass text-xs font-semibold cursor-pointer whitespace-nowrap font-sans transition-all duration-fast ${
      activeTab === tab
        ? 'bg-hover border-b-2 border-b-accent text-text-primary'
        : 'bg-glass text-text-muted hover:bg-hover hover:text-text-primary'
    }`

  return (
    <div
      ref={dockRef}
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-toast flex flex-col items-center"
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      {/* Expanded content area */}
      {activeTab !== null && activeTab !== 'dice' && (
        <div className="mb-1.5 bg-glass backdrop-blur-[16px] rounded-xl border border-border-glass shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-w-[400px] max-h-[220px] overflow-y-auto p-3">
          {activeTab === 'gallery' && (
            <MemoMapDockTab
              activeSceneId={activeSceneId}
              isTactical={isTactical}
              onSetAsBackground={(sceneId, imageUrl) => {
                onUpdateScene(sceneId, { atmosphere: { imageUrl } })
              }}
              onSetAsTacticalMap={onSetAsTacticalMap}
              onShowcaseImage={onShowcaseImage}
            />
          )}
          {activeTab === 'tokens' && (
            <MemoBlueprintDockTab
              onSpawnToken={(bp) => {
                void handleSpawnFromBlueprint(bp)
              }}
              onAddToActive={(bp) => {
                void handleAddToActive(bp)
              }}
              isTactical={isTactical}
            />
          )}
          {activeTab === 'characters' && <MemoCharacterLibraryTab />}
          {activeTab === 'handouts' && (
            <MemoHandoutDockTab
              assets={handoutAssets}
              onAddAsset={onAddHandoutAsset}
              onEditAsset={onEditHandoutAsset}
              onDeleteAsset={onDeleteHandoutAsset}
              onShowcase={onShowcaseHandout}
            />
          )}
        </div>
      )}

      {/* Dice placeholder content */}
      {activeTab === 'dice' && (
        <div className="mb-1.5 bg-glass backdrop-blur-[16px] rounded-xl border border-border-glass shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-w-[300px] p-6 flex flex-col items-center gap-2">
          <Dice5 size={28} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-xs">{t('dock.dice_coming_soon')}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            toggleTab('gallery')
          }}
          className={tabBtnClass('gallery')}
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          {t('dock.gallery')}
        </button>

        <button
          onClick={() => {
            toggleTab('tokens')
          }}
          className={tabBtnClass('tokens')}
        >
          <CircleUser size={14} strokeWidth={1.5} />
          {t('dock.blueprints')}
        </button>

        <button
          onClick={() => {
            toggleTab('characters')
          }}
          className={tabBtnClass('characters')}
        >
          <Users size={14} strokeWidth={1.5} />
          {t('dock.characters')}
        </button>

        <button
          onClick={() => {
            toggleTab('handouts')
          }}
          className={tabBtnClass('handouts')}
        >
          <BookOpen size={14} strokeWidth={1.5} />
          {t('dock.handouts')}
        </button>

        <button
          onClick={() => {
            toggleTab('dice')
          }}
          className={tabBtnClass('dice')}
        >
          <Dice5 size={14} strokeWidth={1.5} />
          {t('dock.dice')}
        </button>

        {/* Separator */}
        <div className="w-px bg-border-glass self-stretch my-1" />

        {/* Combat toggle (fixed, not a tab) */}
        <button
          onClick={onToggleCombat}
          className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg backdrop-blur-[8px] border border-border-glass text-xs font-semibold cursor-pointer whitespace-nowrap font-sans transition-all duration-fast ${
            isTactical
              ? 'bg-danger text-white hover:bg-danger/80'
              : 'bg-glass text-text-muted hover:bg-hover hover:text-text-primary'
          }`}
        >
          {isTactical ? <X size={14} strokeWidth={1.5} /> : <Swords size={14} strokeWidth={1.5} />}
          {isTactical ? t('dock.combat_off') : t('dock.combat_on')}
        </button>

        {/* Token actions (contextual) */}
        {selectedToken && (
          <>
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-[7px] bg-glass backdrop-blur-[8px] border border-border-glass rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap font-sans text-danger hover:bg-danger/10 transition-colors duration-fast"
            >
              <Trash2 size={14} strokeWidth={1.5} />
              Delete
            </button>
            {(() => {
              const selectedEntity = useWorldStore.getState().entities[selectedToken.entityId]
              if (!selectedEntity) return null
              const isHidden = selectedEntity.permissions.default === 'none'
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
                  {isHidden ? t('dock.hidden') : t('dock.visible')}
                </button>
              )
            })()}
          </>
        )}

        {/* Collapse button */}
        <button
          onClick={() => {
            setCollapsed(true)
            setActiveTab(null)
          }}
          className="flex items-center px-2 py-[7px] bg-glass backdrop-blur-[8px] border border-border-glass rounded-lg text-text-muted cursor-pointer hover:bg-hover transition-colors duration-fast"
          title={t('dock.collapse')}
        >
          <ChevronDown size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
