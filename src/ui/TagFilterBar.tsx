import { useTranslation } from 'react-i18next'

interface TagFilterBarProps {
  /** All available user tags (auto-tags already excluded by caller) */
  availableTags: string[]
  /** Currently selected tags for AND filtering */
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  /** Optional trailing content (e.g. asset manager button) */
  trailing?: React.ReactNode

  // ── Category tab layer (optional) ──
  /** Category options, e.g. ['map', 'token']. Omit to hide category tabs. */
  categories?: string[]
  /** Currently active category, or null/undefined for "All" */
  activeCategory?: string | null
  onCategoryChange?: (category: string | null) => void
}

export function TagFilterBar({
  availableTags,
  selectedTags,
  onToggleTag,
  trailing,
  categories,
  activeCategory,
  onCategoryChange,
}: TagFilterBarProps) {
  const { t } = useTranslation('dock')

  return (
    <div className="flex flex-col gap-1.5">
      {/* Top layer: category tabs (only if categories provided) */}
      {categories && categories.length > 0 && onCategoryChange && (
        <div className="flex gap-3 border-b border-border-glass/20 px-1">
          <button
            onClick={() => { onCategoryChange(null); }}
            className={`text-[11px] pb-1.5 cursor-pointer transition-colors duration-fast ${
              activeCategory === null
                ? 'text-text-primary border-b-2 border-accent -mb-px'
                : 'text-text-muted/50 hover:text-text-muted/70'
            }`}
          >
            {t('asset.all', 'All')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => { onCategoryChange(cat); }}
              className={`text-[11px] pb-1.5 cursor-pointer transition-colors duration-fast capitalize ${
                activeCategory === cat
                  ? 'text-text-primary border-b-2 border-accent -mb-px'
                  : 'text-text-muted/50 hover:text-text-muted/70'
              }`}
            >
              {t(`asset.category_${cat}`, `${cat}s`)}
            </button>
          ))}
        </div>
      )}

      {/* Bottom layer: tag pills */}
      <div className="flex flex-wrap gap-1 px-1 items-center">
        {selectedTags.length > 0 && (
          <button
            onClick={() => {
              // Clear all selected tags
              for (const tag of selectedTags) onToggleTag(tag)
            }}
            className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors duration-fast bg-accent text-white"
          >
            {t('asset.all', 'All')}
          </button>
        )}
        {availableTags.map((tag) => {
          const isSelected = selectedTags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => { onToggleTag(tag); }}
              className={`text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors duration-fast ${
                isSelected
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'text-text-muted/40 hover:text-text-muted/60 border border-border-glass/30'
              }`}
            >
              {tag}
            </button>
          )
        })}
        {trailing}
      </div>
    </div>
  )
}
