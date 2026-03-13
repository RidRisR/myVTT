import { useEffect, useRef, useState } from 'react'
import type { HandoutAsset } from '../stores/worldStore'

interface HandoutEditModalProps {
  asset: HandoutAsset
  onSave: (id: string, updates: Partial<HandoutAsset>) => void
  onClose: () => void
}

export function HandoutEditModal({ asset, onSave, onClose }: HandoutEditModalProps) {
  const [title, setTitle] = useState(asset.title || '')
  const [description, setDescription] = useState(asset.description || '')
  const panelRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = () => {
    onSave(asset.id, {
      title: title || undefined,
      description: description || undefined,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-modal bg-black/70 flex items-center justify-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div ref={panelRef} className="flex flex-col items-center gap-3 max-w-[70vw]">
        {/* Image — matches FocusedCard layout */}
        <img
          src={asset.imageUrl}
          alt=""
          className="max-w-[55vw] max-h-[50vh] object-contain rounded shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
        />

        {/* Editable title/description — WYSIWYG matching FocusedCard */}
        <div className="text-center max-w-[55vw] w-full">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title..."
            autoFocus
            className="w-full bg-transparent border-none outline-none text-text-primary font-sans text-center text-base font-semibold"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            className="w-full bg-transparent border-none outline-none text-text-primary/70 font-sans text-center text-[13px] leading-normal mt-1 resize-none"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-border-glass rounded-md text-xs font-medium cursor-pointer font-sans bg-surface text-text-primary/70 transition-colors duration-fast hover:bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer font-sans bg-accent text-deep transition-colors duration-fast hover:bg-accent-bold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
