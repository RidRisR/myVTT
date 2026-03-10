// src/entities/useEntities.ts
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { Entity, EntityPermissions, PermissionLevel } from '../shared/entityTypes'
import type { WorldMaps } from '../yjs/useWorld'

type EntityWithSource = Entity & { _source: 'roster' | string }

/** Read permissions from a nested Y.Map back to a plain EntityPermissions object */
function readPermissions(yMap: Y.Map<unknown>): EntityPermissions {
  const permYMap = yMap.get('permissions')
  if (permYMap instanceof Y.Map) {
    const seatsYMap = permYMap.get('seats')
    const seats: Record<string, PermissionLevel> = {}
    if (seatsYMap instanceof Y.Map) {
      seatsYMap.forEach((val, key) => {
        seats[key] = val as PermissionLevel
      })
    }
    return {
      default: (permYMap.get('default') as PermissionLevel) ?? 'observer',
      seats,
    }
  }
  return { default: 'observer', seats: {} }
}

/** Read ruleData from a nested Y.Map back to a plain object (or null) */
function readRuleData(yMap: Y.Map<unknown>): unknown {
  const ruleYMap = yMap.get('ruleData')
  if (ruleYMap instanceof Y.Map) {
    if (ruleYMap.size === 0) return null
    const obj: Record<string, unknown> = {}
    ruleYMap.forEach((val, key) => {
      obj[key] = val
    })
    return obj
  }
  return null
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
    ruleData: readRuleData(yMap),
    permissions: readPermissions(yMap),
  }
}

/** Write permissions as a nested Y.Map structure */
function writePermissions(entityYMap: Y.Map<unknown>, permissions: EntityPermissions) {
  const permYMap = new Y.Map<unknown>()
  entityYMap.set('permissions', permYMap)
  permYMap.set('default', permissions.default)
  const seatsYMap = new Y.Map<unknown>()
  permYMap.set('seats', seatsYMap)
  for (const [seatId, level] of Object.entries(permissions.seats)) {
    seatsYMap.set(seatId, level)
  }
}

/** Write ruleData as a nested Y.Map structure */
function writeRuleData(entityYMap: Y.Map<unknown>, ruleData: unknown) {
  const ruleYMap = new Y.Map<unknown>()
  entityYMap.set('ruleData', ruleYMap)
  if (ruleData && typeof ruleData === 'object') {
    for (const [key, value] of Object.entries(ruleData as Record<string, unknown>)) {
      ruleYMap.set(key, value)
    }
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
  writeRuleData(yMap, entity.ruleData)
  writePermissions(yMap, entity.permissions)
}

/** Update permissions Y.Map in place (merge into existing nested structure) */
function updatePermissions(entityYMap: Y.Map<unknown>, permissions: EntityPermissions) {
  const permYMap = entityYMap.get('permissions')
  if (permYMap instanceof Y.Map) {
    permYMap.set('default', permissions.default)
    const seatsYMap = permYMap.get('seats')
    if (seatsYMap instanceof Y.Map) {
      // Clear existing seats and set new ones
      seatsYMap.forEach((_v, k) => seatsYMap.delete(k))
      for (const [seatId, level] of Object.entries(permissions.seats)) {
        seatsYMap.set(seatId, level)
      }
    }
  } else {
    // Fallback: create from scratch
    writePermissions(entityYMap, permissions)
  }
}

/** Update ruleData Y.Map in place (merge top-level keys) */
function updateRuleData(entityYMap: Y.Map<unknown>, ruleData: unknown) {
  const ruleYMap = entityYMap.get('ruleData')
  if (ruleYMap instanceof Y.Map) {
    if (ruleData && typeof ruleData === 'object') {
      for (const [key, value] of Object.entries(ruleData as Record<string, unknown>)) {
        ruleYMap.set(key, value)
      }
    }
  } else {
    // Fallback: create from scratch
    writeRuleData(entityYMap, ruleData)
  }
}

export function useEntities(world: WorldMaps, currentSceneId: string | null, yDoc: Y.Doc) {
  const [entities, setEntities] = useState<EntityWithSource[]>([])

  // Collect entities from all sources
  const rebuild = useCallback(() => {
    const result: EntityWithSource[] = []

    // Roster (cross-scene persistent characters) — nested Y.Maps
    world.roster.forEach((yMap) => {
      if (yMap instanceof Y.Map) {
        result.push({ ...readYMapEntity(yMap), _source: 'roster' })
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

    // Roster: observeDeep because values are nested Y.Maps
    world.roster.observeDeep(rebuild)

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
      world.roster.unobserveDeep(rebuild)
      if (sceneEntitiesMap instanceof Y.Map) {
        sceneEntitiesMap.unobserve(rebuild)
      }
    }
  }, [world, currentSceneId, rebuild])

  // --- CRUD ---

  /** Add entity to roster (nested Y.Map for field-level CRDT) */
  const addRosterEntity = useCallback(
    (entity: Entity) => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.roster.set(entity.id, yMap)
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

  /** Update entity (auto-detects source) */
  const updateEntity = useCallback(
    (id: string, updates: Partial<Entity>) => {
      // Check roster first (nested Y.Map)
      const rosterYMap = world.roster.get(id)
      if (rosterYMap instanceof Y.Map) {
        yDoc.transact(() => {
          for (const [key, value] of Object.entries(updates)) {
            if (key === 'permissions') {
              updatePermissions(rosterYMap, value as EntityPermissions)
            } else if (key === 'ruleData') {
              updateRuleData(rosterYMap, value)
            } else {
              rosterYMap.set(key, value)
            }
          }
        })
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
      if (world.roster.has(id)) {
        world.roster.delete(id)
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

  /** Promote entity from scene to roster (cross-scene persistent) */
  const promoteToRoster = useCallback(
    (id: string) => {
      if (!currentSceneId) return
      const sceneMap = world.scenes.get(currentSceneId)
      if (!(sceneMap instanceof Y.Map)) return
      const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
      if (!(sceneEntities instanceof Y.Map)) return
      const entity = sceneEntities.get(id)
      if (!entity) return
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.roster.set(id, yMap)
        setYMapFields(yMap, entity)
        sceneEntities.delete(id)
      })
    },
    [world, currentSceneId, yDoc],
  )

  return {
    entities: entities as Entity[],
    addRosterEntity,
    addSceneEntity,
    updateEntity,
    deleteEntity,
    getEntity,
    promoteToRoster,
  }
}
