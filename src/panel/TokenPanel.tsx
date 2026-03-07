import { useRef, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { readPinModes } from './tokenUtils'
import { adjustNumericValue } from './panelUtils'
import { useHoldRepeat } from './useHoldRepeat'
import { useDraggable } from './useDraggable'

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

  const isToken = typeof selectedShape?.meta?.name === 'string'
  const tokenName = (selectedShape?.meta?.name as string) ?? ''
  const properties = (selectedShape?.meta?.properties as { key: string; value: string }[]) ?? []
  const pinModes = readPinModes(selectedShape?.meta?.pinnedProps)

  const updateMeta = (meta: Record<string, unknown>) => {
    if (!selectedShape) return
    editor.updateShape({
      id: selectedShape.id,
      type: selectedShape.type,
      meta: { ...selectedShape.meta, ...meta },
    })
  }

  const handleAddProperty = () => {
    if (!newKey.trim()) return
    const key = newKey.trim()
    updateMeta({
      properties: [...properties, { key, value: newValue.trim() }],
      pinnedProps: { ...pinModes, [key]: 'hover' as const },
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

        {selectedShape && !isToken && (
          <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>
            Right-click shape and select "Add Properties" to make it a token
          </div>
        )}

        {selectedShape && isToken && (
          <>
            {/* Token Name */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 2 }}>
                Name
              </label>
              <input
                value={tokenName}
                onChange={(e) => updateMeta({ name: e.target.value })}
                style={{
                  width: '100%', padding: '6px 10px', border: '1px solid #ddd',
                  borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Properties List */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>
                Properties
              </label>
              {properties.map((prop, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 0', borderBottom: '1px solid #f3f4f6',
                }}>
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
                  <button
                    onClick={() => {
                      const cur = pinModes[prop.key]
                      const newModes = { ...pinModes }
                      if (!cur) {
                        newModes[prop.key] = 'always'
                      } else if (cur === 'always') {
                        newModes[prop.key] = 'hover'
                      } else {
                        delete newModes[prop.key]
                      }
                      updateMeta({ pinnedProps: newModes })
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0 2px', lineHeight: 1,
                      display: 'flex', alignItems: 'center',
                    }}
                    title={
                      !pinModes[prop.key] ? 'Show on canvas (always)'
                        : pinModes[prop.key] === 'always' ? 'Show on canvas (hover only)'
                        : 'Hide from canvas'
                    }
                  >
                    <span style={{
                      display: 'inline-block', width: 10, height: 10,
                      borderRadius: '50%',
                      border: `2px solid ${
                        pinModes[prop.key] === 'always' ? '#2563eb'
                          : pinModes[prop.key] === 'hover' ? '#f59e0b' : '#ccc'
                      }`,
                      background: pinModes[prop.key] === 'always' ? '#2563eb' : 'transparent',
                      boxShadow: pinModes[prop.key] === 'hover' ? 'inset 5px 0 0 0 #f59e0b' : 'none',
                    }} />
                  </button>
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
              ))}
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
