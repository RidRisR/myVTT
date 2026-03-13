import { useState, useEffect, useRef } from 'react'
import { X, Trash2, Upload, XCircle } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import type { Atmosphere } from '../shared/entityTypes'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import { uploadAsset } from '../shared/assetUpload'

interface SceneConfigPanelProps {
  scene: Scene
  onUpdateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => void
  onDeleteScene: (id: string) => void
  onClose: () => void
}

const PARTICLE_PRESETS = ['none', 'embers', 'snow', 'dust', 'rain', 'fireflies'] as const

export function SceneConfigPanel({
  scene,
  onUpdateScene,
  onDeleteScene,
  onClose,
}: SceneConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(scene.name)
  const [particlePreset, setParticlePreset] = useState(scene.atmosphere.particlePreset)
  const [ambientAudioUrl, setAmbientAudioUrl] = useState(scene.atmosphere.ambientAudioUrl)
  const [ambientAudioVolume, setAmbientAudioVolume] = useState(scene.atmosphere.ambientAudioVolume)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [audioUploading, setAudioUploading] = useState(false)

  // Reset form when scene changes
  useEffect(() => {
    setName(scene.name)
    setParticlePreset(scene.atmosphere.particlePreset)
    setAmbientAudioUrl(scene.atmosphere.ambientAudioUrl)
    setAmbientAudioVolume(scene.atmosphere.ambientAudioVolume)
    setShowDeleteConfirm(false)
  }, [
    scene.id,
    scene.name,
    scene.atmosphere.particlePreset,
    scene.atmosphere.ambientAudioUrl,
    scene.atmosphere.ambientAudioVolume,
  ])

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

  const handleSave = () => {
    onUpdateScene(scene.id, {
      name: name.trim() || 'Untitled',
      atmosphere: {
        particlePreset,
        ambientAudioUrl,
        ambientAudioVolume,
      },
    })
    onClose()
  }

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioUploading(true)
    try {
      const url = await uploadAsset(file)
      setAmbientAudioUrl(url)
    } catch (err) {
      console.error('Audio upload failed:', err)
    } finally {
      setAudioUploading(false)
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    onDeleteScene(scene.id)
    onClose()
  }

  const inputClass =
    'w-full bg-surface text-text-primary text-xs rounded px-2 py-1.5 border border-border-glass focus:border-accent focus:outline-none transition-colors duration-fast'

  const labelClass = 'text-text-muted text-xs font-medium'

  // Extract filename from URL for display
  const audioFileName = ambientAudioUrl
    ? decodeURIComponent(ambientAudioUrl.split('/').pop() ?? '').slice(0, 30)
    : ''

  return (
    <div
      ref={panelRef}
      className="fixed z-toast bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex flex-col"
      style={{ bottom: 56, left: 286, width: 300, maxHeight: 580 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass">
        <span className="text-text-primary text-sm font-semibold">Scene Settings</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors duration-fast p-0.5 cursor-pointer"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Scene name */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Scene name"
          />
        </div>

        {/* Atmosphere image (read-only) */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Atmosphere Image</label>
          <div className="text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
            {scene.atmosphere.imageUrl || 'None — set via asset dock'}
          </div>
        </div>

        {/* Particle preset */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Particle Effect</label>
          <select
            value={particlePreset}
            onChange={(e) => setParticlePreset(e.target.value)}
            className={inputClass}
          >
            {PARTICLE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Ambient audio section */}
        <div className="flex flex-col gap-2">
          <span className="text-text-muted text-xs font-semibold uppercase tracking-wide">
            Ambient Audio
          </span>

          {/* Custom audio upload */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Custom Audio</label>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleAudioUpload}
            />

            {ambientAudioUrl ? (
              <div className="flex items-center gap-1.5">
                <div className="flex-1 text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
                  {audioFileName}
                </div>
                <button
                  onClick={() => setAmbientAudioUrl('')}
                  className="text-text-muted hover:text-danger transition-colors duration-fast p-1 cursor-pointer shrink-0"
                  title="Remove audio"
                >
                  <XCircle size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={audioUploading}
                className="flex items-center justify-center gap-1.5 w-full bg-surface text-text-muted text-xs rounded px-2 py-2 border border-dashed border-border-glass hover:border-accent hover:text-accent transition-colors duration-fast cursor-pointer disabled:opacity-50"
              >
                <Upload size={12} strokeWidth={1.5} />
                {audioUploading ? 'Uploading...' : 'Upload audio file'}
              </button>
            )}
          </div>

          {/* Volume slider */}
          <div className="flex items-center justify-between gap-2">
            <label className={labelClass}>Volume</label>
            <div className="flex items-center gap-2 flex-1 max-w-[160px]">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ambientAudioVolume}
                onChange={(e) => setAmbientAudioVolume(parseFloat(e.target.value))}
                className="flex-1 accent-accent h-1"
              />
              <span className="text-text-muted text-[10px] w-8 text-right">
                {Math.round(ambientAudioVolume * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border-glass">
        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded transition-colors duration-fast cursor-pointer text-danger hover:bg-danger/15"
        >
          <Trash2 size={14} strokeWidth={1.5} />
          Delete
        </button>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="bg-accent hover:bg-accent-bold text-deep text-xs font-semibold px-4 py-1.5 rounded transition-colors duration-fast cursor-pointer"
        >
          Save
        </button>
      </div>
      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Scene"
          message={`Are you sure you want to delete "${scene.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
