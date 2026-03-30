// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import i18next from 'i18next'
import type { RulePlugin } from './types'
import { useWorldStore } from '../stores/worldStore'
import { genericPlugin } from '../../plugins/generic/index'
import { daggerheartPlugin } from '../../plugins/daggerheart/index'
import { daggerheartCorePlugin } from '../../plugins/daggerheart-core'
import { daggerheartCosmeticPlugin } from '../../plugins/daggerheart-cosmetic'
import { coreUIPlugin } from '../../plugins/core-ui'
import { registerWorkflowPlugins, _bindRuleRegistry } from '../workflow/useWorkflowSDK'
import { _bindRollResultDeps } from '../log/renderers/rollResultDeps'

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
registerWorkflowPlugins([daggerheartCorePlugin, daggerheartCosmeticPlugin, coreUIPlugin])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
  loadPluginI18n(plugin)
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

// Late-bind hooks for RollResultRenderer (breaks circular dep — see rollResultDeps.ts).
// Inlined here because importing useRulePlugin/usePluginTranslation would create new cycles.
import { useTranslation } from 'react-i18next'

function _useRulePluginForRenderer(): RulePlugin {
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  return getRulePlugin(ruleSystemId)
}

function _usePluginTranslationForRenderer() {
  const { i18n } = useTranslation()
  const plugin = _useRulePluginForRenderer()
  const lng = i18n.language

  const t = (key: string): string => {
    const resources = plugin.i18n?.resources
    if (!resources) return key
    const dict = resources[lng] ?? resources['zh-CN'] ?? {}
    return dict[key] ?? key
  }
  return { t }
}

_bindRollResultDeps(_useRulePluginForRenderer, _usePluginTranslationForRenderer)
