import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, CircleDot } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { Blueprint } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'
import { ContextMenuContent } from '../ui/primitives/ContextMenuContent'
import { ContextMenuItem } from '../ui/primitives/ContextMenuItem'
import { useToast } from '../ui/useToast'
import { TagFilterBar } from '../ui/TagFilterBar'
import { AssetPickerDialog } from '../asset-picker/AssetPickerDialog'

const PRESET_TAGS = ['Humanoid', 'Beast', 'Magical', 'Undead', 'Object']

interface TokenDockTabProps {
  onSpawnToken: (bp: Blueprint) => void
  onAddToActive: (bp: Blueprint) => void
  isTactical: boolean
}

export function BlueprintDockTab({ onSpawnToken, onAddToActive, isTactical }: TokenDockTabProps) {
  const { t } = useTranslation('dock')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Read directly from blueprints store
  const blueprints = useWorldStore((s) => s.blueprints)
  const createBlueprint = useWorldStore((s) => s.createBlueprint)
  const updateBlueprint = useWorldStore((s) => s.updateBlueprint)
  const deleteBlueprintAction = useWorldStore((s) => s.deleteBlueprint)

  const { toast } = useToast()

  // Collect all used tags + merge with presets
  const availableTags = useMemo(() => {
    const used = new Set<string>()
    for (const bp of blueprints) {
      for (const t of bp.tags) used.add(t)
    }
    // Add presets that aren't already used
    for (const t of PRESET_TAGS) used.add(t)
    return Array.from(used)
  }, [blueprints])

  // Filter by selected tags (AND logic)
  const filteredBlueprints = useMemo(() => {
    if (selectedTags.length === 0) return blueprints
    return blueprints.filter((bp) => selectedTags.every((t) => bp.tags.includes(t)))
  }, [blueprints, selectedTags])

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleDelete = (bp: Blueprint) => {
    void deleteBlueprintAction(bp.id)
    toast('info', t('blueprint.deleted', { name: bp.name }))
  }

  const startEdit = (bp: Blueprint) => {
    setEditingId(bp.id)
    setEditName(bp.name)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      void updateBlueprint(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  const [editingTagsId, setEditingTagsId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  const handleAddTag = (bpId: string) => {
    const tag = tagInput.trim()
    if (!tag) return
    const bp = blueprints.find((b) => b.id === bpId)
    if (!bp) return
    if (bp.tags.includes(tag)) {
      setTagInput('')
      return
    }
    void updateBlueprint(bpId, { tags: [...bp.tags, tag] })
    setTagInput('')
  }

  const handleRemoveTag = (bpId: string, tag: string) => {
    const bp = blueprints.find((b) => b.id === bpId)
    if (!bp) return
    void updateBlueprint(bpId, { tags: bp.tags.filter((t) => t !== tag) })
  }

  return (
    <div>
      <AssetPickerDialog
        mode="select"
        filter={{ mediaType: 'image' }}
        autoTags={['token']}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(asset) => {
          void createBlueprint({
            name: asset.name,
            imageUrl: asset.url,
            defaults: { color: '#3b82f6', width: 1, height: 1 },
          })
        }}
      />

      {/* Tag filter bar */}
      {blueprints.length > 0 && (
        <div className="mb-2.5">
          <TagFilterBar
            availableTags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
          />
        </div>
      )}

      {filteredBlueprints.length === 0 && blueprints.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <CircleDot size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">{t('blueprint.empty')}</p>
          <p className="text-text-muted/50 text-xs">{t('blueprint.upload_hint')}</p>
        </div>
      )}

      {filteredBlueprints.length === 0 && blueprints.length > 0 && (
        <div className="text-center text-text-muted/40 text-xs py-6">{t('blueprint.no_match')}</div>
      )}

      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '12px',
          paddingBottom: '4px',
        }}
      >
        {filteredBlueprints.map((bp) => {
          const isHovered = hoveredId === bp.id
          return (
            <ContextMenu.Root key={bp.id}>
              <ContextMenu.Trigger asChild>
                <div
                  className="flex flex-col items-center gap-1 relative"
                  onMouseEnter={() => {
                    setHoveredId(bp.id)
                  }}
                  onMouseLeave={() => {
                    setHoveredId(null)
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
                      border: `3px solid ${bp.defaults.color}`,
                      boxShadow: isHovered ? `0 0 12px ${bp.defaults.color}44` : 'none',
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
              </ContextMenu.Trigger>

              <ContextMenuContent>
                {isTactical && (
                  <ContextMenuItem
                    data-testid="ctx-spawn-on-map"
                    onSelect={() => {
                      onSpawnToken(bp)
                    }}
                  >
                    {t('blueprint.spawn_on_map')}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  data-testid="ctx-add-as-npc"
                  onSelect={() => {
                    onAddToActive(bp)
                  }}
                >
                  {t('blueprint.add_as_npc')}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    setEditingTagsId(bp.id)
                    setTagInput('')
                  }}
                >
                  {t('blueprint.edit_tags')}
                </ContextMenuItem>
                <ContextMenuItem
                  data-testid="ctx-delete-blueprint"
                  variant="danger"
                  onSelect={() => {
                    handleDelete(bp)
                  }}
                >
                  {t('blueprint.delete_blueprint')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu.Root>
          )
        })}

        {/* Upload card */}
        <div className="flex flex-col items-center gap-1">
          <div
            onClick={() => {
              setPickerOpen(true)
            }}
            className="w-14 h-14 rounded-full border-2 border-dashed border-border-glass cursor-pointer flex items-center justify-center text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50"
          >
            <Plus size={22} strokeWidth={1.5} />
          </div>
          <span className="text-[9px] text-text-muted/30">{t('blueprint.add_token')}</span>
        </div>
      </div>

      {/* Tag editor inline panel */}
      {editingTagsId &&
        (() => {
          const bp = blueprints.find((b) => b.id === editingTagsId)
          if (!bp) return null
          // Autocomplete: existing tags not yet on this blueprint
          const suggestions = availableTags.filter(
            (t) => !bp.tags.includes(t) && t.includes(tagInput),
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
                  {t('blueprint.tag_editor_title', { name: bp.name })}
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
                {bp.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full"
                  >
                    {tag}
                    <button
                      onClick={() => {
                        handleRemoveTag(bp.id, tag)
                      }}
                      className="text-accent/50 hover:text-accent cursor-pointer"
                    >
                      <X size={8} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
                {bp.tags.length === 0 && (
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
                    if (e.key === 'Enter') handleAddTag(bp.id)
                  }}
                  placeholder={t('blueprint.add_tag_placeholder')}
                  className="flex-1 text-[10px] bg-glass text-text-primary border border-border-glass rounded px-1.5 py-1 outline-none placeholder:text-text-muted/30"
                  list={`tag-suggestions-${bp.id}`}
                />
                <datalist id={`tag-suggestions-${bp.id}`}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <button
                  onClick={() => {
                    handleAddTag(bp.id)
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
