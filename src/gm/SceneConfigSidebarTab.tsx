import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, XCircle } from 'lucide-react'
import { useWorldStore } from '../stores/worldStore'

const PARTICLE_PRESETS = ['none', 'embers', 'snow', 'dust', 'rain', 'fireflies'] as const

export function SceneConfigSidebarTab() {
  const { t } = useTranslation('gm')
  const scene = useWorldStore((s) => {
    const id = s.room.activeSceneId
    return id ? (s.scenes.find((sc) => sc.id === id) ?? null) : null
  })
  const updateScene = useWorldStore((s) => s.updateScene)
  const uploadAsset = useWorldStore((s) => s.uploadAsset)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [audioUploading, setAudioUploading] = useState(false)

  if (!scene) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/40 text-xs">
        {t('scene.no_active')}
      </div>
    )
  }

  const { atmosphere } = scene

  const handleUpdate = (updates: Parameters<typeof updateScene>[1]) => {
    void updateScene(scene.id, updates)
  }

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioUploading(true)
    try {
      const result = await uploadAsset(file, {})
      handleUpdate({ atmosphere: { ambientAudioUrl: result.url } })
    } catch (error: unknown) {
      console.error('Audio upload failed:', error)
    } finally {
      setAudioUploading(false)
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  const audioFileName = atmosphere.ambientAudioUrl
    ? decodeURIComponent(atmosphere.ambientAudioUrl.split('/').pop() ?? '').slice(0, 30)
    : ''

  const inputClass =
    'w-full bg-surface text-text-primary text-xs rounded px-2 py-1.5 border border-border-glass focus:border-accent focus:outline-none transition-colors duration-fast'
  const labelClass = 'text-text-muted text-xs font-medium'

  return (
    <div className="p-3 flex flex-col gap-3 overflow-y-auto h-full">
      {/* Scene name */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>{t('scene.name_label')}</label>
        <input
          type="text"
          defaultValue={scene.name}
          key={scene.id}
          onBlur={(e) => {
            const val = e.target.value.trim() || 'Untitled'
            if (val !== scene.name) handleUpdate({ name: val })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className={inputClass}
          placeholder={t('scene.name_placeholder')}
        />
      </div>

      {/* Background (read-only) */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>{t('scene.background')}</label>
        <div className="text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
          {atmosphere.imageUrl
            ? decodeURIComponent(atmosphere.imageUrl.split('/').pop() ?? '')
            : t('scene.no_image_hint')}
        </div>
      </div>

      {/* Particle preset */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>{t('scene.particle_effect')}</label>
        <select
          value={atmosphere.particlePreset}
          onChange={(e) => {
            handleUpdate({
              atmosphere: { particlePreset: e.target.value as typeof atmosphere.particlePreset },
            })
          }}
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
          {t('scene.ambient_audio')}
        </span>

        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            void handleAudioUpload(e)
          }}
        />

        {atmosphere.ambientAudioUrl ? (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
              {audioFileName}
            </div>
            <button
              onClick={() => {
                handleUpdate({ atmosphere: { ambientAudioUrl: '' } })
              }}
              className="text-text-muted hover:text-danger transition-colors duration-fast p-1 cursor-pointer shrink-0"
              title={t('scene.remove_audio')}
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
            {audioUploading ? t('scene.uploading_audio') : t('scene.upload_audio')}
          </button>
        )}

        {/* Volume slider */}
        <div className="flex items-center justify-between gap-2">
          <label className={labelClass}>{t('scene.volume')}</label>
          <div className="flex items-center gap-2 flex-1 max-w-[160px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={atmosphere.ambientAudioVolume}
              onChange={(e) => {
                handleUpdate({ atmosphere: { ambientAudioVolume: parseFloat(e.target.value) } })
              }}
              className="flex-1 accent-accent h-1"
            />
            <span className="text-text-muted text-[10px] w-8 text-right">
              {Math.round(atmosphere.ambientAudioVolume * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
