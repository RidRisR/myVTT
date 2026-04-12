interface ResourceValue {
  current: number
  max: number
}

interface CollapsedBarProps {
  hp: ResourceValue
  stress: ResourceValue
  hope: ResourceValue
  armor: ResourceValue
  onExpand: () => void
  onRollClick: () => void
  onAdjustResource: (resource: 'health' | 'stress' | 'hope' | 'armor', delta: number) => void
}

interface ResourceItemProps {
  label: string
  shortLabel: string
  tone: 'hp' | 'stress' | 'hope' | 'armor'
  value: ResourceValue
  onAdjust: (delta: number) => void
}

function ResourceItem({ shortLabel, tone, value, onAdjust }: ResourceItemProps) {
  const toneClasses = {
    hp: { label: 'text-danger/60', value: 'text-danger' },
    stress: { label: 'text-[#a78bfa]/70', value: 'text-[#a78bfa]' },
    hope: { label: 'text-accent/70', value: 'text-accent' },
    armor: { label: 'text-info/70', value: 'text-info' },
  }[tone]

  return (
    <div className="group/resource flex items-center gap-0.5 px-0.5 text-[11px] whitespace-nowrap">
      <button
        onClick={() => {
          onAdjust(-1)
        }}
        className="hidden group-hover:flex group-hover/resource:flex w-3.5 h-3.5 rounded-[3px] border border-white/[0.12] bg-white/[0.06] text-[9px] text-white/40 items-center justify-center cursor-pointer hover:bg-white/[0.14] hover:text-white/90 transition-colors"
      >
        −
      </button>
      <span className={`text-[9px] font-semibold ${toneClasses.label}`}>{shortLabel}</span>
      <span className={`text-[12px] font-bold tabular-nums ${toneClasses.value}`}>{value.current}</span>
      <span className="text-[10px] text-white/25">/{value.max}</span>
      <button
        onClick={() => {
          onAdjust(1)
        }}
        className="hidden group-hover:flex group-hover/resource:flex w-3.5 h-3.5 rounded-[3px] border border-white/[0.12] bg-white/[0.06] text-[9px] text-white/40 items-center justify-center cursor-pointer hover:bg-white/[0.14] hover:text-white/90 transition-colors"
      >
        +
      </button>
    </div>
  )
}

export function CollapsedBar({
  hp,
  stress,
  hope,
  armor,
  onExpand,
  onRollClick,
  onAdjustResource,
}: CollapsedBarProps) {
  return (
    <div className="h-full flex items-end justify-center">
      <div
        className="group flex items-center gap-1.5 h-7 px-2 rounded-t-lg border border-border-glass border-b-0 bg-[#151210ee] backdrop-blur-[16px] shadow-[0_0_1px_rgba(255,255,255,0.06)]"
        data-testid="player-bottom-panel-collapsed"
      >
        <button
          onClick={onRollClick}
          className="w-[22px] h-[22px] rounded-[5px] border border-[#a78bfa]/25 bg-[#a78bfa]/[0.08] text-[#a78bfa] text-[12px] flex items-center justify-center cursor-pointer transition-all hover:bg-[#a78bfa]/20 hover:border-[#a78bfa]/50 hover:shadow-[0_0_8px_rgba(167,139,250,0.15)]"
          title="打开投骰面板"
          data-testid="player-bottom-panel-roll"
        >
          🎲
        </button>

        <div className="w-px h-3.5 bg-white/[0.08]" />

        <div className="flex items-center gap-1">
          <ResourceItem
            label="HP"
            shortLabel="HP"
            tone="hp"
            value={hp}
            onAdjust={(delta) => {
              onAdjustResource('health', delta)
            }}
          />
          <div className="w-px h-3.5 bg-white/[0.06]" />
          <ResourceItem
            label="Stress"
            shortLabel="S"
            tone="stress"
            value={stress}
            onAdjust={(delta) => {
              onAdjustResource('stress', delta)
            }}
          />
          <div className="w-px h-3.5 bg-white/[0.06]" />
          <ResourceItem
            label="Hope"
            shortLabel="H"
            tone="hope"
            value={hope}
            onAdjust={(delta) => {
              onAdjustResource('hope', delta)
            }}
          />
          <div className="w-px h-3.5 bg-white/[0.06]" />
          <ResourceItem
            label="Armor"
            shortLabel="A"
            tone="armor"
            value={armor}
            onAdjust={(delta) => {
              onAdjustResource('armor', delta)
            }}
          />
        </div>

        <button
          onClick={onExpand}
          className="w-4 h-4 flex items-center justify-center text-[7px] text-white/25 cursor-pointer hover:text-white/70 transition-colors"
          title="展开"
          data-testid="player-bottom-panel-expand"
        >
          ▲
        </button>
      </div>
    </div>
  )
}
