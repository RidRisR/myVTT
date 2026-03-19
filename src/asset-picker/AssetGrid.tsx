import { useRef, useState, useMemo, useCallback } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorldStore } from '../stores/worldStore'
import { AssetGridItem } from './AssetGridItem'
import type { AssetMeta } from '../shared/assetTypes'

interface RubberBand {
  startX: number
  startY: number
  endX: number
  endY: number
}

interface AssetGridProps {
  assets: AssetMeta[]
  mode: 'select' | 'manage'
  autoTags?: string[]
  onSelect?: (asset: AssetMeta) => void
  selection: Set<string>
  onSelectionChange: (selection: Set<string>) => void
  isMultiSelect: boolean
  allKnownTags: string[]
}

export function AssetGrid({
  assets,
  mode,
  autoTags,
  onSelect,
  selection,
  onSelectionChange,
  isMultiSelect,
  allKnownTags,
}: AssetGridProps) {
  const { t } = useTranslation('dock')
  const fileRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [uploading, setUploading] = useState(false)
  const [rubberBand, setRubberBand] = useState<RubberBand | null>(null)
  const [editTagsAssetId, setEditTagsAssetId] = useState<string | null>(null)

  const uploadAsset = useWorldStore((s) => s.uploadAsset)
  const updateAsset = useWorldStore((s) => s.updateAsset)
  const removeAsset = useWorldStore((s) => s.removeAsset)

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
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleClick = useCallback(
    (asset: AssetMeta, e: React.MouseEvent) => {
      if (mode === 'select') {
        onSelect?.(asset)
        return
      }

      // Manage mode
      const isModifier = e.ctrlKey || e.metaKey
      if (isModifier || isMultiSelect) {
        // Toggle selection
        const next = new Set(selection)
        if (next.has(asset.id)) {
          next.delete(asset.id)
        } else {
          next.add(asset.id)
        }
        onSelectionChange(next)
      }
      // manage mode + !isMultiSelect + no modifier: no-op
    },
    [mode, isMultiSelect, selection, onSelectionChange, onSelect],
  )

  const handleRename = useCallback(
    (id: string) => {
      const asset = assets.find((a) => a.id === id)
      if (!asset) return
      const name = prompt(t('asset.rename_prompt', 'New name:'), asset.name)
      if (name && name.trim()) {
        void updateAsset(id, { name: name.trim() })
      }
    },
    [assets, updateAsset, t],
  )

  const handleDelete = useCallback(
    (id: string) => {
      void removeAsset(id)
    },
    [removeAsset],
  )

  const handleEditTags = useCallback((id: string) => {
    setEditTagsAssetId(id)
  }, [])

  const handleEditTagsClose = useCallback(() => {
    setEditTagsAssetId(null)
  }, [])

  const handleTagsChange = useCallback(
    (id: string, tags: string[]) => {
      void updateAsset(id, { tags })
    },
    [updateAsset],
  )

  // Rubber-band selection
  const handleGridPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== 'manage') return
      // Only start rubber-band on empty grid space
      if (e.target !== e.currentTarget) return
      if (e.button !== 0) return

      const rect = e.currentTarget.getBoundingClientRect()
      const startX = e.clientX - rect.left
      const startY = e.clientY - rect.top

      setRubberBand({ startX, startY, endX: startX, endY: startY })
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [mode],
  )

  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!rubberBand) return
      const rect = e.currentTarget.getBoundingClientRect()
      setRubberBand((prev) =>
        prev ? { ...prev, endX: e.clientX - rect.left, endY: e.clientY - rect.top } : null,
      )
    },
    [rubberBand],
  )

  const handleGridPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!rubberBand || !gridRef.current) {
        setRubberBand(null)
        return
      }

      const gridRect = gridRef.current.getBoundingClientRect()
      const bandLeft = Math.min(rubberBand.startX, rubberBand.endX) + gridRect.left
      const bandRight = Math.max(rubberBand.startX, rubberBand.endX) + gridRect.left
      const bandTop = Math.min(rubberBand.startY, rubberBand.endY) + gridRect.top
      const bandBottom = Math.max(rubberBand.startY, rubberBand.endY) + gridRect.top

      // Only select if the band has meaningful size
      if (
        Math.abs(rubberBand.endX - rubberBand.startX) > 5 ||
        Math.abs(rubberBand.endY - rubberBand.startY) > 5
      ) {
        const newSelection = new Set(e.ctrlKey || e.metaKey ? selection : new Set<string>())
        const items = gridRef.current.querySelectorAll<HTMLElement>('[data-asset-id]')
        for (const item of items) {
          const itemRect = item.getBoundingClientRect()
          // Check intersection
          if (
            itemRect.left < bandRight &&
            itemRect.right > bandLeft &&
            itemRect.top < bandBottom &&
            itemRect.bottom > bandTop
          ) {
            const assetId = item.dataset.assetId
            if (assetId) newSelection.add(assetId)
          }
        }
        onSelectionChange(newSelection)
      }

      setRubberBand(null)
    },
    [rubberBand, selection, onSelectionChange],
  )

  // Rubber-band rectangle style
  const rubberBandStyle = useMemo(() => {
    if (!rubberBand) return undefined
    return {
      left: Math.min(rubberBand.startX, rubberBand.endX),
      top: Math.min(rubberBand.startY, rubberBand.endY),
      width: Math.abs(rubberBand.endX - rubberBand.startX),
      height: Math.abs(rubberBand.endY - rubberBand.startY),
    }
  }, [rubberBand])

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
          ref={gridRef}
          className="relative grid grid-cols-4 gap-3 max-h-[320px] overflow-y-auto p-1"
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
        >
          {/* Upload card */}
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
              onClick={(e) => {
                handleClick(asset, e)
              }}
              onRename={handleRename}
              onEditTags={handleEditTags}
              onDelete={handleDelete}
              isEditingTags={editTagsAssetId === asset.id}
              allKnownTags={allKnownTags}
              onTagsChange={(tags) => {
                handleTagsChange(asset.id, tags)
              }}
              onEditTagsClose={handleEditTagsClose}
              isMultiSelect={isMultiSelect}
              isSelected={selection.has(asset.id)}
            />
          ))}

          {/* Rubber-band overlay */}
          {rubberBand && rubberBandStyle && (
            <div
              className="absolute border border-accent/60 bg-accent/15 pointer-events-none"
              style={rubberBandStyle}
            />
          )}
        </div>
      </SortableContext>
    </>
  )
}
