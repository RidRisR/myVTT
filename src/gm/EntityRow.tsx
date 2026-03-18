import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreVertical, Pencil, Trash2, MapPin } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { Entity } from '../shared/entityTypes'
import { DropdownMenuContent } from '../ui/primitives/DropdownMenuContent'
import { DropdownMenuItem } from '../ui/primitives/DropdownMenuItem'
import { ConfirmDropdownItem } from '../ui/ConfirmDropdownItem'

interface EntityRowProps {
  entity: Entity
  isPC: boolean
  isOnline: boolean
  isInScene: boolean
  onSelect: () => void
  onDelete: () => void
  onAddToScene: () => void
  onUpdate: (updates: Partial<Entity>) => void
}

export function EntityRow({
  entity,
  isPC,
  isOnline,
  isInScene,
  onSelect,
  onDelete,
  onAddToScene,
  onUpdate,
}: EntityRowProps) {
  const { t } = useTranslation('gm')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== entity.name) {
      onUpdate({ name: renameValue.trim() })
    }
    setRenaming(false)
  }

  return (
    <div
      className="relative flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface/60 transition-colors duration-fast group"
      onClick={onSelect}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {entity.imageUrl ? (
          <img
            src={entity.imageUrl}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
            style={{ border: `2px solid ${entity.color}` }}
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: entity.color }}
          >
            {entity.name.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Online indicator */}
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-[rgb(var(--color-glass))]" />
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value)
            }}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            onClick={(e) => {
              e.stopPropagation()
            }}
            className="w-full text-xs bg-surface text-text-primary border border-border-glass rounded px-1.5 py-0.5 outline-none"
          />
        ) : (
          <div className="text-xs text-text-primary truncate">{entity.name}</div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-text-muted/40">
          {isPC && <span>{t('entity.label_pc')}</span>}
          {entity.lifecycle === 'persistent' && <span>{t('entity.label_persistent')}</span>}
          {isInScene && <span className="text-accent/50">{t('entity.label_in_scene')}</span>}
        </div>
      </div>

      {/* ⋮ Menu */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation()
            }}
            className="opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer transition-opacity duration-fast"
          >
            <MoreVertical size={12} strokeWidth={1.5} />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuItem
            data-testid="entity-menu-rename"
            onSelect={() => {
              setRenaming(true)
              setRenameValue(entity.name)
            }}
          >
            <Pencil size={12} strokeWidth={1.5} />
            {t('entity.rename')}
          </DropdownMenuItem>

          {!isInScene && (
            <DropdownMenuItem
              onSelect={() => {
                onAddToScene()
              }}
            >
              <MapPin size={12} strokeWidth={1.5} />
              {t('entity.add_to_scene')}
            </DropdownMenuItem>
          )}

          <DropdownMenu.Separator className="border-t border-border-glass my-1" />

          <ConfirmDropdownItem
            data-testid="entity-menu-delete"
            icon={<Trash2 size={12} strokeWidth={1.5} />}
            message={t('entity.delete_confirm', { name: entity.name })}
            onConfirm={onDelete}
          >
            Delete
          </ConfirmDropdownItem>
        </DropdownMenuContent>
      </DropdownMenu.Root>
    </div>
  )
}
