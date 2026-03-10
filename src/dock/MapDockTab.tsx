import { useRef, useState } from 'react'
import type { Scene } from '../yjs/useScenes'
import { uploadAsset, getMediaDimensions, isVideoUrl } from '../shared/assetUpload'
import { generateTokenId } from '../shared/idUtils'

interface MapDockTabProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onAddScene: (scene: Scene) => void
  onDeleteScene: (id: string) => void
}

export function MapDockTab({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDeleteScene,
}: MapDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
        imageUrl,
        width: dims.w,
        height: dims.h,
        gridSize: 50,
        gridVisible: false,
        gridColor: '#ffffff',
        gridOffsetX: 0,
        gridOffsetY: 0,
        sortOrder: scenes.length,
        combatActive: false,
        battleMapUrl: '',
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
        style={{ display: 'none' }}
        onChange={handleUpload}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: 8,
        }}
      >
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId
          const isHovered = hoveredId === scene.id
          return (
            <div
              key={scene.id}
              style={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 8,
                overflow: 'hidden',
                border: isActive ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.08)',
                boxShadow: isActive ? '0 0 12px rgba(59,130,246,0.3)' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onClick={() => onSelectScene(scene.id)}
              onMouseEnter={() => setHoveredId(scene.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isVideoUrl(scene.imageUrl) ? (
                <video
                  src={scene.imageUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: 70,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  draggable={false}
                />
              ) : (
                <img
                  src={scene.imageUrl}
                  alt={scene.name}
                  style={{
                    width: '100%',
                    height: 70,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  draggable={false}
                />
              )}
              <div
                style={{
                  padding: '4px 6px',
                  fontSize: 10,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontWeight: isActive ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  background: 'rgba(0,0,0,0.3)',
                }}
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
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#f87171',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            height: 70 + 24, // match image + label height
            borderRadius: 8,
            border: '2px dashed rgba(255,255,255,0.15)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: 'rgba(255,255,255,0.3)',
            fontSize: 20,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
          }}
        >
          {uploading ? (
            <span style={{ fontSize: 11 }}>Uploading...</span>
          ) : (
            <>
              <span>+</span>
              <span style={{ fontSize: 10 }}>Add Map</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
