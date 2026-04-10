// plugins/daggerheart-core/ui/FearPanel.tsx
import { useState, useCallback } from 'react'
import { usePluginTranslation } from '@myvtt/sdk'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { WorkflowHandle } from '@myvtt/sdk'
import { FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, FEAR_MAX } from '../FearManager'
import { FEAR_SET_WORKFLOW, FEAR_CLEAR_WORKFLOW } from '../index'

interface FearTracker {
  current: number
  max: number
}

export function FearPanel({ sdk }: { sdk: IRegionSDK }) {
  const tracker = sdk.data.useComponent<FearTracker>(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY)
  const { t } = usePluginTranslation('daggerheart')
  const current = tracker?.current ?? 0
  const max = tracker?.max ?? FEAR_MAX

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const fearSetHandle = { name: FEAR_SET_WORKFLOW } as WorkflowHandle
  const fearClearHandle = { name: FEAR_CLEAR_WORKFLOW } as WorkflowHandle

  const handlePipClick = useCallback(
    (index: number) => {
      if (index >= current) {
        // Click empty pip → fill up to here
        void sdk.workflow.runWorkflow(fearSetHandle, { value: index + 1 })
      } else if (index === current - 1) {
        // Click last filled pip → clear all
        void sdk.workflow.runWorkflow(fearClearHandle, {})
      } else {
        // Click non-last filled pip → truncate to this position
        void sdk.workflow.runWorkflow(fearSetHandle, { value: index + 1 })
      }
    },
    [current, sdk.workflow, fearSetHandle, fearClearHandle],
  )

  const handleInc = useCallback(() => {
    if (current < max) {
      void sdk.workflow.runWorkflow(fearSetHandle, { value: current + 1 })
    }
  }, [current, max, sdk.workflow, fearSetHandle])

  const handleDec = useCallback(() => {
    if (current > 0) {
      void sdk.workflow.runWorkflow(fearSetHandle, { value: current - 1 })
    }
  }, [current, sdk.workflow, fearSetHandle])

  return (
    <div className="flex items-center gap-2.5 rounded-3xl bg-white/[0.04] px-5 py-2.5 select-none backdrop-blur-md border border-white/[0.06]">
      {/* - button */}
      <button
        data-testid="fear-dec"
        onClick={handleDec}
        className="flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white/50 transition-fast hover:bg-white/[0.12] hover:text-white/80 hover:border-white/20 active:scale-90"
      >
        -
      </button>

      {/* Label */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/60 mr-1">
        {t('fear.label')}
      </span>

      {/* Pips */}
      <div className="flex items-center gap-2">
        {Array.from({ length: max }, (_, i) => {
          const filled = i < current
          // Hover preview state
          let previewFill = false
          let previewClear = false
          if (hoverIndex !== null) {
            if (hoverIndex >= current && i >= current && i <= hoverIndex) {
              previewFill = true
            }
            if (hoverIndex < current) {
              if (hoverIndex === current - 1) {
                if (filled) previewClear = true
              } else if (i > hoverIndex && filled) {
                previewClear = true
              }
            }
          }

          return (
            <div
              key={i}
              data-testid="fear-pip"
              data-filled={filled}
              onClick={() => handlePipClick(i)}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              className="relative size-[22px] shrink-0 cursor-pointer rounded-full transition-all duration-normal"
              style={
                filled && !previewClear
                  ? {
                      background:
                        'radial-gradient(circle at 38% 32%, #ffad7a 0%, #ff6b4a 15%, #dc2626 40%, #991b1b 70%, #6b1010 100%)',
                      border: '1.5px solid rgba(255, 120, 70, 0.5)',
                      boxShadow:
                        '0 0 10px rgba(220,38,38,0.6), 0 0 24px rgba(220,38,38,0.25), 0 0 40px rgba(180,30,30,0.1), inset 0 -3px 5px rgba(0,0,0,0.35), inset 0 1px 3px rgba(255,220,180,0.35)',
                      animation: `ember-pulse 3s ease-in-out infinite ${i * 0.2}s`,
                    }
                  : previewFill
                    ? {
                        background:
                          'radial-gradient(circle at 50% 50%, rgba(220,38,38,0.15) 0%, rgba(220,38,38,0.05) 70%, transparent 100%)',
                        border: '1.5px solid rgba(220, 38, 38, 0.25)',
                      }
                    : previewClear && filled
                      ? {
                          background:
                            'radial-gradient(circle at 38% 32%, #ffad7a 0%, #ff6b4a 15%, #dc2626 40%, #991b1b 70%, #6b1010 100%)',
                          border: '1.5px solid rgba(255, 120, 70, 0.5)',
                          boxShadow:
                            '0 0 10px rgba(220,38,38,0.6), 0 0 24px rgba(220,38,38,0.25)',
                          opacity: 0.35,
                        }
                      : {
                          background:
                            'radial-gradient(circle at 50% 55%, rgba(20,15,25,0.4) 0%, rgba(10,8,16,0.3) 70%, transparent 100%)',
                          border: '1.5px solid rgba(255,255,255,0.07)',
                          boxShadow:
                            'inset 0 2px 4px rgba(0,0,0,0.35), inset 0 -1px 2px rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.2)',
                        }
              }
            >
              {/* Specular highlight for filled pips */}
              {filled && !previewClear && (
                <div
                  className="absolute left-1 top-[3px] size-2 rounded-full"
                  style={{
                    background:
                      'radial-gradient(ellipse at center, rgba(255,230,200,0.5) 0%, rgba(255,200,150,0.2) 50%, transparent 100%)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Count */}
      <span className="min-w-8 text-center text-[13px] font-semibold tabular-nums text-white/50">
        {t('fear.count', { current, max })}
      </span>

      {/* + button */}
      <button
        data-testid="fear-inc"
        onClick={handleInc}
        className="flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white/50 transition-fast hover:bg-white/[0.12] hover:text-white/80 hover:border-white/20 active:scale-90"
      >
        +
      </button>
    </div>
  )
}
