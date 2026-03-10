import { useState } from 'react'
import { Image, Swords, X } from 'lucide-react'
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

  const editingScene = editingSceneId ? scenes.find((s) => s.id === editingSceneId) ?? null : null

  return (
    <>
      {/* Toolbar */}
      <div
        className="fixed bottom-3 left-4 z-toast flex gap-1.5 font-sans"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Scene management */}
        <button
          onClick={() => {
            setShowSceneList(!showSceneList)
            setEditingSceneId(null)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold text-text-primary shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast"
        >
          <Image size={14} strokeWidth={1.5} />
          Scenes
        </button>

        {/* Combat toggle */}
        <button
          onClick={onToggleCombat}
          className={`flex items-center gap-1.5 rounded-lg backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.3)] transition-colors duration-fast ${
            isCombat
              ? 'bg-danger text-white hover:bg-danger/80'
              : 'bg-glass text-text-primary hover:bg-hover'
          }`}
        >
          {isCombat ? <X size={14} strokeWidth={1.5} /> : <Swords size={14} strokeWidth={1.5} />}
          {isCombat ? 'Exit Combat' : 'Combat'}
        </button>
      </div>

      {/* Scene List Panel */}
      {showSceneList && (
        <SceneListPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={onSelectScene}
          onEditScene={setEditingSceneId}
          onClose={() => setShowSceneList(false)}
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
          onClose={() => setEditingSceneId(null)}
        />
      )}
    </>
  )
}
