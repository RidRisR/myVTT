import { useRef, useState } from 'react'
import { MoreVertical, Pencil, Trash2, MapPin } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
import * as Popover from '@radix-ui/react-popover'

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
  const [showMenu, setShowMenu] = useState(false)
  const [deletingThis, setDeletingThis] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

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

      {/* Menu button + Delete confirmation popover (Radix Popover) */}
      <Popover.Root
        open={deletingThis}
        onOpenChange={(open) => {
          if (!open) setDeletingThis(false)
        }}
      >
        <Popover.Anchor asChild>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer transition-opacity duration-fast"
          >
            <MoreVertical size={12} strokeWidth={1.5} />
          </button>
        </Popover.Anchor>

        {/* Dropdown menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className="absolute right-1 top-full mt-0.5 z-popover bg-surface border border-border-glass rounded-md shadow-lg py-1 min-w-[120px]"
            onPointerDown={(e) => {
              e.stopPropagation()
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(true)
                setRenameValue(entity.name)
                setShowMenu(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast"
            >
              <Pencil size={12} strokeWidth={1.5} />
              重命名
            </button>
            {!isInScene && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddToScene()
                  setShowMenu(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast"
              >
                <MapPin size={12} strokeWidth={1.5} />
                加入场景
              </button>
            )}
            <div className="border-t border-border-glass my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDeletingThis(true)
                setShowMenu(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-hover cursor-pointer transition-colors duration-fast"
            >
              <Trash2 size={12} strokeWidth={1.5} />
              删除
            </button>
          </div>
        )}

        {/* Delete confirmation popover — Radix Popover */}
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="center"
            sideOffset={8}
            className="bg-surface border border-border-glass rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] px-3 py-2.5 min-w-[140px] z-toast font-sans animate-[radix-popover-in_150ms_ease-out]"
            onPointerDownOutside={() => { setDeletingThis(false); }}
          >
            <p className="text-xs text-text-primary mb-2.5 whitespace-nowrap">{`删除"${entity.name}"？`}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeletingThis(false); }}
                className="text-[11px] text-text-muted px-2 py-1 rounded hover:bg-hover cursor-pointer transition-colors duration-fast"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDeletingThis(false)
                  onDelete()
                }}
                className="text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast"
              >
                Delete
              </button>
            </div>
            {/* Arrow pointing down toward anchor */}
            <Popover.Arrow className="fill-[rgb(var(--color-surface))]" width={12} height={6} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
