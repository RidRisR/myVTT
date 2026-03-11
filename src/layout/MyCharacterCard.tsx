import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronRight, Loader } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
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
import { useIdentityStore } from '../stores/identityStore'
import { useAwarenessResource, getRemoteEdit } from '../shared/hooks/useAwarenessResource'

interface MyCharacterCardProps {
  entity: Entity
  onUpdateEntity: (id: string, updates: Partial<Entity>) => void
}

type TabId = 'resources' | 'attributes' | 'statuses' | 'notes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'resources', label: 'RES' },
  { id: 'attributes', label: 'ATTR' },
  { id: 'statuses', label: 'STATUS' },
  { id: 'notes', label: 'NOTES' },
]

/* -- reusable styles -- */
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

export function MyCharacterCard({ entity, onUpdateEntity }: MyCharacterCardProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('resources')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState(entity.name)
  const [colorPickerOpen, setColorPickerOpen] = useState<number | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  // Awareness for resource drag broadcasting
  const awareness = useIdentityStore((s) => s.getAwareness())
  const mySeatId = useIdentityStore((s) => s.mySeatId)
  const mySeat = useIdentityStore((s) => s.getMySeat())
  const { broadcastEditing, clearEditing, remoteEdits } = useAwarenessResource(
    awareness,
    mySeatId,
    mySeat?.color ?? null,
  )

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

  /* -- Portrait upload -- */
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

  /* -- Resource helpers -- */
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

  /* -- Attribute helpers -- */
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

  /* -- Status helpers -- */
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

  /* -- Tab content renderers -- */
  const renderResources = () => (
    <div>
      {resources.map((res, i) => {
        const remoteEdit = getRemoteEdit(remoteEdits, entity.id, String(i))
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            {/* Header: name + current/max inputs + remove */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input
                value={res.key}
                onChange={(e) => updateResource(i, { key: e.target.value })}
                placeholder="Name"
                style={{
                  ...inputStyle,
                  flex: 1,
                  fontSize: 11,
                  padding: '3px 6px',
                  fontWeight: 600,
                }}
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
              <span className="text-[10px] text-text-muted/30">/</span>
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
                className="w-3 h-3 rounded-full cursor-pointer shrink-0 transition-[border-color] duration-fast hover:border-white/50"
                style={{
                  background: res.color,
                  border: '2px solid rgba(255,255,255,0.25)',
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
                x
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
              onDragStart={() => broadcastEditing(entity.id, String(i), res.current)}
              onDragMove={(val: number) => broadcastEditing(entity.id, String(i), val)}
              onDragEnd={() => clearEditing()}
              remoteDragValue={remoteEdit?.value ?? null}
              softLockColor={remoteEdit?.color ?? null}
            />
            {/* Color picker -- collapsed by default */}
            {colorPickerOpen === i && (
              <div ref={colorPickerRef} className="flex gap-[3px] mt-[5px] justify-center">
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
                    className="w-3.5 h-3.5 rounded-full cursor-pointer transition-[border-color] duration-fast"
                    style={{
                      background: c,
                      border: c === res.color ? '2px solid #fff' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
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
            label="-"
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
            x
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
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {statuses.map((s, i) => {
          const sc = statusColor(s.label)
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[14px] text-xs font-semibold"
              style={{
                background: `${sc}22`,
                color: sc,
                border: `1px solid ${sc}33`,
              }}
            >
              {s.label}
              <button
                onClick={() => removeStatus(i)}
                className="bg-transparent border-none cursor-pointer text-sm p-0 leading-none opacity-60 transition-opacity duration-fast hover:opacity-100"
                style={{ color: sc }}
              >
                x
              </button>
            </span>
          )
        })}
        {statuses.length === 0 && (
          <span className="text-xs text-text-muted/25 italic">No active statuses</span>
        )}
      </div>
      <div className="flex gap-1">
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
          className="bg-surface border border-border-glass rounded-md cursor-pointer text-text-muted/40 text-[11px] px-3 py-1.5 transition-colors duration-fast hover:bg-hover hover:text-text-muted/70"
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
      className="fixed top-1/2 left-0 -translate-y-1/2 z-toast flex pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center pointer-events-auto"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-280px)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Card panel */}
        <div className="w-[272px] bg-glass backdrop-blur-[16px] rounded-r-[14px] shadow-[4px_0_32px_rgba(0,0,0,0.3)] border border-border-glass border-l-0 font-sans text-text-primary">
          {/* Header (portrait + name) */}
          <div className="pt-5 px-4 shrink-0">
            {/* Portrait */}
            <div className="flex flex-col items-center mb-3">
              <div
                className="relative cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {entity.imageUrl ? (
                  <img
                    src={entity.imageUrl}
                    alt={entity.name}
                    className="w-20 h-20 rounded-full object-cover block"
                    style={{
                      border: `3px solid ${entity.color}`,
                      boxShadow: `0 0 20px ${entity.color}33`,
                    }}
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-[32px] font-bold"
                    style={{
                      background: `linear-gradient(135deg, ${entity.color}, ${entity.color}99)`,
                      boxShadow: `0 0 20px ${entity.color}33`,
                    }}
                  >
                    {entity.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white">
                    <Loader size={20} strokeWidth={1.5} className="animate-spin" />
                  </div>
                )}
                <div
                  className="absolute inset-0 rounded-full flex items-center justify-center transition-colors duration-200"
                  style={{ background: 'rgba(0,0,0,0)' }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.3)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)'
                  }}
                >
                  <Camera size={16} strokeWidth={1.5} className="text-white opacity-70" />
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePortraitUpload}
                className="hidden"
              />
            </div>

            {/* Name */}
            <div className="text-center mb-3.5">
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
                  className="w-4/5 px-2 py-0.5 border border-border-glass rounded-md text-base font-bold bg-surface text-white outline-none text-center tracking-wide font-sans"
                />
              ) : (
                <div
                  onClick={() => setEditingName(true)}
                  className="font-bold text-base text-white tracking-wide cursor-text"
                  title="Click to rename"
                >
                  {entity.name}
                </div>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-t border-border-glass border-b border-b-border-glass shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 bg-transparent border-none cursor-pointer text-[9px] font-bold tracking-wider uppercase transition-colors duration-fast font-sans ${
                  activeTab === tab.id
                    ? 'bg-surface/60 text-white'
                    : 'text-text-muted/35 hover:text-text-muted/60'
                }`}
                style={{
                  borderBottom:
                    activeTab === tab.id ? `2px solid ${entity.color}` : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content (fixed height, scroll if needed) */}
          <div className="px-4 py-3.5 overflow-y-auto" style={{ height: 500 }}>
            {tabContent[activeTab]()}
          </div>
        </div>

        {/* Tab handle -- always visible */}
        <div
          onClick={() => setOpen(!open)}
          className="w-9 py-3 bg-glass backdrop-blur-[12px] rounded-r-[10px] cursor-pointer flex flex-col items-center gap-1.5 border border-border-glass border-l-0 shadow-[4px_0_16px_rgba(0,0,0,0.2)] transition-colors duration-fast -ml-px hover:bg-surface"
        >
          {entity.imageUrl ? (
            <img
              src={entity.imageUrl}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
              style={{ border: `2px solid ${entity.color}` }}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold font-sans"
              style={{ background: entity.color }}
            >
              {entity.name.charAt(0).toUpperCase()}
            </div>
          )}
          <ChevronRight
            size={10}
            strokeWidth={2.5}
            className="text-text-muted/40 transition-transform duration-300"
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
