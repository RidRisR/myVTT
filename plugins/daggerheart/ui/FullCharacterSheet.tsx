// plugins/daggerheart/ui/FullCharacterSheet.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { PluginPanelProps } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'
import type { DHHealth, DHStress, DHAttributes, DHMeta, DHExtras } from '../types'
import { DH_KEYS } from '../types'
import { createDefaultDHEntityData } from '../templates'
import { getName, getImageUrl, getColor, getNotes } from '../../../src/shared/coreComponents'

const ATTR_KEYS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export function FullCharacterSheet({ entity, onClose, onUpdateEntity }: PluginPanelProps) {
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState(entity ? getName(entity) : '')
  const { t } = usePluginTranslation()

  if (!entity) {
    return (
      <div className="bg-glass backdrop-blur-[16px] rounded-2xl border border-border-glass p-8 text-text-muted text-center">
        {t('sheet.noData')}
      </div>
    )
  }

  // Edit view: merge with defaults so all fields are editable even on new entities
  const defaults = createDefaultDHEntityData()
  const hp: DHHealth = (entity.components[DH_KEYS.health] as DHHealth | undefined) ?? (defaults[DH_KEYS.health] as DHHealth)
  const stress: DHStress = (entity.components[DH_KEYS.stress] as DHStress | undefined) ?? (defaults[DH_KEYS.stress] as DHStress)
  const attrs: DHAttributes = (entity.components[DH_KEYS.attributes] as DHAttributes | undefined) ?? (defaults[DH_KEYS.attributes] as DHAttributes)
  const meta: DHMeta = (entity.components[DH_KEYS.meta] as DHMeta | undefined) ?? (defaults[DH_KEYS.meta] as DHMeta)
  const extras: DHExtras = (entity.components[DH_KEYS.extras] as DHExtras | undefined) ?? (defaults[DH_KEYS.extras] as DHExtras)

  const updateComponent = (key: string, value: unknown) => {
    onUpdateEntity(entity.id, { components: { ...entity.components, [key]: value } })
  }

  const updateHP = (patch: Partial<DHHealth>) => {
    updateComponent(DH_KEYS.health, { ...hp, ...patch })
  }

  const updateStress = (patch: Partial<DHStress>) => {
    updateComponent(DH_KEYS.stress, { ...stress, ...patch })
  }

  const updateMeta = (patch: Partial<DHMeta>) => {
    updateComponent(DH_KEYS.meta, { ...meta, ...patch })
  }

  const updateExtras = (patch: Partial<DHExtras>) => {
    updateComponent(DH_KEYS.extras, { ...extras, ...patch })
  }

  const updateAttrs = (patch: Partial<DHAttributes>) => {
    updateComponent(DH_KEYS.attributes, { ...attrs, ...patch })
  }

  const entityName = getName(entity)

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== entityName) {
      onUpdateEntity(entity.id, {
        components: {
          ...entity.components,
          'core:identity': { ...entity.components['core:identity'] as Record<string, unknown>, name: trimmed },
        },
      })
    }
    setEditingName(false)
  }

  return (
    <div className="bg-glass backdrop-blur-[20px] rounded-2xl border border-border-glass shadow-[0_24px_64px_rgba(0,0,0,0.5)] font-sans text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-glass">
        <div className="flex items-center gap-3">
          {getImageUrl(entity) ? (
            <img
              src={getImageUrl(entity)}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
              style={{ border: `2px solid ${getColor(entity)}` }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold"
              style={{ background: getColor(entity) }}
            >
              {entityName.charAt(0).toUpperCase()}
            </div>
          )}
          {editingName ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value)
              }}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') {
                  setEditingName(false)
                  setEditName(entityName)
                }
              }}
              className="px-2 py-0.5 border border-border-glass rounded-md text-lg font-bold bg-surface text-white outline-none"
            />
          ) : (
            <span
              className="text-lg font-bold cursor-text hover:opacity-80"
              onClick={() => {
                setEditName(entityName)
                setEditingName(true)
              }}
            >
              {entityName}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label={t('sheet.close')}
          className="p-1.5 rounded-lg text-text-muted hover:bg-hover hover:text-text-primary transition-colors duration-fast"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 grid grid-cols-2 gap-6">
        {/* Left: Identity + Attributes */}
        <div className="flex flex-col gap-5">
          {/* Identity */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              {t('sheet.sectionIdentity')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <IdentityField
                label={t('sheet.class')}
                value={meta.className}
                onChange={(v) => {
                  updateMeta({ className: v })
                }}
              />
              <IdentityField
                label={t('sheet.ancestry')}
                value={meta.ancestry}
                onChange={(v) => {
                  updateMeta({ ancestry: v })
                }}
              />
            </div>
          </div>

          {/* Tier + Proficiency */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              {t('sheet.sectionGrowth')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted/40 block mb-1">
                  {t('sheet.tier')}
                </label>
                <div className="flex gap-1">
                  {([1, 2, 3, 4] as const).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => {
                        updateMeta({ tier })
                      }}
                      className={`flex-1 py-1 rounded text-xs font-bold transition-colors duration-fast ${
                        meta.tier === tier
                          ? 'bg-accent text-white'
                          : 'bg-black/20 text-text-muted/50 hover:bg-black/40'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
              <NumberField
                label={t('sheet.proficiency')}
                value={meta.proficiency}
                min={1}
                max={6}
                onChange={(v) => {
                  updateMeta({ proficiency: v })
                }}
              />
            </div>
          </div>

          {/* Six Attributes */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              {t('sheet.sectionAttributes')}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ATTR_KEYS.map((key) => (
                <AttrField
                  key={key}
                  label={t(`attr.${key}`)}
                  value={attrs[key]}
                  onChange={(v) => {
                    updateAttrs({ [key]: v } as Partial<DHAttributes>)
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Resources */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              {t('sheet.sectionResources')}
            </div>
            <div className="flex flex-col gap-3">
              <ResourceField
                label={t('sheet.hp')}
                color="#ef4444"
                current={hp.current}
                max={hp.max}
                onCurrentChange={(v) => {
                  updateHP({ current: v })
                }}
                onMaxChange={(v) => {
                  updateHP({ max: v })
                }}
              />
              <ResourceField
                label={t('sheet.stress')}
                color="#f97316"
                current={stress.current}
                max={stress.max}
                onCurrentChange={(v) => {
                  updateStress({ current: v })
                }}
                onMaxChange={(v) => {
                  updateStress({ max: v })
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label={t('sheet.hope')}
                  value={extras.hope}
                  min={0}
                  max={99}
                  onChange={(v) => {
                    updateExtras({ hope: v })
                  }}
                />
                <NumberField
                  label={t('sheet.armor')}
                  value={extras.armor}
                  min={0}
                  max={6}
                  onChange={(v) => {
                    updateExtras({ armor: v })
                  }}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              {t('sheet.sectionNotes')}
            </div>
            <textarea
              value={getNotes(entity).text}
              onChange={(e) => {
                onUpdateEntity(entity.id, {
                  components: {
                    ...entity.components,
                    'core:notes': { text: e.target.value },
                  },
                })
              }}
              placeholder={t('sheet.notesPlaceholder')}
              rows={6}
              className="w-full px-3 py-2 bg-black/20 border border-border-glass rounded-lg text-sm text-text-primary placeholder:text-text-muted/25 outline-none resize-none focus:border-accent/50 transition-colors duration-fast"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IdentityField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted/40 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        placeholder={label}
        className="w-full px-2 py-1 bg-black/20 border border-border-glass rounded text-xs text-text-primary outline-none focus:border-accent/50 transition-colors duration-fast"
      />
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted/40 block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value)
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
        }}
        className="w-full px-2 py-1 bg-black/20 border border-border-glass rounded text-sm font-bold text-text-primary outline-none focus:border-accent/50 transition-colors duration-fast text-center"
      />
    </div>
  )
}

function AttrField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center bg-black/20 rounded-lg py-2 px-1 border border-border-glass/50">
      <span className="text-[9px] text-text-muted/50 uppercase mb-1">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            onChange(value - 1)
          }}
          className="w-5 h-5 flex items-center justify-center text-text-muted/40 hover:text-danger transition-colors duration-fast text-xs"
        >
          −
        </button>
        <span className="text-base font-bold text-text-primary min-w-[24px] text-center">
          {value >= 0 ? '+' : ''}
          {value}
        </span>
        <button
          onClick={() => {
            onChange(value + 1)
          }}
          className="w-5 h-5 flex items-center justify-center text-text-muted/40 hover:text-success transition-colors duration-fast text-xs"
        >
          ＋
        </button>
      </div>
    </div>
  )
}

function ResourceField({
  label,
  color,
  current,
  max,
  onCurrentChange,
  onMaxChange,
}: {
  label: string
  color: string
  current: number
  max: number
  onCurrentChange: (v: number) => void
  onMaxChange: (v: number) => void
}) {
  const pct = max > 0 ? Math.min(current / max, 1) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold" style={{ color }}>
          {label}
        </span>
        <div className="flex items-center gap-1 text-xs">
          <input
            key={`cur-${current}`}
            defaultValue={current}
            onBlur={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v)) onCurrentChange(Math.max(0, Math.min(v, max)))
              else e.target.value = String(current)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-8 text-center bg-black/30 border border-border-glass rounded text-text-primary font-bold outline-none focus:border-accent/50 py-0.5"
          />
          <span className="text-text-muted/30">/</span>
          <input
            key={`max-${max}`}
            defaultValue={max}
            onBlur={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v) && v > 0) onMaxChange(v)
              else e.target.value = String(max)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-8 text-center bg-black/30 border border-border-glass rounded text-text-muted font-bold outline-none focus:border-accent/50 py-0.5"
          />
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  )
}
