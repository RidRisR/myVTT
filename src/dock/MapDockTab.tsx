import { useRef, useState } from 'react'
import { Plus, FolderOpen } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import { uploadAsset, getMediaDimensions, isVideoUrl } from '../shared/assetUpload'
import { generateTokenId } from '../shared/idUtils'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'

interface MapDockTabProps {
  scenes: Scene[]
  activeSceneId: string | null
  isCombat: boolean
  onAddScene: (scene: Scene) => void
  onDeleteScene: (id: string) => void
  onSetAsBackground?: (sceneId: string, imageUrl: string) => void
  onSetAsTacticalMap?: (imageUrl: string) => void
  onShowcaseImage?: (imageUrl: string) => void
}

interface ContextState {
  x: number
  y: number
  scene: Scene
}

export function MapDockTab({
  scenes,
  activeSceneId,
  isCombat,
  onAddScene,
  onDeleteScene,
  onSetAsBackground,
  onSetAsTacticalMap,
  onShowcaseImage,
}: MapDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null)

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
        sortOrder: scenes.length,
        atmosphere: {
          imageUrl: imageUrl,
          width: dims.w,
          height: dims.h,
          particlePreset: 'none',
          ambientPreset: '',
          ambientAudioUrl: '',
          ambientAudioVolume: 0.5,
        },
        entityIds: [],
        encounters: {},
      }
      onAddScene(scene)
    } finally {
      setUploading(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, scene: Scene) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, scene })
  }

  const buildContextMenuItems = (scene: Scene): ContextMenuItem[] => {
    const imageUrl = scene.atmosphere.imageUrl
    const items: ContextMenuItem[] = []

    if (onSetAsBackground && activeSceneId && imageUrl) {
      items.push({
        label: 'Set as Scene Background',
        onClick: () => onSetAsBackground(activeSceneId, imageUrl),
      })
    }
    if (onSetAsTacticalMap && imageUrl) {
      items.push({
        label: 'Set as Tactical Map',
        onClick: () => onSetAsTacticalMap(imageUrl),
      })
    }
    if (onShowcaseImage && imageUrl) {
      items.push({
        label: 'Showcase to Players',
        onClick: () => onShowcaseImage(imageUrl),
      })
    }
    items.push({
      label: 'Delete',
      onClick: () => onDeleteScene(scene.id),
      color: 'var(--color-danger)',
    })

    return items
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
          <FolderOpen size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">No images yet</p>
          <p className="text-text-muted/50 text-xs">Upload an image to get started</p>
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
              role="button"
              tabIndex={0}
              className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-fast ${
                isActive
                  ? 'border-accent shadow-[0_0_12px_rgba(212,160,85,0.3)]'
                  : 'border-border-glass'
              }`}
              onClick={() => {
                const imageUrl = scene.atmosphere.imageUrl
                if (!activeSceneId || !imageUrl) return
                if (isCombat) {
                  onSetAsTacticalMap?.(imageUrl)
                } else {
                  onSetAsBackground?.(activeSceneId, imageUrl)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const imageUrl = scene.atmosphere.imageUrl
                  if (!activeSceneId || !imageUrl) return
                  if (isCombat) {
                    onSetAsTacticalMap?.(imageUrl)
                  } else {
                    onSetAsBackground?.(activeSceneId, imageUrl)
                  }
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, scene)}
              onMouseEnter={() => setHoveredId(scene.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isVideoUrl(scene.atmosphere.imageUrl) ? (
                <video
                  src={scene.atmosphere.imageUrl}
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
                  src={scene.atmosphere.imageUrl}
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

              {/* Hover indicator for right-click */}
              {isHovered && (
                <div className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/40 flex items-center justify-center text-white/50 text-[8px]">
                  ···
                </div>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border-2 border-dashed border-border-glass cursor-pointer flex flex-col items-center justify-center gap-1 text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 bg-transparent"
          style={{ height: 94 }}
        >
          {uploading ? (
            <span className="text-[11px]">Uploading…</span>
          ) : (
            <>
              <Plus size={20} strokeWidth={1.5} />
              <span className="text-[10px]">Upload</span>
            </>
          )}
        </button>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.scene)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
