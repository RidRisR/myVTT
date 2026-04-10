// plugins/daggerheart/ui/PipRow.tsx
// Pip-style toggle row for armor and hope (click to toggle filled/empty).
import { useCallback } from 'react'

interface PipRowProps {
  icon: string
  color: string
  current: number
  max: number
  onUpdate: (value: number) => void
}

export function PipRow({ icon, color, current, max, onUpdate }: PipRowProps) {
  const handleClick = useCallback(
    (index: number) => {
      // Clicking a filled pip at the current edge unfills it; otherwise fill up to index+1
      const next = index + 1 === current ? current - 1 : index + 1
      onUpdate(Math.max(0, Math.min(next, max)))
    },
    [current, max, onUpdate],
  )

  return (
    <div className="flex items-center gap-1.5 py-0.5 px-1 -mx-1" data-testid="pip-row">
      <span className="text-[10px] w-3.5 text-center" style={{ color }}>
        {icon}
      </span>
      <div className="flex-1 flex gap-[3px] items-center">
        {Array.from({ length: max }, (_, i) => {
          const filled = i < current
          return (
            <div
              key={i}
              className="w-[9px] h-[9px] rounded-full cursor-pointer transition-all hover:scale-[1.3]"
              style={
                filled
                  ? { background: color, boxShadow: `0 0 4px ${color}50` }
                  : { background: `${color}10`, border: `1px solid ${color}20` }
              }
              onClick={() => handleClick(i)}
              data-testid="pip"
            />
          )
        })}
      </div>
      <span className="text-[9px] min-w-[30px] text-right text-text-muted/60 tabular-nums">
        {current}/{max}
      </span>
    </div>
  )
}
