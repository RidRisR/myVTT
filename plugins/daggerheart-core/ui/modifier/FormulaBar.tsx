// plugins/daggerheart-core/ui/modifier/FormulaBar.tsx
import type { FormulaToken } from '../../rollConfigUtils'

interface FormulaBarProps {
  value: string
  tokens: FormulaToken[]
  onChange: (value: string) => void
  error?: string | null
}

const tokenColors: Record<FormulaToken['type'], string> = {
  dice: 'text-[#9070c0]', // fear purple (dice)
  modifier: 'text-success', // green (attribute/experience)
  constant: 'text-accent-bold', // gold
  op: 'text-text-muted/50', // muted
}

export function FormulaBar({ value, tokens, onChange, error }: FormulaBarProps) {
  return (
    <div className="rounded-lg bg-black/40 border border-white/[0.06]">
      <input
        data-testid="modifier-formula-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        placeholder="输入公式，如 1d20+2 或 2d20kh1+3"
        className="w-full h-10 px-3 bg-transparent text-text-primary font-mono text-[13px] outline-none placeholder:text-text-muted/35"
      />
      <div className="px-3 pb-2 min-h-[28px] flex items-center gap-1 flex-wrap font-mono text-base">
        {tokens.map((tok, i) => (
          <span key={i} className="inline-flex items-center gap-0.5 whitespace-nowrap">
            <span className={`font-bold ${tokenColors[tok.type]}`}>{tok.text}</span>
            {tok.source && (
              <span className="text-[10px] text-text-muted/60 font-sans font-normal">
                {tok.source}
              </span>
            )}
          </span>
        ))}
        {tokens.length === 0 && !error && (
          <span className="text-text-muted/30 text-xs font-sans">点击下方控件构建公式</span>
        )}
        {error && <span className="text-danger text-[11px] font-sans">{error}</span>}
      </div>
    </div>
  )
}
