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

function Stepper({ label, subLabel, value, min = 0, max = 10, onChange, variant = 'default', inputMode }: StepperProps) {
  const isActive = value !== 0
  const variantClasses = {
    default: '',
    advantage: isActive ? 'border-info/25 bg-info/[0.06]' : '',
    disadvantage: isActive ? 'border-danger/25 bg-danger/[0.06]' : '',
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
      className={`flex-1 flex items-center gap-1 h-9 px-2.5 rounded-md border border-border-glass bg-transparent ${variantClasses[variant]}`}
    >
      <span className={`text-[10px] whitespace-nowrap ${labelColor[variant]}`}>{label}</span>
      {subLabel && (
        <span className={`text-[9px] ${labelColor[variant]} opacity-40`}>{subLabel}</span>
      )}
      <div className="flex items-center gap-0.5 ml-auto">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-6 h-6 rounded border border-border-glass bg-transparent text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/10 hover:text-text-primary transition-colors"
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
            className="w-11 h-6 rounded border border-accent/25 bg-black/20 text-accent-bold text-[13px] font-semibold font-mono text-center outline-none focus:border-accent/50"
          />
        ) : (
          <span className={`text-sm font-bold tabular-nums min-w-[18px] text-center ${valColor[variant]}`}>
            {value}
          </span>
        )}
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-6 h-6 rounded border border-border-glass bg-transparent text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/10 hover:text-text-primary transition-colors"
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
        label="优势" subLabel="d6"
        value={props.advantage} onChange={props.onAdvantageChange}
        variant="advantage"
      />
      <Stepper
        label="劣势" subLabel="d6"
        value={props.disadvantage} onChange={props.onDisadvantageChange}
        variant="disadvantage"
      />
      <Stepper
        label="修正"
        value={props.constant} onChange={props.onConstantChange}
        min={-20} max={20} inputMode
      />
    </div>
  )
}
