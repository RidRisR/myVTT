import { useState, useCallback } from 'react'
import { Image, Swords, Layout, BookOpen } from 'lucide-react'
import type { Scene } from '../yjs/useScenes'
import { SceneListPanel } from './SceneListPanel'
import { SceneConfigPanel } from './SceneConfigPanel'

interface GmToolbarProps {
  scenes: Scene[]
  activeSceneId: string | null
  isCombat: boolean
  onSelectScene: (sceneId: string) => void
  onToggleCombat: () => void
  onUpdateScene: (id: string, updates: Partial<Scene>) => void
  onDeleteScene: (id: string) => void
}

export function GmToolbar({
  scenes,
  activeSceneId,
  isCombat,
  onSelectScene,
  onToggleCombat,
  onUpdateScene,
  onDeleteScene,
}: GmToolbarProps) {
  const [showSceneList, setShowSceneList] = useState(false)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)

  const editingScene = editingSceneId ? (scenes.find((s) => s.id === editingSceneId) ?? null) : null

  const handleEditScene = useCallback((sceneId: string) => {
    setEditingSceneId(sceneId)
  }, [])

  const handleCloseSceneList = useCallback(() => {
    setShowSceneList(false)
  }, [])

  const handleCloseConfig = useCallback(() => {
    setEditingSceneId(null)
  }, [])

  const toolbarBtnClass =
    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-fast'

  const defaultBtnClass = `${toolbarBtnClass} bg-glass backdrop-blur-[12px] border border-border-glass text-text-primary hover:bg-hover`

  return (
    <>
      {/* Toolbar */}
      <div
        className="fixed z-toast flex gap-1.5"
        style={{ bottom: 12, left: 16 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 1. Scene management */}
        <button
          onClick={() => {
            setShowSceneList(!showSceneList)
            if (!showSceneList) setEditingSceneId(null)
          }}
          className={`${toolbarBtnClass} ${
            showSceneList
              ? 'bg-accent/20 backdrop-blur-[12px] border border-accent/40 text-accent-bold'
              : 'bg-glass backdrop-blur-[12px] border border-border-glass text-text-primary hover:bg-hover'
          }`}
          title="Scene management"
        >
          <Image size={16} strokeWidth={1.5} />
          Scenes
        </button>

        {/* 2. Tactical toggle */}
        <button
          onClick={onToggleCombat}
          className={`${toolbarBtnClass} ${
            isCombat
              ? 'bg-danger backdrop-blur-[12px] border border-danger text-text-primary'
              : 'bg-glass backdrop-blur-[12px] border border-border-glass text-text-primary hover:bg-hover'
          }`}
          title={isCombat ? 'Exit combat mode' : 'Enter combat mode'}
        >
          <Swords size={16} strokeWidth={1.5} />
          {isCombat ? 'Exit Combat' : 'Combat'}
        </button>

        {/* 3. Asset dock toggle (placeholder) */}
        <button className={defaultBtnClass} title="Asset library">
          <Layout size={16} strokeWidth={1.5} />
          Assets
        </button>

        {/* 4. Showcase (placeholder) */}
        <button className={defaultBtnClass} title="Showcase / Handouts">
          <BookOpen size={16} strokeWidth={1.5} />
          Showcase
        </button>
      </div>

      {/* Scene List Panel */}
      {showSceneList && (
        <SceneListPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={onSelectScene}
          onEditScene={handleEditScene}
          onClose={handleCloseSceneList}
        />
      )}

      {/* Scene Config Panel */}
      {editingScene && (
        <SceneConfigPanel
          scene={editingScene}
          onUpdateScene={onUpdateScene}
          onDeleteScene={(id) => {
            onDeleteScene(id)
            setEditingSceneId(null)
          }}
          onClose={handleCloseConfig}
        />
      )}
    </>
  )
}
