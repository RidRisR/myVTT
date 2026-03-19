import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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
import { usePanelDrag } from '../shared/usePanelDrag'
import { useClickOutside } from '../hooks/useClickOutside'
import { useWorldStore } from '../stores/worldStore'
import { CategoryTabs } from '../ui/CategoryTabs'
import { DraggableTagBar } from '../ui/DraggableTagBar'
import { AssetGrid } from './AssetGrid'
import { BatchToolbar } from './BatchToolbar'
import { AUTO_TAGS, type AssetMeta } from '../shared/assetTypes'
const REORDER_GAP = 1000

const CATEGORIES = [
  { key: 'map', label: 'Maps' },
  { key: 'token', label: 'Tokens' },
]

interface AssetPickerPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'select' | 'manage'
  filter?: { mediaType?: string }
  autoTags?: string[]
  onSelect?: (asset: AssetMeta) => void
}

export function AssetPickerPanel({
  open,
  onOpenChange,
  mode,
  filter,
  autoTags,
  onSelect,
}: AssetPickerPanelProps) {
  const { t } = useTranslation('dock')
  const allAssets = useWorldStore((s) => s.assets)
  const updateAsset = useWorldStore((s) => s.updateAsset)
  const reorderAssets = useWorldStore((s) => s.reorderAssets)

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [draggedAsset, setDraggedAsset] = useState<AssetMeta | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  const panelRef = useRef<HTMLDivElement | null>(null)
  const { targetRef, handlePointerDown: onDragHandleDown, resetPosition } = usePanelDrag()

  const isMultiSelect = selection.size > 0

  // Combined ref setter for panel element
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node
      targetRef.current = node
    },
    [targetRef],
  )

  // Close handler
  const close = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Click outside to close
  const activeDrag = draggedTag !== null || draggedAsset !== null
  useClickOutside(panelRef, close, open && !activeDrag)

  // Reset position on open
  useEffect(() => {
    if (open) resetPosition()
  }, [open, resetPosition])

  // Clear selection when mode or open changes
  useEffect(() => {
    setSelection(new Set())
  }, [mode, open])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if ((e.target as Element)?.closest?.('[data-radix-popper-content-wrapper]')) return
        if (isMultiSelect) {
          setSelection(new Set())
        } else {
          close()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [open, isMultiSelect, close])

  // Filter assets
  const filteredAssets = useMemo(() => {
    let result = allAssets
    if (filter?.mediaType) {
      result = result.filter((a) => a.mediaType === filter.mediaType)
    }
    if (activeCategory) {
      result = result.filter((a) => a.tags.includes(activeCategory))
    }
    if (selectedTags.length > 0) {
      result = result.filter((a) => selectedTags.every((tag) => a.tags.includes(tag)))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((a) => a.name.toLowerCase().includes(q))
    }
    return result
  }, [allAssets, filter, activeCategory, selectedTags, search])

  // Available tags: from assets matching mediaType + category filter (excludes auto-tags)
  const availableTags = useMemo(() => {
    let base = allAssets
    if (filter?.mediaType) {
      base = base.filter((a) => a.mediaType === filter.mediaType)
    }
    if (activeCategory) {
      base = base.filter((a) => a.tags.includes(activeCategory))
    }
    const tags = new Set<string>()
    for (const a of base) {
      for (const tag of a.tags) {
        if (!AUTO_TAGS.includes(tag)) tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [allAssets, filter, activeCategory])

  // All known tags across ALL assets
  const allKnownTags = useMemo(() => {
    const tags = new Set<string>()
    for (const a of allAssets) {
      for (const tag of a.tags) {
        if (!AUTO_TAGS.includes(tag)) tags.add(tag)
      }
    }
    return Array.from(tags).sort()
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
    const overAssetId = ((overData?.assetId as string | undefined) ?? over.id) as string

    // Tag drop onto asset
    if (activeData?.type === 'tag' && overAssetId) {
      const tag = activeData.tag as string
      // If the target is in selection, add tag to ALL selected assets
      const targetIds = selection.has(overAssetId) ? Array.from(selection) : [overAssetId]
      for (const id of targetIds) {
        const asset = allAssets.find((a) => a.id === id)
        if (asset && !asset.tags.includes(tag)) {
          void updateAsset(id, { tags: [...asset.tags, tag] })
        }
      }
      return
    }

    // Sortable reorder
    if (activeData?.type === 'asset' && active.id !== overAssetId) {
      const oldIndex = filteredAssets.findIndex((a) => a.id === active.id)
      const newIndex = filteredAssets.findIndex((a) => a.id === overAssetId)
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(filteredAssets, oldIndex, newIndex)
        const order = reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * REORDER_GAP }))
        void reorderAssets(order)
      }
    }
  }

  const handleSelectionChange = useCallback((newSelection: Set<string>) => {
    setSelection(newSelection)
  }, [])

  if (!open) return null

  return (
    <div
      ref={setPanelRef}
      className="fixed inset-0 m-auto w-[90vw] max-w-[560px] h-fit max-h-[80vh] z-panel bg-surface border border-border-glass rounded-xl shadow-xl flex flex-col"
    >
      {/* Title bar — drag handle */}
      <div
        className="flex items-center justify-between px-5 pt-4 pb-2 cursor-grab active:cursor-grabbing select-none shrink-0"
        onPointerDown={onDragHandleDown}
      >
        <h2 className="text-base font-semibold text-text-primary">
          {mode === 'select'
            ? t('asset.select_title', 'Select Image')
            : t('asset.manage_title', 'Asset Library')}
        </h2>
        <button onClick={close} className="text-text-muted hover:text-text-primary cursor-pointer">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 min-h-0">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Category tabs + search */}
          <div className="mb-3">
            <CategoryTabs
              categories={CATEGORIES}
              active={activeCategory}
              onSelect={(cat) => {
                setActiveCategory(cat)
                setSelectedTags([])
              }}
              trailing={
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                  }}
                  placeholder={t('asset.search', 'Search...')}
                  className="bg-glass border border-border-glass rounded-md px-2.5 py-1 text-[11px] text-text-primary placeholder:text-text-muted/30 outline-none w-32"
                />
              }
            />
          </div>

          {/* Draggable tag bar */}
          <div className="mb-3">
            <DraggableTagBar
              tags={availableTags}
              selectedTags={selectedTags}
              onToggleTag={(tag) => {
                setSelectedTags((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                )
              }}
            />
          </div>

          {/* Asset grid */}
          <AssetGrid
            assets={filteredAssets}
            mode={mode}
            autoTags={autoTags}
            onSelect={handleSelect}
            selection={selection}
            onSelectionChange={handleSelectionChange}
            isMultiSelect={isMultiSelect}
            allKnownTags={allKnownTags}
          />

          {/* Drag overlay */}
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
      </div>

      {/* Batch toolbar */}
      {mode === 'manage' && selection.size > 0 && (
        <BatchToolbar
          selection={selection}
          assets={allAssets}
          allKnownTags={allKnownTags}
          onClearSelection={() => {
            setSelection(new Set())
          }}
        />
      )}
    </div>
  )
}
