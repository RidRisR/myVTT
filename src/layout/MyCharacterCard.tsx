import { useEffect, useRef, useState } from 'react'
import type { Entity } from '../shared/entityTypes'
import type { RuleSystem, RollAction } from '../rules/types'
import {
  getEntityResources,
  getEntityAttributes,
  getEntityStatuses,
  type ResourceView,
  type AttributeView,
} from '../shared/entityAdapters'
import { barColorForKey, statusColor } from '../shared/tokenUtils'
import { uploadAsset } from '../shared/assetUpload'
import { ResourceBar } from '../shared/ui/ResourceBar'
import { MiniHoldButton } from '../shared/ui/MiniHoldButton'

interface MyCharacterCardProps {
  entity: Entity
  onUpdateEntity: (id: string, updates: Partial<Entity>) => void
  ruleSystem?: RuleSystem
  onRollAction?: (action: RollAction) => void
}

type TabId = 'resources' | 'attributes' | 'statuses' | 'notes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'resources', label: 'RES' },
  { id: 'attributes', label: 'ATTR' },
  { id: 'statuses', label: 'STATUS' },
  { id: 'notes', label: 'NOTES' },
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

// Helper to update ruleData sub-field
function updateRuleData(entity: Entity, key: string, value: unknown): Partial<Entity> {
  const rd = (entity.ruleData ?? {}) as Record<string, unknown>
  return { ruleData: { ...rd, [key]: value } }
}

export function MyCharacterCard({
  entity,
  onUpdateEntity,
  ruleSystem,
  onRollAction,
}: MyCharacterCardProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('resources')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState(entity.name)
  const [colorPickerOpen, setColorPickerOpen] = useState<number | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  // Sync editName when entity name changes externally
  useEffect(() => {
    setEditName(entity.name)
  }, [entity.name])

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

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== entity.name) {
      onUpdateEntity(entity.id, { name: trimmed })
    }
    setEditingName(false)
  }

  // Status add input
  const [statusInput, setStatusInput] = useState('')

  const resources = getEntityResources(entity)
  const attributes = getEntityAttributes(entity)
  const statuses = getEntityStatuses(entity)
  const notes = entity.notes

  /* ── Portrait upload ── */
  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAsset(file)
      onUpdateEntity(entity.id, { imageUrl: url })
    } catch (err) {
      console.error('Portrait upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ── Resource helpers ── */
  const updateResource = (index: number, updates: Partial<ResourceView>) => {
    const next = [...resources]
    next[index] = { ...next[index], ...updates }
    onUpdateEntity(entity.id, updateRuleData(entity, 'resources', next))
  }
  const addResource = () => {
    const color = barColorForKey(`res_${resources.length}`)
    const next = [...resources, { key: '', current: 10, max: 10, color }]
    onUpdateEntity(entity.id, updateRuleData(entity, 'resources', next))
  }
  const removeResource = (index: number) => {
    onUpdateEntity(
      entity.id,
      updateRuleData(
        entity,
        'resources',
        resources.filter((_, i) => i !== index),
      ),
    )
  }

  /* ── Attribute helpers ── */
  const updateAttribute = (index: number, updates: Partial<AttributeView>) => {
    const next = [...attributes]
    next[index] = { ...next[index], ...updates }
    onUpdateEntity(entity.id, updateRuleData(entity, 'attributes', next))
  }
  const addAttribute = () => {
    const next = [...attributes, { key: '', value: 10 }]
    onUpdateEntity(entity.id, updateRuleData(entity, 'attributes', next))
  }
  const removeAttribute = (index: number) => {
    onUpdateEntity(
      entity.id,
      updateRuleData(
        entity,
        'attributes',
        attributes.filter((_, i) => i !== index),
      ),
    )
  }

  /* ── Status helpers ── */
  const addStatus = () => {
    const label = statusInput.trim()
    if (!label) return
    if (statuses.some((s) => s.label === label)) return
    onUpdateEntity(entity.id, updateRuleData(entity, 'statuses', [...statuses, { label }]))
    setStatusInput('')
  }
  const removeStatus = (index: number) => {
    onUpdateEntity(
      entity.id,
      updateRuleData(
        entity,
        'statuses',
        statuses.filter((_, i) => i !== index),
      ),
    )
  }

  /* ── Tab content renderers ── */
  const renderResources = () => (
    <div>
      {resources.map((res, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          {/* Header: name + current/max inputs + remove */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <input
              value={res.key}
              onChange={(e) => updateResource(i, { key: e.target.value })}
              placeholder="Name"
              style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 6px', fontWeight: 600 }}
            />
            <input
              key={`cur-${i}-${res.current}`}
              defaultValue={res.current}
              onBlur={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v)) updateResource(i, { current: Math.max(0, Math.min(v, res.max)) })
                else e.target.value = String(res.current)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              style={{
                ...inputStyle,
                width: 32,
                textAlign: 'center',
                fontSize: 11,
                padding: '3px 2px',
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>/</span>
            <input
              key={`max-${i}-${res.max}`}
              defaultValue={res.max}
              onBlur={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v > 0)
                  updateResource(i, { max: v, current: Math.min(res.current, v) })
                else e.target.value = String(res.max)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              style={{
                ...inputStyle,
                width: 32,
                textAlign: 'center',
                fontSize: 11,
                padding: '3px 2px',
                fontWeight: 700,
              }}
            />
            <div
              onClick={() => setColorPickerOpen(colorPickerOpen === i ? null : i)}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: res.color,
                border: '2px solid rgba(255,255,255,0.25)',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
              }}
              title="Change color"
            />
            <button
              onClick={() => removeResource(i)}
              style={removeBtnStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.2)'
              }}
            >
              ×
            </button>
          </div>
          <ResourceBar
            current={res.current}
            max={res.max}
            color={res.color}
            height={18}
            valueDisplay="inline"
            draggable
            showButtons
            onChange={(val: number) => updateResource(i, { current: val })}
          />
          {/* Color picker — collapsed by default */}
          {colorPickerOpen === i && (
            <div
              ref={colorPickerRef}
              style={{ display: 'flex', gap: 3, marginTop: 5, justifyContent: 'center' }}
            >
              {[
                '#22c55e',
                '#3b82f6',
                '#8b5cf6',
                '#f59e0b',
                '#06b6d4',
                '#ec4899',
                '#ef4444',
                '#f97316',
              ].map((c) => (
                <div
                  key={c}
                  onClick={() => {
                    updateResource(i, { color: c })
                    setColorPickerOpen(null)
                  }}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: c === res.color ? '2px solid #fff' : '2px solid transparent',
                    transition: 'border-color 0.15s',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={addResource}
        style={addBtnStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
        }}
      >
        + Add resource
      </button>
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
          <MiniHoldButton
            label="−"
            onTick={() => updateAttribute(i, { value: Math.max(0, attr.value - 1) })}
            color="#ef4444"
          />
          <input
            value={attr.value}
            onChange={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v)) updateAttribute(i, { value: Math.max(0, v) })
            }}
            style={{
              ...inputStyle,
              width: 40,
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 700,
              padding: '4px 2px',
              color: '#fff',
            }}
          />
          <MiniHoldButton
            label="+"
            onTick={() => updateAttribute(i, { value: attr.value + 1 })}
            color="#22c55e"
          />
          <button
            onClick={() => removeAttribute(i)}
            style={removeBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ef4444'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.2)'
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addAttribute}
        style={addBtnStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
        }}
      >
        + Add attribute
      </button>
    </div>
  )

  const renderStatuses = () => (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {statuses.map((s, i) => {
          const sc = statusColor(s.label)
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px 4px 12px',
                borderRadius: 14,
                background: `${sc}22`,
                color: sc,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${sc}33`,
              }}
            >
              {s.label}
              <button
                onClick={() => removeStatus(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: sc,
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                  opacity: 0.6,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6'
                }}
              >
                ×
              </button>
            </span>
          )
        })}
        {statuses.length === 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
            No active statuses
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={statusInput}
          onChange={(e) => setStatusInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addStatus()
          }}
          placeholder="Add status..."
          style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }}
        />
        <button
          onClick={addStatus}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            padding: '6px 12px',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
          }}
        >
          Add
        </button>
      </div>
    </div>
  )

  const renderNotes = () => (
    <div>
      <textarea
        value={notes}
        onChange={(e) => onUpdateEntity(entity.id, { notes: e.target.value })}
        placeholder="Free-form notes..."
        rows={8}
        style={{
          ...inputStyle,
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          fontSize: 12,
          lineHeight: 1.6,
          padding: '10px 12px',
        }}
      />
    </div>
  )

  const tabContent: Record<TabId, () => React.ReactNode> = {
    resources: renderResources,
    attributes: renderAttributes,
    statuses: renderStatuses,
    notes: renderNotes,
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: 0,
        transform: 'translateY(-50%)',
        zIndex: 10000,
        display: 'flex',
        pointerEvents: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          transform: open ? 'translateX(0)' : 'translateX(-280px)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'auto',
        }}
      >
        {/* Card panel */}
        <div
          style={{
            width: 272,
            background: 'rgba(15, 15, 25, 0.88)',
            backdropFilter: 'blur(16px)',
            borderRadius: '0 14px 14px 0',
            boxShadow: '4px 0 32px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderLeft: 'none',
            fontFamily: 'sans-serif',
            color: '#e4e4e7',
          }}
        >
          {ruleSystem ? (
            /* ── Rule-managed content (portrait, name, everything) ── */
            <div style={{ overflowY: 'auto', height: 680 }}>
              <ruleSystem.EntityCard
                entity={entity}
                onUpdateEntity={onUpdateEntity}
                onRollAction={onRollAction ?? (() => {})}
              />
            </div>
          ) : (
            /* ── Fallback: generic tabs (no rule system) ── */
            <>
              {/* ── Header (portrait + name) ── */}
              <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
                {/* Portrait */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {entity.imageUrl ? (
                      <img
                        src={entity.imageUrl}
                        alt={entity.name}
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `3px solid ${entity.color}`,
                          boxShadow: `0 0 20px ${entity.color}33`,
                          display: 'block',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          background: `linear-gradient(135deg, ${entity.color}, ${entity.color}99)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 32,
                          fontWeight: 700,
                          boxShadow: `0 0 20px ${entity.color}33`,
                        }}
                      >
                        {entity.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {uploading && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ animation: 'spin 1s linear infinite' }}
                        >
                          <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                      </div>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.3)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)'
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ opacity: 0.7 }}
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePortraitUpload}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Name */}
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  {editingName ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') {
                          setEditingName(false)
                          setEditName(entity.name)
                        }
                      }}
                      style={{
                        width: '80%',
                        padding: '3px 8px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        fontSize: 16,
                        fontWeight: 700,
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        outline: 'none',
                        textAlign: 'center',
                        letterSpacing: 0.3,
                        boxSizing: 'border-box',
                        fontFamily: 'sans-serif',
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => setEditingName(true)}
                      style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: '#fff',
                        letterSpacing: 0.3,
                        cursor: 'text',
                      }}
                      title="Click to rename"
                    >
                      {entity.name}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Tab bar ── */}
              <div
                style={{
                  display: 'flex',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      background: activeTab === tab.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: 'none',
                      borderBottom:
                        activeTab === tab.id
                          ? `2px solid ${entity.color}`
                          : '2px solid transparent',
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
                      if (activeTab !== tab.id)
                        e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== tab.id)
                        e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab content (fixed height, scroll if needed) ── */}
              <div
                style={{
                  padding: '14px 16px 16px',
                  overflowY: 'auto',
                  height: 500,
                }}
              >
                {tabContent[activeTab]()}
              </div>
            </>
          )}
        </div>

        {/* Tab handle — always visible */}
        <div
          onClick={() => setOpen(!open)}
          style={{
            width: 36,
            padding: '12px 0',
            background: 'rgba(15, 15, 25, 0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '0 10px 10px 0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            border: '1px solid rgba(255,255,255,0.08)',
            borderLeft: 'none',
            boxShadow: '4px 0 16px rgba(0,0,0,0.2)',
            transition: 'background 0.15s',
            marginLeft: -1,
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'rgba(25, 25, 40, 0.92)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'rgba(15, 15, 25, 0.85)'
          }}
        >
          {entity.imageUrl ? (
            <img
              src={entity.imageUrl}
              alt=""
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${entity.color}`,
              }}
            />
          ) : (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: entity.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'sans-serif',
              }}
            >
              {entity.name.charAt(0).toUpperCase()}
            </div>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease',
            }}
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
