// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import type { RulePlugin } from './types'
import { useWorldStore } from '../stores/worldStore'
import { genericPlugin } from '../../plugins/generic/index'
import { daggerheartPlugin } from '../../plugins/daggerheart/index'
import { daggerheartCorePlugin } from '../../plugins/daggerheart-core'
import { daggerheartCosmeticPlugin } from '../../plugins/daggerheart-cosmetic'
import { coreUIPlugin } from '../../plugins/core-ui'
import { registerWorkflowPlugins, _bindRuleRegistry } from '../workflow/useWorkflowSDK'

const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

// POC: register workflow plugins (will be replaced by dynamic discovery from room's rule system)
registerWorkflowPlugins([daggerheartCorePlugin, daggerheartCosmeticPlugin, coreUIPlugin])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin
}

/** Non-hook accessor for the active rule plugin (uses current room's ruleSystemId) */
export function getRulePluginSync(): RulePlugin {
  const ruleSystemId = useWorldStore.getState().room.ruleSystemId
  return getRulePlugin(ruleSystemId)
}

export function getAvailablePlugins(): Array<{ id: string; name: string }> {
  return Array.from(registry.entries()).map(([id, p]) => ({ id, name: p.name }))
}

// Late-bind getRulePluginSync into useWorkflowSDK — breaks circular dependency.
// This runs after all module-level code above has completed.
_bindRuleRegistry(getRulePluginSync)
