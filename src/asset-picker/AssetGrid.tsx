import { useRef, useState, useMemo } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorldStore } from '../stores/worldStore'
import { AssetGridItem } from './AssetGridItem'
import type { AssetMeta } from '../shared/assetTypes'

interface AssetGridProps {
  assets: AssetMeta[]
  mode: 'select' | 'manage'
  autoTags?: string[]
  onSelect?: (asset: AssetMeta) => void
  onRename: (id: string) => void
  onEditTags: (id: string) => void
  onDelete: (id: string) => void
  editTagsAssetId?: string | null
  allKnownTags?: string[]
  onTagsChange?: (id: string, tags: string[]) => void
  onEditTagsClose?: () => void
}

export function AssetGrid({
  assets,
  mode,
  autoTags,
  onSelect,
  onRename,
  onEditTags,
  onDelete,
  editTagsAssetId,
  allKnownTags,
  onTagsChange,
  onEditTagsClose,
}: AssetGridProps) {
  const { t } = useTranslation('dock')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const uploadAsset = useWorldStore((s) => s.uploadAsset)

  const sortableIds = useMemo(() => assets.map((a) => a.id), [assets])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const asset = await uploadAsset(file, {
        name: file.name.replace(/\.[^.]+$/, ''),
        mediaType: 'image',
        tags: autoTags,
      })
      if (mode === 'select' && onSelect) {
        onSelect(asset)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleClick = (asset: AssetMeta) => {
    if (mode === 'select' && onSelect) {
      onSelect(asset)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleUpload(e)}
      />

      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div
          className="grid gap-3 max-h-[320px] overflow-y-auto p-1"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        >
          {/* Upload card — first position */}
          <div
            onClick={() => fileRef.current?.click()}
            className="w-24 h-24 border-2 border-dashed border-border-glass rounded-lg cursor-pointer flex flex-col items-center justify-center text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 mx-auto"
          >
            {uploading ? (
              <span className="text-xs">...</span>
            ) : (
              <>
                <Plus size={22} strokeWidth={1.5} />
                <span className="text-[10px] mt-1">{t('asset.upload', 'Upload')}</span>
              </>
            )}
          </div>

          {assets.map((asset) => (
            <AssetGridItem
              key={asset.id}
              asset={asset}
              onClick={() => {
                handleClick(asset)
              }}
              onRename={onRename}
              onEditTags={onEditTags}
              onDelete={onDelete}
              isEditingTags={editTagsAssetId === asset.id}
              allKnownTags={allKnownTags}
              onTagsChange={(tags) => {
                onTagsChange?.(asset.id, tags)
              }}
              onEditTagsClose={onEditTagsClose}
            />
          ))}
        </div>
      </SortableContext>
    </>
  )
}
