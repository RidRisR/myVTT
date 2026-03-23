// plugins/generic/index.ts
import type { RulePlugin, ResourceView, StatusView, Entity } from '@myvtt/sdk'
import { GenericEntityCard } from './GenericEntityCard'

function getResources(entity: Entity): ResourceView[] {
  const resources = entity.components['generic:resources'] as ResourceView[] | undefined
  return resources ?? []
}

// Generic plugin: reads directly from entity.components.
// This is the fallback for rooms without a specific rule system.
export const genericPlugin: RulePlugin = {
  id: 'generic',
  name: 'Generic',
  sdkVersion: '1',

  adapters: {
    getMainResource(entity: Entity): ResourceView | null {
      const resources = getResources(entity)
      if (resources.length === 0) return null
      const r = resources[0] as (typeof resources)[0]
      return r
    },

    getPortraitResources(entity: Entity): ResourceView[] {
      return getResources(entity)
    },

    getStatuses(entity: Entity): StatusView[] {
      const statuses = entity.components['generic:statuses'] as StatusView[] | undefined
      return statuses ?? []
    },

    getFormulaTokens(entity: Entity): Record<string, number> {
      const attrs = entity.components['generic:attributes'] as
        | Record<string, number>
        | undefined
      return attrs ?? {}
    },
  },

  characterUI: {
    EntityCard: GenericEntityCard,
  },
}
