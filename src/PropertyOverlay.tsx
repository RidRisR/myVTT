import { useState } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'

export function PropertyOverlay() {
  const editor = useEditor()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const hoveredShapeId = useValue(
    'hoveredShapeId',
    () => editor.getHoveredShapeId(),
    [editor]
  )

  const selectedShapeId = useValue(
    'selectedShapeId',
    () => {
      const shapes = editor.getSelectedShapes()
      return shapes.length === 1 ? shapes[0].id : null
    },
    [editor]
  )

  // Prefer selected shape (persistent), fall back to hovered
  const targetId = selectedShapeId ?? hoveredShapeId
  const isSelected = targetId === selectedShapeId && selectedShapeId !== null

  const overlayData = useValue(
    'overlayData',
    () => {
      if (!targetId) return null

      const shape = editor.getShape(targetId)
      if (!shape) return null

      const properties = shape.meta?.properties as
        | { key: string; value: string }[]
        | undefined
      if (!properties || properties.length === 0) return null

      const pageBounds = editor.getShapePageBounds(targetId)
      if (!pageBounds) return null

      const topRight = editor.pageToScreen({
        x: pageBounds.maxX,
        y: pageBounds.minY,
      })

      return { shapeId: targetId, properties, x: topRight.x + 8, y: topRight.y }
    },
    [editor, targetId]
  )

  if (!overlayData) return null

  const updateProperty = (shapeId: TLShapeId, index: number, newValue: string) => {
    const shape = editor.getShape(shapeId)
    if (!shape) return
    const props = [...(shape.meta.properties as { key: string; value: string }[])]
    props[index] = { ...props[index], value: newValue }
    editor.updateShape({
      id: shape.id,
      type: shape.type,
      meta: { ...shape.meta, properties: props },
    })
  }

  const deleteProperty = (shapeId: TLShapeId, index: number) => {
    const shape = editor.getShape(shapeId)
    if (!shape) return
    const props = (shape.meta.properties as { key: string; value: string }[]).filter(
      (_, i) => i !== index
    )
    editor.updateShape({
      id: shape.id,
      type: shape.type,
      meta: { ...shape.meta, properties: props },
    })
    setEditingIndex(null)
  }

  const startEdit = (index: number, value: string) => {
    setEditingIndex(index)
    setEditValue(value)
  }

  const commitEdit = () => {
    if (editingIndex !== null) {
      updateProperty(overlayData.shapeId, editingIndex, editValue)
      setEditingIndex(null)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: overlayData.x,
        top: overlayData.y,
        pointerEvents: isSelected ? 'auto' : 'none',
        zIndex: 99998,
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        fontFamily: 'sans-serif',
        fontSize: 13,
        minWidth: 120,
        maxWidth: 250,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {overlayData.properties.map((prop, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '3px 0',
            borderBottom:
              i < overlayData.properties.length - 1 ? '1px solid #eee' : 'none',
          }}
        >
          <span style={{ fontWeight: 600, color: '#333', flexShrink: 0 }}>
            {prop.key}
          </span>
          <span style={{ flex: 1 }} />
          {editingIndex === i ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditingIndex(null)
              }}
              style={{
                width: 80,
                padding: '1px 4px',
                border: '1px solid #2563eb',
                borderRadius: 4,
                fontSize: 13,
                outline: 'none',
              }}
            />
          ) : (
            <span
              onClick={() => isSelected && startEdit(i, prop.value)}
              style={{
                color: '#666',
                cursor: isSelected ? 'pointer' : 'default',
                borderBottom: isSelected ? '1px dashed #ccc' : 'none',
                padding: '0 2px',
              }}
            >
              {prop.value}
            </span>
          )}
          {isSelected && (
            <span
              onClick={() => deleteProperty(overlayData.shapeId, i)}
              style={{
                color: '#999',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: '0 2px',
              }}
              title="Delete"
            >
              ×
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
