import { useEffect, useRef, useState } from 'react'
import type { HandoutAsset } from './useHandoutAssets'

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box',
    textAlign: 'center',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={panelRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          maxWidth: '70vw',
        }}
      >
        {/* Image — matches FocusedCard layout */}
        <img
          src={asset.imageUrl}
          alt=""
          style={{
            maxWidth: '55vw',
            maxHeight: '50vh',
            objectFit: 'contain',
            borderRadius: 4,
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}
        />

        {/* Editable title/description — WYSIWYG matching FocusedCard */}
        <div style={{ textAlign: 'center', maxWidth: '55vw', width: '100%' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title..."
            autoFocus
            style={{
              ...inputStyle,
              fontSize: 16,
              fontWeight: 600,
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            style={{
              ...inputStyle,
              fontSize: 13,
              lineHeight: 1.5,
              marginTop: 4,
              color: 'rgba(255,255,255,0.7)',
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
              resize: 'none',
            }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'sans-serif',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 16px',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'sans-serif',
              background: 'rgba(59,130,246,0.85)',
              color: '#fff',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
