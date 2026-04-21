// plugins/daggerheart-core/ui/modifier/AdvancedOptions.tsx
import { useState } from 'react'
import type { DiceGroup } from '../../rollTypes'

const FACE_OPTIONS = [4, 6, 8, 10, 12, 20] as const

interface CollapsibleSectionProps {
  label: string
  summary?: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({
  label,
  summary,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => {
          setOpen(!open)
        }}
        className="w-full flex items-center gap-1.5 px-4 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
      >
        <span
          className={`text-[10px] text-text-muted/60 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <span className="text-[11px] text-text-muted font-medium tracking-wide uppercase">
          {label}
        </span>
        {summary && !open && (
          <span className="text-[10px] text-text-muted/50 ml-auto">{summary}</span>
        )}
      </button>
      {open && <div className="px-4 pb-3 border-b border-border-glass">{children}</div>}
    </div>
  )
}

interface AdvancedOptionsProps {
  hopeFace: number
  fearFace: number
  onHopeFaceChange: (face: number) => void
  onFearFaceChange: (face: number) => void
  diceGroups: DiceGroup[]
  onKeepChange: (index: number, keep: DiceGroup['keep']) => void
  /** Label for the duality dice group (e.g. "1d12+1d12") */
  dualityLabel?: string
}

export function AdvancedOptions({
  hopeFace,
  fearFace,
  onHopeFaceChange,
  onFearFaceChange,
  diceGroups,
  onKeepChange,
  dualityLabel,
}: AdvancedOptionsProps) {
  const summary = [
    hopeFace !== 12 || fearFace !== 12 ? '骰面' : '',
    diceGroups.some((g) => g.keep) ? '取高/取低' : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <CollapsibleSection label="高级选项" summary={summary || '骰面 · 取高/取低'}>
      {/* Face swap */}
      <div className="text-[10px] text-text-muted/70 uppercase tracking-wider mb-1.5">骰面替换</div>
      <div className="flex gap-1 mb-3">
        <FaceSelector
          dotColor="bg-accent-bold"
          label="希望骰"
          value={hopeFace}
          onChange={onHopeFaceChange}
          isChanged={hopeFace !== 12}
        />
        <FaceSelector
          dotColor="bg-[#9070c0]"
          label="恐惧骰"
          value={fearFace}
          onChange={onFearFaceChange}
          isChanged={fearFace !== 12}
        />
      </div>

      {/* Keep high/low per dice group */}
      {(dualityLabel || diceGroups.length > 0) && (
        <>
          <div className="text-[10px] text-text-muted/70 uppercase tracking-wider mb-1.5">
            骰子修饰
          </div>
          <div className="flex flex-col gap-1">
            {dualityLabel && (
              <KeepRow
                diceLabel={dualityLabel}
                typeLabel="二元骰"
                keep={undefined}
                totalCount={2}
                onKeepChange={() => {
                  /* duality dice keep is not supported */
                }}
                disabled
              />
            )}
            {diceGroups.map((group, i) => (
              <KeepRow
                key={i}
                diceLabel={`${group.count}d${group.sides}`}
                typeLabel={group.operator === '-' ? '减去' : '标准'}
                typeColor={group.operator === '-' ? 'text-danger' : undefined}
                diceLabelColor={group.operator === '-' ? 'text-danger' : undefined}
                keep={group.keep}
                totalCount={group.count}
                onKeepChange={(keep) => {
                  onKeepChange(i, keep)
                }}
              />
            ))}
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

interface FaceSelectorProps {
  dotColor: string
  label: string
  value: number
  onChange: (v: number) => void
  isChanged: boolean
}

function FaceSelector({ dotColor, label, value, onChange, isChanged }: FaceSelectorProps) {
  return (
    <div className="flex-1 flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border-glass bg-transparent">
      <span className={`w-[6px] h-[6px] rounded-full ${dotColor}`} />
      <span className="text-[10px] text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value))
        }}
        className={`ml-auto w-12 h-6 rounded border bg-transparent text-[11px] font-semibold text-center outline-none cursor-pointer ${
          isChanged ? 'border-accent/30 text-accent-bold' : 'border-border-glass text-text-muted'
        }`}
      >
        {FACE_OPTIONS.map((f) => (
          <option key={f} value={f} className="bg-deep text-text-primary">
            d{f}
          </option>
        ))}
      </select>
    </div>
  )
}

interface KeepRowProps {
  diceLabel: string
  typeLabel: string
  typeColor?: string
  diceLabelColor?: string
  keep: DiceGroup['keep']
  totalCount: number
  onKeepChange: (keep: DiceGroup['keep']) => void
  disabled?: boolean
}

function KeepRow({
  diceLabel,
  typeLabel,
  typeColor,
  diceLabelColor,
  keep,
  totalCount,
  onKeepChange,
  disabled,
}: KeepRowProps) {
  const mode = keep?.mode
  const keepCount = keep?.count ?? 1

  return (
    <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border-glass bg-transparent">
      <span className={`text-[11px] font-semibold ${diceLabelColor ?? 'text-text-primary'}`}>
        {diceLabel}
      </span>
      <span className={`text-[10px] ${typeColor ?? 'text-text-muted'} opacity-70`}>
        {typeLabel}
      </span>
      <div className="flex items-center gap-0.5 ml-auto">
        <button
          onClick={() => {
            if (!disabled) {
              onKeepChange(mode === 'high' ? undefined : { mode: 'high', count: keepCount })
            }
          }}
          className={`px-1.5 h-5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
            mode === 'high'
              ? 'bg-info/20 text-info border border-info/30'
              : 'text-text-muted/60 hover:text-text-muted border border-transparent'
          } ${disabled ? 'opacity-40 cursor-default' : ''}`}
        >
          取高
        </button>
        <button
          onClick={() => {
            if (!disabled) {
              onKeepChange(mode === 'low' ? undefined : { mode: 'low', count: keepCount })
            }
          }}
          className={`px-1.5 h-5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
            mode === 'low'
              ? 'bg-danger/20 text-danger border border-danger/30'
              : 'text-text-muted/60 hover:text-text-muted border border-transparent'
          } ${disabled ? 'opacity-40 cursor-default' : ''}`}
        >
          取低
        </button>
        <button
          onClick={() => {
            if (!disabled) {
              onKeepChange(undefined)
            }
          }}
          className={`px-1.5 h-5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
            !mode
              ? 'text-text-muted'
              : 'text-text-muted/40 hover:text-text-muted border border-transparent'
          } ${disabled ? 'opacity-40 cursor-default' : ''}`}
        >
          无
        </button>
        {mode && !disabled && totalCount > 1 && (
          <span className="flex items-center gap-0.5 text-[10px] text-text-muted ml-1">
            取
            <input
              type="number"
              min={1}
              max={totalCount}
              value={keepCount}
              onChange={(e) => {
                const n = Math.max(1, Math.min(totalCount, Number(e.target.value) || 1))
                onKeepChange({ mode, count: n })
              }}
              className="w-7 h-5 rounded border border-border-glass bg-black/20 text-text-primary text-[10px] text-center outline-none focus:border-accent/40"
            />
            颗
          </span>
        )}
      </div>
    </div>
  )
}

export { CollapsibleSection }
