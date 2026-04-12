import { Diamond, Heart, Shield, Zap } from 'lucide-react'
import type { SideEffectEntry } from '../../rollTypes'
import { CollapsibleSection } from './AdvancedOptions'

interface SideEffectsProps {
  effects: SideEffectEntry[]
  onChange: (resource: SideEffectEntry['resource'], delta: number) => void
}

const RESOURCE_META: Record<
  SideEffectEntry['resource'],
  {
    label: string
    Icon: typeof Heart
  }
> = {
  hope: { label: '希望', Icon: Diamond },
  hp: { label: '生命', Icon: Heart },
  stress: { label: '压力', Icon: Zap },
  armor: { label: '护甲', Icon: Shield },
}

const RESOURCE_ORDER: SideEffectEntry['resource'][] = ['hope', 'hp', 'stress', 'armor']

function getDelta(effects: SideEffectEntry[], resource: SideEffectEntry['resource']): number {
  return effects.find((effect) => effect.resource === resource)?.delta ?? 0
}

function getEffectTone(delta: number): 'pos' | 'neg' | 'neutral' {
  if (delta === 0) return 'neutral'
  return delta < 0 ? 'neg' : 'pos'
}

function getSummary(effects: SideEffectEntry[]): string {
  return effects
    .filter((effect) => effect.delta !== 0)
    .map((effect) => {
      const { label } = RESOURCE_META[effect.resource]
      const value = effect.delta > 0 ? `+${effect.delta}` : `${effect.delta}`
      return `${label} ${value}`
    })
    .join(' · ')
}

export function SideEffects({ effects, onChange }: SideEffectsProps) {
  const summary = getSummary(effects)

  return (
    <CollapsibleSection label="副作用" summary={summary || '资源变动'}>
      <div className="grid grid-cols-2 gap-1">
        {RESOURCE_ORDER.map((resource) => {
          const { label, Icon } = RESOURCE_META[resource]
          const delta = getDelta(effects, resource)
          const tone = getEffectTone(delta)
          const toneClasses =
            tone === 'neg'
              ? 'border-danger/20 bg-danger/[0.05]'
              : tone === 'pos'
                ? 'border-success/20 bg-success/[0.05]'
                : 'border-border-glass bg-transparent'
          const textClasses =
            tone === 'neg' ? 'text-danger' : tone === 'pos' ? 'text-success' : 'text-text-muted/50'

          return (
            <div
              key={resource}
              className={`flex items-center gap-1.5 h-9 px-2.5 rounded-md border ${toneClasses}`}
            >
              <span className={`flex items-center justify-center w-3.5 h-3.5 ${textClasses}`}>
                <Icon size={12} strokeWidth={1.5} />
              </span>
              <span className={`text-[10px] opacity-80 ${textClasses}`}>{label}</span>
              <div className="flex items-center gap-0.5 ml-auto">
                <button
                  onClick={() => { onChange(resource, Math.max(-9, delta - 1)); }}
                  className="w-6 h-6 rounded border border-border-glass bg-transparent text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:text-text-primary transition-colors"
                >
                  -
                </button>
                <span
                  className={`min-w-[22px] text-center text-[13px] font-bold tabular-nums ${textClasses}`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
                <button
                  onClick={() => { onChange(resource, Math.min(9, delta + 1)); }}
                  className="w-6 h-6 rounded border border-border-glass bg-transparent text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:text-text-primary transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </CollapsibleSection>
  )
}
