import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDraggable } from '@dnd-kit/core'

// ---------------------------------------------------------------------------
// Pattern: MultiType DnD
//
// Demonstrates multi-type drag-and-drop in a SINGLE DndContext:
//   - Tags: useDraggable — drag onto items to assign
//   - Items: useSortable — drag to reorder + serve as drop targets for tags
//   - DragOverlay: renders different previews per drag type
//   - Batch drop: dropping a tag on a selected item applies to all selected
//
// INTENTIONALLY OMITTED (separate concerns, covered by other patterns):
//   - Rubber-band / lasso selection
//   - ContextMenu / Popover on items (see PatternFloatingPanelOverlay)
//   - Real asset data (colored boxes are sufficient for demonstrating DnD)
// ---------------------------------------------------------------------------

// --- Data model (local state, no stores) ---

interface Item {
  id: string
  label: string
  color: string
  tags: string[]
}

const AVAILABLE_TAGS = ['Fire', 'Water', 'Earth', 'Air']

const INITIAL_ITEMS: Item[] = [
  { id: 'item-1', label: 'Alpha', color: 'bg-red-900/60', tags: [] },
  { id: 'item-2', label: 'Beta', color: 'bg-blue-900/60', tags: [] },
  { id: 'item-3', label: 'Gamma', color: 'bg-green-900/60', tags: [] },
  { id: 'item-4', label: 'Delta', color: 'bg-amber-900/60', tags: [] },
  { id: 'item-5', label: 'Epsilon', color: 'bg-purple-900/60', tags: [] },
  { id: 'item-6', label: 'Zeta', color: 'bg-pink-900/60', tags: [] },
]

// --- Event log entry ---

interface LogEntry {
  id: number
  text: string
}

// --- Main component ---

export default function PatternMultiTypeDnD() {
  return (
    <div>
      <div className="mb-4 p-4 rounded-lg border border-border-glass bg-glass">
        <h2 className="text-sm font-medium mb-2">MultiType DnD</h2>
        <p className="text-xs text-muted leading-relaxed">
          Single <code className="text-accent">DndContext</code> with two drag types: tags (
          <code className="text-accent">useDraggable</code>) and items (
          <code className="text-accent">useSortable</code>). Items serve dual role as sortable
          elements AND drop targets for tag assignment.
        </p>
        <p className="text-xs text-muted mt-2 leading-relaxed">
          Try: drag tags onto items to assign them. Drag items to reorder. Click items to select,
          then drag a tag onto a selected item to batch-assign.
        </p>
      </div>
      <MultiTypeDnDDemo />
    </div>
  )
}

// --- Demo component with all DnD logic ---

function MultiTypeDnDDemo() {
  const [items, setItems] = useState<Item[]>(INITIAL_ITEMS)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [draggedItem, setDraggedItem] = useState<Item | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [logCounter, setLogCounter] = useState(0)

  const sortableIds = useMemo(() => items.map((i) => i.id), [items])

  const addLog = useCallback(
    (text: string) => {
      setLogCounter((c) => c + 1)
      setLog((prev) => [{ id: logCounter + 1, text }, ...prev].slice(0, 5))
    },
    [logCounter],
  )

  // PATTERN: PointerSensor with distance constraint prevents click/drag confusion.
  // Without this, every click would be interpreted as a drag start.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // PATTERN: onDragStart discriminates by data.type to set the correct drag state.
  // This determines what DragOverlay renders and how onDragEnd routes.
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current
      if (data?.type === 'tag') {
        setDraggedTag(data.tag as string)
      } else if (data?.type === 'item') {
        const item = items.find((i) => i.id === (data.itemId as string))
        if (item) setDraggedItem(item)
      }
    },
    [items],
  )

  // PATTERN: onDragEnd routes to different handlers based on active.data.type.
  // Tag drop: assign tag to target (or batch if target is in selection).
  // Item drop: reorder via arrayMove.
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeType = draggedTag ? 'tag' : draggedItem ? 'item' : null

      // Always clear drag state first
      setDraggedTag(null)
      setDraggedItem(null)

      const { active, over } = event
      if (!over) return

      const overData = over.data.current
      const overItemId = ((overData?.itemId as string | undefined) ?? over.id) as string

      if (activeType === 'tag') {
        const tag = active.data.current?.tag as string
        // PATTERN: Batch drop — if the drop target is in the current selection,
        // apply the tag to ALL selected items, not just the target.
        const targetIds = selection.has(overItemId) ? Array.from(selection) : [overItemId]
        let count = 0
        setItems((prev) =>
          prev.map((item) => {
            if (targetIds.includes(item.id) && !item.tags.includes(tag)) {
              count++
              return { ...item, tags: [...item.tags, tag] }
            }
            return item
          }),
        )
        if (count > 0) {
          const target =
            targetIds.length > 1
              ? `${count} items (batch)`
              : (items.find((i) => i.id === overItemId)?.label ?? overItemId)
          addLog(`[tag] "${tag}" → ${target}`)
        }
        return
      }

      if (activeType === 'item' && active.id !== overItemId) {
        setItems((prev) => {
          const oldIndex = prev.findIndex((i) => i.id === active.id)
          const newIndex = prev.findIndex((i) => i.id === overItemId)
          if (oldIndex === -1 || newIndex === -1) return prev
          const movedItem = prev[oldIndex]
          addLog(`[item] "${movedItem?.label}" moved ${oldIndex + 1}→${newIndex + 1}`)
          return arrayMove(prev, oldIndex, newIndex)
        })
      }
    },
    [draggedTag, draggedItem, selection, items, addLog],
  )

  const toggleSelection = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Tag bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <span className="text-[10px] text-muted self-center mr-1">Drag tags →</span>
        {AVAILABLE_TAGS.map((tag) => (
          <DraggableTag key={tag} tag={tag} />
        ))}
      </div>

      {/* Item grid */}
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              isSelected={selection.has(item.id)}
              onToggleSelect={toggleSelection}
            />
          ))}
        </div>
      </SortableContext>

      {/* PATTERN: Single DragOverlay renders different previews per drag type.
          DragOverlay exists globally in the DndContext — it MUST handle every
          draggable type. Missing a type = dragged item disappears during drag. */}
      <DragOverlay>
        {draggedTag ? (
          <span className="px-3 py-1 rounded-full text-[11px] bg-accent text-white shadow-lg">
            {draggedTag}
          </span>
        ) : draggedItem ? (
          <div
            className={`w-16 h-16 rounded-lg ${draggedItem.color} opacity-80 shadow-xl flex items-center justify-center`}
          >
            <span className="text-[10px] text-white font-medium">{draggedItem.label}</span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Event log */}
      <div className="border-t border-border-glass pt-3">
        <p className="text-[10px] text-muted mb-1 font-medium">Event Log</p>
        <div className="space-y-0.5 min-h-[60px]">
          {log.length === 0 ? (
            <p className="text-[10px] text-muted/40">Drag something to see events...</p>
          ) : (
            log.map((entry) => (
              <p key={entry.id} className="text-[10px] text-muted font-mono">
                {entry.text}
              </p>
            ))
          )}
        </div>
      </div>
    </DndContext>
  )
}

// --- DraggableTag: useDraggable source for tag type ---

function DraggableTag({ tag }: { tag: string }) {
  // PATTERN: useDraggable (not useSortable) — tags are drag sources only,
  // they don't participate in sorting. data.type discriminates in onDragEnd.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tag-${tag}`,
    data: { type: 'tag', tag },
  })

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`px-3 py-1 rounded-full text-[11px] border cursor-grab active:cursor-grabbing transition-opacity select-none ${
        isDragging
          ? 'opacity-40 border-accent/40 text-accent/40'
          : 'border-accent/60 text-accent hover:bg-accent/10'
      }`}
    >
      {tag}
    </button>
  )
}

// --- SortableItem: useSortable for dual role (sort + drop target) ---

function SortableItem({
  item,
  isSelected,
  onToggleSelect,
}: {
  item: Item
  isSelected: boolean
  onToggleSelect: (id: string) => void
}) {
  // PATTERN: useSortable provides BOTH sortable behavior AND drop target
  // detection (via isOver). data.type + data.itemId let onDragEnd identify
  // what was dropped and where.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: item.id,
      data: { type: 'item', itemId: item.id },
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        onToggleSelect(item.id)
      }}
      className={`relative w-full aspect-square rounded-lg ${item.color} flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing select-none transition-all duration-fast ${
        isOver
          ? 'ring-2 ring-accent shadow-[0_0_12px_rgba(99,102,241,0.3)]'
          : isSelected
            ? 'ring-2 ring-accent'
            : 'hover:scale-[1.03]'
      }`}
    >
      <span className="text-xs text-white font-medium">{item.label}</span>

      {/* Tag chips */}
      {item.tags.length > 0 && (
        <div className="flex gap-0.5 flex-wrap justify-center px-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="text-[7px] bg-white/20 text-white px-1 py-px rounded-full leading-tight"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded bg-accent text-white flex items-center justify-center text-[8px] font-bold">
          ✓
        </div>
      )}
    </div>
  )
}
