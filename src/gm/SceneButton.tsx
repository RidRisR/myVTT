import { useState } from 'react'
import { Image } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import type { Atmosphere } from '../shared/entityTypes'
import { SceneListPanel } from './SceneListPanel'
import { SceneConfigPanel } from './SceneConfigPanel'

interface SceneButtonProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onUpdateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => void
  onDeleteScene: (id: string) => void
  onDuplicateScene: (sceneId: string) => void
  onCreateScene: () => void
}

export function SceneButton({
  scenes,
  activeSceneId,
  onSelectScene,
  onUpdateScene,
  onDeleteScene,
  onDuplicateScene,
  onCreateScene,
}: SceneButtonProps) {
  const [showSceneList, setShowSceneList] = useState(false)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)

  const editingScene = editingSceneId ? (scenes.find((s) => s.id === editingSceneId) ?? null) : null

  return (
    <>
      {/* Scene button */}
      <div
        className="fixed bottom-3 left-4 z-toast font-sans"
        onPointerDown={(e) => e.stopPropagation()}
      >
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
      </div>

      {/* Scene List Panel */}
      {showSceneList && (
        <SceneListPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={onSelectScene}
          onEditScene={setEditingSceneId}
          onDeleteScene={(id) => {
            onDeleteScene(id)
            setEditingSceneId(null)
          }}
          onRenameScene={(id, name) => onUpdateScene(id, { name })}
          onDuplicateScene={onDuplicateScene}
          onCreateScene={onCreateScene}
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
