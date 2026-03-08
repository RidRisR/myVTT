import { useState, useRef, useEffect } from 'react'
import type { Character } from '../shared/characterTypes'
import { uploadAsset } from '../shared/assetUpload'
import type { Resource, Attribute } from '../shared/tokenTypes'
import { barColorForKey, statusColor } from '../shared/tokenUtils'
import { useHoldRepeat } from '../shared/useHoldRepeat'

interface CharacterEditPanelProps {
  character: Character
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void
  onClose: () => void
}

type TabId = 'info' | 'resources' | 'attributes' | 'statuses' | 'notes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'info', label: 'INFO' },
  { id: 'resources', label: 'RES' },
  { id: 'attributes', label: 'ATTR' },
  { id: 'statuses', label: 'STATUS' },
  { id: 'notes', label: 'NOTES' },
]

const inputStyle: React.CSSProperties = {
  padding: '5px 7px',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  fontSize: 12,
  background: 'rgba(255,255,255,0.06)',
  color: '#e4e4e7',
  outline: 'none',
  minWidth: 0,
}

const addBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px',
  background: 'transparent',
  border: '1px dashed rgba(255,255,255,0.15)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 11,
  color: 'rgba(255,255,255,0.35)',
  marginTop: 4,
  transition: 'border-color 0.15s, color 0.15s',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.2)',
  fontSize: 14,
  padding: '0 2px',
  lineHeight: 1,
  transition: 'color 0.15s',
  flexShrink: 0,
}

function HoldButton({ label, onTick, color }: { label: string; onTick: () => void; color?: string }) {
  const { holdStart, holdStop } = useHoldRepeat(onTick)
  return (
    <button
      onPointerDown={holdStart} onPointerUp={holdStop} onPointerLeave={holdStop}
      style={{
        width: 20, height: 20,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, cursor: 'pointer',
        color: color ?? 'rgba(255,255,255,0.5)',
        fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, lineHeight: 1,
        transition: 'background 0.15s, border-color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
    >
      {label}
    </button>
  )
}

export function CharacterEditPanel({ character, onUpdateCharacter, onClose }: CharacterEditPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [statusInput, setStatusInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [draggingRes, setDraggingRes] = useState<number | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState<'character' | number | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close color picker on click outside
  useEffect(() => {
    if (colorPickerOpen === null) return
    const handler = (e: PointerEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [colorPickerOpen])

  const updateChar = (updates: Partial<Character>) => onUpdateCharacter(character.id, updates)

  /* ── Resource helpers ── */
  const updateResource = (index: number, updates: Partial<Resource>) => {
    const next = [...character.resources]
    next[index] = { ...next[index], ...updates }
    updateChar({ resources: next })
  }
  const addResource = () => {
    const color = barColorForKey(`res_${character.resources.length}`)
    updateChar({ resources: [...character.resources, { key: '', current: 10, max: 10, color }] })
  }
  const removeResource = (index: number) => {
    updateChar({ resources: character.resources.filter((_, i) => i !== index) })
  }

  /* ── Attribute helpers ── */
  const updateAttribute = (index: number, updates: Partial<Attribute>) => {
    const next = [...character.attributes]
    next[index] = { ...next[index], ...updates }
    updateChar({ attributes: next })
  }
  const addAttribute = () => {
    updateChar({ attributes: [...character.attributes, { key: '', value: 10 }] })
  }
  const removeAttribute = (index: number) => {
    updateChar({ attributes: character.attributes.filter((_, i) => i !== index) })
  }

  /* ── Status helpers ── */
  const addStatus = () => {
    const label = statusInput.trim()
    if (!label || character.statuses.some(s => s.label === label)) return
    updateChar({ statuses: [...character.statuses, { label }] })
    setStatusInput('')
  }
  const removeStatus = (index: number) => {
    updateChar({ statuses: character.statuses.filter((_, i) => i !== index) })
  }

  /* ── Resource bar drag ── */
  const handleBarDrag = (e: React.PointerEvent, index: number, max: number) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    const bar = e.currentTarget as HTMLElement
    const rect = bar.getBoundingClientRect()
    const calcValue = (clientX: number) =>
      Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * max)
    updateResource(index, { current: calcValue(e.clientX) })
    setDraggingRes(index)
    const onMove = (ev: PointerEvent) => {
      updateResource(index, { current: calcValue(ev.clientX) })
    }
    const onUp = () => {
      setDraggingRes(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /* ── Portrait upload ── */
  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAsset(file)
      updateChar({ imageUrl: url })
    } catch (err) {
      console.error('Portrait upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ── Tab renderers ── */
  const renderInfo = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Portrait + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePortraitUpload} />
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
          title="Click to change portrait"
        >
          {character.imageUrl ? (
            <img src={character.imageUrl} alt={character.name}
              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${character.color}`, display: 'block' }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: `linear-gradient(135deg, ${character.color}, ${character.color}aa)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20, fontWeight: 700,
              border: `3px solid ${character.color}`, boxSizing: 'border-box',
            }}>
              {character.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Upload overlay */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: uploading ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
            fontSize: 10, color: '#fff', fontWeight: 600,
          }}
            onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0.5)' }}
            onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0)' }}
          >
            {uploading ? '...' : ''}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Name</label>
          <input value={character.name} onChange={(e) => updateChar({ name: e.target.value })}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} />
        </div>
      </div>

      {/* Color */}
      <div ref={colorPickerOpen === 'character' ? colorPickerRef : undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Color</label>
          <div
            onClick={() => setColorPickerOpen(colorPickerOpen === 'character' ? null : 'character')}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: character.color,
              border: '2px solid rgba(255,255,255,0.3)',
              cursor: 'pointer', transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)' }}
            title="Change color"
          />
        </div>
        {colorPickerOpen === 'character' && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'].map(c => (
              <div key={c} onClick={() => { updateChar({ color: c }); setColorPickerOpen(null) }}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: c === character.color ? '2px solid #fff' : '2px solid transparent',
                  transition: 'border-color 0.15s',
                }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderResources = () => (
    <div>
      {character.resources.map((res, i) => {
        const pct = res.max > 0 ? Math.min(res.current / res.max, 1) : 0
        const isDragging = draggingRes === i
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            {/* Header: name + current/max inputs + remove */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input value={res.key} onChange={(e) => updateResource(i, { key: e.target.value })}
                placeholder="Name" style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 6px', fontWeight: 600 }} />
              <input
                key={`cur-${i}-${res.current}`}
                defaultValue={res.current}
                onBlur={(e) => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v)) updateResource(i, { current: Math.max(0, Math.min(v, res.max)) })
                  else e.target.value = String(res.current)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                style={{ ...inputStyle, width: 32, textAlign: 'center', fontSize: 11, padding: '3px 2px', fontWeight: 700 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>/</span>
              <input
                key={`max-${i}-${res.max}`}
                defaultValue={res.max}
                onBlur={(e) => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v) && v > 0) updateResource(i, { max: v, current: Math.min(res.current, v) })
                  else e.target.value = String(res.max)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                style={{ ...inputStyle, width: 32, textAlign: 'center', fontSize: 11, padding: '3px 2px', fontWeight: 700 }} />
              <div
                onClick={() => setColorPickerOpen(colorPickerOpen === i ? null : i)}
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: res.color,
                  border: '2px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                title="Change color"
              />
              <button onClick={() => removeResource(i)} style={removeBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
              >x</button>
            </div>
            {/* Bar row: - draggable bar + */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <HoldButton label="-" onTick={() => updateResource(i, { current: Math.max(0, res.current - 1) })} color="#ef4444" />
              <div
                style={{ flex: 1, height: 18, borderRadius: 8, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative', cursor: 'ew-resize', userSelect: 'none' }}
                onPointerDown={(e) => handleBarDrag(e, i, res.max)}
              >
                <div style={{
                  height: '100%', width: `${pct * 100}%`,
                  background: `linear-gradient(90deg, ${res.color}, ${res.color}cc)`,
                  borderRadius: 8,
                  transition: isDragging ? 'none' : 'width 0.2s ease',
                }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                }}>
                  {res.current} / {res.max}
                </div>
              </div>
              <HoldButton label="+" onTick={() => updateResource(i, { current: Math.min(res.max, res.current + 1) })} color="#22c55e" />
            </div>
            {/* Color picker — collapsed by default */}
            {colorPickerOpen === i && (
              <div ref={colorPickerRef} style={{ display: 'flex', gap: 3, marginTop: 5, justifyContent: 'center' }}>
                {['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#ef4444', '#f97316'].map(c => (
                  <div key={c} onClick={() => { updateResource(i, { color: c }); setColorPickerOpen(null) }}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: c === res.color ? '2px solid #fff' : '2px solid transparent', transition: 'border-color 0.15s' }} />
                ))}
              </div>
            )}
          </div>
        )
      })}
      <button onClick={addResource} style={addBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
      >+ Add resource</button>
    </div>
  )

  const renderAttributes = () => (
    <div>
      {character.attributes.map((attr, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <input value={attr.key} onChange={(e) => updateAttribute(i, { key: e.target.value })}
            placeholder="Name" style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '5px 8px', fontWeight: 600 }} />
          <HoldButton label="-" onTick={() => updateAttribute(i, { value: Math.max(0, attr.value - 1) })} color="#ef4444" />
          <input value={attr.value}
            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateAttribute(i, { value: Math.max(0, v) }) }}
            style={{ ...inputStyle, width: 40, textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '4px 2px', color: '#fff' }} />
          <HoldButton label="+" onTick={() => updateAttribute(i, { value: attr.value + 1 })} color="#22c55e" />
          <button onClick={() => removeAttribute(i)} style={removeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
          >x</button>
        </div>
      ))}
      <button onClick={addAttribute} style={addBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
      >+ Add attribute</button>
    </div>
  )

  const renderStatuses = () => (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {character.statuses.map((s, i) => {
          const sc = statusColor(s.label)
          return (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px 4px 12px', borderRadius: 14,
              background: `${sc}22`, color: sc,
              fontSize: 12, fontWeight: 600, border: `1px solid ${sc}33`,
            }}>
              {s.label}
              <button onClick={() => removeStatus(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: sc, fontSize: 14, padding: 0, lineHeight: 1, opacity: 0.6, transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
              >x</button>
            </span>
          )
        })}
        {character.statuses.length === 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>No active statuses</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input value={statusInput} onChange={(e) => setStatusInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addStatus() }}
          placeholder="Add status..." style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }} />
        <button onClick={addStatus}
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, padding: '6px 12px', transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
        >Add</button>
      </div>
    </div>
  )

  const renderNotes = () => (
    <div>
      <textarea value={character.notes} onChange={(e) => updateChar({ notes: e.target.value })}
        placeholder="Free-form notes..." rows={8}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12, lineHeight: 1.6, padding: '10px 12px' }} />
    </div>
  )

  const tabContent: Record<TabId, () => React.ReactNode> = {
    info: renderInfo,
    resources: renderResources,
    attributes: renderAttributes,
    statuses: renderStatuses,
    notes: renderNotes,
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        width: 320,
        zIndex: 10000,
        background: 'rgba(15, 15, 25, 0.88)',
        backdropFilter: 'blur(16px)',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'sans-serif',
        color: '#e4e4e7',
        maxHeight: 'calc(50vh - 100px)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column' as const,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Character</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 18, padding: '0 2px', lineHeight: 1, transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
        >x</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '7px 0',
              background: activeTab === tab.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${character.color}` : '2px solid transparent',
              cursor: 'pointer',
              color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.35)',
              fontSize: 8, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              transition: 'color 0.15s, background 0.15s, border-color 0.15s',
              fontFamily: 'sans-serif',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '12px 14px 14px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {tabContent[activeTab]()}
      </div>
    </div>
  )
}
