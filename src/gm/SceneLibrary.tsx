import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Trash2, Upload } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
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
  return self.crypto.randomUUID()
}

export function SceneLibrary({
  scenes,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onSelect,
}: SceneLibraryProps) {
  const { t } = useTranslation('gm')
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (files: FileList | null) => {
    if (!files) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const result = await uploadAsset(file)
        const imageUrl = result.url
        const dims = await getMediaDimensions(imageUrl)

        const scene: Scene = {
          id: generateId(),
          name: file.name.replace(/\.[^.]+$/, ''),
          sortOrder: scenes.length,
          gmOnly: false,
          atmosphere: {
            imageUrl: imageUrl,
            width: dims.w,
            height: dims.h,
            particlePreset: 'none',
            ambientPreset: '',
            ambientAudioUrl: '',
            ambientAudioVolume: 0.5,
          },
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
      className="fixed inset-0 z-overlay bg-black/50 flex items-center justify-center font-sans"
      onClick={onClose}
    >
      <div
        className="bg-glass backdrop-blur-[16px] rounded-[14px] border border-border-glass shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
        style={{ width: 520, maxHeight: '80vh' }}
        onClick={(e) => {
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-glass flex items-center justify-between">
          <span className="font-bold text-base text-text-primary">{t('scene_library.title')}</span>
          <button
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-text-muted p-1 flex transition-colors duration-fast hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Scene grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {scenes.map((scene) => (
              <div
                key={scene.id}
                className="rounded-lg overflow-hidden border border-border-glass cursor-pointer transition-shadow duration-fast hover:shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                onClick={() => {
                  onSelect(scene.id)
                }}
              >
                {isVideoUrl(scene.atmosphere.imageUrl) ? (
                  <video
                    src={scene.atmosphere.imageUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="w-full object-cover block"
                    style={{ height: 90 }}
                  />
                ) : (
                  <img
                    src={scene.atmosphere.imageUrl}
                    alt={scene.name}
                    className="w-full object-cover block"
                    style={{ height: 90 }}
                  />
                )}
                <div className="px-2 py-1.5 flex items-center gap-1">
                  {editingId === scene.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value)
                      }}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                      className="flex-1 text-[11px] border border-border-glass rounded-[3px] px-1 py-0.5 bg-surface text-text-primary outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 text-[11px] text-text-primary font-medium"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startRename(scene)
                      }}
                    >
                      {scene.name || t('scene.untitled')}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(scene.id)
                    }}
                    className="bg-transparent border-none cursor-pointer text-text-muted/30 p-0.5 leading-none transition-colors duration-fast hover:text-danger"
                    title={t('delete', { ns: 'common' })}
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {scenes.length === 0 && (
            <div className="text-center py-10 text-text-muted text-[13px]">
              {t('scene_library.empty')}
            </div>
          )}
        </div>

        {/* Upload button */}
        <div className="px-5 py-3 border-t border-border-glass flex justify-end">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleUpload(e.target.files)
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`flex items-center gap-2 px-4 py-2 border-none rounded-md text-[13px] font-semibold ${
              uploading
                ? 'bg-text-muted text-deep cursor-wait'
                : 'bg-accent text-deep cursor-pointer hover:bg-accent-bold'
            } transition-colors duration-fast`}
          >
            <Upload size={14} strokeWidth={1.5} />
            {uploading ? t('scene_library.uploading') : t('scene_library.upload')}
          </button>
        </div>
      </div>
    </div>
  )
}
