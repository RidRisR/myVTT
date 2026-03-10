import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
import { uploadAsset } from '../shared/assetUpload'
import {
  getEntityResources,
  getEntityAttributes,
  getEntityStatuses,
  type ResourceView,
  type AttributeView,
} from '../shared/entityAdapters'
import { barColorForKey, statusColor } from '../shared/tokenUtils'
import { ResourceBar } from '../shared/ui/ResourceBar'
import { MiniHoldButton } from '../shared/ui/MiniHoldButton'

interface CharacterEditPanelProps {
  character: Entity
  onUpdateCharacter: (id: string, updates: Partial<Entity>) => void
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

export function CharacterEditPanel({
  character,
  onUpdateCharacter,
  onClose,
}: CharacterEditPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [statusInput, setStatusInput] = useState('')
  const [uploading, setUploading] = useState(false)
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

  const updateChar = (updates: Partial<Entity>) => onUpdateCharacter(character.id, updates)

  /** Wrap a ruleData sub-key update into a Partial<Entity> */
  function updateRuleData(key: string, value: unknown): Partial<Entity> {
    const rd = (character.ruleData ?? {}) as Record<string, unknown>
    return { ruleData: { ...rd, [key]: value } }
  }

  const resources = getEntityResources(character)
  const attributes = getEntityAttributes(character)
  const statuses = getEntityStatuses(character)

  /* -- Resource helpers -- */
  const updateResource = (index: number, updates: Partial<ResourceView>) => {
    const next = [...resources]
    next[index] = { ...next[index], ...updates }
    updateChar(updateRuleData('resources', next))
  }
  const addResource = () => {
    const color = barColorForKey(`res_${resources.length}`)
    updateChar(
      updateRuleData('resources', [...resources, { key: '', current: 10, max: 10, color }]),
    )
  }
  const removeResource = (index: number) => {
    updateChar(
      updateRuleData(
        'resources',
        resources.filter((_, i) => i !== index),
      ),
    )
  }

  /* -- Attribute helpers -- */
  const updateAttribute = (index: number, updates: Partial<AttributeView>) => {
    const next = [...attributes]
    next[index] = { ...next[index], ...updates }
    updateChar(updateRuleData('attributes', next))
  }
  const addAttribute = () => {
    updateChar(updateRuleData('attributes', [...attributes, { key: '', value: 10 }]))
  }
  const removeAttribute = (index: number) => {
    updateChar(
      updateRuleData(
        'attributes',
        attributes.filter((_, i) => i !== index),
      ),
    )
  }

  /* -- Status helpers -- */
  const addStatus = () => {
    const label = statusInput.trim()
    if (!label || statuses.some((s) => s.label === label)) return
    updateChar(updateRuleData('statuses', [...statuses, { label }]))
    setStatusInput('')
  }
  const removeStatus = (index: number) => {
    updateChar(
      updateRuleData(
        'statuses',
        statuses.filter((_, i) => i !== index),
      ),
    )
  }

  /* -- Portrait upload -- */
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

  /* -- Tab renderers -- */
  const renderInfo = () => (
    <div className="flex flex-col gap-2.5">
      {/* Portrait + name */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePortraitUpload}
        />
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative cursor-pointer shrink-0"
          title="Click to change portrait"
        >
          {character.imageUrl ? (
            <img
              src={character.imageUrl}
              alt={character.name}
              className="w-12 h-12 rounded-full object-cover block"
              style={{ border: `3px solid ${character.color}` }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{
                background: `linear-gradient(135deg, ${character.color}, ${character.color}aa)`,
                border: `3px solid ${character.color}`,
                boxSizing: 'border-box',
              }}
            >
              {character.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Upload overlay */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center transition-colors duration-fast text-[10px] text-white font-semibold"
            style={{
              background: uploading ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
            }}
            onMouseEnter={(e) => {
              if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
            }}
            onMouseLeave={(e) => {
              if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0)'
            }}
          >
            {uploading ? '...' : ''}
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[9px] text-text-muted/40 uppercase tracking-wider">Name</label>
          <input
            value={character.name}
            onChange={(e) => updateChar({ name: e.target.value })}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Color */}
      <div ref={colorPickerOpen === 'character' ? colorPickerRef : undefined}>
        <div className="flex items-center gap-2">
          <label className="text-[9px] text-text-muted/40 uppercase tracking-wider">Color</label>
          <div
            onClick={() => setColorPickerOpen(colorPickerOpen === 'character' ? null : 'character')}
            className="w-[18px] h-[18px] rounded-full cursor-pointer transition-[border-color] duration-fast hover:border-white/50"
            style={{
              background: character.color,
              border: '2px solid rgba(255,255,255,0.3)',
            }}
            title="Change color"
          />
        </div>
        {colorPickerOpen === 'character' && (
          <div className="flex gap-[5px] flex-wrap mt-1.5">
            {[
              '#3b82f6',
              '#ef4444',
              '#22c55e',
              '#f59e0b',
              '#8b5cf6',
              '#ec4899',
              '#06b6d4',
              '#f97316',
            ].map((c) => (
              <div
                key={c}
                onClick={() => {
                  updateChar({ color: c })
                  setColorPickerOpen(null)
                }}
                className="w-[22px] h-[22px] rounded-full cursor-pointer transition-[border-color] duration-fast"
                style={{
                  background: c,
                  border: c === character.color ? '2px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderResources = () => (
    <div>
      {resources.map((res, i) => {
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
            {/* Bar row: - draggable bar + */}
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
        value={character.notes}
        onChange={(e) => updateChar({ notes: e.target.value })}
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
    info: renderInfo,
    resources: renderResources,
    attributes: renderAttributes,
    statuses: renderStatuses,
    notes: renderNotes,
  }

  return (
    <div
      className="bg-glass backdrop-blur-[16px] rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-border-glass font-sans text-text-primary flex flex-col"
      style={{
        width: 320,
        maxHeight: 'inherit',
        boxSizing: 'border-box',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2 shrink-0">
        <span className="text-[11px] font-bold text-text-muted/50 uppercase tracking-wider">
          Character
        </span>
        <button
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer text-text-muted/30 p-0.5 leading-none transition-colors duration-fast hover:text-text-muted/70"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-t border-border-glass border-b border-b-border-glass shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-[7px] bg-transparent border-none cursor-pointer text-[8px] font-bold tracking-wider uppercase transition-colors duration-fast font-sans ${
              activeTab === tab.id
                ? 'bg-surface/60 text-white'
                : 'text-text-muted/35 hover:text-text-muted/60'
            }`}
            style={{
              borderBottom:
                activeTab === tab.id ? `2px solid ${character.color}` : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-3.5 py-3 overflow-y-auto flex-1 min-h-0">{tabContent[activeTab]()}</div>
    </div>
  )
}
