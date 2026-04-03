import { useState } from 'react'
import type { InputHandlerProps } from '../../../src/ui-system/inputHandlerTypes'

export interface ModifierPanelContext {
  actorId?: string
}

export interface ModifierResult {
  dc: number
}

/**
 * TEMP: This panel is currently triggered from .dd command line.
 * After characterUI migration, it should ONLY be triggered from character card buttons.
 * The command-line trigger path should be removed at that point.
 */
export function ModifierPanel({
  context: _context,
  resolve,
  cancel,
}: InputHandlerProps<ModifierPanelContext, ModifierResult>) {
  const [dc, setDc] = useState(12)

  return (
    <div className="bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-[260px]">
      <div className="text-sm text-text-muted mb-3">Daggerheart Action Check</div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-text-muted w-8">DC</label>
        <input
          type="number"
          min={1}
          max={30}
          value={dc}
          onChange={(e) => { setDc(Math.max(1, Math.min(30, Number(e.target.value) || 12))); }}
          className="w-16 bg-surface border border-border-glass rounded px-2 py-1 text-sm text-text-primary text-center outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { cancel(); }}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={() => { resolve({ dc }); }}
          className="px-3 py-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors cursor-pointer"
        >
          Roll
        </button>
      </div>
    </div>
  )
}
