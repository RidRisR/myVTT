import { lazy, Suspense, useState } from 'react'

interface PatternEntry {
  key: string
  title: string
  description: string
  component: React.LazyExoticComponent<React.ComponentType>
}

const PATTERNS: PatternEntry[] = [
  {
    key: 'floating-panel-overlay',
    title: 'FloatingPanel + NestedOverlay',
    description: 'Non-modal floating panel with nested Radix Popover and ContextMenu',
    component: lazy(() => import('./PatternFloatingPanelOverlay')),
  },
  {
    key: 'floating-card',
    title: 'FloatingCard',
    description: 'Anchored/floating/hover card with pin and drag support',
    component: lazy(() => import('./PatternFloatingCard')),
  },
  {
    key: 'multi-type-dnd',
    title: 'MultiType DnD',
    description: 'Single DndContext with tag drag + item sortable + batch drop',
    component: lazy(() => import('./PatternMultiTypeDnD')),
  },
  {
    key: 'ui-system-poc',
    title: 'UI System POC',
    description: 'Plugin registerComponent + registerLayer + IComponentSDK injection',
    component: lazy(() => import('./PatternUISystem')),
  },
]

export default function SandboxRoot() {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const active = PATTERNS.find((p) => p.key === activeKey)

  return (
    <div className="min-h-screen bg-deep text-text-primary p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-light tracking-wide">Sandbox</h1>
          <p className="text-xs text-muted mt-1">
            Dev-only pattern library for high-risk interaction combos
          </p>
        </div>
        <a href="#admin" className="text-xs text-accent hover:underline">
          Back to Admin
        </a>
      </div>

      {/* Pattern list */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {PATTERNS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setActiveKey(activeKey === p.key ? null : p.key)
            }}
            className={[
              'px-4 py-2.5 rounded-lg border text-left transition-colors duration-fast cursor-pointer',
              activeKey === p.key
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-glass bg-glass hover:bg-hover text-text-primary',
            ].join(' ')}
          >
            <div className="text-sm font-medium">{p.title}</div>
            <div className="text-xs text-muted mt-0.5">{p.description}</div>
          </button>
        ))}
      </div>

      {/* Active pattern */}
      {active && (
        <Suspense fallback={<div className="text-muted text-sm">Loading pattern...</div>}>
          <active.component />
        </Suspense>
      )}
    </div>
  )
}
