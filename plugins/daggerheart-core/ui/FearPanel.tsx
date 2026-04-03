// plugins/daggerheart-core/ui/FearPanel.tsx
import { useComponent } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'

interface FearTracker {
  current: number
  max: number
}

export function FearPanel() {
  const tracker = useComponent<FearTracker>(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY)
  const current = tracker?.current ?? 0
  const max = tracker?.max ?? 10

  return (
    <div className="p-3 select-none">
      <div className="text-[10px] text-text-muted/50 uppercase tracking-wider mb-2">Fear</div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-red-500 tabular-nums w-8 text-center">
          {current}
        </span>
        <span className="text-xs text-text-muted">/ {max}</span>
      </div>
      {/* Pip track */}
      <div className="flex gap-1 mt-2">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className="w-[7px] h-[7px] rounded-full transition-colors"
            style={{
              backgroundColor: i < current ? '#dc2626' : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
