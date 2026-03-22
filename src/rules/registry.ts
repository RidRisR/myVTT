// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import i18next from 'i18next'
import type { RulePlugin } from './types'
import { genericPlugin } from '../../plugins/generic/index'
import { daggerheartPlugin } from '../../plugins/daggerheart/index'
import { daggerheartCorePlugin } from '../../plugins/daggerheart-core'
import { daggerheartCosmeticPlugin } from '../../plugins/daggerheart-cosmetic'
import { registerWorkflowPlugins } from '../workflow/useWorkflowSDK'

function loadPluginI18n(plugin: RulePlugin): void {
  if (!plugin.i18n?.resources) return
  if (!i18next.isInitialized) return
  for (const [lng, translations] of Object.entries(plugin.i18n.resources)) {
    i18next.addResourceBundle(lng, `plugin-${plugin.id}`, translations, true, true)
  }
}

const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

// Load i18n for pre-registered plugins
for (const plugin of registry.values()) {
  loadPluginI18n(plugin)
}

// POC: register workflow plugins (will be replaced by dynamic discovery from room's rule system)
registerWorkflowPlugins([daggerheartCorePlugin, daggerheartCosmeticPlugin])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
  loadPluginI18n(plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin
}

export function getAvailablePlugins(): Array<{ id: string; name: string }> {
  return Array.from(registry.entries()).map(([id, p]) => ({ id, name: p.name }))
}
