import { useMemo, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { Entity } from '../shared/entityTypes'

export interface MergedEntity extends Entity {
  _hidden?: boolean
}

/** Read hidden entities from the secret doc's secret_entities map */
function readSecretEntities(secretDoc: Y.Doc): Entity[] {
  const map = secretDoc.getMap('secret_entities')
  const result: Entity[] = []
  map.forEach((yMap) => {
    if (!(yMap instanceof Y.Map)) return
    result.push({
      id: yMap.get('id') as string,
      name: (yMap.get('name') as string) ?? '',
      imageUrl: (yMap.get('imageUrl') as string) ?? '',
      color: (yMap.get('color') as string) ?? '',
      size: (yMap.get('size') as number) ?? 1,
      blueprintId: yMap.get('blueprintId') as string | undefined,
      notes: (yMap.get('notes') as string) ?? '',
      ruleData: null,
      permissions: { default: 'none', seats: {} },
      persistent: (yMap.get('persistent') as boolean) ?? false,
    })
  })
  return result
}

/**
 * GM merged view: combines public entities with hidden entities from the secret doc.
 * Hidden entities are tagged with _hidden = true.
 * Non-GM clients (secretDoc is null) get publicEntities unchanged.
 */
export function useGmMergedView(publicEntities: Entity[], secretDoc: Y.Doc | null): MergedEntity[] {
  const [hiddenEntities, setHiddenEntities] = useState<Entity[]>([])

  useEffect(() => {
    if (!secretDoc) return
    const map = secretDoc.getMap('secret_entities')
    const rebuild = () => setHiddenEntities(readSecretEntities(secretDoc))
    rebuild()
    map.observeDeep(rebuild)
    return () => map.unobserveDeep(rebuild)
  }, [secretDoc])

  return useMemo(() => {
    if (!secretDoc) return publicEntities
    const hidden: MergedEntity[] = hiddenEntities.map((e) => ({ ...e, _hidden: true }))
    return [...publicEntities, ...hidden]
  }, [publicEntities, hiddenEntities, secretDoc])
}
