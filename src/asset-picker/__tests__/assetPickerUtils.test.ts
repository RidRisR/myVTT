import type { AssetMeta } from '../../shared/assetTypes'
import {
  computeCommonTags,
  computeTagsToAdd,
  computeTagsAfterRemoval,
  filterAssets,
  collectUserTags,
  resolveTagDrop,
  computeReorder,
  filterUserTags,
  computeSuggestions,
  shouldShowCreateOption,
} from '../assetPickerUtils'

// --- Test helpers ---

function makeAsset(overrides: Partial<AssetMeta> = {}): AssetMeta {
  return {
    id: 'a1',
    url: '/img/a1.png',
    name: 'Asset 1',
    mediaType: 'image',
    tags: [],
    sortOrder: 1000,
    createdAt: Date.now(),
    ...overrides,
  }
}

// =============================================
// BatchToolbar logic (highest risk — batch writes)
// =============================================

describe('computeCommonTags', () => {
  it('returns [] for empty array', () => {
    expect(computeCommonTags([])).toEqual([])
  })

  it('returns all tags for single asset', () => {
    const assets = [makeAsset({ tags: ['a', 'b', 'c'] })]
    expect(computeCommonTags(assets)).toEqual(['a', 'b', 'c'])
  })

  it('returns intersection of two assets', () => {
    const assets = [
      makeAsset({ tags: ['a', 'b', 'c'] }),
      makeAsset({ id: 'a2', tags: ['b', 'c', 'd'] }),
    ]
    expect(computeCommonTags(assets).sort()).toEqual(['b', 'c'])
  })

  it('returns [] when tags are completely different', () => {
    const assets = [makeAsset({ tags: ['a', 'b'] }), makeAsset({ id: 'a2', tags: ['c', 'd'] })]
    expect(computeCommonTags(assets)).toEqual([])
  })

  it('returns [] when one asset has empty tags', () => {
    const assets = [makeAsset({ tags: ['a', 'b'] }), makeAsset({ id: 'a2', tags: [] })]
    expect(computeCommonTags(assets)).toEqual([])
  })

  it('handles three assets correctly', () => {
    const assets = [
      makeAsset({ tags: ['a', 'b', 'c'] }),
      makeAsset({ id: 'a2', tags: ['b', 'c', 'd'] }),
      makeAsset({ id: 'a3', tags: ['c', 'd', 'e'] }),
    ]
    expect(computeCommonTags(assets)).toEqual(['c'])
  })
})

describe('computeTagsToAdd', () => {
  it('returns all when none exist', () => {
    expect(computeTagsToAdd([], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('returns [] when all already exist', () => {
    expect(computeTagsToAdd(['a', 'b'], ['a', 'b'])).toEqual([])
  })

  it('returns only new tags', () => {
    expect(computeTagsToAdd(['a', 'b'], ['b', 'c'])).toEqual(['c'])
  })
})

describe('computeTagsAfterRemoval', () => {
  it('removes specified tags', () => {
    expect(computeTagsAfterRemoval(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('returns original when removing non-existent tags', () => {
    expect(computeTagsAfterRemoval(['a', 'b'], ['x', 'y'])).toEqual(['a', 'b'])
  })

  it('returns [] when removing all', () => {
    expect(computeTagsAfterRemoval(['a', 'b'], ['a', 'b'])).toEqual([])
  })
})

// =============================================
// AssetPickerPanel filter pipeline
// =============================================

describe('filterAssets', () => {
  const assets = [
    makeAsset({ id: '1', name: 'Dragon Map', mediaType: 'image', tags: ['map', 'fantasy'] }),
    makeAsset({ id: '2', name: 'Goblin Token', mediaType: 'image', tags: ['token', 'fantasy'] }),
    makeAsset({ id: '3', name: 'Rules Doc', mediaType: 'handout', tags: ['rules'] }),
    makeAsset({ id: '4', name: 'Cave Map', mediaType: 'image', tags: ['map', 'dark', 'fantasy'] }),
  ]

  it('returns all with empty options', () => {
    expect(filterAssets(assets, {})).toEqual(assets)
  })

  it('filters by mediaType', () => {
    const result = filterAssets(assets, { mediaType: 'handout' })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('3')
  })

  it('filters by category (tag inclusion)', () => {
    const result = filterAssets(assets, { category: 'map' })
    expect(result).toHaveLength(2)
    expect(result.map((a) => a.id)).toEqual(['1', '4'])
  })

  it('selectedTags uses AND semantics', () => {
    const result = filterAssets(assets, { selectedTags: ['fantasy', 'dark'] })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('4')
  })

  it('search is case-insensitive', () => {
    const result = filterAssets(assets, { search: 'dragon' })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('1')
  })

  it('search with whitespace is trimmed', () => {
    const result = filterAssets(assets, { search: '  cave  ' })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('4')
  })

  it('combines multiple filters', () => {
    const result = filterAssets(assets, {
      mediaType: 'image',
      category: 'map',
      selectedTags: ['fantasy'],
      search: 'cave',
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('4')
  })

  it('empty search string does not filter', () => {
    expect(filterAssets(assets, { search: '   ' })).toEqual(assets)
  })

  it('null category does not filter', () => {
    expect(filterAssets(assets, { category: null })).toEqual(assets)
  })
})

describe('collectUserTags', () => {
  it('excludes AUTO_TAGS (map, token, portrait)', () => {
    const assets = [
      makeAsset({ tags: ['map', 'fantasy', 'dark'] }),
      makeAsset({ id: 'a2', tags: ['token', 'goblin'] }),
      makeAsset({ id: 'a3', tags: ['portrait', 'npc'] }),
    ]
    const result = collectUserTags(assets)
    expect(result).not.toContain('map')
    expect(result).not.toContain('token')
    expect(result).not.toContain('portrait')
    expect(result).toEqual(['dark', 'fantasy', 'goblin', 'npc'])
  })

  it('returns sorted, deduplicated tags', () => {
    const assets = [makeAsset({ tags: ['b', 'a'] }), makeAsset({ id: 'a2', tags: ['a', 'c'] })]
    expect(collectUserTags(assets)).toEqual(['a', 'b', 'c'])
  })

  it('returns [] for empty assets', () => {
    expect(collectUserTags([])).toEqual([])
  })
})

// =============================================
// Tag drag-and-drop (implicit batch operation)
// =============================================

describe('resolveTagDrop', () => {
  const assets = [
    makeAsset({ id: '1', tags: ['a'] }),
    makeAsset({ id: '2', tags: ['b'] }),
    makeAsset({ id: '3', tags: ['a', 'c'] }),
  ]

  it('updates only target when not in selection', () => {
    const updates = resolveTagDrop(assets, '1', 'new-tag', new Set())
    expect(updates).toEqual([{ id: '1', tags: ['a', 'new-tag'] }])
  })

  it('updates all selected when target is in selection', () => {
    const updates = resolveTagDrop(assets, '1', 'new-tag', new Set(['1', '2']))
    expect(updates).toHaveLength(2)
    expect(updates.find((u) => u.id === '1')!.tags).toEqual(['a', 'new-tag'])
    expect(updates.find((u) => u.id === '2')!.tags).toEqual(['b', 'new-tag'])
  })

  it('skips assets that already have the tag', () => {
    const updates = resolveTagDrop(assets, '1', 'a', new Set(['1', '2']))
    // asset 1 already has 'a', so only asset 2 gets updated
    expect(updates).toHaveLength(1)
    expect(updates[0]!.id).toBe('2')
  })

  it('returns [] when all selected already have the tag', () => {
    const updates = resolveTagDrop(assets, '3', 'a', new Set(['3']))
    expect(updates).toEqual([])
  })

  it('returns [] for unknown target id', () => {
    const updates = resolveTagDrop(assets, 'unknown', 'tag', new Set())
    expect(updates).toEqual([])
  })
})

describe('computeReorder', () => {
  const assets = [
    makeAsset({ id: '1', sortOrder: 1000 }),
    makeAsset({ id: '2', sortOrder: 2000 }),
    makeAsset({ id: '3', sortOrder: 3000 }),
  ]

  it('moves item and computes new sortOrder', () => {
    // Move item 1 to position of item 3
    const order = computeReorder(assets, '1', '3')
    expect(order).toHaveLength(3)
    // After move: [2, 3, 1]
    expect(order[0]).toEqual({ id: '2', sortOrder: 1000 })
    expect(order[1]).toEqual({ id: '3', sortOrder: 2000 })
    expect(order[2]).toEqual({ id: '1', sortOrder: 3000 })
  })

  it('returns [] when activeId not found', () => {
    expect(computeReorder(assets, 'unknown', '1')).toEqual([])
  })

  it('returns [] when overId not found', () => {
    expect(computeReorder(assets, '1', 'unknown')).toEqual([])
  })
})

// =============================================
// TagEditorPopover logic
// =============================================

describe('filterUserTags', () => {
  it('removes AUTO_TAGS', () => {
    expect(filterUserTags(['map', 'token', 'portrait', 'custom'])).toEqual(['custom'])
  })

  it('returns [] for only auto tags', () => {
    expect(filterUserTags(['map', 'token'])).toEqual([])
  })

  it('returns all for no auto tags', () => {
    expect(filterUserTags(['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('computeSuggestions', () => {
  const knownTags = ['map', 'token', 'fantasy', 'dark', 'forest']

  it('excludes AUTO_TAGS and current tags', () => {
    const result = computeSuggestions(knownTags, ['fantasy'], '')
    expect(result).not.toContain('map')
    expect(result).not.toContain('token')
    expect(result).not.toContain('fantasy')
    expect(result).toEqual(['dark', 'forest'])
  })

  it('filters by input (case-insensitive)', () => {
    const result = computeSuggestions(knownTags, [], 'FAn')
    expect(result).toEqual(['fantasy'])
  })

  it('returns all non-auto non-current when input is empty', () => {
    const result = computeSuggestions(knownTags, [], '')
    expect(result).toEqual(['fantasy', 'dark', 'forest'])
  })

  it('returns [] when all tags are excluded', () => {
    const result = computeSuggestions(['map', 'token'], [], '')
    expect(result).toEqual([])
  })
})

describe('shouldShowCreateOption', () => {
  const knownTags = ['fantasy', 'dark', 'forest']

  it('returns false for empty input', () => {
    expect(shouldShowCreateOption('', knownTags)).toBe(false)
  })

  it('returns false for whitespace-only input', () => {
    expect(shouldShowCreateOption('   ', knownTags)).toBe(false)
  })

  it('returns false when input matches known tag (case-insensitive)', () => {
    expect(shouldShowCreateOption('Fantasy', knownTags)).toBe(false)
    expect(shouldShowCreateOption('DARK', knownTags)).toBe(false)
  })

  it('returns false when input is an AUTO_TAG', () => {
    expect(shouldShowCreateOption('map', [])).toBe(false)
    expect(shouldShowCreateOption('Token', [])).toBe(false)
    expect(shouldShowCreateOption('PORTRAIT', [])).toBe(false)
  })

  it('returns true for genuinely new tag', () => {
    expect(shouldShowCreateOption('sci-fi', knownTags)).toBe(true)
  })
})
