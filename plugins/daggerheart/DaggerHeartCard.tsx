// plugins/daggerheart/DaggerHeartCard.tsx
import type { EntityCardProps } from '@myvtt/sdk'
import { usePluginPanels } from '@myvtt/sdk'
import type { DHRuleData } from './types'

const ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export function DaggerHeartCard({ entity, readonly }: EntityCardProps) {
  const d = entity.ruleData as DHRuleData | null
  const { openPanel } = usePluginPanels()

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-text-primary font-semibold">{entity.name}</span>
        {d?.className && <span className="text-xs text-text-muted">{d.className}</span>}
      </div>
      {d && (
        <>
          <div className="flex gap-4 text-sm">
            <span className="text-red-500">
              HP {d.hp?.current ?? 0}/{d.hp?.max ?? 0}
            </span>
            <span className="text-orange-400">
              压力 {d.stress?.current ?? 0}/{d.stress?.max ?? 0}
            </span>
            <span className="text-accent">希望 {d.hope ?? 0}</span>
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
      {!readonly && (
        <button
          onClick={() => {
            openPanel('dh-full-sheet', entity.id)
          }}
          className="mt-2 w-full py-1.5 text-[11px] text-text-muted/50 bg-black/20 hover:bg-black/40 rounded-md transition-colors duration-fast"
        >
          完整角色卡 →
        </button>
      )}
    </div>
  )
}
