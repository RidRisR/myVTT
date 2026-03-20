import { arrayMove } from '@dnd-kit/sortable'
import { AUTO_TAGS, type AssetMeta } from '../shared/assetTypes'

const REORDER_GAP = 1000

// --- BatchToolbar logic ---

/** Compute tags common to ALL assets (intersection) */
export function computeCommonTags(assets: AssetMeta[]): string[] {
  const first = assets[0]
  if (!first) return []
  const common = new Set(first.tags)
  for (let i = 1; i < assets.length; i++) {
    const asset = assets[i]
    if (!asset) continue
    const tags = new Set(asset.tags)
    for (const tag of common) {
      if (!tags.has(tag)) common.delete(tag)
    }
  }
  return Array.from(common)
}

/** Compute which tags from newTags are not already in existingTags */
export function computeTagsToAdd(existingTags: string[], newTags: string[]): string[] {
  return newTags.filter((tag) => !existingTags.includes(tag))
}

/** Remove specified tags from existing tags */
export function computeTagsAfterRemoval(existingTags: string[], removedTags: string[]): string[] {
  return existingTags.filter((tag) => !removedTags.includes(tag))
}

// --- AssetPickerPanel logic ---

/** 4-stage filter pipeline: mediaType → category → selectedTags → search */
export function filterAssets(
  assets: AssetMeta[],
  opts: { mediaType?: string; category?: string | null; selectedTags?: string[]; search?: string },
): AssetMeta[] {
  let result = assets
  if (opts.mediaType) {
    result = result.filter((a) => a.mediaType === opts.mediaType)
  }
  if (opts.category) {
    const cat = opts.category
    result = result.filter((a) => a.tags.includes(cat))
  }
  if (opts.selectedTags && opts.selectedTags.length > 0) {
    const tags = opts.selectedTags
    result = result.filter((a) => tags.every((tag) => a.tags.includes(tag)))
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase()
    result = result.filter((a) => a.name.toLowerCase().includes(q))
  }
  return result
}

/** Collect all user tags (excluding AUTO_TAGS) from assets */
export function collectUserTags(assets: AssetMeta[]): string[] {
  const tags = new Set<string>()
  for (const a of assets) {
    for (const tag of a.tags) {
      if (!AUTO_TAGS.includes(tag)) tags.add(tag)
    }
  }
  return Array.from(tags).sort()
}

/** Resolve which assets need tag updates after a tag-drop */
export function resolveTagDrop(
  assets: AssetMeta[],
  targetId: string,
  tag: string,
  selection: Set<string>,
): { id: string; tags: string[] }[] {
  const targetIds = selection.has(targetId) ? Array.from(selection) : [targetId]
  const updates: { id: string; tags: string[] }[] = []
  for (const id of targetIds) {
    const asset = assets.find((a) => a.id === id)
    if (asset && !asset.tags.includes(tag)) {
      updates.push({ id, tags: [...asset.tags, tag] })
    }
  }
  return updates
}

/** Compute new sortOrder after reordering */
export function computeReorder(
  assets: AssetMeta[],
  activeId: string,
  overId: string,
): { id: string; sortOrder: number }[] {
  const oldIndex = assets.findIndex((a) => a.id === activeId)
  const newIndex = assets.findIndex((a) => a.id === overId)
  if (oldIndex === -1 || newIndex === -1) return []
  const reordered = arrayMove(assets, oldIndex, newIndex)
  return reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * REORDER_GAP }))
}

// --- TagEditorPopover logic ---

/** Filter out AUTO_TAGS, keeping only user-defined tags */
export function filterUserTags(tags: string[]): string[] {
  return tags.filter((t) => !AUTO_TAGS.includes(t))
}

/** Compute tag suggestions: exclude current tags, exclude AUTO_TAGS, filter by input */
export function computeSuggestions(
  knownTags: string[],
  currentTags: string[],
  input: string,
): string[] {
  const q = input.trim().toLowerCase()
  return knownTags
    .filter((t) => !AUTO_TAGS.includes(t))
    .filter((t) => !currentTags.includes(t))
    .filter((t) => !q || t.toLowerCase().includes(q))
}

/** Whether to show "Create new tag" option */
export function shouldShowCreateOption(input: string, allKnownTags: string[]): boolean {
  const q = input.trim()
  if (!q) return false
  if (AUTO_TAGS.some((t) => t.toLowerCase() === q.toLowerCase())) return false
  return !allKnownTags.some((t) => t.toLowerCase() === q.toLowerCase())
}
