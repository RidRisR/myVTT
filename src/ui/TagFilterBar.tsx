interface TagFilterBarProps {
  /** All available tags (union of used + preset) */
  availableTags: string[]
  /** Currently selected tags for filtering */
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  /** Optional trailing content (e.g. asset manager button) */
  trailing?: React.ReactNode
}

export function TagFilterBar({ availableTags, selectedTags, onToggleTag, trailing }: TagFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-1 px-1 items-center">
      {availableTags.map((tag) => {
        const isSelected = selectedTags.includes(tag)
        return (
          <button
            key={tag}
            onClick={() => {
              onToggleTag(tag)
            }}
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
  )
}
