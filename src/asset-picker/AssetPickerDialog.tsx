import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { X } from 'lucide-react'
import { DialogContent } from '../ui/primitives/DialogContent'
import { useDraggable } from '../shared/useDraggable'
import { useWorldStore } from '../stores/worldStore'
import { DraggableTag } from './DraggableTag'
import { AssetGrid } from './AssetGrid'
import type { AssetMeta } from '../shared/assetTypes'

interface AssetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'select' | 'manage'
  filter?: { mediaType?: string }
  autoTags?: string[]
  onSelect?: (asset: AssetMeta) => void
}

export function AssetPickerDialog({
  open,
  onOpenChange,
  mode,
  filter,
  autoTags,
  onSelect,
}: AssetPickerProps) {
  const { t } = useTranslation('dock')
  const allAssets = useWorldStore((s) => s.assets)
  const updateAsset = useWorldStore((s) => s.updateAsset)
  const removeAsset = useWorldStore((s) => s.removeAsset)
  const reorderAssets = useWorldStore((s) => s.reorderAssets)

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [draggedAsset, setDraggedAsset] = useState<AssetMeta | null>(null)
  const { targetRef, handlePointerDown: onDragHandleDown, resetPosition } = useDraggable()

  // Reset drag position when dialog opens
  useEffect(() => {
    if (open) resetPosition()
  }, [open, resetPosition])

  // Filter assets
  const filteredAssets = useMemo(() => {
    let result = allAssets
    if (filter?.mediaType) {
      result = result.filter((a) => a.mediaType === filter.mediaType)
    }
    if (selectedTags.length > 0) {
      result = result.filter((a) => selectedTags.every((t) => a.tags.includes(t)))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((a) => a.name.toLowerCase().includes(q))
    }
    return result
  }, [allAssets, filter, selectedTags, search])

  // Collect available tags
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const a of allAssets) {
      for (const tag of a.tags) tags.add(tag)
    }
    return Array.from(tags)
  }, [allAssets])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleSelect = useCallback(
    (asset: AssetMeta) => {
      if (onSelect) onSelect(asset)
      onOpenChange(false)
    },
    [onSelect, onOpenChange],
  )

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'tag') {
      setDraggedTag(data.tag as string)
    } else if (data?.type === 'asset') {
      const asset = allAssets.find((a) => a.id === (data.assetId as string))
      if (asset) setDraggedAsset(asset)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTag(null)
    setDraggedAsset(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current

    // Resolve the real asset ID — over might be a sortable or a droppable
    const overAssetId = ((overData?.assetId as string | undefined) ?? over.id) as string

    // Tag drop onto asset
    if (activeData?.type === 'tag' && overAssetId) {
      const tag = activeData.tag as string
      const asset = allAssets.find((a) => a.id === overAssetId)
      if (asset && !asset.tags.includes(tag)) {
        void updateAsset(overAssetId, { tags: [...asset.tags, tag] })
      }
      return
    }

    // Sortable reorder
    if (activeData?.type === 'asset' && active.id !== overAssetId) {
      const oldIndex = filteredAssets.findIndex((a) => a.id === active.id)
      const newIndex = filteredAssets.findIndex((a) => a.id === overAssetId)
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(filteredAssets, oldIndex, newIndex)
        const GAP = 1000
        const order = reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * GAP }))
        void reorderAssets(order)
      }
    }
  }

  const handleDelete = (id: string) => {
    void removeAsset(id)
  }

  const handleRename = (id: string) => {
    const asset = allAssets.find((a) => a.id === id)
    if (!asset) return
    const name = prompt(t('asset.rename_prompt', 'New name:'), asset.name)
    if (name && name.trim()) {
      void updateAsset(id, { name: name.trim() })
    }
  }

  const handleEditTags = (id: string) => {
    const asset = allAssets.find((a) => a.id === id)
    if (!asset) return
    const input = prompt(t('asset.tags_prompt', 'Tags (comma separated):'), asset.tags.join(', '))
    if (input !== null) {
      const tags = input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      void updateAsset(id, { tags })
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={targetRef} noOverlay className="max-w-[560px] w-[90vw] bg-surface border border-border-glass rounded-xl p-5 shadow-xl">
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onDragHandleDown}
        >
          <Dialog.Title className="text-base font-semibold text-text-primary">
            {mode === 'select'
              ? t('asset.select_title', 'Select Image')
              : t('asset.manage_title', 'Asset Library')}
          </Dialog.Title>
          <Dialog.Close className="text-text-muted hover:text-text-primary cursor-pointer">
            <X size={16} strokeWidth={1.5} />
          </Dialog.Close>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Tag filter + search */}
          <div className="flex gap-1.5 mb-3 items-center overflow-x-auto">
            <button
              onClick={() => {
                setSelectedTags([])
              }}
              className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors duration-fast cursor-pointer ${
                selectedTags.length === 0
                  ? 'bg-accent text-white'
                  : 'bg-glass text-text-muted hover:text-text-primary'
              }`}
            >
              {t('asset.all', 'All')}
            </button>
            {availableTags.map((tag) => (
              <DraggableTag
                key={tag}
                tag={tag}
                selected={selectedTags.includes(tag)}
                onClick={() => {
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }}
              />
            ))}
            <div className="flex-1" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              placeholder={t('asset.search', 'Search...')}
              className="bg-glass border border-border-glass rounded-md px-2.5 py-1 text-[11px] text-text-primary placeholder:text-text-muted/30 outline-none w-32"
            />
          </div>

          {/* Grid */}
          <AssetGrid
            assets={filteredAssets}
            mode={mode}
            autoTags={autoTags}
            onSelect={handleSelect}
            onRename={handleRename}
            onEditTags={handleEditTags}
            onDelete={handleDelete}
          />

          {/* Drag overlay for tags and assets */}
          <DragOverlay>
            {draggedTag ? (
              <span className="px-3 py-1 rounded-full text-[11px] bg-accent text-white shadow-lg">
                {draggedTag}
              </span>
            ) : draggedAsset ? (
              <div className="w-24 h-24 rounded-lg overflow-hidden shadow-xl opacity-80">
                <img
                  src={draggedAsset.url}
                  alt={draggedAsset.name}
                  className="w-full h-full object-cover block"
                  draggable={false}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Footer hint */}
        <p className="text-[10px] text-text-muted/25 text-center mt-3">
          {mode === 'select'
            ? t('asset.hint_select', 'Click to select · Right-click to manage · Drag tags to label')
            : t(
                'asset.hint_manage',
                'Right-click to manage · Drag tags to label · Drag to reorder',
              )}
        </p>
      </DialogContent>
    </Dialog.Root>
  )
}
