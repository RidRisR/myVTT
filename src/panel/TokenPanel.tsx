import { useRef, useState } from 'react'
import { useValue, type Editor, type JsonValue } from 'tldraw'
import { useHoldRepeat } from './useHoldRepeat'
import {
  type Resource, type Attribute, type Status,
  readResources, readAttributes, readStatuses,
  BAR_COLORS, statusColor,
} from './tokenUtils'

function EyeIcon({ mode, size = 14 }: { mode: 'hidden' | 'hover' | 'always'; size?: number }) {
  const color = mode === 'always' ? '#f59e0b' : '#aaa'
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path
        d="M1 8 Q4 3 8 3 Q12 3 15 8 Q12 13 8 13 Q4 13 1 8 Z"
        stroke={color} strokeWidth="1.5" fill="none"
      />
      <circle
        cx="8" cy="8" r="2"
        fill={mode === 'hidden' ? 'none' : color}
        stroke={color} strokeWidth="1.2"
      />
      {mode === 'hidden' && (
        <line x1="3" y1="13" x2="13" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

function SectionHeader({ title, collapsed, onToggle, showingAdd, onToggleAdd }: {
  title: string; collapsed: boolean; onToggle: () => void;
  showingAdd?: boolean; onToggleAdd?: () => void;
}) {
  return (
    <div
      style={{
        fontSize: 11, fontWeight: 600, color: '#888',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 0 4px', userSelect: 'none',
        borderBottom: '1px solid #f0f0f0', marginBottom: 4,
      }}
    >
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 1 }}>
        <span style={{ fontSize: 8, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          ▼
        </span>
        {title}
      </div>
      {onToggleAdd && !collapsed && (
        <button
          onClick={onToggleAdd}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: showingAdd ? '#2563eb' : '#bbb', fontSize: 14,
            padding: '0 2px', lineHeight: 1, fontWeight: 700,
          }}
          title="Add"
        >+</button>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', border: '1px solid #ddd',
  borderRadius: 4, fontSize: 12, boxSizing: 'border-box',
}

const smallBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid #ddd', borderRadius: 3,
  cursor: 'pointer', width: 18, height: 18, padding: 0,
  fontSize: 12, lineHeight: 1, color: '#666', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const deleteBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#ccc', fontSize: 14, padding: '0 2px', lineHeight: 1,
}

interface TokenPanelProps {
  editor: Editor
}

export function TokenPanel({ editor }: TokenPanelProps) {
  // Section collapse state
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (section: string) => setCollapsed(c => ({ ...c, [section]: !c[section] }))

  // Add-form visibility + states
  const [addingSection, setAddingSection] = useState<string | null>(null)
  const toggleAdding = (section: string) => setAddingSection(addingSection === section ? null : section)
  const [newResKey, setNewResKey] = useState('')
  const [newResCur, setNewResCur] = useState('')
  const [newResMax, setNewResMax] = useState('')
  const [newAttrKey, setNewAttrKey] = useState('')
  const [newAttrVal, setNewAttrVal] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [colorPickerIdx, setColorPickerIdx] = useState<number | null>(null)

  // Inline editing state: { section, index, field } identifies what's being edited
  const [editing, setEditing] = useState<{ section: string; index: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (section: string, index: number, field: string, currentValue: string) => {
    setEditing({ section, index, field })
    setEditValue(currentValue)
  }

  const commitEdit = () => {
    if (!editing || !selectedShape) { setEditing(null); return }
    const { section, index, field } = editing
    if (section === 'resources') {
      const updated = [...resources]
      if (field === 'key') {
        const trimmed = editValue.trim()
        if (trimmed) updated[index] = { ...updated[index], key: trimmed }
      } else if (field === 'values') {
        const match = editValue.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/)
        if (match) {
          const cur = parseInt(match[1])
          const max = parseInt(match[2])
          if (max > 0) updated[index] = { ...updated[index], current: Math.max(0, Math.min(cur, max)), max }
        }
      }
      updateMeta(selectedShape, { resources: updated })
    } else if (section === 'attributes') {
      const updated = [...attributes]
      if (field === 'key') {
        const trimmed = editValue.trim()
        if (trimmed) updated[index] = { ...updated[index], key: trimmed }
      } else if (field === 'value') {
        const n = parseInt(editValue)
        if (!isNaN(n)) updated[index] = { ...updated[index], value: n }
      }
      updateMeta(selectedShape, { attributes: updated })
    }
    setEditing(null)
  }

  const cancelEdit = () => setEditing(null)

  const isEditing = (section: string, index: number, field: string) =>
    editing?.section === section && editing?.index === index && editing?.field === field

  // Hold-to-repeat for resources
  const resHoldRef = useRef<{ index: number; delta: number }>({ index: 0, delta: 1 })
  const { holdStart: rawResHold, holdStop: resHoldStop } = useHoldRepeat((count) => {
    const shape = editor.getSelectedShapes()[0]
    if (!shape) return
    const resources = readResources(shape.meta?.resources)
    const { index, delta } = resHoldRef.current
    if (index >= resources.length) return
    const d = count > 15 ? delta * 5 : delta
    const r = resources[index]
    const updated = [...resources]
    updated[index] = { ...r, current: Math.max(0, Math.min(r.current + d, r.max)) }
    updateMeta(shape, { resources: updated })
  })
  const resHoldStart = (index: number, delta: number) => {
    resHoldRef.current = { index, delta }
    rawResHold()
  }

  // Hold-to-repeat for attributes
  const attrHoldRef = useRef<{ index: number; delta: number }>({ index: 0, delta: 1 })
  const { holdStart: rawAttrHold, holdStop: attrHoldStop } = useHoldRepeat((count) => {
    const shape = editor.getSelectedShapes()[0]
    if (!shape) return
    const attributes = readAttributes(shape.meta?.attributes)
    const { index, delta } = attrHoldRef.current
    if (index >= attributes.length) return
    const d = count > 15 ? delta * 5 : delta
    const updated = [...attributes]
    updated[index] = { ...updated[index], value: updated[index].value + d }
    updateMeta(shape, { attributes: updated })
  })
  const attrHoldStart = (index: number, delta: number) => {
    attrHoldRef.current = { index, delta }
    rawAttrHold()
  }

  const selectedShape = useValue('selectedShape', () => {
    const shapes = editor.getSelectedShapes()
    return shapes.length === 1 ? shapes[0] : null
  }, [editor])

  const tokenName = (selectedShape?.meta?.name as string) ?? ''
  const nameDisplay = (selectedShape?.meta?.nameDisplay as string) ?? 'hidden'
  const resources = readResources(selectedShape?.meta?.resources)
  const attributes = readAttributes(selectedShape?.meta?.attributes)
  const statuses = readStatuses(selectedShape?.meta?.statuses)
  const notes = (selectedShape?.meta?.notes as string) ?? ''

  const updateMeta = (shape: typeof selectedShape, meta: Record<string, unknown>) => {
    if (!shape) return
    editor.updateShape({
      id: shape.id,
      type: shape.type,
      meta: { ...shape.meta, ...meta } as Record<string, JsonValue>,
    })
  }

  // Resource handlers
  const addResource = () => {
    if (!newResKey.trim() || !selectedShape) return
    const cur = parseInt(newResCur) || 0
    const max = parseInt(newResMax) || cur
    updateMeta(selectedShape, {
      resources: [...resources, { key: newResKey.trim(), current: cur, max, color: BAR_COLORS[resources.length % BAR_COLORS.length] }],
    })
    setNewResKey(''); setNewResCur(''); setNewResMax('')
  }

  const deleteResource = (index: number) => {
    if (!selectedShape) return
    updateMeta(selectedShape, { resources: resources.filter((_, i) => i !== index) })
  }

  // Attribute handlers
  const addAttribute = () => {
    if (!newAttrKey.trim() || !selectedShape) return
    const val = parseInt(newAttrVal) || 0
    updateMeta(selectedShape, {
      attributes: [...attributes, { key: newAttrKey.trim(), value: val }],
    })
    setNewAttrKey(''); setNewAttrVal('')
  }

  const deleteAttribute = (index: number) => {
    if (!selectedShape) return
    updateMeta(selectedShape, { attributes: attributes.filter((_, i) => i !== index) })
  }

  // Status handlers
  const addStatus = () => {
    if (!newStatus.trim() || !selectedShape) return
    if (statuses.some(s => s.label === newStatus.trim())) return
    updateMeta(selectedShape, {
      statuses: [...statuses, { label: newStatus.trim() }],
    })
    setNewStatus('')
  }

  const deleteStatus = (index: number) => {
    if (!selectedShape) return
    updateMeta(selectedShape, { statuses: statuses.filter((_, i) => i !== index) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', fontSize: 13, userSelect: 'none' }}>
      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        {!selectedShape && (
          <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>Select a shape</div>
        )}

        {selectedShape && (
          <>
            {/* Name */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 2 }}>Name</label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  value={tokenName}
                  onChange={(e) => updateMeta(selectedShape, { name: e.target.value })}
                  placeholder="Unnamed"
                  style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 13 }}
                />
                <button
                  onClick={() => {
                    const next = nameDisplay === 'hidden' ? 'hover' : nameDisplay === 'hover' ? 'always' : 'hidden'
                    updateMeta(selectedShape, { nameDisplay: next })
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                  title={nameDisplay === 'hidden' ? 'Hidden (click: hover)' : nameDisplay === 'hover' ? 'Hover (click: always)' : 'Always (click: hidden)'}
                >
                  <EyeIcon mode={nameDisplay as 'hidden' | 'hover' | 'always'} />
                </button>
              </div>
            </div>

            {/* Resources */}
            <SectionHeader title="Resources" collapsed={!!collapsed.resources} onToggle={() => toggle('resources')} showingAdd={addingSection === 'resources'} onToggleAdd={() => toggleAdding('resources')} />
            {!collapsed.resources && (
              <div style={{ marginBottom: 8 }}>
                {resources.map((r, i) => {
                  const pct = r.max > 0 ? Math.min(r.current / r.max, 1) : 0
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                      {isEditing('resources', i, 'key') ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                          style={{ ...inputStyle, fontWeight: 600, width: 50, padding: '2px 4px', fontSize: 12 }}
                        />
                      ) : (
                        <span
                          onClick={() => startEdit('resources', i, 'key', r.key)}
                          style={{ fontWeight: 600, color: '#333', minWidth: 36, fontSize: 12, cursor: 'text', borderBottom: '1px dashed transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = '#ccc')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
                        >{r.key}</span>
                      )}
                      <button style={smallBtnStyle} onPointerDown={() => resHoldStart(i, -1)} onPointerUp={resHoldStop} onPointerLeave={resHoldStop} title="−1">−</button>
                      <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.1)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', background: r.color, borderRadius: 4, transition: 'width 0.15s' }} />
                      </div>
                      {isEditing('resources', i, 'values') ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                          style={{ ...inputStyle, width: 56, padding: '2px 4px', fontSize: 11, textAlign: 'center' }}
                        />
                      ) : (
                        <span
                          onClick={() => startEdit('resources', i, 'values', `${r.current}/${r.max}`)}
                          style={{ fontSize: 11, color: '#555', minWidth: 42, textAlign: 'center', cursor: 'text', borderBottom: '1px dashed transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = '#ccc')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
                        >{r.current}/{r.max}</span>
                      )}
                      <button style={smallBtnStyle} onPointerDown={() => resHoldStart(i, 1)} onPointerUp={resHoldStop} onPointerLeave={resHoldStop} title="+1">+</button>
                      {/* Color picker */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          onClick={() => setColorPickerIdx(colorPickerIdx === i ? null : i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                          title="Bar color"
                        >
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: r.color, border: '1.5px solid rgba(0,0,0,0.15)' }} />
                        </button>
                        {colorPickerIdx === i && (
                          <div style={{ position: 'absolute', right: 0, top: 18, background: '#fff', borderRadius: 6, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', display: 'flex', gap: 3, zIndex: 10 }}>
                            {BAR_COLORS.map((c) => (
                              <button
                                key={c}
                                onClick={() => {
                                  const updated = [...resources]
                                  updated[i] = { ...r, color: c }
                                  updateMeta(selectedShape, { resources: updated })
                                  setColorPickerIdx(null)
                                }}
                                style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: c === r.color ? '2px solid #333' : '1.5px solid rgba(0,0,0,0.1)', cursor: 'pointer', padding: 0 }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteResource(i)} style={deleteBtnStyle} title="Delete">x</button>
                    </div>
                  )
                })}
                {resources.length === 0 && addingSection !== 'resources' && <div style={{ color: '#ccc', fontSize: 12, padding: '4px 0' }}>No resources</div>}
                {addingSection === 'resources' && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                    <input placeholder="Key" value={newResKey} onChange={(e) => setNewResKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addResource()} style={{ ...inputStyle, width: 60 }} />
                    <span style={{ color: '#aaa', fontSize: 12 }}>:</span>
                    <input placeholder="Cur" value={newResCur} onChange={(e) => setNewResCur(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addResource()} style={{ ...inputStyle, flex: 1, minWidth: 0 }} type="number" />
                    <span style={{ color: '#aaa', fontSize: 12 }}>/</span>
                    <input placeholder="Max" value={newResMax} onChange={(e) => setNewResMax(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addResource()} style={{ ...inputStyle, flex: 1, minWidth: 0 }} type="number" />
                    <button onClick={addResource} disabled={!newResKey.trim()} style={{ padding: '4px 10px', background: newResKey.trim() ? '#2563eb' : '#e5e7eb', color: '#fff', border: 'none', borderRadius: 4, cursor: newResKey.trim() ? 'pointer' : 'default', fontSize: 12 }}>+</button>
                  </div>
                )}
              </div>
            )}

            {/* Attributes */}
            <SectionHeader title="Attributes" collapsed={!!collapsed.attributes} onToggle={() => toggle('attributes')} showingAdd={addingSection === 'attributes'} onToggleAdd={() => toggleAdding('attributes')} />
            {!collapsed.attributes && (
              <div style={{ marginBottom: 8 }}>
                {attributes.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                    {isEditing('attributes', i, 'key') ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                        style={{ ...inputStyle, fontWeight: 600, width: 50, padding: '2px 4px', fontSize: 12 }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit('attributes', i, 'key', a.key)}
                        style={{ fontWeight: 600, color: '#333', minWidth: 40, fontSize: 12, cursor: 'text', borderBottom: '1px dashed transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = '#ccc')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
                      >{a.key}</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button style={smallBtnStyle} onPointerDown={() => attrHoldStart(i, -1)} onPointerUp={attrHoldStop} onPointerLeave={attrHoldStop} title="−1">−</button>
                    {isEditing('attributes', i, 'value') ? (
                      <input
                        autoFocus
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                        style={{ ...inputStyle, width: 44, padding: '2px 4px', fontSize: 12, textAlign: 'center' }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit('attributes', i, 'value', String(a.value))}
                        style={{ fontSize: 12, color: '#555', minWidth: 28, textAlign: 'center', cursor: 'text', borderBottom: '1px dashed transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = '#ccc')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
                      >{a.value}</span>
                    )}
                    <button style={smallBtnStyle} onPointerDown={() => attrHoldStart(i, 1)} onPointerUp={attrHoldStop} onPointerLeave={attrHoldStop} title="+1">+</button>
                    <button onClick={() => deleteAttribute(i)} style={deleteBtnStyle} title="Delete">x</button>
                  </div>
                ))}
                {attributes.length === 0 && addingSection !== 'attributes' && <div style={{ color: '#ccc', fontSize: 12, padding: '4px 0' }}>No attributes</div>}
                {addingSection === 'attributes' && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input placeholder="Key" value={newAttrKey} onChange={(e) => setNewAttrKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAttribute()} style={{ ...inputStyle, width: 80 }} />
                    <input placeholder="Value" value={newAttrVal} onChange={(e) => setNewAttrVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAttribute()} style={{ ...inputStyle, flex: 1 }} type="number" />
                    <button onClick={addAttribute} disabled={!newAttrKey.trim()} style={{ padding: '4px 10px', background: newAttrKey.trim() ? '#2563eb' : '#e5e7eb', color: '#fff', border: 'none', borderRadius: 4, cursor: newAttrKey.trim() ? 'pointer' : 'default', fontSize: 12 }}>+</button>
                  </div>
                )}
              </div>
            )}

            {/* Statuses */}
            <SectionHeader title="Statuses" collapsed={!!collapsed.statuses} onToggle={() => toggle('statuses')} showingAdd={addingSection === 'statuses'} onToggleAdd={() => toggleAdding('statuses')} />
            {!collapsed.statuses && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                  {statuses.map((s, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 11, padding: '2px 8px', borderRadius: 10,
                      background: statusColor(s.label), color: '#fff',
                    }}>
                      {s.label}
                      <button
                        onClick={() => deleteStatus(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: 0, lineHeight: 1 }}
                      >x</button>
                    </span>
                  ))}
                </div>
                {statuses.length === 0 && addingSection !== 'statuses' && <div style={{ color: '#ccc', fontSize: 12, padding: '4px 0' }}>No statuses</div>}
                {addingSection === 'statuses' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input placeholder="Status name" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStatus()} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={addStatus} disabled={!newStatus.trim()} style={{ padding: '4px 10px', background: newStatus.trim() ? '#2563eb' : '#e5e7eb', color: '#fff', border: 'none', borderRadius: 4, cursor: newStatus.trim() ? 'pointer' : 'default', fontSize: 12 }}>+</button>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <SectionHeader title="Notes" collapsed={!!collapsed.notes} onToggle={() => toggle('notes')} />
            {!collapsed.notes && (
              <div style={{ marginBottom: 8 }}>
                <textarea
                  value={notes}
                  onChange={(e) => updateMeta(selectedShape, { notes: e.target.value })}
                  placeholder="Add notes..."
                  style={{
                    width: '100%', minHeight: 60, padding: '6px 8px',
                    border: '1px solid #ddd', borderRadius: 6, fontSize: 12,
                    resize: 'vertical', fontFamily: 'sans-serif',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
