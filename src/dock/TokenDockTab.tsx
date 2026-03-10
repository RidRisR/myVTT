import { useRef, useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { Blueprint } from '../shared/entityTypes'
import { uploadAsset } from '../shared/assetUpload'
import { generateTokenId } from '../shared/idUtils'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'

interface TokenDockTabProps {
  blueprints: Blueprint[]
  onAddBlueprint: (bp: Blueprint) => void
  onUpdateBlueprint: (id: string, updates: Partial<Blueprint>) => void
  onDeleteBlueprint: (id: string) => void
  onSpawnToken: (bp: Blueprint) => void
  onAddToActive: (bp: Blueprint) => void
  isCombat: boolean
}

export function TokenDockTab({
  blueprints,
  onAddBlueprint,
  onUpdateBlueprint,
  onDeleteBlueprint,
  onSpawnToken,
  onAddToActive,
  isCombat,
}: TokenDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bpId: string } | null>(
    null,
  )

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const imageUrl = await uploadAsset(file)
      const bp: Blueprint = {
        id: generateTokenId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        imageUrl,
        defaultSize: 1,
        defaultColor: '#3b82f6',
      }
      onAddBlueprint(bp)
    } finally {
      setUploading(false)
    }
  }

  const startEdit = (bp: Blueprint) => {
    setEditingId(bp.id)
    setEditName(bp.name)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      onUpdateBlueprint(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  const handleContextMenu = (e: React.MouseEvent, bpId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, bpId })
  }

  const getContextMenuItems = (bp: Blueprint): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    if (isCombat) {
      items.push({ label: 'Spawn on map', onClick: () => onSpawnToken(bp) })
    }
    items.push({ label: 'Add as featured NPC', onClick: () => onAddToActive(bp) })
    items.push({
      label: 'Delete blueprint',
      onClick: () => onDeleteBlueprint(bp.id),
      color: '#f87171',
    })
    return items
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}
      >
        {blueprints.map((bp) => {
          const isHovered = hoveredId === bp.id
          return (
            <div
              key={bp.id}
              className="flex flex-col items-center gap-1 relative"
              onMouseEnter={() => setHoveredId(bp.id)}
              onMouseLeave={() => setHoveredId(null)}
              onContextMenu={(e) => handleContextMenu(e, bp.id)}
            >
              {/* Circular token image */}
              <div
                onClick={() => (isCombat ? onSpawnToken(bp) : onAddToActive(bp))}
                className="w-14 h-14 rounded-full overflow-hidden cursor-pointer shrink-0 transition-shadow duration-fast"
                style={{
                  border: `3px solid ${bp.defaultColor}`,
                  boxShadow: isHovered ? `0 0 12px ${bp.defaultColor}44` : 'none',
                }}
              >
                <img
                  src={bp.imageUrl}
                  alt={bp.name}
                  className="w-full h-full object-cover block"
                  draggable={false}
                />
              </div>

              {/* Name label (double-click to edit) */}
              {editingId === bp.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  autoFocus
                  className="w-16 text-[9px] text-center bg-surface border border-border-glass rounded text-text-primary outline-none px-1 py-0.5"
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(bp)}
                  className="text-[9px] text-text-muted/60 text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-[72px] cursor-default"
                >
                  {bp.name}
                </span>
              )}

              {/* Delete button on hover */}
              {isHovered && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteBlueprint(bp.id)
                  }}
                  className="absolute -top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 border-none cursor-pointer text-danger flex items-center justify-center p-0"
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <div className="flex flex-col items-center gap-1">
          <div
            onClick={() => fileRef.current?.click()}
            className="w-14 h-14 rounded-full border-2 border-dashed border-border-glass cursor-pointer flex items-center justify-center text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50"
          >
            {uploading ? '...' : <Plus size={22} strokeWidth={1.5} />}
          </div>
          <span className="text-[9px] text-text-muted/30">Add Token</span>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu &&
        (() => {
          const bp = blueprints.find((b) => b.id === contextMenu.bpId)
          if (!bp) return null
          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={getContextMenuItems(bp)}
              onClose={() => setContextMenu(null)}
            />
          )
        })()}
    </div>
  )
}
