// plugins/daggerheart/ui/FullCharacterSheet.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { PluginPanelProps } from '@myvtt/sdk'
import type { DHRuleData } from '../types'
import { createDefaultDHEntityData } from '../templates'

const ATTRS = [
  { key: 'agility', label: '敏捷' },
  { key: 'strength', label: '力量' },
  { key: 'finesse', label: '精巧' },
  { key: 'instinct', label: '本能' },
  { key: 'presence', label: '临场' },
  { key: 'knowledge', label: '知识' },
] as const

export function FullCharacterSheet({ entity, onClose, onUpdateEntity }: PluginPanelProps) {
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState(entity?.name ?? '')

  if (!entity) {
    return (
      <div className="bg-glass backdrop-blur-[16px] rounded-2xl border border-border-glass p-8 text-text-muted text-center">
        无角色数据
      </div>
    )
  }

  // Edit view: merge with defaults so all fields are editable even on new entities
  const d = { ...createDefaultDHEntityData(), ...(entity.ruleData as Record<string, unknown>) }

  const updateDH = (patch: Partial<DHRuleData>) => {
    onUpdateEntity(entity.id, { ruleData: { ...d, ...patch } })
  }

  const updateHP = (patch: Partial<DHRuleData['hp']>) => {
    const cur = d.hp ?? { current: 0, max: 0 }
    updateDH({ hp: { ...cur, ...patch } })
  }

  const updateStress = (patch: Partial<DHRuleData['stress']>) => {
    const cur = d.stress ?? { current: 0, max: 0 }
    updateDH({ stress: { ...cur, ...patch } })
  }

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== entity.name) {
      onUpdateEntity(entity.id, { name: trimmed })
    }
    setEditingName(false)
  }

  return (
    <div className="bg-glass backdrop-blur-[20px] rounded-2xl border border-border-glass shadow-[0_24px_64px_rgba(0,0,0,0.5)] font-sans text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-glass">
        <div className="flex items-center gap-3">
          {entity.imageUrl ? (
            <img
              src={entity.imageUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
              style={{ border: `2px solid ${entity.color}` }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold"
              style={{ background: entity.color }}
            >
              {entity.name.charAt(0).toUpperCase()}
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
                  setEditName(entity.name)
                }
              }}
              className="px-2 py-0.5 border border-border-glass rounded-md text-lg font-bold bg-surface text-white outline-none"
            />
          ) : (
            <span
              className="text-lg font-bold cursor-text hover:opacity-80"
              onClick={() => {
                setEditName(entity.name)
                setEditingName(true)
              }}
            >
              {entity.name}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="关闭"
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
              身份
            </div>
            <div className="grid grid-cols-2 gap-2">
              <IdentityField
                label="职业"
                value={d.className}
                onChange={(v) => {
                  updateDH({ className: v })
                }}
              />
              <IdentityField
                label="血统"
                value={d.ancestry}
                onChange={(v) => {
                  updateDH({ ancestry: v })
                }}
              />
            </div>
          </div>

          {/* Tier + Proficiency */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              成长
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted/40 block mb-1">等级</label>
                <div className="flex gap-1">
                  {([1, 2, 3, 4] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        updateDH({ tier: t })
                      }}
                      className={`flex-1 py-1 rounded text-xs font-bold transition-colors duration-fast ${
                        d.tier === t
                          ? 'bg-accent text-white'
                          : 'bg-black/20 text-text-muted/50 hover:bg-black/40'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <NumberField
                label="熟练值"
                value={d.proficiency}
                min={1}
                max={6}
                onChange={(v) => {
                  updateDH({ proficiency: v })
                }}
              />
            </div>
          </div>

          {/* Six Attributes */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              核心属性
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ATTRS.map(({ key, label }) => (
                <AttrField
                  key={key}
                  label={label}
                  value={d[key]}
                  onChange={(v) => {
                    updateDH({ [key]: v } as Partial<DHRuleData>)
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
              资源
            </div>
            <div className="flex flex-col gap-3">
              <ResourceField
                label="生命值 HP"
                color="#ef4444"
                current={d.hp?.current ?? 0}
                max={d.hp?.max ?? 0}
                onCurrentChange={(v) => {
                  updateHP({ current: v })
                }}
                onMaxChange={(v) => {
                  updateHP({ max: v })
                }}
              />
              <ResourceField
                label="压力 Stress"
                color="#f97316"
                current={d.stress?.current ?? 0}
                max={d.stress?.max ?? 0}
                onCurrentChange={(v) => {
                  updateStress({ current: v })
                }}
                onMaxChange={(v) => {
                  updateStress({ max: v })
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="希望 Hope"
                  value={d.hope ?? 0}
                  min={0}
                  max={99}
                  onChange={(v) => {
                    updateDH({ hope: v })
                  }}
                />
                <NumberField
                  label="护甲 Armor"
                  value={d.armor ?? 0}
                  min={0}
                  max={6}
                  onChange={(v) => {
                    updateDH({ armor: v })
                  }}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              备注
            </div>
            <textarea
              value={entity.notes}
              onChange={(e) => {
                onUpdateEntity(entity.id, { notes: e.target.value })
              }}
              placeholder="角色背景、笔记..."
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
