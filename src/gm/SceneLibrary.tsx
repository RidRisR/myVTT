import { useState, useRef } from 'react'
import type { Scene } from '../yjs/useScenes'
import { uploadAsset, getMediaDimensions, isVideoUrl } from '../shared/assetUpload'

interface SceneLibraryProps {
  scenes: Scene[]
  onClose: () => void
  onAdd: (scene: Scene) => void
  onUpdate: (id: string, updates: Partial<Scene>) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
}

function generateId(): string {
  return (
    self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
  )
}

export function SceneLibrary({
  scenes,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onSelect,
}: SceneLibraryProps) {
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (files: FileList | null) => {
    if (!files) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const imageUrl = await uploadAsset(file)
        const dims = await getMediaDimensions(imageUrl)

        const scene: Scene = {
          id: generateId(),
          name: file.name.replace(/\.[^.]+$/, ''),
          imageUrl,
          width: dims.w,
          height: dims.h,
          gridSize: 70,
          gridVisible: false,
          gridColor: 'rgba(255,255,255,0.2)',
          gridOffsetX: 0,
          gridOffsetY: 0,
          sortOrder: scenes.length,
        }
        onAdd(scene)
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const startRename = (scene: Scene) => {
    setEditingId(scene.id)
    setEditName(scene.name)
  }

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onUpdate(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          maxHeight: '80vh',
          background: '#fff',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>Scene Library</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#999',
              padding: 4,
              display: 'flex',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scene grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140, 1fr))',
              gap: 12,
            }}
          >
            {scenes.map((scene) => (
              <div
                key={scene.id}
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onClick={() => onSelect(scene.id)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
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
                      height: 90,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <img
                    src={scene.imageUrl}
                    alt={scene.name}
                    style={{
                      width: '100%',
                      height: 90,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                )}
                <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editingId === scene.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1,
                        fontSize: 11,
                        border: '1px solid #ddd',
                        borderRadius: 3,
                        padding: '2px 4px',
                      }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, fontSize: 11, color: '#333', fontWeight: 500 }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startRename(scene)
                      }}
                    >
                      {scene.name || 'Untitled'}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(scene.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#ccc',
                      fontSize: 12,
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                    title="Delete"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {scenes.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#999', fontSize: 13 }}>
              No scenes yet. Upload an image to get started.
            </div>
          )}
        </div>

        {/* Upload button */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '8px 18px',
              background: uploading ? '#94a3b8' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: uploading ? 'wait' : 'pointer',
            }}
          >
            {uploading ? 'Uploading...' : 'Upload Scenes'}
          </button>
        </div>
      </div>
    </div>
  )
}
