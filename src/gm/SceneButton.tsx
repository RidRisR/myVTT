import { useState } from 'react'
import { Image } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import { SceneListPanel } from './SceneListPanel'

interface SceneButtonProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onDeleteScene: (id: string) => void
  onDuplicateScene: (sceneId: string) => void
  onCreateScene: () => void
  onRenameScene: (id: string, name: string) => void
}

export function SceneButton({
  scenes,
  activeSceneId,
  onSelectScene,
  onDeleteScene,
  onDuplicateScene,
  onCreateScene,
  onRenameScene,
}: SceneButtonProps) {
  const [showSceneList, setShowSceneList] = useState(false)

  return (
    <>
      <div
        className="fixed bottom-3 left-4 z-toast font-sans"
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        <button
          onClick={() => {
            setShowSceneList(!showSceneList)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold text-text-primary shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast"
        >
          <Image size={14} strokeWidth={1.5} />
          Scenes
        </button>
      </div>

      {showSceneList && (
        <SceneListPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={onSelectScene}
          onDeleteScene={onDeleteScene}
          onRenameScene={onRenameScene}
          onDuplicateScene={onDuplicateScene}
          onCreateScene={onCreateScene}
          onClose={() => {
            setShowSceneList(false)
          }}
        />
      )}
    </>
  )
}
