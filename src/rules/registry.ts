// src/rules/registry.ts
// Plugin registration boundary — imports plugins and wires them into the workflow system.
import { daggerheartCorePlugin } from '../../plugins/daggerheart-core'
import { daggerheartCosmeticPlugin } from '../../plugins/daggerheart-cosmetic'
import { genericVTTPlugin } from '../../plugins/generic/vttPlugin'
import { registerWorkflowPlugins } from '../workflow/useWorkflowSDK'

// Register VTT plugins for workflow activation
registerWorkflowPlugins([genericVTTPlugin, daggerheartCorePlugin, daggerheartCosmeticPlugin])

// Static list of available rule systems (used by AdminPanel, HamburgerMenu)
const AVAILABLE_RULE_SYSTEMS: Array<{ id: string; name: string }> = [
  { id: 'generic', name: 'Generic' },
  { id: 'daggerheart', name: 'Daggerheart' },
]

export function getAvailablePlugins(): Array<{ id: string; name: string }> {
  return AVAILABLE_RULE_SYSTEMS
}
