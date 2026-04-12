// plugins/daggerheart-core/ui/modifier/StepperRow.tsx

interface StepperProps {
  label: string
  subLabel?: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  variant?: 'default' | 'advantage' | 'disadvantage'
  /** 使用 input 替代纯文本显示 */
  inputMode?: boolean
}

function Stepper({
  label,
  subLabel,
  value,
  min = 0,
  max = 10,
  onChange,
  variant = 'default',
  inputMode,
}: StepperProps) {
  const isActive = value !== 0
  const containerClasses = {
    default: isActive ? 'border-accent/20 bg-accent/[0.04]' : 'border-white/[0.06] bg-white/[0.02]',
    advantage: isActive ? 'border-info/20 bg-info/[0.04]' : 'border-white/[0.06] bg-white/[0.02]',
    disadvantage: isActive
      ? 'border-danger/20 bg-danger/[0.04]'
      : 'border-white/[0.06] bg-white/[0.02]',
  }
  const labelColor = {
    default: 'text-text-muted',
    advantage: isActive ? 'text-info' : 'text-text-muted',
    disadvantage: isActive ? 'text-danger' : 'text-text-muted',
  }
  const valColor = {
    default: isActive ? 'text-accent-bold' : 'text-text-muted/50',
    advantage: isActive ? 'text-info' : 'text-text-muted/50',
    disadvantage: isActive ? 'text-danger' : 'text-text-muted/50',
  }

  return (
    <div
      className={`flex-1 flex items-center gap-1 h-9 px-2.5 rounded-lg border ${containerClasses[variant]}`}
    >
      <span className={`text-[11px] whitespace-nowrap ${labelColor[variant]}`}>{label}</span>
      {subLabel && (
        <span className={`text-[10px] ${labelColor[variant]} opacity-60`}>{subLabel}</span>
      )}
      <div className="flex items-center ml-auto rounded-full bg-black/20 overflow-hidden">
        <button
          onClick={() => { onChange(Math.max(min, value - 1)); }}
          className="w-7 h-7 text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:text-text-primary transition-colors"
        >
          -
        </button>
        {inputMode ? (
          <input
            value={value >= 0 ? `+${value}` : `${value}`}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/[^-\d]/g, ''), 10)
              if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
            }}
            className="w-10 h-7 bg-transparent text-accent-bold text-[13px] font-semibold font-mono text-center outline-none"
          />
        ) : (
          <span
            className={`text-sm font-bold tabular-nums min-w-[18px] text-center ${valColor[variant]}`}
          >
            {value}
          </span>
        )}
        <button
          onClick={() => { onChange(Math.min(max, value + 1)); }}
          className="w-7 h-7 text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:text-text-primary transition-colors"
        >
          +
        </button>
      </div>
    </div>
  )
}

interface StepperRowProps {
  advantage: number
  disadvantage: number
  constant: number
  onAdvantageChange: (v: number) => void
  onDisadvantageChange: (v: number) => void
  onConstantChange: (v: number) => void
}

export function StepperRow(props: StepperRowProps) {
  return (
    <div className="flex gap-1">
      <Stepper
        label="优势"
        subLabel="d6"
        value={props.advantage}
        onChange={props.onAdvantageChange}
        variant="advantage"
      />
      <Stepper
        label="劣势"
        subLabel="d6"
        value={props.disadvantage}
        onChange={props.onDisadvantageChange}
        variant="disadvantage"
      />
      <Stepper
        label="修正"
        value={props.constant}
        onChange={props.onConstantChange}
        min={-20}
        max={20}
        inputMode
      />
    </div>
  )
}
