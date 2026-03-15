// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import type { RulePlugin } from './types'
import { genericPlugin } from '../../plugins/generic/index'

const registry = new Map<string, RulePlugin>([['generic', genericPlugin]])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin
}
