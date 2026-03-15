// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import type { RulePlugin } from './types'
import { genericPlugin } from '../../plugins/generic/index'
import { daggerheartPlugin } from '../../plugins/daggerheart/index'

const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin
}

export function getAvailablePlugins(): Array<{ id: string; name: string }> {
  return Array.from(registry.entries()).map(([id, p]) => ({ id, name: p.name }))
}
