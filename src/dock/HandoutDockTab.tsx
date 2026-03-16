import { useRef, useState } from 'react'
import { Pencil, X, Plus, Loader, FileImage } from 'lucide-react'
import type { HandoutAsset } from '../stores/worldStore'
import { uploadAsset } from '../shared/assetUpload'
import { generateTokenId } from '../shared/idUtils'

interface HandoutDockTabProps {
  assets: HandoutAsset[]
  onAddAsset: (asset: HandoutAsset) => void
  onDeleteAsset: (id: string) => void
  onEditAsset: (asset: HandoutAsset) => void
  onShowcase: (asset: HandoutAsset) => void
}

export function HandoutDockTab({
  assets,
  onAddAsset,
  onDeleteAsset,
  onEditAsset,
  onShowcase,
}: HandoutDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const result = await uploadAsset(file)
      onAddAsset({ id: generateTokenId(), imageUrl: result.url, createdAt: Date.now() })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleUpload(e)
        }}
      />
      {assets.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <FileImage size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">No handouts yet</p>
          <p className="text-text-muted/50 text-xs">Upload images to share with your players</p>
        </div>
      )}

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
      >
        {assets.map((asset) => {
          const isHovered = hoveredId === asset.id
          return (
            <div
              key={asset.id}
              className="relative cursor-pointer rounded-lg overflow-hidden border-2 border-border-glass transition-colors duration-fast hover:border-text-muted/20"
              onClick={() => {
                onShowcase(asset)
              }}
              onMouseEnter={() => {
                setHoveredId(asset.id)
              }}
              onMouseLeave={() => {
                setHoveredId(null)
              }}
            >
              <img
                src={asset.imageUrl}
                alt=""
                className="w-full object-cover block"
                style={{ height: 70 }}
                draggable={false}
              />
              {/* Title indicator */}
              {asset.title && !isHovered && (
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 text-[9px] text-text-primary/80 whitespace-nowrap overflow-hidden text-ellipsis font-sans">
                  {asset.title}
                </div>
              )}
              {isHovered && (
                <>
                  {/* Edit button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditAsset(asset)
                    }}
                    className="absolute top-1 left-1 w-[18px] h-[18px] rounded-full bg-black/60 border-none cursor-pointer text-text-primary/80 flex items-center justify-center p-0"
                  >
                    <Pencil size={10} strokeWidth={2.5} />
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteAsset(asset.id)
                    }}
                    className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/60 border-none cursor-pointer text-danger flex items-center justify-center p-0"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border-2 border-dashed border-border-glass cursor-pointer flex items-center justify-center gap-1 text-text-muted/30 text-xl transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50"
          style={{ height: 70 }}
        >
          {uploading ? (
            <Loader size={14} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Plus size={20} strokeWidth={1.5} />
          )}
        </div>
      </div>
    </div>
  )
}
