import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent } from '../ui/primitives/ContextMenuContent'
import { ContextMenuItem } from '../ui/primitives/ContextMenuItem'
import { useTranslation } from 'react-i18next'
import { TagEditorPopover } from '../ui/TagEditorPopover'
import type { AssetMeta } from '../shared/assetTypes'

const AUTO_TAGS = ['map', 'token', 'portrait']

interface AssetGridItemProps {
  asset: AssetMeta
  onClick?: () => void
  onRename: (id: string) => void
  onEditTags: (id: string) => void
  onDelete: (id: string) => void
  // Tag editor integration
  isEditingTags?: boolean
  allKnownTags?: string[]
  onTagsChange?: (tags: string[]) => void
  onEditTagsClose?: () => void
}

export function AssetGridItem({
  asset,
  onClick,
  onRename,
  onEditTags,
  onDelete,
  isEditingTags,
  allKnownTags,
  onTagsChange,
  onEditTagsClose,
}: AssetGridItemProps) {
  const { t } = useTranslation('dock')
  const { isOver: isTagOver, setNodeRef: setDropRef } = useDroppable({
    id: `drop-${asset.id}`,
    data: { type: 'asset-drop-target', assetId: asset.id },
  })
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: asset.id,
    data: { type: 'asset', assetId: asset.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const content = (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>
        <div
          ref={(node) => {
            setSortRef(node)
            setDropRef(node)
          }}
          style={style}
          className="flex flex-col items-center gap-1 cursor-pointer group"
          onClick={onClick}
          {...attributes}
          {...listeners}
        >
          <div
            className={`relative w-24 h-24 rounded-lg overflow-hidden transition-all duration-fast ${
              isTagOver
                ? 'ring-2 ring-accent shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                : 'border-2 border-transparent hover:scale-[1.03]'
            }`}
          >
            <img
              src={asset.url}
              alt={asset.name}
              className="w-full h-full object-cover block"
              draggable={false}
            />
            {(() => {
              const userTags = asset.tags.filter((t) => !AUTO_TAGS.includes(t))
              if (userTags.length === 0) return null
              const visible = userTags.slice(0, 3)
              const extra = userTags.length - visible.length
              return (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent pt-3 pb-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-fast pointer-events-none">
                  <div className="flex gap-0.5 justify-center flex-wrap">
                    {visible.map((tag) => (
                      <span
                        key={tag}
                        className="text-[8px] bg-white/20 text-white px-1 py-px rounded-full leading-tight"
                      >
                        {tag}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="text-[8px] text-white/60 leading-tight">+{extra}</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
          <span className="text-[10px] text-text-muted/60 text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-[96px]">
            {asset.name}
          </span>
        </div>
      </ContextMenu.Trigger>

      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            onRename(asset.id)
          }}
        >
          {t('asset.rename', 'Rename')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            onEditTags(asset.id)
          }}
        >
          {t('asset.edit_tags', 'Edit Tags')}
        </ContextMenuItem>
        <ContextMenuItem
          variant="danger"
          onSelect={() => {
            onDelete(asset.id)
          }}
        >
          {t('asset.delete', 'Delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu.Root>
  )

  if (isEditingTags && allKnownTags && onTagsChange) {
    return (
      <TagEditorPopover
        tags={asset.tags}
        allKnownTags={allKnownTags}
        onTagsChange={onTagsChange}
        defaultOpen
        onOpenChange={(open) => {
          if (!open) onEditTagsClose?.()
        }}
      >
        {content}
      </TagEditorPopover>
    )
  }

  return content
}
