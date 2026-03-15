// src/rules/useRulePlugin.ts
import { useWorldStore } from '../stores/worldStore'
import { getRulePlugin } from './registry'
import type { RulePlugin } from './types'

export function useRulePlugin(): RulePlugin {
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  return getRulePlugin(ruleSystemId)
}
