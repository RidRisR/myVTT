import { useEffect, useRef, useState } from 'react'
import { X, Plus, Map } from 'lucide-react'
import type { Scene } from '../yjs/useScenes'
import { uploadAsset, getMediaDimensions, isVideoUrl } from '../shared/assetUpload'
import { generateTokenId } from '../shared/idUtils'

interface MapDockTabProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onAddScene: (scene: Scene) => void
  onDeleteScene: (id: string) => void
  onSetAsTacticalMap?: (imageUrl: string) => void
}

type ContextMenu = { sceneId: string; x: number; y: number }

export function MapDockTab({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDeleteScene,
  onSetAsTacticalMap,
}: MapDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [contextMenu])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const imageUrl = await uploadAsset(file)
      const name = file.name.replace(/\.[^.]+$/, '')
      const dims = await getMediaDimensions(imageUrl)
      const scene: Scene = {
        id: generateTokenId(),
        name,
        atmosphereImageUrl: imageUrl,
        tacticalMapImageUrl: '',
        particlePreset: 'none',
        width: dims.w,
        height: dims.h,
        gridSize: 50,
        gridSnap: true,
        gridVisible: false,
        gridColor: '#ffffff',
        gridOffsetX: 0,
        gridOffsetY: 0,
        sortOrder: scenes.length,
        ambientPreset: 'none',
        ambientAudioUrl: '',
        ambientAudioVolume: 0.5,
        combatActive: false,
        battleMapUrl: '',
        initiativeOrder: [],
        initiativeIndex: 0,
      }
      onAddScene(scene)
      onSelectScene(scene.id)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleUpload}
      />

      {scenes.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Map size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">No maps yet</p>
          <p className="text-text-muted/50 text-xs">Upload an image to create your first scene</p>
        </div>
      )}

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          contentVisibility: 'auto',
        }}
      >
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId
          const isHovered = hoveredId === scene.id
          return (
            <div
              key={scene.id}
              className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-fast ${
                isActive
                  ? 'border-accent shadow-[0_0_12px_rgba(212,160,85,0.3)]'
                  : 'border-border-glass'
              }`}
              onClick={() => onSelectScene(scene.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ sceneId: scene.id, x: e.clientX, y: e.clientY })
              }}
              onMouseEnter={() => setHoveredId(scene.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isVideoUrl(scene.atmosphereImageUrl) ? (
                <video
                  src={scene.atmosphereImageUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="w-full object-cover block"
                  style={{ height: 70 }}
                  draggable={false}
                />
              ) : (
                <img
                  src={scene.atmosphereImageUrl}
                  alt={scene.name}
                  className="w-full object-cover block"
                  style={{ height: 70 }}
                  draggable={false}
                />
              )}
              <div
                className={`px-1.5 py-1 text-[10px] overflow-hidden text-ellipsis whitespace-nowrap bg-black/30 ${
                  isActive ? 'text-text-primary font-semibold' : 'text-text-muted/60'
                }`}
              >
                {scene.name || 'Untitled'}
              </div>

              {/* Delete button on hover */}
              {isHovered && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteScene(scene.id)
                  }}
                  className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/60 border-none cursor-pointer text-danger flex items-center justify-center p-0"
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border-2 border-dashed border-border-glass cursor-pointer flex flex-col items-center justify-center gap-1 text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50"
          style={{ height: 94 }}
        >
          {uploading ? (
            <span className="text-[11px]">Uploading...</span>
          ) : (
            <>
              <Plus size={20} strokeWidth={1.5} />
              <span className="text-[10px]">Add Map</span>
            </>
          )}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu &&
        (() => {
          const scene = scenes.find((s) => s.id === contextMenu.sceneId)
          if (!scene) return null
          return (
            <div
              className="fixed z-[10002] bg-glass backdrop-blur-[12px] border border-border-glass rounded-lg py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  onSelectScene(scene.id)
                  setContextMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer border-none bg-transparent transition-colors duration-fast"
              >
                切换到此场景
              </button>
              {onSetAsTacticalMap && scene.atmosphereImageUrl && (
                <button
                  onClick={() => {
                    onSetAsTacticalMap(scene.atmosphereImageUrl)
                    setContextMenu(null)
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer border-none bg-transparent transition-colors duration-fast"
                >
                  设为当前场景的战术地图
                </button>
              )}
            </div>
          )
        })()}
    </div>
  )
}
