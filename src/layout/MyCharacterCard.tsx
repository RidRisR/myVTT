import { useRef, useState } from 'react'
import type { Character } from '../shared/characterTypes'
import type { Resource, Attribute, Handout } from '../shared/tokenTypes'
import { barColorForKey, statusColor } from '../shared/tokenUtils'
import { useHoldRepeat } from '../shared/useHoldRepeat'
import { uploadAsset } from '../shared/assetUpload'

interface MyCharacterCardProps {
  character: Character
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void
}

type TabId = 'resources' | 'attributes' | 'statuses' | 'notes' | 'handouts'

const TABS: { id: TabId; label: string }[] = [
  { id: 'resources', label: 'RES' },
  { id: 'attributes', label: 'ATTR' },
  { id: 'statuses', label: 'STATUS' },
  { id: 'notes', label: 'NOTES' },
  { id: 'handouts', label: 'CARDS' },
]

/* ── reusable styles ── */
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

/* ── Hold-to-repeat +/- button ── */
function HoldButton({ label, onTick, color }: { label: string; onTick: () => void; color?: string }) {
  const { holdStart, holdStop } = useHoldRepeat(onTick)
  return (
    <button
      onPointerDown={holdStart}
      onPointerUp={holdStop}
      onPointerLeave={holdStop}
      style={{
        width: 20, height: 20,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        cursor: 'pointer',
        color: color ?? 'rgba(255,255,255,0.5)',
        fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, lineHeight: 1,
        transition: 'background 0.15s, border-color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
    >
      {label}
    </button>
  )
}

export function MyCharacterCard({ character, onUpdateCharacter }: MyCharacterCardProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('resources')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // Status add input
  const [statusInput, setStatusInput] = useState('')

  // Handout editor
  const [editingHandout, setEditingHandout] = useState<string | null>(null)
  const handoutFileRef = useRef<HTMLInputElement>(null)
  const [handoutUploading, setHandoutUploading] = useState(false)

  const resources = character.resources
  const attributes = character.attributes
  const statuses = character.statuses
  const notes = character.notes
  const handouts = character.handouts ?? []

  /* ── Portrait upload ── */
  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAsset(file)
      onUpdateCharacter(character.id, { imageUrl: url })
    } catch (err) {
      console.error('Portrait upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ── Resource helpers ── */
  const updateResource = (index: number, updates: Partial<Resource>) => {
    const next = [...resources]
    next[index] = { ...next[index], ...updates }
    onUpdateCharacter(character.id, { resources: next })
  }
  const addResource = () => {
    const color = barColorForKey(`res_${resources.length}`)
    onUpdateCharacter(character.id, { resources: [...resources, { key: '', current: 10, max: 10, color }] })
  }
  const removeResource = (index: number) => {
    onUpdateCharacter(character.id, { resources: resources.filter((_, i) => i !== index) })
  }

  /* ── Attribute helpers ── */
  const updateAttribute = (index: number, updates: Partial<Attribute>) => {
    const next = [...attributes]
    next[index] = { ...next[index], ...updates }
    onUpdateCharacter(character.id, { attributes: next })
  }
  const addAttribute = () => {
    onUpdateCharacter(character.id, { attributes: [...attributes, { key: '', value: 10 }] })
  }
  const removeAttribute = (index: number) => {
    onUpdateCharacter(character.id, { attributes: attributes.filter((_, i) => i !== index) })
  }

  /* ── Status helpers ── */
  const addStatus = () => {
    const label = statusInput.trim()
    if (!label) return
    if (statuses.some(s => s.label === label)) return
    onUpdateCharacter(character.id, { statuses: [...statuses, { label }] })
    setStatusInput('')
  }
  const removeStatus = (index: number) => {
    onUpdateCharacter(character.id, { statuses: statuses.filter((_, i) => i !== index) })
  }

  /* ── Handout helpers ── */
  const addHandout = () => {
    const id = self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
    onUpdateCharacter(character.id, { handouts: [...handouts, { id, title: '', description: '' }] })
    setEditingHandout(id)
  }
  const updateHandout = (id: string, updates: Partial<Handout>) => {
    const next = handouts.map(h => h.id === id ? { ...h, ...updates } : h)
    onUpdateCharacter(character.id, { handouts: next })
  }
  const removeHandout = (id: string) => {
    onUpdateCharacter(character.id, { handouts: handouts.filter(h => h.id !== id) })
    if (editingHandout === id) setEditingHandout(null)
  }
  const handleHandoutImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, handoutId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    setHandoutUploading(true)
    try {
      const url = await uploadAsset(file)
      updateHandout(handoutId, { imageUrl: url })
    } catch (err) {
      console.error('Handout image upload failed:', err)
    } finally {
      setHandoutUploading(false)
      if (handoutFileRef.current) handoutFileRef.current.value = ''
    }
  }

  /* ── Tab content renderers ── */
  const renderResources = () => (
    <div>
      {resources.map((res, i) => {
        const pct = res.max > 0 ? Math.min(res.current / res.max, 1) : 0
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input
                value={res.key}
                onChange={(e) => updateResource(i, { key: e.target.value })}
                placeholder="Name"
                style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 6px', fontWeight: 600 }}
              />
              <HoldButton label="−" onTick={() => updateResource(i, { current: Math.max(0, res.current - 1) })} color="#ef4444" />
              <HoldButton label="+" onTick={() => updateResource(i, { current: Math.min(res.max, res.current + 1) })} color="#22c55e" />
              <button onClick={() => removeResource(i)} style={removeBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
              >×</button>
            </div>
            <div style={{
              height: 16, borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%', width: `${pct * 100}%`,
                background: `linear-gradient(90deg, ${res.color}, ${res.color}cc)`,
                borderRadius: 8, transition: 'width 0.2s ease',
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}>
                <input value={res.current}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateResource(i, { current: Math.max(0, Math.min(v, res.max)) }) }}
                  style={{ width: 28, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 10, fontWeight: 700, padding: 0 }}
                />
                <span style={{ margin: '0 1px' }}>/</span>
                <input value={res.max}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) updateResource(i, { max: v, current: Math.min(res.current, v) }) }}
                  style={{ width: 28, textAlign: 'left', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 10, fontWeight: 700, padding: 0 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 5, justifyContent: 'center' }}>
              {['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#ef4444', '#f97316'].map(c => (
                <div key={c} onClick={() => updateResource(i, { color: c })}
                  style={{
                    width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: c === res.color ? '2px solid #fff' : '2px solid transparent',
                    transition: 'border-color 0.15s',
                  }}
                />
              ))}
            </div>
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
      {attributes.map((attr, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <input
            value={attr.key}
            onChange={(e) => updateAttribute(i, { key: e.target.value })}
            placeholder="Name"
            style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '5px 8px', fontWeight: 600 }}
          />
          <HoldButton label="−" onTick={() => updateAttribute(i, { value: Math.max(0, attr.value - 1) })} color="#ef4444" />
          <input
            value={attr.value}
            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateAttribute(i, { value: Math.max(0, v) }) }}
            style={{ ...inputStyle, width: 40, textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '4px 2px', color: '#fff' }}
          />
          <HoldButton label="+" onTick={() => updateAttribute(i, { value: attr.value + 1 })} color="#22c55e" />
          <button onClick={() => removeAttribute(i)} style={removeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
          >×</button>
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
        {statuses.map((s, i) => {
          const sc = statusColor(s.label)
          return (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px 4px 12px', borderRadius: 14,
              background: `${sc}22`, color: sc,
              fontSize: 12, fontWeight: 600,
              border: `1px solid ${sc}33`,
            }}>
              {s.label}
              <button onClick={() => removeStatus(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: sc, fontSize: 14, padding: 0, lineHeight: 1, opacity: 0.6, transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
              >×</button>
            </span>
          )
        })}
        {statuses.length === 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>No active statuses</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={statusInput}
          onChange={(e) => setStatusInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addStatus() }}
          placeholder="Add status..."
          style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }}
        />
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
      <textarea
        value={notes}
        onChange={(e) => onUpdateCharacter(character.id, { notes: e.target.value })}
        placeholder="Free-form notes..."
        rows={8}
        style={{
          ...inputStyle,
          width: '100%', boxSizing: 'border-box',
          resize: 'vertical', fontSize: 12,
          lineHeight: 1.6, padding: '10px 12px',
        }}
      />
    </div>
  )

  const renderHandouts = () => (
    <div>
      {handouts.map((h) => {
        const isEditing = editingHandout === h.id
        return (
          <div key={h.id} style={{
            marginBottom: 8, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isEditing ? 10 : 0 }}>
              {h.imageUrl && (
                <img src={h.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <span
                style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#e4e4e7', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => setEditingHandout(isEditing ? null : h.id)}
              >
                {h.title || 'Untitled'}
              </span>
              <button onClick={() => removeHandout(h.id)} style={removeBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
              >×</button>
            </div>
            {isEditing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={h.title} onChange={(e) => updateHandout(h.id, { title: e.target.value })}
                  placeholder="Title" style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {h.imageUrl ? (
                    <img src={h.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => handoutFileRef.current?.click()} />
                  ) : (
                    <button onClick={() => handoutFileRef.current?.click()}
                      style={{
                        width: 56, height: 56, borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.15)',
                        cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >{handoutUploading ? '...' : '+'}</button>
                  )}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    {h.imageUrl ? 'Click to change' : 'Add image'}
                  </span>
                </div>
                <input ref={handoutFileRef} type="file" accept="image/*"
                  onChange={(e) => handleHandoutImageUpload(e, h.id)} style={{ display: 'none' }} />
                <textarea value={h.description} onChange={(e) => updateHandout(h.id, { description: e.target.value })}
                  placeholder="Description..." rows={4}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
              </div>
            )}
          </div>
        )
      })}
      <button onClick={addHandout} style={addBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
      >+ Add handout</button>
    </div>
  )

  const tabContent: Record<TabId, () => React.ReactNode> = {
    resources: renderResources,
    attributes: renderAttributes,
    statuses: renderStatuses,
    notes: renderNotes,
    handouts: renderHandouts,
  }

  return (
    <div
      style={{
        position: 'fixed', top: '50%', left: 0,
        transform: 'translateY(-50%)',
        zIndex: 10000, display: 'flex',
        pointerEvents: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{
        display: 'flex', alignItems: 'center',
        transform: open ? 'translateX(0)' : 'translateX(-280px)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'auto',
      }}>
        {/* Card panel */}
        <div style={{
          width: 272,
          background: 'rgba(15, 15, 25, 0.88)',
          backdropFilter: 'blur(16px)',
          borderRadius: '0 14px 14px 0',
          boxShadow: '4px 0 32px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderLeft: 'none',
          fontFamily: 'sans-serif',
          color: '#e4e4e7',
        }}>
          {/* ── Header (portrait + name) ── */}
          <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
            {/* Portrait */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                {character.imageUrl ? (
                  <img src={character.imageUrl} alt={character.name}
                    style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${character.color}`, boxShadow: `0 0 20px ${character.color}33`, display: 'block' }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${character.color}, ${character.color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 700, boxShadow: `0 0 20px ${character.color}33` }}>
                    {character.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  </div>
                )}
                <div
                  style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePortraitUpload} style={{ display: 'none' }} />
            </div>

            {/* Name + Type */}
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: 0.3 }}>{character.name}</div>
              <span style={{
                display: 'inline-block', marginTop: 4,
                fontSize: 9, padding: '2px 8px', borderRadius: 8,
                background: character.type === 'npc' ? 'rgba(251,191,36,0.2)' : 'rgba(96,165,250,0.2)',
                color: character.type === 'npc' ? '#fbbf24' : '#60a5fa',
                fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
              }}>
                {character.type === 'npc' ? 'NPC' : 'Player Character'}
              </span>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div style={{
            display: 'flex',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? `2px solid ${character.color}` : '2px solid transparent',
                  cursor: 'pointer',
                  color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.35)',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  transition: 'color 0.15s, background 0.15s, border-color 0.15s',
                  fontFamily: 'sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab content (fixed height, scroll if needed) ── */}
          <div style={{
            padding: '14px 16px 16px',
            overflowY: 'auto',
            height: 500,
          }}>
            {tabContent[activeTab]()}
          </div>
        </div>

        {/* Tab handle — always visible */}
        <div
          onClick={() => setOpen(!open)}
          style={{
            width: 36, padding: '12px 0',
            background: 'rgba(15, 15, 25, 0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '0 10px 10px 0',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            border: '1px solid rgba(255,255,255,0.08)', borderLeft: 'none',
            boxShadow: '4px 0 16px rgba(0,0,0,0.2)',
            transition: 'background 0.15s', marginLeft: -1,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(25, 25, 40, 0.92)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(15, 15, 25, 0.85)' }}
        >
          {character.imageUrl ? (
            <img src={character.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${character.color}` }} />
          ) : (
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: character.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif' }}>
              {character.name.charAt(0).toUpperCase()}
            </div>
          )}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
