interface ResourceValue {
  current: number
  max: number
}

interface CollapsedBarProps {
  hp: ResourceValue
  stress: ResourceValue
  hope: ResourceValue
  armor: ResourceValue
}

const TONES = {
  hp: { label: 'text-danger/70', value: 'text-danger', bar: 'bg-danger/60' },
  stress: { label: 'text-[#a78bfa]/70', value: 'text-[#a78bfa]', bar: 'bg-[#a78bfa]/60' },
  hope: { label: 'text-accent/70', value: 'text-accent', bar: 'bg-accent/60' },
  armor: { label: 'text-info/70', value: 'text-info', bar: 'bg-info/60' },
} as const

function ResourceChip({
  label,
  tone,
  value,
}: {
  label: string
  tone: 'hp' | 'stress' | 'hope' | 'armor'
  value: ResourceValue
}) {
  const t = TONES[tone]
  const pct = value.max > 0 ? Math.round((value.current / value.max) * 100) : 0

  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <div className="flex items-baseline gap-1">
        <span className={`text-[9px] font-medium uppercase tracking-wider ${t.label}`}>
          {label}
        </span>
        <span className={`text-[14px] font-bold tabular-nums leading-none ${t.value}`}>
          {value.current}
        </span>
        <span className="text-[10px] text-white/20 tabular-nums">/{value.max}</span>
      </div>
      <div className="w-full h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${t.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function CollapsedBar({ hp, stress, hope, armor }: CollapsedBarProps) {
  return (
    <div
      className="h-full flex items-center justify-center gap-4 px-5 rounded-xl bg-[#151210ee] backdrop-blur-[16px] border border-border-glass shadow-[0_0_1px_rgba(255,255,255,0.06)]"
      data-testid="player-bottom-panel-collapsed"
    >
      <ResourceChip label="HP" tone="hp" value={hp} />
      <div className="w-px h-5 bg-white/[0.06]" />
      <ResourceChip label="Stress" tone="stress" value={stress} />
      <div className="w-px h-5 bg-white/[0.06]" />
      <ResourceChip label="Hope" tone="hope" value={hope} />
      <div className="w-px h-5 bg-white/[0.06]" />
      <ResourceChip label="Armor" tone="armor" value={armor} />
    </div>
  )
}
