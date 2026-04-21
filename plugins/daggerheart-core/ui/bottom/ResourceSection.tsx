interface ResourceValue {
  current: number
  max: number
}

interface ResourceSectionProps {
  hp: ResourceValue
  stress: ResourceValue
  hope: ResourceValue
  armor: ResourceValue
  onAdjustResource: (resource: 'health' | 'stress' | 'hope' | 'armor', delta: number) => void
}

interface ResourceCardProps {
  label: string
  tone: 'hp' | 'stress' | 'hope' | 'armor'
  value: ResourceValue
  onAdjust: (delta: number) => void
}

function ResourceCard({ label, tone, value, onAdjust }: ResourceCardProps) {
  const pct =
    value.max > 0 ? Math.max(0, Math.min(100, Math.round((value.current / value.max) * 100))) : 0
  const toneClasses = {
    hp: {
      value: 'text-danger',
      fill: 'bg-[linear-gradient(90deg,#ef4444,#f87171)]',
    },
    stress: {
      value: 'text-[#a78bfa]',
      fill: 'bg-[linear-gradient(90deg,#a78bfa,#c4b5fd)]',
    },
    hope: {
      value: 'text-accent',
      fill: 'bg-[linear-gradient(90deg,#fbbf24,#fcd34d)]',
    },
    armor: {
      value: 'text-info',
      fill: 'bg-[linear-gradient(90deg,#60a5fa,#93c5fd)]',
    },
  }[tone]

  return (
    <div className="flex-1 rounded-md border border-border-glass bg-white/[0.04] px-2 py-1.5 flex flex-col items-center gap-1 hover:bg-white/[0.08] hover:border-white/[0.12] transition-colors">
      <div className="text-[7px] uppercase tracking-[0.18em] text-white/30">{label}</div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            onAdjust(-1)
          }}
          className="w-4 h-[14px] rounded-[3px] border border-white/[0.12] bg-white/[0.06] text-[10px] text-white/35 flex items-center justify-center cursor-pointer hover:bg-white/[0.12] hover:text-white/90 transition-colors"
        >
          −
        </button>
        <div className="flex items-end gap-1">
          <span
            className={`text-[18px] font-extrabold leading-none tabular-nums ${toneClasses.value}`}
          >
            {value.current}
          </span>
          <span className="text-[10px] text-white/25 tabular-nums">/{value.max}</span>
        </div>
        <button
          onClick={() => {
            onAdjust(1)
          }}
          className="w-4 h-[14px] rounded-[3px] border border-white/[0.12] bg-white/[0.06] text-[10px] text-white/35 flex items-center justify-center cursor-pointer hover:bg-white/[0.12] hover:text-white/90 transition-colors"
        >
          +
        </button>
      </div>
      <div className="w-full h-0.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div className={`h-full rounded-full ${toneClasses.fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ResourceSection({
  hp,
  stress,
  hope,
  armor,
  onAdjustResource,
}: ResourceSectionProps) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex gap-1.5 items-stretch">
        <ResourceCard
          label="HP"
          tone="hp"
          value={hp}
          onAdjust={(delta) => {
            onAdjustResource('health', delta)
          }}
        />
        <ResourceCard
          label="Stress"
          tone="stress"
          value={stress}
          onAdjust={(delta) => {
            onAdjustResource('stress', delta)
          }}
        />
        <ResourceCard
          label="Hope"
          tone="hope"
          value={hope}
          onAdjust={(delta) => {
            onAdjustResource('hope', delta)
          }}
        />
        <ResourceCard
          label="Armor"
          tone="armor"
          value={armor}
          onAdjust={(delta) => {
            onAdjustResource('armor', delta)
          }}
        />
      </div>
    </div>
  )
}
