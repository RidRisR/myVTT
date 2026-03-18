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

      {assets.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <FolderOpen size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">{t('map.no_images')}</p>
          <p className="text-text-muted/50 text-xs">{t('map.upload_hint')}</p>
        </div>
      )}

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          contentVisibility: 'auto',
        }}
      >
        {assets.map((asset) => {
          const isHovered = hoveredId === asset.id
          return (
            <ContextMenu.Root key={asset.id}>
              <ContextMenu.Trigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  className="relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-fast border-border-glass"
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
                  {isVideoUrl(asset.url) ? (
                    <video
                      src={asset.url}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="w-full h-[70px] object-cover block"
                      draggable={false}
                    />
                  ) : (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-[70px] object-cover block"
                      draggable={false}
                    />
                  )}
                  <div className="px-1.5 py-1 text-[10px] overflow-hidden text-ellipsis whitespace-nowrap bg-black/30 text-text-muted/60">
                    {asset.name || t('map.untitled')}
                  </div>

                  {/* Hover indicator for right-click */}
                  {isHovered && (
                    <div className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/40 flex items-center justify-center text-white/50 text-[8px]">
                      ···
                    </div>
                  )}
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

        {/* Upload card */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="gallery-upload"
          className="rounded-lg border-2 border-dashed border-border-glass cursor-pointer flex flex-col items-center justify-center gap-1 text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 bg-transparent disabled:cursor-not-allowed disabled:opacity-50 h-[94px]"
        >
          {uploading ? (
            <>
              <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
              <span className="text-[10px]">{t('map.uploading')}</span>
            </>
          ) : (
            <>
              <Plus size={20} strokeWidth={1.5} />
              <span className="text-[10px]">{t('map.upload')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
