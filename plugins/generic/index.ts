// plugins/generic/index.ts
import type { RulePlugin, ResourceView, StatusView, Entity } from '@myvtt/sdk'
import { GenericEntityCard } from './GenericEntityCard'
import { getEntityResources, getEntityStatuses } from '../../src/shared/entityAdapters'

// Generic plugin: delegates adapters to entityAdapters.ts.
// This is the legacy fallback for rooms without a specific rule system.
export const genericPlugin: RulePlugin = {
  id: 'generic',
  name: 'Generic',
  sdkVersion: '1',

  adapters: {
    getMainResource(entity: Entity): ResourceView | null {
      // entityAdapters.getEntityResources returns items with { key, current, max, color }
      // Map to plugin ResourceView { label, current, max, color }
      const resources = getEntityResources(entity)
      if (resources.length === 0) return null
      const r = resources[0]
      return { label: r.key, current: r.current, max: r.max, color: r.color }
    },

    getPortraitResources(entity: Entity): ResourceView[] {
      return getEntityResources(entity).map((r) => ({
        label: r.key,
        current: r.current,
        max: r.max,
        color: r.color,
      }))
    },

    getStatuses(entity: Entity): StatusView[] {
      return getEntityStatuses(entity)
    },

    getFormulaTokens(_entity: Entity): Record<string, number> {
      return {}
    },
  },

  characterUI: {
    EntityCard: GenericEntityCard,
  },
}
