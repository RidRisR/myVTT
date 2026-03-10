import { useEffect, useRef } from 'react'
import { X, Pencil } from 'lucide-react'
import type { Scene } from '../yjs/useScenes'
import { isVideoUrl } from '../shared/assetUpload'

interface SceneListPanelProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onEditScene: (sceneId: string) => void
  onClose: () => void
}

export function SceneListPanel({
  scenes,
  activeSceneId,
  onSelectScene,
  onEditScene,
  onClose,
}: SceneListPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Click-outside-to-close
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="fixed z-toast bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex flex-col"
      style={{ bottom: 56, left: 16, width: 260, maxHeight: 400 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass">
        <span className="text-text-primary text-sm font-semibold">Scenes</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors duration-fast p-0.5 cursor-pointer"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {scenes.length === 0 ? (
          <div className="text-text-muted text-xs text-center py-8 px-4">
            No scenes yet. Upload from the asset dock.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {scenes.map((scene) => {
              const isActive = scene.id === activeSceneId
              return (
                <div
                  key={scene.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors duration-fast group ${
                    isActive
                      ? 'bg-accent/15 border border-accent/30'
                      : 'border border-transparent hover:bg-hover'
                  }`}
                  onClick={() => onSelectScene(scene.id)}
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-8 rounded overflow-hidden flex-shrink-0 bg-deep">
                    {scene.atmosphereImageUrl ? (
                      isVideoUrl(scene.atmosphereImageUrl) ? (
                        <video
                          src={scene.atmosphereImageUrl}
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={scene.atmosphereImageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-full bg-surface" />
                    )}
                  </div>

                  {/* Name */}
                  <span
                    className={`flex-1 text-xs truncate ${
                      isActive ? 'text-accent-bold font-semibold' : 'text-text-primary'
                    }`}
                  >
                    {scene.name || 'Untitled'}
                  </span>

                  {/* Edit button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditScene(scene.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent transition-all duration-fast p-1 cursor-pointer"
                    title="Edit scene"
                  >
                    <Pencil size={14} strokeWidth={1.5} />
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
