import { useState } from 'react'
import type { CombatToken } from './combatTypes'
import type { Seat } from '../identity/useIdentity'
import type { Resource, Attribute } from '../shared/tokenTypes'
import { barColorForKey, statusColor } from '../shared/tokenUtils'
import { useHoldRepeat } from '../shared/useHoldRepeat'

interface TokenPropertiesPanelProps {
  token: CombatToken
  seats: Seat[]
  onUpdate: (id: string, updates: Partial<CombatToken>) => void
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

export function TokenPropertiesPanel({ token, seats, onUpdate, onClose }: TokenPropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [statusInput, setStatusInput] = useState('')

  const update = (updates: Partial<CombatToken>) => onUpdate(token.id, updates)

  /* ── Resource helpers ── */
  const updateResource = (index: number, updates: Partial<Resource>) => {
    const next = [...token.resources]
    next[index] = { ...next[index], ...updates }
    update({ resources: next })
  }
  const addResource = () => {
    const color = barColorForKey(`res_${token.resources.length}`)
    update({ resources: [...token.resources, { key: '', current: 10, max: 10, color }] })
  }
  const removeResource = (index: number) => {
    update({ resources: token.resources.filter((_, i) => i !== index) })
  }

  /* ── Attribute helpers ── */
  const updateAttribute = (index: number, updates: Partial<Attribute>) => {
    const next = [...token.attributes]
    next[index] = { ...next[index], ...updates }
    update({ attributes: next })
  }
  const addAttribute = () => {
    update({ attributes: [...token.attributes, { key: '', value: 10 }] })
  }
  const removeAttribute = (index: number) => {
    update({ attributes: token.attributes.filter((_, i) => i !== index) })
  }

  /* ── Status helpers ── */
  const addStatus = () => {
    const label = statusInput.trim()
    if (!label || token.statuses.some(s => s.label === label)) return
    update({ statuses: [...token.statuses, { label }] })
    setStatusInput('')
  }
  const removeStatus = (index: number) => {
    update({ statuses: token.statuses.filter((_, i) => i !== index) })
  }

  /* ── Tab renderers ── */
  const renderInfo = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Token image preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={token.imageUrl} alt={token.name}
          style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${token.color}`, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Name</label>
          <input value={token.name} onChange={(e) => update({ name: e.target.value })}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} />
        </div>
      </div>

      {/* Size */}
      <div>
        <label style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }}>Size (grid cells)</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4].map(s => (
            <button key={s} onClick={() => update({ size: s })}
              style={{
                flex: 1, padding: '6px 0',
                background: token.size === s ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: token.size === s ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6, cursor: 'pointer',
                color: token.size === s ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: 600, fontFamily: 'sans-serif',
                transition: 'all 0.15s',
              }}
            >{s}×{s}</button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <label style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }}>Color</label>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'].map(c => (
            <div key={c} onClick={() => update({ color: c })}
              style={{
                width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                border: c === token.color ? '2px solid #fff' : '2px solid transparent',
                transition: 'border-color 0.15s',
              }} />
          ))}
        </div>
      </div>

      {/* Owner */}
      <div>
        <label style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }}>Owner</label>
        <select
          value={token.ownerId ?? ''}
          onChange={(e) => update({ ownerId: e.target.value || null })}
          style={{
            ...inputStyle, width: '100%', boxSizing: 'border-box',
            cursor: 'pointer', fontSize: 12,
          }}
        >
          <option value="">NPC (no owner)</option>
          {seats.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderResources = () => (
    <div>
      {token.resources.map((res, i) => {
        const pct = res.max > 0 ? Math.min(res.current / res.max, 1) : 0
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input value={res.key} onChange={(e) => updateResource(i, { key: e.target.value })}
                placeholder="Name" style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 6px', fontWeight: 600 }} />
              <HoldButton label="−" onTick={() => updateResource(i, { current: Math.max(0, res.current - 1) })} color="#ef4444" />
              <HoldButton label="+" onTick={() => updateResource(i, { current: Math.min(res.max, res.current + 1) })} color="#22c55e" />
              <button onClick={() => removeResource(i)} style={removeBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
              >×</button>
            </div>
            <div style={{ height: 16, borderRadius: 8, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${pct * 100}%`, background: `linear-gradient(90deg, ${res.color}, ${res.color}cc)`, borderRadius: 8, transition: 'width 0.2s ease' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                <input value={res.current}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateResource(i, { current: Math.max(0, Math.min(v, res.max)) }) }}
                  style={{ width: 28, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 10, fontWeight: 700, padding: 0 }} />
                <span style={{ margin: '0 1px' }}>/</span>
                <input value={res.max}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) updateResource(i, { max: v, current: Math.min(res.current, v) }) }}
                  style={{ width: 28, textAlign: 'left', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 10, fontWeight: 700, padding: 0 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 5, justifyContent: 'center' }}>
              {['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#ef4444', '#f97316'].map(c => (
                <div key={c} onClick={() => updateResource(i, { color: c })}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: c === res.color ? '2px solid #fff' : '2px solid transparent', transition: 'border-color 0.15s' }} />
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
      {token.attributes.map((attr, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <input value={attr.key} onChange={(e) => updateAttribute(i, { key: e.target.value })}
            placeholder="Name" style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '5px 8px', fontWeight: 600 }} />
          <HoldButton label="−" onTick={() => updateAttribute(i, { value: Math.max(0, attr.value - 1) })} color="#ef4444" />
          <input value={attr.value}
            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateAttribute(i, { value: Math.max(0, v) }) }}
            style={{ ...inputStyle, width: 40, textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '4px 2px', color: '#fff' }} />
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
        {token.statuses.map((s, i) => {
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
              >×</button>
            </span>
          )
        })}
        {token.statuses.length === 0 && (
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
      <textarea value={token.notes} onChange={(e) => update({ notes: e.target.value })}
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
        top: 80,
        right: 16,
        width: 272,
        zIndex: 10000,
        background: 'rgba(15, 15, 25, 0.88)',
        backdropFilter: 'blur(16px)',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'sans-serif',
        color: '#e4e4e7',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Token</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 18, padding: '0 2px', lineHeight: 1, transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
        >×</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '7px 0',
              background: activeTab === tab.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${token.color}` : '2px solid transparent',
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
      <div style={{ padding: '12px 14px 14px', overflowY: 'auto', maxHeight: 400 }}>
        {tabContent[activeTab]()}
      </div>
    </div>
  )
}
