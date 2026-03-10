import { useState } from 'react'
import { Image, Swords, X } from 'lucide-react'
import type { Scene } from '../yjs/useScenes'
import { SceneLibrary } from './SceneLibrary'
import { isVideoUrl } from '../shared/assetUpload'

interface GmToolbarProps {
  scenes: Scene[]
  activeSceneId: string | null
  isCombat: boolean
  onSelectScene: (sceneId: string) => void
  onToggleCombat: () => void
  onAddScene: (scene: Scene) => void
  onUpdateScene: (id: string, updates: Partial<Scene>) => void
  onDeleteScene: (id: string) => void
}

export function GmToolbar({
  scenes,
  activeSceneId,
  isCombat,
  onSelectScene,
  onToggleCombat,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
}: GmToolbarProps) {
  const [showScenePicker, setShowScenePicker] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  return (
    <>
      {/* Toolbar */}
      <div
        className="fixed bottom-3 left-4 z-toast flex gap-1.5 font-sans"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Scene picker */}
        <div className="relative">
          <button
            onClick={() => setShowScenePicker(!showScenePicker)}
            className="flex items-center gap-1.5 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold text-text-primary shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast"
          >
            <Image size={14} strokeWidth={1.5} />
            Scenes
          </button>

          {/* Scene dropdown */}
          {showScenePicker && (
            <div className="absolute bottom-full left-0 mb-1.5 bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] min-w-[200px] max-h-[300px] overflow-y-auto p-1">
              {scenes.length === 0 && (
                <div className="px-4 py-3 text-text-muted text-xs text-center">No scenes yet</div>
              )}
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => {
                    onSelectScene(scene.id)
                    setShowScenePicker(false)
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 border-none rounded-md cursor-pointer text-xs text-left transition-colors duration-fast ${
                    scene.id === activeSceneId
                      ? 'bg-accent/20 text-accent'
                      : 'bg-transparent text-text-primary hover:bg-hover'
                  }`}
                >
                  {isVideoUrl(scene.atmosphereImageUrl) ? (
                    <video
                      src={scene.atmosphereImageUrl}
                      muted
                      playsInline
                      className="w-9 h-6 object-cover rounded-sm shrink-0"
                    />
                  ) : (
                    <img
                      src={scene.atmosphereImageUrl}
                      alt=""
                      className="w-9 h-6 object-cover rounded-sm shrink-0"
                    />
                  )}
                  <span
                    className={`overflow-hidden text-ellipsis whitespace-nowrap ${
                      scene.id === activeSceneId ? 'font-semibold' : 'font-normal'
                    }`}
                  >
                    {scene.name || 'Untitled'}
                  </span>
                </button>
              ))}
              <div className="border-t border-border-glass my-1" />
              <button
                onClick={() => {
                  setShowScenePicker(false)
                  setShowLibrary(true)
                }}
                className="w-full px-3 py-2 bg-transparent border-none rounded-md cursor-pointer text-xs text-accent font-semibold text-left hover:bg-hover transition-colors duration-fast"
              >
                Manage Scenes...
              </button>
            </div>
          )}
        </div>

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

      {/* Scene Library Modal */}
      {showLibrary && (
        <SceneLibrary
          scenes={scenes}
          onClose={() => setShowLibrary(false)}
          onAdd={onAddScene}
          onUpdate={onUpdateScene}
          onDelete={onDeleteScene}
          onSelect={(id) => {
            onSelectScene(id)
            setShowLibrary(false)
          }}
        />
      )}
    </>
  )
}
