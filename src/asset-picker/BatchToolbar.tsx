import { useState, useMemo } from 'react'
import { Loader2, Plus, Minus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorldStore } from '../stores/worldStore'
import { useToast } from '../ui/useToast'
import { TagEditorPopover } from '../ui/TagEditorPopover'
import type { AssetMeta } from '../shared/assetTypes'

interface BatchToolbarProps {
  selection: Set<string>
  assets: AssetMeta[]
  allKnownTags: string[]
  onClearSelection: () => void
}

export function BatchToolbar({
  selection,
  assets,
  allKnownTags,
  onClearSelection,
}: BatchToolbarProps) {
  const { t } = useTranslation('dock')
  const { toast } = useToast()
  const updateAsset = useWorldStore((s) => s.updateAsset)
  const removeAsset = useWorldStore((s) => s.removeAsset)
  const [loading, setLoading] = useState(false)

  const selectedAssets = useMemo(
    () => assets.filter((a) => selection.has(a.id)),
    [assets, selection],
  )

  // Tags common to ALL selected assets (for remove display)
  const commonTags = useMemo(() => {
    const firstAsset = selectedAssets[0]
    if (!firstAsset) return []
    const first = new Set(firstAsset.tags)
    for (let i = 1; i < selectedAssets.length; i++) {
      const tags = new Set(selectedAssets[i]!.tags)
      for (const tag of first) {
        if (!tags.has(tag)) first.delete(tag)
      }
    }
    return Array.from(first)
  }, [selectedAssets])

  const handleAddTags = async (newTags: string[]) => {
    // Find tags that were added compared to empty initial state
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        selectedAssets.map((asset) => {
          const tagsToAdd = newTags.filter((tag) => !asset.tags.includes(tag))
          if (tagsToAdd.length === 0) return Promise.resolve()
          return updateAsset(asset.id, { tags: [...asset.tags, ...tagsToAdd] })
        }),
      )
      const failures = results.filter((r) => r.status === 'rejected')
      if (failures.length > 0) {
        console.error('Batch add tags failures:', failures)
        toast('error', t('asset.batch_error', 'Some operations failed'))
      }
    } catch (err) {
      console.error('Batch add tags error:', err)
      toast('error', t('asset.batch_error', 'Some operations failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTags = async (remainingTags: string[]) => {
    // Tags that were removed = commonTags minus remainingTags
    const removedTags = commonTags.filter((tag) => !remainingTags.includes(tag))
    if (removedTags.length === 0) return

    setLoading(true)
    try {
      const results = await Promise.allSettled(
        selectedAssets.map((asset) => {
          const newTags = asset.tags.filter((tag) => !removedTags.includes(tag))
          return updateAsset(asset.id, { tags: newTags })
        }),
      )
      const failures = results.filter((r) => r.status === 'rejected')
      if (failures.length > 0) {
        console.error('Batch remove tags failures:', failures)
        toast('error', t('asset.batch_error', 'Some operations failed'))
      }
    } catch (err) {
      console.error('Batch remove tags error:', err)
      toast('error', t('asset.batch_error', 'Some operations failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = confirm(
      t('asset.batch_delete_confirm', `Delete ${selection.size} items?`),
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const results = await Promise.allSettled(
        Array.from(selection).map((id) => removeAsset(id)),
      )
      const failures = results.filter((r) => r.status === 'rejected')
      if (failures.length > 0) {
        console.error('Batch delete failures:', failures)
        toast('error', t('asset.batch_error', 'Some operations failed'))
      }
      onClearSelection()
    } catch (err) {
      console.error('Batch delete error:', err)
      toast('error', t('asset.batch_error', 'Some operations failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-5 py-3 border-t border-border-glass/30 shrink-0">
      {loading && <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-text-muted" />}

      <span className="text-xs text-text-muted">
        {t('asset.batch_selected', { count: selection.size, defaultValue: `Selected ${selection.size} items` })}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Add Tags */}
        <TagEditorPopover
          tags={[]}
          allKnownTags={allKnownTags}
          onTagsChange={(tags) => void handleAddTags(tags)}
        >
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-glass text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <Plus size={12} strokeWidth={1.5} />
            {t('asset.batch_add_tags', 'Add Tags')}
          </button>
        </TagEditorPopover>

        {/* Remove Tags */}
        <TagEditorPopover
          tags={commonTags}
          allKnownTags={allKnownTags}
          onTagsChange={(tags) => void handleRemoveTags(tags)}
        >
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-glass text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <Minus size={12} strokeWidth={1.5} />
            {t('asset.batch_remove_tags', 'Remove Tags')}
          </button>
        </TagEditorPopover>

        {/* Delete */}
        <button
          onClick={() => void handleDelete()}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-glass text-danger hover:text-danger/80 transition-colors cursor-pointer"
        >
          <Trash2 size={12} strokeWidth={1.5} />
          {t('asset.batch_delete', 'Delete')}
        </button>

        {/* Clear selection */}
        <button
          onClick={onClearSelection}
          className="px-2 py-1 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          {t('asset.batch_clear', 'Clear')}
        </button>
      </div>
    </div>
  )
}
