import { useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useClickOutside } from '../hooks/useClickOutside'
import type { Entity } from '../shared/entityTypes'
import { getName, getColor, getImageUrl, getIdentity, getNotes } from '../shared/coreComponents'
import type { CoreIdentity } from '../shared/coreComponents'
import { AssetPickerPanel } from '../asset-picker/AssetPickerPanel'
import { useRulePlugin } from '../rules/useRulePlugin'
import type { ResourceView } from '../rules/types'
import { barColorForKey, statusColor } from '../shared/tokenUtils'
import { ResourceBar } from '../ui/ResourceBar'
import { MiniHoldButton } from '../ui/MiniHoldButton'
import { useIdentityStore } from '../stores/identityStore'
import { useAwarenessResource, getRemoteEdit } from '../hooks/useAwarenessResource'

interface CharacterEditPanelProps {
  character: Entity
  onUpdateCharacter: (id: string, updates: Partial<Entity>) => void
  onClose?: () => void
}

type TabId = 'info' | 'resources' | 'attributes' | 'statuses' | 'notes'

const TAB_IDS: TabId[] = ['info', 'resources', 'attributes', 'statuses', 'notes']

const TAB_I18N_KEYS: Record<TabId, string> = {
  info: 'character.tab_info',
  resources: 'character.tab_resources',
  attributes: 'character.tab_attributes',
  statuses: 'character.tab_statuses',
  notes: 'character.tab_notes',
}

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

function updateComponent(entity: Entity, key: string, value: unknown): Partial<Entity> {
  return { components: { ...entity.components, [key]: value } }
}

export function CharacterEditPanel({
  character,
  onUpdateCharacter,
  onClose,
}: CharacterEditPanelProps) {
  const { t } = useTranslation('layout')
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [statusInput, setStatusInput] = useState('')
  const [colorPickerOpen, setColorPickerOpen] = useState<'character' | number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  const plugin = useRulePlugin()

  // Awareness for resource drag broadcasting
  const mySeatId = useIdentityStore((s) => s.mySeatId)
  const mySeat = useIdentityStore((s) => s.getMySeat())
  const { broadcastEditing, clearEditing, remoteEdits } = useAwarenessResource(
    mySeatId,
    mySeat?.color ?? null,
  )

  // Close color picker on click outside (Radix Portal-aware)
  const closeColorPicker = useCallback(() => {
    setColorPickerOpen(null)
  }, [])
  useClickOutside(colorPickerRef, closeColorPicker, colorPickerOpen !== null)

  const updateChar = (updates: Partial<Entity>) => {
    onUpdateCharacter(character.id, updates)
  }

  const name = getName(character)
  const imageUrl = getImageUrl(character)
  const color = getColor(character)
  const identity = getIdentity(character)
  const notes = getNotes(character).text

  const resources = plugin.adapters.getPortraitResources(character)
  const attributes = plugin.adapters.getFormulaTokens(character)
  const statuses = plugin.adapters.getStatuses(character)
  const attrEntries = Object.entries(attributes)

  const updateIdentity = (patch: Partial<CoreIdentity>) => {
    updateChar(updateComponent(character, 'core:identity', { ...identity, ...patch }))
  }

  /* -- Resource helpers -- */
  const rawResources = (character.components['rule:resources'] ?? []) as ResourceView[]
  const updateResource = (index: number, updates: Partial<ResourceView>) => {
    const next = [...rawResources]
    const existing = next[index]
    if (!existing) return
    next[index] = { ...existing, ...updates }
    updateChar(updateComponent(character, 'rule:resources', next))
  }
  const addResource = () => {
    const clr = barColorForKey(`res_${rawResources.length}`)
    updateChar(
      updateComponent(character, 'rule:resources', [
        ...rawResources,
        { key: '', current: 10, max: 10, color: clr },
      ]),
    )
  }
  const removeResource = (index: number) => {
    updateChar(
      updateComponent(
        character,
        'rule:resources',
        rawResources.filter((_, i) => i !== index),
      ),
    )
  }

  /* -- Attribute helpers -- */
  type AttrEntry = { key: string; value: number }
  const rawAttributes = (character.components['rule:attributes'] ?? []) as AttrEntry[]
  const updateAttribute = (index: number, updates: Partial<AttrEntry>) => {
    const next = [...rawAttributes]
    const existing = next[index]
    if (!existing) return
    next[index] = { ...existing, ...updates }
    updateChar(updateComponent(character, 'rule:attributes', next))
  }
  const addAttribute = () => {
    updateChar(
      updateComponent(character, 'rule:attributes', [...rawAttributes, { key: '', value: 10 }]),
    )
  }
  const removeAttribute = (index: number) => {
    updateChar(
      updateComponent(
        character,
        'rule:attributes',
        rawAttributes.filter((_, i) => i !== index),
      ),
    )
  }

  /* -- Status helpers -- */
  const rawStatuses = (character.components['rule:statuses'] ?? []) as { label: string }[]
  const addStatus = () => {
    const label = statusInput.trim()
    if (!label || rawStatuses.some((s) => s.label === label)) return
    updateChar(updateComponent(character, 'rule:statuses', [...rawStatuses, { label }]))
    setStatusInput('')
  }
  const removeStatus = (index: number) => {
    updateChar(
      updateComponent(
        character,
        'rule:statuses',
        rawStatuses.filter((_, i) => i !== index),
      ),
    )
  }

  /* -- Tab renderers -- */
  const renderInfo = () => (
    <div className="flex flex-col gap-2.5">
      {/* Portrait + name */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => {
            setPickerOpen(true)
          }}
          className="relative cursor-pointer shrink-0"
          title={t('character.change_portrait')}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="w-12 h-12 rounded-full object-cover block"
              style={{ border: `3px solid ${color}` }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{
                background: `linear-gradient(135deg, ${color}, ${color}aa)`,
                border: `3px solid ${color}`,
                boxSizing: 'border-box',
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Hover overlay */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center transition-colors duration-fast text-[10px] text-white font-semibold"
            style={{ background: 'rgba(0,0,0,0)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0)'
            }}
          />
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[9px] text-text-muted/40 uppercase tracking-wider">
            {t('character.name_label')}
          </label>
          <input
            value={name}
            onChange={(e) => {
              updateIdentity({ name: e.target.value })
            }}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Color */}
      <div ref={colorPickerOpen === 'character' ? colorPickerRef : undefined}>
        <div className="flex items-center gap-2">
          <label className="text-[9px] text-text-muted/40 uppercase tracking-wider">
            {t('character.color_label')}
          </label>
          <div
            onClick={() => {
              setColorPickerOpen(colorPickerOpen === 'character' ? null : 'character')
            }}
            className="w-[18px] h-[18px] rounded-full cursor-pointer transition-[border-color] duration-fast hover:border-white/50"
            style={{
              background: color,
              border: '2px solid rgba(255,255,255,0.3)',
            }}
            title={t('character.change_color')}
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
                  updateIdentity({ color: c })
                  setColorPickerOpen(null)
                }}
                className="w-[22px] h-[22px] rounded-full cursor-pointer transition-[border-color] duration-fast"
                style={{
                  background: c,
                  border: c === color ? '2px solid #fff' : '2px solid transparent',
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
        const remoteEdit = getRemoteEdit(remoteEdits, character.id, String(i))
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            {/* Header: name + current/max inputs + remove */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input
                value={res.label}
                onChange={(e) => {
                  updateResource(i, { key: e.target.value } as Partial<ResourceView>)
                }}
                placeholder={t('character.resource_name_placeholder')}
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
                onClick={() => {
                  setColorPickerOpen(colorPickerOpen === i ? null : i)
                }}
                className="w-3 h-3 rounded-full cursor-pointer shrink-0 transition-[border-color] duration-fast hover:border-white/50"
                style={{
                  background: res.color,
                  border: '2px solid rgba(255,255,255,0.25)',
                }}
                title={t('character.change_color')}
              />
              <button
                onClick={() => {
                  removeResource(i)
                }}
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
              onChange={(val: number) => {
                updateResource(i, { current: val })
              }}
              onDragStart={() => {
                broadcastEditing(character.id, String(i), res.current)
              }}
              onDragMove={(val: number) => {
                broadcastEditing(character.id, String(i), val)
              }}
              onDragEnd={() => {
                clearEditing()
              }}
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
        {t('character.add_resource')}
      </button>
    </div>
  )

  const renderAttributes = () => (
    <div>
      {attrEntries.map(([key, value], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <input
            value={key}
            onChange={(e) => {
              updateAttribute(i, { key: e.target.value })
            }}
            placeholder={t('character.attribute_name_placeholder')}
            style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '5px 8px', fontWeight: 600 }}
          />
          <MiniHoldButton
            label="-"
            onTick={() => {
              updateAttribute(i, { value: Math.max(0, value - 1) })
            }}
            color="#ef4444"
          />
          <input
            value={value}
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
            onTick={() => {
              updateAttribute(i, { value: value + 1 })
            }}
            color="#22c55e"
          />
          <button
            onClick={() => {
              removeAttribute(i)
            }}
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
        {t('character.add_attribute')}
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
                onClick={() => {
                  removeStatus(i)
                }}
                className="bg-transparent border-none cursor-pointer text-sm p-0 leading-none opacity-60 transition-opacity duration-fast hover:opacity-100"
                style={{ color: sc }}
              >
                x
              </button>
            </span>
          )
        })}
        {statuses.length === 0 && (
          <span className="text-xs text-text-muted/25 italic">{t('character.no_statuses')}</span>
        )}
      </div>
      <div className="flex gap-1">
        <input
          value={statusInput}
          onChange={(e) => {
            setStatusInput(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addStatus()
          }}
          placeholder={t('character.add_status_placeholder')}
          style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }}
        />
        <button
          onClick={addStatus}
          className="bg-surface border border-border-glass rounded-md cursor-pointer text-text-muted/40 text-[11px] px-3 py-1.5 transition-colors duration-fast hover:bg-hover hover:text-text-muted/70"
        >
          {t('add', { ns: 'common' })}
        </button>
      </div>
    </div>
  )

  const renderNotes = () => (
    <div>
      <textarea
        value={notes}
        onChange={(e) => {
          updateChar(updateComponent(character, 'core:notes', { text: e.target.value }))
        }}
        placeholder={t('character.notes_placeholder')}
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
    <>
      <AssetPickerPanel
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="select"
        filter={{ mediaType: 'image' }}
        autoTags={['portrait']}
        onSelect={(asset) => {
          updateIdentity({ imageUrl: asset.url })
        }}
      />
      <div
        className="bg-glass backdrop-blur-[16px] rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-border-glass font-sans text-text-primary flex flex-col"
        style={{
          width: 320,
          maxHeight: 'inherit',
          boxSizing: 'border-box',
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
        onWheel={(e) => {
          e.stopPropagation()
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 shrink-0">
          <span className="text-[11px] font-bold text-text-muted/50 uppercase tracking-wider">
            {t('character.title')}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="bg-transparent border-none cursor-pointer text-text-muted/30 p-0.5 leading-none transition-colors duration-fast hover:text-text-muted/70"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-border-glass border-b border-b-border-glass shrink-0">
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              onClick={() => {
                setActiveTab(tabId)
              }}
              className={`flex-1 py-[7px] bg-transparent border-none cursor-pointer text-[8px] font-bold tracking-wider uppercase transition-colors duration-fast font-sans ${
                activeTab === tabId
                  ? 'bg-surface/60 text-white'
                  : 'text-text-muted/35 hover:text-text-muted/60'
              }`}
              style={{
                borderBottom:
                  activeTab === tabId ? `2px solid ${color}` : '2px solid transparent',
              }}
            >
              {t(TAB_I18N_KEYS[tabId])}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-3.5 py-3 overflow-y-auto flex-1 min-h-0">{tabContent[activeTab]()}</div>
      </div>
    </>
  )
}
