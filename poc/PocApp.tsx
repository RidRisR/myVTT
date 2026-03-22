import { useCallback } from 'react'
import { WorkflowEngine } from '../src/workflow/engine'
import type { WorkflowContext } from '../src/workflow/types'
import { usePocStore } from './store'
import { createDataReader } from './dataReader'
import { createEventBus } from './eventBus'
import { createPocWorkflowContext } from './pocWorkflowContext'
import { activateCorePlugin } from './plugins/core/index'
import { activateStatusFxPlugin } from './plugins/status-fx/index'
import { loadMockData } from './mockData'
import { EntityCard } from './panels/EntityCard'
import { setSpellDropHandler } from './panels/spellDropHandler'
import { StatusTagPalette } from './panels/StatusTagPalette'
import { DamageLog } from './panels/DamageLog'
import { SelectionDetail } from './panels/SelectionDetail'
import { PocPanelRenderer } from './PocPanelRenderer'
import type { PanelEntry } from './PocPanelRenderer'
import { usePocSessionStore } from './sessionStore'
import type { SpellPayload } from './panels/StatusTagPalette'
import type { Health } from './plugins/core/components'

// Initialize once
const engine = new WorkflowEngine()
activateCorePlugin(engine)
activateStatusFxPlugin(engine)
loadMockData()

const reader = createDataReader()
const bus = createEventBus()

// Wire up spell drop handler
setSpellDropHandler((entityId: string, spell: SpellPayload) => {
  const internal = { depth: 0, abortCtrl: { aborted: false } }
  const ctx = createPocWorkflowContext(
    { dataReader: reader, eventBus: bus, engine },
    { targetId: entityId, rawDamage: spell.damage, damageType: spell.damageType, finalDamage: 0 },
    internal,
  )
  void engine.runWorkflow('core:deal-damage', ctx as unknown as WorkflowContext, internal)
})

const ENTITY_LIST = ['goblin-01', 'hero-01', 'minion-01', 'minion-02', 'minion-03']

const panelEntries: Record<string, PanelEntry> = {
  'entity-card#fixed': {
    component: EntityCard as React.ComponentType<Record<string, unknown>>,
    instanceProps: { entityId: 'goblin-01' },
  },
  'selection-detail#dynamic': {
    component: SelectionDetail as React.ComponentType<Record<string, unknown>>,
    instanceProps: (session: { selection: string[] }) => ({
      entityId: session.selection[0] ?? null,
    }),
  },
}

export default function PocApp() {
  const selection = usePocSessionStore((s) => s.selection)
  const entities = usePocStore((s) => s.entities)

  const handleDirectEdit = useCallback(() => {
    usePocStore.getState().updateEntityComponent('goblin-01', 'core:health', (current) => {
      const h = current as Health | undefined
      return { hp: Math.max(0, (h?.hp ?? 0) - 1), maxHp: h?.maxHp ?? 0 }
    })
  }, [])

  const handleSelectEntity = useCallback((entityId: string) => {
    const internal = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createPocWorkflowContext(
      { dataReader: reader, eventBus: bus, engine },
      { entityId },
      internal,
    )
    void engine.runWorkflow('core:set-selection', ctx as unknown as WorkflowContext, internal)
  }, [])

  return (
    <div className="flex h-screen bg-deep text-foreground">
      {/* Left: Spell Palette */}
      <div className="w-60 border-r border-border">
        <StatusTagPalette />
      </div>

      {/* Center: Entity Cards + Entity List */}
      <div className="flex flex-1 flex-col gap-4 p-6">
        <h2 className="text-lg font-bold text-foreground">POC Plugin Verification</h2>

        {/* Entity List — click to select */}
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted">Entity List (click to select)</h3>
          {ENTITY_LIST.map((eid) => {
            const entity = entities[eid]
            const isSelected = selection.includes(eid)
            return (
              <button
                key={eid}
                onClick={() => {
                  handleSelectEntity(eid)
                }}
                className={`rounded px-2 py-1 text-left text-sm ${
                  isSelected ? 'bg-accent text-white' : 'hover:bg-surface'
                }`}
              >
                {entity?.name ?? eid}
              </button>
            )
          })}
        </div>

        {/* Debug: current selection */}
        <div className="text-xs text-muted">
          Selection: {selection.length > 0 ? selection.join(', ') : '(none)'}
        </div>

        {/* Entity Cards */}
        <div className="flex gap-4">
          <EntityCard entityId="goblin-01" />
          <EntityCard entityId="goblin-01" />
        </div>
        <button
          onClick={handleDirectEdit}
          className="w-fit rounded bg-accent px-3 py-1 text-sm text-white"
        >
          Direct Store Edit: -1 HP to goblin-01
        </button>
        <div className="flex gap-4">
          <EntityCard entityId="hero-01" />
        </div>

        {/* Panel Renderer: static + dynamic panels */}
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-muted">Panel Renderer (static + dynamic)</h3>
          <PocPanelRenderer entries={panelEntries} />
        </div>
      </div>

      {/* Right: Damage Log */}
      <div className="w-60 border-l border-border">
        <DamageLog />
      </div>
    </div>
  )
}
