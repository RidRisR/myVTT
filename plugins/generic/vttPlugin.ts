// plugins/generic/vttPlugin.ts
// VTTPlugin for the Generic rule system — registers entity display bindings.
// Reads from rule:* component keys (matching CharacterEditPanel's write targets).

import type { VTTPlugin, Entity, ResourceView, StatusView } from '@myvtt/sdk'
import {
  MAIN_RESOURCE_POINT,
  PORTRAIT_RESOURCES_POINT,
  STATUS_POINT,
  FORMULA_TOKENS_POINT,
  ENTITY_CARD_POINT,
} from '@myvtt/sdk'
import { GenericEntityCard } from './GenericEntityCard'

function getResources(entity: Entity): ResourceView[] {
  return (entity.components['rule:resources'] as ResourceView[] | undefined) ?? []
}

export const genericVTTPlugin: VTTPlugin = {
  id: 'generic-bindings',
  ruleSystemId: 'generic',

  onActivate(sdk) {
    sdk.ui.registerRenderer(MAIN_RESOURCE_POINT, {
      resolve(entity: Entity): ResourceView | null {
        const resources = getResources(entity)
        return resources.length > 0 ? (resources[0] ?? null) : null
      },
    })

    sdk.ui.registerRenderer(PORTRAIT_RESOURCES_POINT, {
      resolve(entity: Entity): ResourceView[] {
        return getResources(entity)
      },
    })

    sdk.ui.registerRenderer(STATUS_POINT, {
      resolve(entity: Entity): StatusView[] {
        return (entity.components['rule:statuses'] as StatusView[] | undefined) ?? []
      },
    })

    sdk.ui.registerRenderer(FORMULA_TOKENS_POINT, {
      resolve(entity: Entity): Record<string, number> {
        const attrs = entity.components['rule:attributes'] as
          | { key: string; value: number }[]
          | undefined
        if (!attrs) return {}
        const result: Record<string, number> = {}
        for (const attr of attrs) {
          if (attr.key && typeof attr.value === 'number') result[attr.key] = attr.value
        }
        return result
      },
    })

    sdk.ui.registerRenderer(ENTITY_CARD_POINT, {
      ruleSystemId: 'generic',
      component: GenericEntityCard,
    })
  },
}
