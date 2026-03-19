import { useDraggable } from '@dnd-kit/core'

interface DraggableTagProps {
  tag: string
  selected: boolean
  onClick: () => void
}

export function DraggableTag({ tag, selected, onClick }: DraggableTagProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tag-${tag}`,
    data: { type: 'tag', tag },
  })

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] cursor-grab whitespace-nowrap transition-colors duration-fast ${
        selected ? 'bg-accent text-white' : 'bg-glass text-text-muted hover:text-text-primary'
      } ${isDragging ? 'opacity-50' : ''}`}
      {...listeners}
      {...attributes}
    >
      {tag}
    </button>
  )
}
