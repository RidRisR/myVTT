import type { DHRuleData } from './types'
import { createDefaultDHEntityData } from './templates'

/** Merge raw ruleData with DaggerHeart defaults — guarantees all fields exist */
export function parseDHRuleData(raw: unknown): DHRuleData {
  return { ...createDefaultDHEntityData(), ...(raw as Record<string, unknown>) } as DHRuleData
}
