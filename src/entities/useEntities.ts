// src/entities/useEntities.ts
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { Entity } from '../shared/entityTypes'
import type { WorldMaps } from '../yjs/useWorld'

type EntityWithSource = Entity & { _source: 'party' | 'prepared' | string }

/**
 * Read ruleData from a nested Y.Map structure back into a plain object.
 * Backward compat: if ruleData is a plain value (old data), returns it directly.
 */
function readRuleDataFromYMap(yMap: Y.Map<unknown>): unknown {
  const ruleDataVal = yMap.get('ruleData')
  if (!(ruleDataVal instanceof Y.Map)) return ruleDataVal ?? null

  const rd: Record<string, unknown> = {}
  ruleDataVal.forEach((val: unknown, key: string) => {
    if (val instanceof Y.Map) {
      const arr: unknown[] = []
      ;(val as Y.Map<unknown>).forEach((v: unknown) => arr.push(v))
      rd[key] = arr
    } else if (val instanceof Y.Array) {
      rd[key] = (val as Y.Array<unknown>).toArray()
    } else {
      rd[key] = val
    }
  })
  return rd
}

/**
 * Write ruleData as a multi-level nested Y structure for fine-grained CRDT merging.
 * resources → Y.Map (keyed by resource name)
 * attributes → Y.Map (keyed by attribute name)
 * statuses → Y.Array
 */
function setRuleDataYMaps(parentYMap: Y.Map<unknown>, ruleData: unknown) {
  const ruleDataMap = new Y.Map<unknown>()
  if (ruleData && typeof ruleData === 'object') {
    const rd = ruleData as Record<string, unknown>

    if (rd.resources && typeof rd.resources === 'object') {
      const resMap = new Y.Map<unknown>()
      const entries: [string, unknown][] = Array.isArray(rd.resources)
        ? (rd.resources as Array<{ key: string }>).map((r) => [r.key, r])
        : Object.entries(rd.resources as Record<string, unknown>)
      for (const [k, v] of entries) resMap.set(k, v)
      ruleDataMap.set('resources', resMap)
    }

    if (rd.attributes && typeof rd.attributes === 'object') {
      const attrMap = new Y.Map<unknown>()
      const entries: [string, unknown][] = Array.isArray(rd.attributes)
        ? (rd.attributes as Array<{ key: string }>).map((a) => [a.key, a])
        : Object.entries(rd.attributes as Record<string, unknown>)
      for (const [k, v] of entries) attrMap.set(k, v)
      ruleDataMap.set('attributes', attrMap)
    }

    if (Array.isArray(rd.statuses)) {
      const statusArr = new Y.Array<unknown>()
      statusArr.push(rd.statuses)
      ruleDataMap.set('statuses', statusArr)
    }

    for (const [k, v] of Object.entries(rd)) {
      if (!['resources', 'attributes', 'statuses'].includes(k)) {
        ruleDataMap.set(k, v)
      }
    }
  }
  parentYMap.set('ruleData', ruleDataMap)
}

/**
 * Merge ruleData updates into existing nested Y.Map structure.
 * Only touches the specific sub-keys provided (e.g. { resources: { HP: {...} } }).
 */
function mergeRuleDataUpdate(partyYMap: Y.Map<unknown>, ruleDataUpdates: Record<string, unknown>) {
  const ruleDataMap = partyYMap.get('ruleData')
  if (!(ruleDataMap instanceof Y.Map)) {
    setRuleDataYMaps(partyYMap, ruleDataUpdates)
    return
  }

  for (const [subKey, subVal] of Object.entries(ruleDataUpdates)) {
    if (subKey === 'resources' || subKey === 'attributes') {
      let subMap = (ruleDataMap as Y.Map<unknown>).get(subKey)
      if (!(subMap instanceof Y.Map)) {
        subMap = new Y.Map<unknown>()
        ;(ruleDataMap as Y.Map<unknown>).set(subKey, subMap)
      }
      if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal)) {
        for (const [k, v] of Object.entries(subVal as Record<string, unknown>)) {
          ;(subMap as Y.Map<unknown>).set(k, v)
        }
      }
    } else if (subKey === 'statuses' && Array.isArray(subVal)) {
      const arr = new Y.Array<unknown>()
      arr.push(subVal)
      ;(ruleDataMap as Y.Map<unknown>).set('statuses', arr)
    } else {
      ;(ruleDataMap as Y.Map<unknown>).set(subKey, subVal)
    }
  }
}

function readYMapEntity(yMap: Y.Map<unknown>): Entity {
  return {
    id: yMap.get('id') as string,
    name: (yMap.get('name') as string) ?? '',
    imageUrl: (yMap.get('imageUrl') as string) ?? '',
    color: (yMap.get('color') as string) ?? '',
    size: (yMap.get('size') as number) ?? 1,
    blueprintId: yMap.get('blueprintId') as string | undefined,
    notes: (yMap.get('notes') as string) ?? '',
    ruleData: readRuleDataFromYMap(yMap),
    permissions: (yMap.get('permissions') as Entity['permissions']) ?? {
      default: 'observer',
      seats: {},
    },
  }
}

function setYMapFields(yMap: Y.Map<unknown>, entity: Entity) {
  yMap.set('id', entity.id)
  yMap.set('name', entity.name)
  yMap.set('imageUrl', entity.imageUrl)
  yMap.set('color', entity.color)
  yMap.set('size', entity.size)
  if (entity.blueprintId) yMap.set('blueprintId', entity.blueprintId)
  yMap.set('notes', entity.notes)
  setRuleDataYMaps(yMap, entity.ruleData)
  yMap.set('permissions', entity.permissions)
}

export function useEntities(world: WorldMaps, currentSceneId: string | null, yDoc: Y.Doc) {
  const [entities, setEntities] = useState<EntityWithSource[]>([])

  // Collect entities from all sources
  const rebuild = useCallback(() => {
    const result: EntityWithSource[] = []

    // Party (PCs) — nested Y.Maps
    world.party.forEach((yMap) => {
      if (yMap instanceof Y.Map) {
        result.push({ ...readYMapEntity(yMap), _source: 'party' })
      }
    })

    // Prepared (GM staging) — plain objects
    world.prepared.forEach((val) => {
      const entity = val as Entity
      if (entity && entity.id) {
        result.push({ ...entity, _source: 'prepared' })
      }
    })

    // Current scene entities — plain objects
    if (currentSceneId) {
      const sceneMap = world.scenes.get(currentSceneId)
      if (sceneMap instanceof Y.Map) {
        const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
        if (sceneEntities instanceof Y.Map) {
          sceneEntities.forEach((entity) => {
            if (entity && entity.id) {
              result.push({ ...entity, _source: `scene:${currentSceneId}` })
            }
          })
        }
      }
    }

    setEntities(result)
  }, [world, currentSceneId])

  // Observe all containers
  useEffect(() => {
    rebuild()

    // Party: observeDeep because values are nested Y.Maps
    world.party.observeDeep(rebuild)

    // Prepared: observe (plain objects, top-level changes only)
    world.prepared.observe(rebuild)

    // Current scene entities
    let sceneEntitiesMap: Y.Map<unknown> | null = null
    if (currentSceneId) {
      const sceneMap = world.scenes.get(currentSceneId)
      if (sceneMap instanceof Y.Map) {
        sceneEntitiesMap = sceneMap.get('entities') as Y.Map<unknown> | null
        if (sceneEntitiesMap instanceof Y.Map) {
          sceneEntitiesMap.observe(rebuild)
        }
      }
    }

    return () => {
      world.party.unobserveDeep(rebuild)
      world.prepared.unobserve(rebuild)
      if (sceneEntitiesMap instanceof Y.Map) {
        sceneEntitiesMap.unobserve(rebuild)
      }
    }
  }, [world, currentSceneId, rebuild])

  // --- CRUD ---

  /** Add PC to party (nested Y.Map) */
  const addPartyEntity = useCallback(
    (entity: Entity) => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.party.set(entity.id, yMap)
        setYMapFields(yMap, entity)
      })
    },
    [world, yDoc],
  )

  /** Add NPC to current scene (plain object) */
  const addSceneEntity = useCallback(
    (entity: Entity, sceneId?: string) => {
      const targetSceneId = sceneId ?? currentSceneId
      if (!targetSceneId) return
      const sceneMap = world.scenes.get(targetSceneId)
      if (!(sceneMap instanceof Y.Map)) return
      const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
      if (sceneEntities instanceof Y.Map) {
        sceneEntities.set(entity.id, entity)
      }
    },
    [world, currentSceneId],
  )

  /** Add entity to prepared (plain object) */
  const addPreparedEntity = useCallback(
    (entity: Entity) => {
      world.prepared.set(entity.id, entity)
    },
    [world],
  )

  /** Update entity (auto-detects source) */
  const updateEntity = useCallback(
    (id: string, updates: Partial<Entity>) => {
      // Check party first (nested Y.Map)
      const partyYMap = world.party.get(id)
      if (partyYMap instanceof Y.Map) {
        yDoc.transact(() => {
          for (const [key, value] of Object.entries(updates)) {
            if (key === 'ruleData' && value && typeof value === 'object') {
              mergeRuleDataUpdate(partyYMap, value as Record<string, unknown>)
            } else {
              partyYMap.set(key, value)
            }
          }
        })
        return
      }

      // Check prepared
      const preparedEntity = world.prepared.get(id) as Entity | undefined
      if (preparedEntity) {
        world.prepared.set(id, { ...preparedEntity, ...updates })
        return
      }

      // Check current scene
      if (currentSceneId) {
        const sceneMap = world.scenes.get(currentSceneId)
        if (sceneMap instanceof Y.Map) {
          const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
          if (sceneEntities instanceof Y.Map) {
            const existing = sceneEntities.get(id)
            if (existing) {
              sceneEntities.set(id, { ...existing, ...updates })
              return
            }
          }
        }
      }
    },
    [world, currentSceneId, yDoc],
  )

  /** Delete entity from wherever it lives */
  const deleteEntity = useCallback(
    (id: string) => {
      if (world.party.has(id)) {
        world.party.delete(id)
        return
      }
      if (world.prepared.has(id)) {
        world.prepared.delete(id)
        return
      }
      if (currentSceneId) {
        const sceneMap = world.scenes.get(currentSceneId)
        if (sceneMap instanceof Y.Map) {
          const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
          if (sceneEntities instanceof Y.Map && sceneEntities.has(id)) {
            sceneEntities.delete(id)
          }
        }
      }
    },
    [world, currentSceneId],
  )

  /** Get entity by ID */
  const getEntity = useCallback(
    (id: string | null): Entity | null => {
      if (!id) return null
      return entities.find((e) => e.id === id) ?? null
    },
    [entities],
  )

  /** Promote entity from scene to prepared (GM collection) */
  const promoteToGM = useCallback(
    (id: string) => {
      if (!currentSceneId) return
      const sceneMap = world.scenes.get(currentSceneId)
      if (!(sceneMap instanceof Y.Map)) return
      const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
      if (!(sceneEntities instanceof Y.Map)) return
      const entity = sceneEntities.get(id)
      if (!entity) return
      yDoc.transact(() => {
        world.prepared.set(id, entity)
        sceneEntities.delete(id)
      })
    },
    [world, currentSceneId, yDoc],
  )

  return {
    entities: entities as Entity[],
    addPartyEntity,
    addSceneEntity,
    addPreparedEntity,
    updateEntity,
    deleteEntity,
    getEntity,
    promoteToGM,
  }
}
