import { useMemo, useRef, useState } from 'react'
import { Plus, FolderOpen, Loader2 } from 'lucide-react'
import { useAssetStore } from '../stores/assetStore'
import type { AssetMeta } from '../shared/assetTypes'
import { isVideoUrl } from '../shared/assetUpload'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import { useToast } from '../shared/ui/useToast'

interface MapDockTabProps {
  activeSceneId: string | null
  isCombat: boolean
  onSetAsBackground?: (sceneId: string, imageUrl: string) => void
  onSetAsTacticalMap?: (imageUrl: string) => void
  onShowcaseImage?: (imageUrl: string) => void
}

interface ContextState {
  x: number
  y: number
  asset: AssetMeta
}

export function MapDockTab({
  activeSceneId,
  isCombat,
  onSetAsBackground,
  onSetAsTacticalMap,
  onShowcaseImage,
}: MapDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssetMeta | null>(null)

  const allAssets = useAssetStore((s) => s.assets)
  const loading = useAssetStore((s) => s.loading)
  const upload = useAssetStore((s) => s.upload)
  const remove = useAssetStore((s) => s.remove)
  const assets = useMemo(() => allAssets.filter((a) => a.type === 'image'), [allAssets])

  const { toast } = useToast()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await upload(file, { type: 'image' })
      toast('success', `Uploaded ${file.name}`)
    } catch (err) {
      toast('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (asset: AssetMeta) => {
    try {
      await remove(asset.id)
    } catch (err) {
      toast('error', `Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, asset: AssetMeta) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, asset })
  }

  const buildContextMenuItems = (asset: AssetMeta): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []

    if (onSetAsBackground && activeSceneId && asset.url) {
      items.push({
        label: 'Set as Scene Background',
        onClick: () => onSetAsBackground(activeSceneId, asset.url),
      })
    }
    if (onSetAsTacticalMap && asset.url) {
      items.push({
        label: 'Set as Tactical Map',
        onClick: () => onSetAsTacticalMap(asset.url),
      })
    }
    if (onShowcaseImage && asset.url) {
      items.push({
        label: 'Showcase to Players',
        onClick: () => onShowcaseImage(asset.url),
      })
    }
    items.push({
      label: 'Delete',
      onClick: () => setDeleteTarget(asset),
      color: 'var(--color-danger)',
    })

    return items
  }

  // Loading state
  if (loading && assets.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <Loader2 size={20} strokeWidth={1.5} className="text-text-muted/40 animate-spin" />
        <span className="text-text-muted text-sm">Loading assets…</span>
      </div>
    )
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

      {assets.length === 0 && (
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
        {assets.map((asset) => {
          const isHovered = hoveredId === asset.id
          return (
            <div
              key={asset.id}
              role="button"
              tabIndex={0}
              className="relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-fast border-border-glass"
              onClick={() => {
                if (!activeSceneId || !asset.url) return
                if (isCombat) {
                  onSetAsTacticalMap?.(asset.url)
                } else {
                  onSetAsBackground?.(activeSceneId, asset.url)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (!activeSceneId || !asset.url) return
                  if (isCombat) {
                    onSetAsTacticalMap?.(asset.url)
                  } else {
                    onSetAsBackground?.(activeSceneId, asset.url)
                  }
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, asset)}
              onMouseEnter={() => setHoveredId(asset.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isVideoUrl(asset.url) ? (
                <video
                  src={asset.url}
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
                  src={asset.url}
                  alt={asset.name}
                  className="w-full object-cover block"
                  style={{ height: 70 }}
                  draggable={false}
                />
              )}
              <div className="px-1.5 py-1 text-[10px] overflow-hidden text-ellipsis whitespace-nowrap bg-black/30 text-text-muted/60">
                {asset.name || 'Untitled'}
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
          disabled={uploading}
          className="rounded-lg border-2 border-dashed border-border-glass cursor-pointer flex flex-col items-center justify-center gap-1 text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
          style={{ height: 94 }}
        >
          {uploading ? (
            <>
              <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
              <span className="text-[10px]">Uploading…</span>
            </>
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
          items={buildContextMenuItems(contextMenu.asset)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Asset"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            handleDelete(deleteTarget)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
