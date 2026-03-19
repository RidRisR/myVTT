import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, FolderOpen, Loader2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useWorldStore } from '../stores/worldStore'
import type { AssetMeta } from '../shared/assetTypes'
import { isVideoUrl } from '../shared/assetUpload'
import { ContextMenuContent } from '../ui/primitives/ContextMenuContent'
import { ContextMenuItem } from '../ui/primitives/ContextMenuItem'
import { useToast } from '../ui/useToast'

interface MapDockTabProps {
  activeSceneId: string | null
  isTactical: boolean
  onSetAsBackground?: (sceneId: string, imageUrl: string) => void
  onSetAsTacticalMap?: (imageUrl: string) => void
  onShowcaseImage?: (imageUrl: string) => void
}

export function MapDockTab({
  activeSceneId,
  isTactical,
  onSetAsBackground,
  onSetAsTacticalMap,
  onShowcaseImage,
}: MapDockTabProps) {
  const { t } = useTranslation('dock')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const allAssets = useWorldStore((s) => s.assets)
  const upload = useWorldStore((s) => s.uploadAsset)
  const softRemove = useWorldStore((s) => s.softRemoveAsset)
  const assets = useMemo(
    () => allAssets.filter((a) => a.mediaType === 'image' && a.tags.includes('map')),
    [allAssets],
  )

  const { toast } = useToast()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await upload(file, { mediaType: 'image', tags: ['map'] })
      toast('success', t('map.uploaded', { name: file.name }))
    } catch (err) {
      toast(
        'error',
        t('map.upload_failed', { error: err instanceof Error ? err.message : 'Unknown error' }),
      )
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = (asset: AssetMeta) => {
    const undo = softRemove(asset.id)
    toast('undo', t('map.deleted', { name: asset.name || t('map.untitled') }), {
      duration: 5000,
      action: { label: t('map.undo'), onClick: undo },
    })
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          void handleUpload(e)
        }}
      />

      <div className="flex overflow-x-auto gap-3 pb-1" style={{ scrollbarWidth: 'none' }}>
        {assets.map((asset) => {
          const isHovered = hoveredId === asset.id
          return (
            <ContextMenu.Root key={asset.id}>
              <ContextMenu.Trigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer"
                  onClick={() => {
                    if (!activeSceneId || !asset.url) return
                    if (isTactical) {
                      onSetAsTacticalMap?.(asset.url)
                    } else {
                      onSetAsBackground?.(activeSceneId, asset.url)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (!activeSceneId || !asset.url) return
                      if (isTactical) {
                        onSetAsTacticalMap?.(asset.url)
                      } else {
                        onSetAsBackground?.(activeSceneId, asset.url)
                      }
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredId(asset.id)
                  }}
                  onMouseLeave={() => {
                    setHoveredId(null)
                  }}
                >
                  <div
                    className={`relative w-14 h-14 rounded-full overflow-hidden border-2 transition-all duration-fast ${isHovered ? 'border-accent' : 'border-border-glass'}`}
                  >
                    {isVideoUrl(asset.url) ? (
                      <video
                        src={asset.url}
                        muted
                        loop
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover block"
                        draggable={false}
                      />
                    ) : (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-cover block"
                        draggable={false}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted/60 max-w-[56px] overflow-hidden text-ellipsis whitespace-nowrap text-center">
                    {asset.name || t('map.untitled')}
                  </span>
                </div>
              </ContextMenu.Trigger>

              <ContextMenuContent>
                {onSetAsBackground && activeSceneId && asset.url && (
                  <ContextMenuItem
                    data-testid="ctx-set-bg"
                    onSelect={() => {
                      onSetAsBackground(activeSceneId, asset.url)
                    }}
                  >
                    {t('map.set_scene_bg')}
                  </ContextMenuItem>
                )}
                {onSetAsTacticalMap && asset.url && (
                  <ContextMenuItem
                    onSelect={() => {
                      onSetAsTacticalMap(asset.url)
                    }}
                  >
                    {t('map.set_tactical_map')}
                  </ContextMenuItem>
                )}
                {onShowcaseImage && asset.url && (
                  <ContextMenuItem
                    onSelect={() => {
                      onShowcaseImage(asset.url)
                    }}
                  >
                    {t('map.showcase')}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  data-testid="ctx-delete"
                  variant="danger"
                  onSelect={() => {
                    handleDelete(asset)
                  }}
                >
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu.Root>
          )
        })}

        {assets.length === 0 && (
          <div className="flex items-center gap-2 py-2 text-text-muted/40">
            <FolderOpen size={20} strokeWidth={1} />
            <span className="text-xs">{t('map.no_images')}</span>
          </div>
        )}

        {/* Upload card */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="gallery-upload"
            className="w-14 h-14 rounded-full border-2 border-dashed border-border-glass cursor-pointer flex flex-col items-center justify-center gap-0.5 text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Plus size={18} strokeWidth={1.5} />
            )}
          </button>
          <span className="text-[10px] text-text-muted/40">
            {uploading ? t('map.uploading') : t('map.upload')}
          </span>
        </div>
      </div>
    </div>
  )
}
