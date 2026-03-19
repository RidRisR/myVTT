import { DraggableTag } from '../asset-picker/DraggableTag'

interface DraggableTagBarProps {
  tags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
}

export function DraggableTagBar({ tags, selectedTags, onToggleTag }: DraggableTagBarProps) {
  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 py-1">
      {selectedTags.length > 0 && (
        <button
          className="px-2 py-0.5 text-[10px] rounded-full bg-accent text-white"
          onClick={() => { selectedTags.forEach(onToggleTag); }}
        >
          Clear
        </button>
      )}
      {tags.map((tag) => (
        <DraggableTag
          key={tag}
          tag={tag}
          selected={selectedTags.includes(tag)}
          onClick={() => { onToggleTag(tag); }}
        />
      ))}
    </div>
  )
}
