import { useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Loader2, FolderOpen } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { Blueprint } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'
import { ContextMenuContent } from '../ui/primitives/ContextMenuContent'
import { ContextMenuItem } from '../ui/primitives/ContextMenuItem'
import { useToast } from '../ui/useToast'
import { TagFilterBar } from '../ui/TagFilterBar'
import { AssetPickerDialog } from '../asset-picker/AssetPickerDialog'
import { TagEditorPopover } from '../ui/TagEditorPopover'

const AUTO_TAGS = ['map', 'token', 'portrait']

interface TokenDockTabProps {
  onSpawnToken: (bp: Blueprint) => void
  onAddToActive: (bp: Blueprint) => void
  isTactical: boolean
}

export function BlueprintDockTab({ onSpawnToken, onAddToActive, isTactical }: TokenDockTabProps) {
  const { t } = useTranslation('dock')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Read directly from blueprints store
  const blueprints = useWorldStore((s) => s.blueprints)
  const updateBlueprint = useWorldStore((s) => s.updateBlueprint)
  const deleteBlueprintAction = useWorldStore((s) => s.deleteBlueprint)
  const uploadAndCreateBlueprint = useWorldStore((s) => s.uploadAndCreateBlueprint)

  const { toast } = useToast()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await uploadAndCreateBlueprint(file, {
        name: file.name,
        tags: ['token'],
        defaults: { color: '#3b82f6', width: 1, height: 1 },
      })
      toast('success', t('blueprint.uploaded', { name: file.name }))
    } catch (err) {
      toast(
        'error',
        t('blueprint.upload_failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
      )
    } finally {
      setUploading(false)
    }
  }

  // Collect all used tags, excluding auto-tags
  const availableTags = useMemo(() => {
    const used = new Set<string>()
    for (const bp of blueprints) {
      for (const t of bp.tags) {
        if (!AUTO_TAGS.includes(t)) used.add(t)
      }
    }
    return Array.from(used).sort()
  }, [blueprints])

  const allKnownTags = availableTags

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

  return (
    <div>
      <AssetPickerDialog mode="manage" open={managerOpen} onOpenChange={setManagerOpen} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleUpload(e)
        }}
      />

      {/* Tag filter bar — always visible */}
      <div className="mb-2.5">
        <TagFilterBar
          availableTags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          trailing={
            <button
              onClick={() => { setManagerOpen(true); }}
              className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer text-text-muted/40 hover:text-text-muted/60 border border-border-glass/30 transition-colors duration-fast ml-auto"
              title={t('blueprint.manage_assets')}
            >
              <FolderOpen size={12} strokeWidth={1.5} />
            </button>
          }
        />
      </div>

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
          const bpContent = (
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

          if (editingTagsId === bp.id) {
            return (
              <TagEditorPopover
                key={bp.id}
                tags={bp.tags}
                allKnownTags={allKnownTags}
                onTagsChange={(tags) => {
                  void updateBlueprint(bp.id, { tags })
                }}
                defaultOpen
                onOpenChange={(open) => {
                  if (!open) setEditingTagsId(null)
                }}
              >
                {bpContent}
              </TagEditorPopover>
            )
          }

          return bpContent
        })}

        {/* Upload card */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-14 h-14 rounded-full border-2 border-dashed border-border-glass cursor-pointer flex items-center justify-center text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Plus size={22} strokeWidth={1.5} />
            )}
          </button>
          <span className="text-[9px] text-text-muted/30">
            {uploading ? t('blueprint.uploading') : t('blueprint.add_token')}
          </span>
        </div>
      </div>
    </div>
  )
}
