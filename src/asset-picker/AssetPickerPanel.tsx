import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
import { X } from 'lucide-react'
import { usePanelDrag } from '../shared/usePanelDrag'
import { useClickOutside } from '../hooks/useClickOutside'
import { useWorldStore } from '../stores/worldStore'
import { CategoryTabs } from '../ui/CategoryTabs'
import { DraggableTagBar } from '../ui/DraggableTagBar'
import { AssetGrid } from './AssetGrid'
import { BatchToolbar } from './BatchToolbar'
import { type AssetMeta } from '../shared/assetTypes'
import { filterAssets, collectUserTags, resolveTagDrop, computeReorder } from './assetPickerUtils'

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
  const [activeCategory, setActiveCategory] = useState<string>('map')
  const [selection, setSelection] = useState<Set<string>>(new Set())

  // Panel drag — fixed + left/top, no transform (avoids CSS containing block)
  const { panelRef, pos, setPos, handleDragStart: onDragHandleDown } = usePanelDrag()

  const isMultiSelect = selection.size > 0

  // Close handler
  const close = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Click outside to close (disabled during drag)
  const activeDrag = draggedTag !== null || draggedAsset !== null
  useClickOutside(panelRef, close, open && !activeDrag)

  // Center panel on open
  useEffect(() => {
    if (open) {
      setPos({
        x: Math.round((window.innerWidth - 560) / 2),
        y: Math.round((window.innerHeight - 500) / 2),
      })
    }
  }, [open, setPos])

  // Clear selection when mode or open changes
  useEffect(() => {
    setSelection(new Set())
  }, [mode, open])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if ((e.target as Element).closest('[data-radix-popper-content-wrapper]')) return
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
  const filteredAssets = useMemo(
    () =>
      filterAssets(allAssets, {
        mediaType: filter?.mediaType,
        category: activeCategory,
        selectedTags,
        search,
      }),
    [allAssets, filter, activeCategory, selectedTags, search],
  )

  // Available tags: from assets matching mediaType + category filter (excludes auto-tags)
  const availableTags = useMemo(() => {
    const base = filterAssets(allAssets, { mediaType: filter?.mediaType, category: activeCategory })
    return collectUserTags(base)
  }, [allAssets, filter, activeCategory])

  // All known tags across ALL assets
  const allKnownTags = useMemo(() => collectUserTags(allAssets), [allAssets])

  // Effective auto-tags: prop > activeCategory
  // In manage mode, use current category tab as upload tag
  const effectiveAutoTags = useMemo(() => {
    if (autoTags) return autoTags
    return [activeCategory]
  }, [autoTags, activeCategory])

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
      const updates = resolveTagDrop(allAssets, overAssetId, tag, selection)
      for (const u of updates) {
        void updateAsset(u.id, { tags: u.tags })
      }
      return
    }

    // Sortable reorder
    if (activeData?.type === 'asset' && active.id !== overAssetId) {
      const order = computeReorder(filteredAssets, active.id as string, overAssetId)
      if (order.length > 0) {
        void reorderAssets(order)
      }
    }
  }

  const handleSelectionChange = useCallback((newSelection: Set<string>) => {
    setSelection(newSelection)
  }, [])

  if (!open) return null

  // Render via Portal to escape ancestor containing blocks
  // (transform/backdrop-filter on MyCharacterCard, HamburgerMenu, etc.)
  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-ui w-[90vw] max-w-[560px] max-h-[80vh] bg-surface border border-border-glass rounded-xl shadow-xl flex flex-col"
      style={{ left: pos.x, top: pos.y }}
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
              onSelect={(cat: string) => {
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
            category={activeCategory}
            autoTags={effectiveAutoTags}
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
    </div>,
    document.body,
  )
}
