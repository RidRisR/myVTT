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

export default function PocApp() {
  const handleDirectEdit = useCallback(() => {
    usePocStore.getState().updateEntityComponent('goblin-01', 'core:health', (current) => {
      const h = current as Health | undefined
      return { hp: Math.max(0, (h?.hp ?? 0) - 1), maxHp: h?.maxHp ?? 0 }
    })
  }, [])

  return (
    <div className="flex h-screen bg-deep text-foreground">
      {/* Left: Spell Palette */}
      <div className="w-60 border-r border-border">
        <StatusTagPalette />
      </div>

      {/* Center: Entity Cards */}
      <div className="flex flex-1 flex-col gap-4 p-6">
        <h2 className="text-lg font-bold text-foreground">POC Plugin Verification</h2>
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
      </div>
    </div>
  )
}
