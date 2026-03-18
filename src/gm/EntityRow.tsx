import { useState } from 'react'
import { MoreVertical, Pencil, Trash2, MapPin } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { Entity } from '../shared/entityTypes'
import { ConfirmDropdown } from '../ui/ConfirmDropdownItem'

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
          {isPC && <span>PC</span>}
          {entity.lifecycle === 'persistent' && <span>常驻</span>}
          {isInScene && <span className="text-accent/50">在场景中</span>}
        </div>
      </div>

      {/* ⋮ menu with delete confirmation */}
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <ConfirmDropdown
          trigger={
            <button className="text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer">
              <MoreVertical size={12} strokeWidth={1.5} />
            </button>
          }
          confirmLabel={
            <>
              <Trash2 size={12} strokeWidth={1.5} />
              Delete
            </>
          }
          confirmItemClassName="flex items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-hover cursor-pointer transition-colors duration-fast outline-none"
          confirmMessage={`Delete "${entity.name}"?`}
          onConfirm={onDelete}
        >
          <DropdownMenu.Item
            onSelect={() => {
              setRenaming(true)
              setRenameValue(entity.name)
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast outline-none"
          >
            <Pencil size={12} strokeWidth={1.5} />
            Rename
          </DropdownMenu.Item>
          {!isInScene && (
            <DropdownMenu.Item
              onSelect={() => {
                onAddToScene()
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast outline-none"
            >
              <MapPin size={12} strokeWidth={1.5} />
              Add to Scene
            </DropdownMenu.Item>
          )}
        </ConfirmDropdown>
      </div>
    </div>
  )
}
