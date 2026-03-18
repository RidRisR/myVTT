import { useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, CircleDot } from 'lucide-react'
import type { Blueprint } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'
import { useToast } from '../ui/useToast'
import { TagFilterBar } from '../ui/TagFilterBar'

const PRESET_TAGS = ['Humanoid', 'Beast', 'Magical', 'Undead', 'Object']

interface TokenDockTabProps {
  onSpawnToken: (bp: Blueprint) => void
  onAddToActive: (bp: Blueprint) => void
  isTactical: boolean
}

/** Convert asset with type=blueprint into a Blueprint object */
function assetToBlueprint(a: {
  id: string
  url: string
  name: string
  blueprint?: { defaultSize: number; defaultColor: string; defaultRuleData?: unknown }
}): Blueprint {
  return {
    id: a.id,
    name: a.name,
    imageUrl: a.url,
    defaultSize: a.blueprint?.defaultSize ?? 1,
    defaultColor: a.blueprint?.defaultColor ?? '#3b82f6',
    defaultRuleData: a.blueprint?.defaultRuleData,
  }
}

export function BlueprintDockTab({ onSpawnToken, onAddToActive, isTactical }: TokenDockTabProps) {
  const { t } = useTranslation('dock')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bpId: string } | null>(
    null,
  )
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Read from world store — derive blueprints from assets with type === 'blueprint'
  const allAssets = useWorldStore((s) => s.assets)
  const upload = useWorldStore((s) => s.uploadAsset)
  const softRemove = useWorldStore((s) => s.softRemoveAsset)
  const updateAssetMeta = useWorldStore((s) => s.updateAsset)

  const { toast } = useToast()

  const blueprintAssets = useMemo(
    () => allAssets.filter((a) => a.type === 'blueprint'),
    [allAssets],
  )

  // Collect all used tags + merge with presets
  const availableTags = useMemo(() => {
    const used = new Set<string>()
    for (const a of blueprintAssets) {
      for (const t of a.tags) used.add(t)
    }
    // Add presets that aren't already used
    for (const t of PRESET_TAGS) used.add(t)
    return Array.from(used)
  }, [blueprintAssets])

  // Filter by selected tags (AND logic)
  const filteredAssets = useMemo(() => {
    if (selectedTags.length === 0) return blueprintAssets
    return blueprintAssets.filter((a) => selectedTags.every((t) => a.tags.includes(t)))
  }, [blueprintAssets, selectedTags])

  const blueprints = useMemo(() => filteredAssets.map(assetToBlueprint), [filteredAssets])

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleDelete = (bp: Blueprint) => {
    const undo = softRemove(bp.id)
    toast('undo', t('blueprint.deleted', { name: bp.name }), {
      duration: 5000,
      action: { label: t('blueprint.undo'), onClick: undo },
    })
  }

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
      void updateAssetMeta(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  const handleContextMenu = (e: React.MouseEvent, bpId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, bpId })
  }

  const [editingTagsId, setEditingTagsId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  const handleAddTag = (assetId: string) => {
    const tag = tagInput.trim()
    if (!tag) return
    const asset = blueprintAssets.find((a) => a.id === assetId)
    if (!asset) return
    if (asset.tags.includes(tag)) {
      setTagInput('')
      return
    }
    void updateAssetMeta(assetId, { tags: [...asset.tags, tag] } as Record<string, unknown>)
    setTagInput('')
  }

  const handleRemoveTag = (assetId: string, tag: string) => {
    const asset = blueprintAssets.find((a) => a.id === assetId)
    if (!asset) return
    void updateAssetMeta(assetId, { tags: asset.tags.filter((t) => t !== tag) } as Record<
      string,
      unknown
    >)
  }

  const getContextMenuItems = (bp: Blueprint): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    if (isTactical) {
      items.push({
        label: t('blueprint.spawn_on_map'),
        testId: 'ctx-spawn-on-map',
        onClick: () => {
          onSpawnToken(bp)
        },
      })
    }
    items.push({
      label: t('blueprint.add_as_npc'),
      testId: 'ctx-add-as-npc',
      onClick: () => {
        onAddToActive(bp)
      },
    })
    items.push({
      label: t('blueprint.edit_tags'),
      onClick: () => {
        setEditingTagsId(bp.id)
        setTagInput('')
      },
    })
    items.push({
      label: t('blueprint.delete_blueprint'),
      testId: 'ctx-delete-blueprint',
      onClick: () => {
        handleDelete(bp)
      },
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
        onChange={(e) => {
          void handleUpload(e)
        }}
      />

      {/* Tag filter bar */}
      {blueprintAssets.length > 0 && (
        <div className="mb-2.5">
          <TagFilterBar
            availableTags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
          />
        </div>
      )}

      {blueprints.length === 0 && blueprintAssets.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <CircleDot size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">{t('blueprint.empty')}</p>
          <p className="text-text-muted/50 text-xs">{t('blueprint.upload_hint')}</p>
        </div>
      )}

      {blueprints.length === 0 && blueprintAssets.length > 0 && (
        <div className="text-center text-text-muted/40 text-xs py-6">{t('blueprint.no_match')}</div>
      )}

      <div
        className="grid gap-2.5"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
          contentVisibility: 'auto',
        }}
      >
        {blueprints.map((bp) => {
          const isHovered = hoveredId === bp.id
          return (
            <div
              key={bp.id}
              className="flex flex-col items-center gap-1 relative"
              onMouseEnter={() => {
                setHoveredId(bp.id)
              }}
              onMouseLeave={() => {
                setHoveredId(null)
              }}
              onContextMenu={(e) => {
                handleContextMenu(e, bp.id)
              }}
            >
              {/* Circular token image */}
              <div
                onClick={() => {
                  if (isTactical) {
                    onSpawnToken(bp)
                  } else {
                    onAddToActive(bp)
                  }
                }}
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
                  onChange={(e) => {
                    setEditName(e.target.value)
                  }}
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
                  onDoubleClick={() => {
                    startEdit(bp)
                  }}
                  className="text-[9px] text-text-muted/60 text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-[72px] cursor-default"
                >
                  {bp.name}
                </span>
              )}

              {/* Delete button on hover */}
              {isHovered && (
                <button
                  aria-label={t('blueprint.delete_blueprint')}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(bp)
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
          <span className="text-[9px] text-text-muted/30">{t('blueprint.add_token')}</span>
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
              onClose={() => {
                setContextMenu(null)
              }}
            />
          )
        })()}

      {/* Tag editor inline panel */}
      {editingTagsId &&
        (() => {
          const asset = blueprintAssets.find((a) => a.id === editingTagsId)
          if (!asset) return null
          // Autocomplete: existing tags not yet on this asset
          const suggestions = availableTags.filter(
            (t) => !asset.tags.includes(t) && t.includes(tagInput),
          )
          return (
            <div
              className="mt-3 p-2.5 bg-surface border border-border-glass rounded-lg"
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-primary font-semibold truncate">
                  {t('blueprint.tag_editor_title', { name: asset.name })}
                </span>
                <button
                  onClick={() => {
                    setEditingTagsId(null)
                  }}
                  className="text-text-muted/40 hover:text-text-primary cursor-pointer"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
              {/* Current tags */}
              <div className="flex flex-wrap gap-1 mb-2">
                {asset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full"
                  >
                    {tag}
                    <button
                      onClick={() => {
                        handleRemoveTag(asset.id, tag)
                      }}
                      className="text-accent/50 hover:text-accent cursor-pointer"
                    >
                      <X size={8} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
                {asset.tags.length === 0 && (
                  <span className="text-[10px] text-text-muted/30 italic">
                    {t('blueprint.no_tags')}
                  </span>
                )}
              </div>
              {/* Add tag input */}
              <div className="flex gap-1">
                <input
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag(asset.id)
                  }}
                  placeholder={t('blueprint.add_tag_placeholder')}
                  className="flex-1 text-[10px] bg-glass text-text-primary border border-border-glass rounded px-1.5 py-1 outline-none placeholder:text-text-muted/30"
                  list={`tag-suggestions-${asset.id}`}
                />
                <datalist id={`tag-suggestions-${asset.id}`}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <button
                  onClick={() => {
                    handleAddTag(asset.id)
                  }}
                  className="text-[10px] text-accent px-1.5 py-1 rounded bg-accent/10 hover:bg-accent/20 cursor-pointer transition-colors duration-fast"
                >
                  {t('blueprint.add_tag')}
                </button>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
