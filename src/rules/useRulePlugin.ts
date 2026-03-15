// src/rules/useRulePlugin.ts
import { useWorldStore } from '../stores/worldStore'
import { getRulePlugin } from './registry'
import type { RulePlugin } from './types'

export function useRulePlugin(): RulePlugin {
  // ruleSystemId will be added to RoomState in Task 8.
  // Room state is nested under s.room — see worldStore RoomState type.
  // Fall back to 'generic' until the store field exists.
  const ruleSystemId =
    (useWorldStore((s) => (s.room as Record<string, unknown>).ruleSystemId as string | undefined) ??
    'generic')
  return getRulePlugin(ruleSystemId)
}
