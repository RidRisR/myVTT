// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import type { RulePlugin } from './types'

// Temporary until plugins/generic/index.ts is created (Task 9).
// DO NOT call getRulePlugin() in this state — will throw.
// import { genericPlugin } from '../../plugins/generic/index'
const registry = new Map<string, RulePlugin>()

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(_id: string): RulePlugin {
  throw new Error('Plugin registry not yet wired — complete Task 9 first')
}
