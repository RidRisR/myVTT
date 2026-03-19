import { useState, useMemo, useRef, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { X } from 'lucide-react'
import { PopoverContent } from './primitives/PopoverContent'

const AUTO_TAGS = ['map', 'token', 'portrait']

interface TagEditorPopoverProps {
  tags: string[]
  allKnownTags: string[]
  onTagsChange: (tags: string[]) => void
  children: React.ReactNode
  /** If true, popover opens immediately on mount (for programmatic open) */
  defaultOpen?: boolean
  /** Callback when popover open state changes (for controlled close) */
  onOpenChange?: (open: boolean) => void
}

export function TagEditorPopover({
  tags,
  allKnownTags,
  onTagsChange,
  children,
  defaultOpen,
  onOpenChange,
}: TagEditorPopoverProps) {
  const [input, setInput] = useState('')
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
  const inputRef = useRef<HTMLInputElement>(null)

  const open = internalOpen
  const handleOpenChange = (v: boolean) => {
    setInternalOpen(v)
    onOpenChange?.(v)
  }

  // Filter out auto-tags from display and editing
  const userTags = useMemo(() => tags.filter((t) => !AUTO_TAGS.includes(t)), [tags])
  const autoTagsOnItem = useMemo(() => tags.filter((t) => AUTO_TAGS.includes(t)), [tags])

  // Suggestions: known tags not already on this item, matching input, excluding auto-tags
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    return allKnownTags
      .filter((t) => !AUTO_TAGS.includes(t))
      .filter((t) => !tags.includes(t))
      .filter((t) => !q || t.toLowerCase().includes(q))
  }, [allKnownTags, tags, input])

  const showCreateOption = useMemo(() => {
    const q = input.trim()
    if (!q) return false
    if (AUTO_TAGS.some((t) => t.toLowerCase() === q.toLowerCase())) return false
    return !allKnownTags.some((t) => t.toLowerCase() === q.toLowerCase())
  }, [input, allKnownTags])

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || tags.includes(trimmed) || AUTO_TAGS.includes(trimmed)) return
    onTagsChange([...tags, trimmed])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onTagsChange(autoTagsOnItem.concat(userTags.filter((t) => t !== tag)))
  }

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => {
        clearTimeout(timer)
      }
    }
  }, [open])

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <PopoverContent className="w-64 p-3" sideOffset={8}>
        {/* Current tags as pills */}
        <div className="flex flex-wrap gap-1 mb-2 min-h-[24px]">
          {userTags.length === 0 && (
            <span className="text-[10px] text-text-muted/30 italic leading-6">No tags</span>
          )}
          {userTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full"
            >
              {tag}
              <button
                onClick={() => {
                  removeTag(tag)
                }}
                className="text-accent/50 hover:text-accent cursor-pointer"
              >
                <X size={8} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              addTag(input.trim())
            }
          }}
          placeholder="Type to add tag..."
          className="w-full text-[11px] bg-glass text-text-primary border border-border-glass rounded-md px-2 py-1.5 outline-none placeholder:text-text-muted/30 mb-1"
        />

        {/* Suggestions dropdown */}
        {(suggestions.length > 0 || showCreateOption) && input.trim() && (
          <div className="max-h-32 overflow-y-auto">
            {suggestions.slice(0, 8).map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  addTag(tag)
                }}
                className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-glass text-text-muted hover:text-text-primary cursor-pointer transition-colors duration-fast"
              >
                {tag}
              </button>
            ))}
            {showCreateOption && (
              <button
                onClick={() => {
                  addTag(input.trim())
                }}
                className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-glass text-accent cursor-pointer transition-colors duration-fast"
              >
                + Create &quot;{input.trim()}&quot;
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover.Root>
  )
}
