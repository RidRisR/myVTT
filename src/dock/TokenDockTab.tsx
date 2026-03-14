import { useRef, useState, useMemo } from 'react'
import { X, Plus, CircleDot } from 'lucide-react'
import type { Blueprint } from '../shared/entityTypes'
import { useAssetStore } from '../stores/assetStore'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'

interface TokenDockTabProps {
  onSpawnToken: (bp: Blueprint) => void
  onAddToActive: (bp: Blueprint) => void
  isCombat: boolean
}

/** Convert asset with type=blueprint into a Blueprint object */
function assetToBlueprint(a: { id: string; url: string; name: string; blueprint?: { defaultSize: number; defaultColor: string; defaultRuleData?: unknown } }): Blueprint {
  return {
    id: a.id,
    name: a.name,
    imageUrl: a.url,
    defaultSize: a.blueprint?.defaultSize ?? 1,
    defaultColor: a.blueprint?.defaultColor ?? '#3b82f6',
    defaultRuleData: a.blueprint?.defaultRuleData,
  }
}

export function TokenDockTab({
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

  // Read from asset store — derive blueprints from assets with type === 'blueprint'
  const allAssets = useAssetStore((s) => s.assets)
  const upload = useAssetStore((s) => s.upload)
  const remove = useAssetStore((s) => s.remove)
  const updateAssetMeta = useAssetStore((s) => s.update)

  const blueprints = useMemo(
    () => allAssets.filter((a) => a.type === 'blueprint').map(assetToBlueprint),
    [allAssets],
  )

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await upload(file, {
        name: file.name.replace(/\.[^.]+$/, ''),
        type: 'blueprint',
        blueprint: { defaultSize: 1, defaultColor: '#3b82f6' },
      })
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
      updateAssetMeta(editingId, { name: editName.trim() })
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
      onClick: () => remove(bp.id),
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

      {blueprints.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <CircleDot size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">No token blueprints</p>
          <p className="text-text-muted/50 text-xs">Upload token images to build your collection</p>
        </div>
      )}

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', contentVisibility: 'auto' }}
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
                    remove(bp.id)
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
