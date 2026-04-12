// plugins/daggerheart-core/ui/modifier/FormulaBar.tsx
import type { FormulaToken } from '../../rollConfigUtils'

interface FormulaBarProps {
  tokens: FormulaToken[]
}

const tokenColors: Record<FormulaToken['type'], string> = {
  dice: 'text-[#9070c0]', // fear purple (dice)
  modifier: 'text-success', // green (attribute/experience)
  constant: 'text-accent-bold', // gold
  op: 'text-text-muted/50', // muted
}

export function FormulaBar({ tokens }: FormulaBarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-black/40 min-h-[40px] flex-wrap font-mono text-base cursor-text">
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
      {tokens.length === 0 && (
        <span className="text-text-muted/30 text-xs font-sans">点击下方控件构建公式</span>
      )}
    </div>
  )
}
