// plugins/daggerheart/DaggerHeartCard.tsx
import type { EntityCardProps } from '@myvtt/sdk'
import type { DHRuleData } from './types'

const ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export function DaggerHeartCard({ entity }: EntityCardProps) {
  const d = entity.ruleData as DHRuleData | null

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-text-primary font-semibold">{entity.name}</span>
        {d?.className && <span className="text-xs text-text-muted">{d.className}</span>}
      </div>
      {d && (
        <>
          <div className="flex gap-4 text-sm">
            <span className="text-red-500">HP {d.hp.current}/{d.hp.max}</span>
            <span className="text-orange-400">压力 {d.stress.current}/{d.stress.max}</span>
            <span className="text-accent">希望 {d.hope}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs">
            {ATTRS.map((k) => (
              <div key={k} className="flex flex-col items-center bg-black/20 rounded p-1">
                <span className="text-text-muted capitalize">{k}</span>
                <span className="text-text-primary font-bold">
                  {d[k] >= 0 ? '+' : ''}
                  {d[k]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
