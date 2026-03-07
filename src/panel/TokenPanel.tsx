import { useRef, useState } from 'react'
import { useValue, type Editor, type JsonValue } from 'tldraw'
import { readPinModes } from './tokenUtils'
import { adjustNumericValue } from './panelUtils'
import { useHoldRepeat } from './useHoldRepeat'
import { useDraggable } from './useDraggable'

const BAR_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899']

function EyeIcon({ mode, size = 14 }: { mode: 'hidden' | 'hover' | 'always'; size?: number }) {
  // hidden = gray + slash, hover = gray open, always = orange open
  const color = mode === 'always' ? '#f59e0b' : '#aaa'
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path
        d="M1 8 Q4 3 8 3 Q12 3 15 8 Q12 13 8 13 Q4 13 1 8 Z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      <circle
        cx="8" cy="8" r="2"
        fill={mode === 'hidden' ? 'none' : color}
        stroke={color}
        strokeWidth="1.2"
      />
      {mode === 'hidden' && (
        <line x1="3" y1="13" x2="13" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

interface TokenPanelProps {
  editor: Editor
}

export function TokenPanel({ editor }: TokenPanelProps) {
  const { pos, dragRef, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggable({ x: window.innerWidth - 320, y: 60 })
  const [isOpen, setIsOpen] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const [colorPickerKey, setColorPickerKey] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  // Hold-to-repeat: ref tracks which property is being held
  const holdTargetRef = useRef<{ index: number; delta: number }>({ index: 0, delta: 1 })

  const { holdStart: rawHoldStart, holdStop } = useHoldRepeat((count) => {
    const { index, delta } = holdTargetRef.current
    const shapes = editor.getSelectedShapes()
    const shape = shapes.length === 1 ? shapes[0] : null
    if (!shape) return
    const props = (shape.meta?.properties as { key: string; value: string }[]) ?? []
    if (index >= props.length) return
    const actualDelta = count > 15 ? delta * 5 : delta
    const updated = [...props]
    updated[index] = { ...updated[index], value: adjustNumericValue(props[index].value, actualDelta) }
    editor.updateShape({
      id: shape.id,
      type: shape.type,
      meta: { ...shape.meta, properties: updated },
    })
  })

  const holdStart = (index: number, delta: number) => {
    holdTargetRef.current = { index, delta }
    rawHoldStart()
  }

  const selectedShape = useValue('selectedShape', () => {
    const shapes = editor.getSelectedShapes()
    return shapes.length === 1 ? shapes[0] : null
  }, [editor])

  const tokenName = (selectedShape?.meta?.name as string) ?? ''
  const nameDisplay = (selectedShape?.meta?.nameDisplay as string) ?? 'hidden'
  const properties = (selectedShape?.meta?.properties as { key: string; value: string }[]) ?? []
  const pinModes = readPinModes(selectedShape?.meta?.pinnedProps)
  const propColors = (selectedShape?.meta?.propColors as Record<string, string>) ?? {}

  const updateMeta = (meta: Record<string, unknown>) => {
    if (!selectedShape) return
    editor.updateShape({
      id: selectedShape.id,
      type: selectedShape.type,
      meta: { ...selectedShape.meta, ...meta } as Record<string, JsonValue>,
    })
  }

  const handleAddProperty = () => {
    if (!newKey.trim()) return
    const key = newKey.trim()
    updateMeta({
      properties: [...properties, { key, value: newValue.trim() }],
      pinnedProps: { ...pinModes, [key]: 'always' as const },
    })
    setNewKey('')
    setNewValue('')
  }

  const handleDeleteProperty = (index: number) => {
    updateMeta({ properties: properties.filter((_, i) => i !== index) })
    if (editingIndex === index) setEditingIndex(null)
  }

  const startEdit = (index: number) => {
    setEditingIndex(index)
    setEditKey(properties[index].key)
    setEditValue(properties[index].value)
  }

  const commitEdit = () => {
    if (editingIndex === null) return
    const updated = [...properties]
    updated[editingIndex] = { key: editKey.trim() || updated[editingIndex].key, value: editValue }
    updateMeta({ properties: updated })
    setEditingIndex(null)
  }

  // Collapsed button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', left: pos.x, top: pos.y,
          zIndex: 99999, padding: '8px 16px',
          background: '#2563eb', color: '#fff', border: 'none',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'sans-serif',
          fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        Token
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', left: pos.x, top: pos.y,
        zIndex: 99999, width: 280,
        background: '#fff', borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        fontFamily: 'sans-serif', fontSize: 13,
        userSelect: 'none',
      }}
    >
      {/* Header — drag handle */}
      <div
        style={{
          padding: '10px 16px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: dragRef.current ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Token</span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#666', padding: '0 4px',
          }}
        >
          x
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px' }}>
        {!selectedShape && (
          <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>
            Select a shape
          </div>
        )}

        {selectedShape && (
          <>
            {/* Token Name + Display Mode */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 2 }}>
                Name
              </label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  value={tokenName}
                  onChange={(e) => updateMeta({ name: e.target.value })}
                  placeholder="Unnamed"
                  style={{
                    flex: 1, padding: '6px 10px', border: '1px solid #ddd',
                    borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => {
                    const next = nameDisplay === 'hidden' ? 'hover'
                      : nameDisplay === 'hover' ? 'always' : 'hidden'
                    updateMeta({ nameDisplay: next })
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '2px 4px', lineHeight: 1, display: 'flex', alignItems: 'center',
                  }}
                  title={
                    nameDisplay === 'hidden' ? 'Name hidden (click: hover)'
                      : nameDisplay === 'hover' ? 'Name on hover (click: always)'
                      : 'Name always shown (click: hidden)'
                  }
                >
                  <EyeIcon mode={nameDisplay as 'hidden' | 'hover' | 'always'} />
                </button>
              </div>
            </div>

            {/* Properties List */}
            <div
              style={{ marginBottom: 8, position: 'relative' }}
              onPointerMove={(e) => {
                if (dragIndex === null) return
                let closest = 0
                let minDist = Infinity
                for (let j = 0; j <= properties.length; j++) {
                  let y: number
                  if (j < properties.length && rowRefs.current[j]) {
                    y = rowRefs.current[j]!.getBoundingClientRect().top
                  } else if (j > 0 && rowRefs.current[j - 1]) {
                    const r = rowRefs.current[j - 1]!.getBoundingClientRect()
                    y = r.bottom
                  } else continue
                  const dist = Math.abs(e.clientY - y)
                  if (dist < minDist) { minDist = dist; closest = j }
                }
                setDropIndex(closest)
              }}
              onPointerUp={() => {
                if (dragIndex !== null && dropIndex !== null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1) {
                  const reordered = [...properties]
                  const [item] = reordered.splice(dragIndex, 1)
                  const insertAt = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
                  reordered.splice(insertAt, 0, item)
                  updateMeta({ properties: reordered })
                }
                setDragIndex(null)
                setDropIndex(null)
              }}
            >
              <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>
                Properties
              </label>
              {properties.map((prop, i) => {
                const pinMode = pinModes[prop.key]
                const curColor = propColors[prop.key]
                return (
                <div key={i}>
                  {/* Drop indicator line */}
                  {dragIndex !== null && dropIndex === i && dropIndex !== dragIndex && dropIndex !== dragIndex + 1 && (
                    <div style={{ height: 2, background: '#2563eb', borderRadius: 1, margin: '0 4px' }} />
                  )}
                  <div
                    ref={(el) => { rowRefs.current[i] = el }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 0', borderBottom: '1px solid #f3f4f6',
                      opacity: dragIndex === i ? 0.4 : 1,
                    }}
                  >
                  {/* Drag handle */}
                  <span
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
                      setDragIndex(i)
                    }}
                    style={{
                      cursor: dragIndex === i ? 'grabbing' : 'grab',
                      color: '#ccc', fontSize: 10, lineHeight: 1,
                      padding: '0 1px', flexShrink: 0, userSelect: 'none',
                      letterSpacing: 1,
                    }}
                    title="Drag to reorder"
                  >⋮⋮</span>
                  {/* Visibility eye (left) */}
                  <button
                    onClick={() => {
                      const newModes = { ...pinModes }
                      if (!pinMode) {
                        newModes[prop.key] = 'hover'
                      } else if (pinMode === 'hover') {
                        newModes[prop.key] = 'always'
                      } else {
                        delete newModes[prop.key]
                      }
                      updateMeta({ pinnedProps: newModes })
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0 1px', lineHeight: 1, display: 'flex', alignItems: 'center',
                      flexShrink: 0,
                    }}
                    title={
                      !pinMode ? 'Hidden (click: show on hover)'
                        : pinMode === 'hover' ? 'Show on hover (click: always)'
                        : 'Always shown (click: hide)'
                    }
                  >
                    <EyeIcon mode={pinMode ?? 'hidden'} size={13} />
                  </button>
                  {editingIndex === i ? (
                    <div
                      style={{ display: 'flex', gap: 4, flex: 1 }}
                      onBlur={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return
                        commitEdit()
                      }}
                    >
                      <input
                        autoFocus
                        value={editKey}
                        onChange={(e) => setEditKey(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIndex(null) }}
                        style={{
                          width: 80, padding: '2px 6px', border: '1px solid #2563eb',
                          borderRadius: 4, fontSize: 12,
                        }}
                      />
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIndex(null) }}
                        style={{
                          flex: 1, padding: '2px 6px', border: '1px solid #2563eb',
                          borderRadius: 4, fontSize: 12,
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <span
                        onClick={() => startEdit(i)}
                        style={{ fontWeight: 600, color: '#333', cursor: 'pointer', minWidth: 50 }}
                      >
                        {prop.key}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        gap: 2, minWidth: 110,
                      }}>
                        {/^\d+(\/\d+)?$/.test(prop.value) && (
                          <>
                            <button
                              onPointerDown={() => holdStart(i, -1)}
                              onPointerUp={holdStop}
                              onPointerLeave={holdStop}
                              style={{
                                background: 'none', border: '1px solid #ddd', borderRadius: 3,
                                cursor: 'pointer', width: 18, height: 18, padding: 0,
                                fontSize: 12, lineHeight: 1, color: '#666', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                              title="−1 (hold to repeat)"
                            >−</button>
                            <button
                              onPointerDown={() => holdStart(i, 1)}
                              onPointerUp={holdStop}
                              onPointerLeave={holdStop}
                              style={{
                                background: 'none', border: '1px solid #ddd', borderRadius: 3,
                                cursor: 'pointer', width: 18, height: 18, padding: 0,
                                fontSize: 12, lineHeight: 1, color: '#666', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                              title="+1 (hold to repeat)"
                            >+</button>
                          </>
                        )}
                        <span
                          onClick={() => startEdit(i)}
                          style={{
                            color: '#666', cursor: 'pointer',
                            borderBottom: '1px dashed #ccc', padding: '0 2px',
                            minWidth: 65, textAlign: 'right',
                          }}
                        >
                          {prop.value || '(empty)'}
                        </span>
                      </span>
                    </>
                  )}
                  {/* Color picker (right) — only for HP-format values (N/M) */}
                  {/^\d+\/\d+$/.test(prop.value) && (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      onClick={() => setColorPickerKey(colorPickerKey === prop.key ? null : prop.key)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center',
                      }}
                      title="Bar color (click to choose)"
                    >
                      <span style={{
                        display: 'inline-block', width: 10, height: 10,
                        borderRadius: '50%',
                        background: curColor || BAR_COLORS[0],
                        border: '1.5px solid rgba(0,0,0,0.15)',
                      }} />
                    </button>
                    {colorPickerKey === prop.key && (
                      <div
                        style={{
                          position: 'absolute', right: 0, top: 18,
                          background: '#fff', borderRadius: 6, padding: 4,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                          display: 'flex', gap: 3, zIndex: 10,
                        }}
                      >
                        {BAR_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              updateMeta({ propColors: { ...propColors, [prop.key]: c } })
                              setColorPickerKey(null)
                            }}
                            style={{
                              width: 16, height: 16, borderRadius: '50%',
                              background: c, border: c === curColor ? '2px solid #333' : '1.5px solid rgba(0,0,0,0.1)',
                              cursor: 'pointer', padding: 0,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  )}
                  <button
                    onClick={() => handleDeleteProperty(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#ccc', fontSize: 14, padding: '0 2px', lineHeight: 1,
                    }}
                    title="Delete"
                  >
                    x
                  </button>
                  </div>
                </div>
                )
              })}
              {/* Bottom drop indicator */}
              {dragIndex !== null && dropIndex === properties.length && dropIndex !== dragIndex && dropIndex !== dragIndex + 1 && (
                <div style={{ height: 2, background: '#2563eb', borderRadius: 1, margin: '0 4px' }} />
              )}
              {properties.length === 0 && (
                <div style={{ color: '#ccc', fontSize: 12, padding: '4px 0' }}>
                  No properties yet
                </div>
              )}
            </div>

            {/* Add Property */}
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                placeholder="Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddProperty()}
                style={{
                  width: 80, padding: '4px 8px', border: '1px solid #ddd',
                  borderRadius: 4, fontSize: 12, boxSizing: 'border-box',
                }}
              />
              <input
                placeholder="Value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddProperty()}
                style={{
                  flex: 1, padding: '4px 8px', border: '1px solid #ddd',
                  borderRadius: 4, fontSize: 12, boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleAddProperty}
                disabled={!newKey.trim()}
                style={{
                  padding: '4px 10px', background: newKey.trim() ? '#2563eb' : '#e5e7eb',
                  color: '#fff', border: 'none', borderRadius: 4,
                  cursor: newKey.trim() ? 'pointer' : 'default', fontSize: 12,
                }}
              >
                +
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
