// src/entities/useEntities.ts
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { Entity, EntityPermissions, PermissionLevel } from '../shared/entityTypes'
import type { WorldMaps } from '../yjs/useWorld'

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
    persistent: (yMap.get('persistent') as boolean) ?? false,
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
  yMap.set('persistent', entity.persistent)
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
      // Delete seats not in the new set, upsert seats that are
      const newSeatIds = new Set(Object.keys(permissions.seats))
      seatsYMap.forEach((_v, k) => {
        if (!newSeatIds.has(k)) seatsYMap.delete(k)
      })
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

export function useEntities(world: WorldMaps, yDoc: Y.Doc) {
  const [entities, setEntities] = useState<Entity[]>([])

  // Collect all entities from the single global source
  const rebuild = useCallback(() => {
    const result: Entity[] = []
    world.entities.forEach((yMap) => {
      if (yMap instanceof Y.Map) {
        result.push(readYMapEntity(yMap))
      }
    })
    setEntities(result)
  }, [world])

  // Observe the global entities map
  useEffect(() => {
    rebuild()
    world.entities.observeDeep(rebuild)
    return () => world.entities.unobserveDeep(rebuild)
  }, [world, rebuild])

  // --- CRUD ---

  /** Add entity to the global entities store (nested Y.Map for field-level CRDT) */
  const addEntity = useCallback(
    (entity: Entity) => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.entities.set(entity.id, yMap)
        setYMapFields(yMap, entity)
      })
    },
    [world, yDoc],
  )

  /** Update entity fields */
  const updateEntity = useCallback(
    (id: string, updates: Partial<Entity>) => {
      const entityYMap = world.entities.get(id)
      if (!(entityYMap instanceof Y.Map)) return
      yDoc.transact(() => {
        for (const [key, value] of Object.entries(updates)) {
          if (key === 'permissions') {
            updatePermissions(entityYMap, value as EntityPermissions)
          } else if (key === 'ruleData') {
            updateRuleData(entityYMap, value)
          } else {
            entityYMap.set(key, value)
          }
        }
      })
    },
    [world, yDoc],
  )

  /** Delete entity from the global store */
  const deleteEntity = useCallback(
    (id: string) => {
      world.entities.delete(id)
    },
    [world],
  )

  /** Get entity by ID */
  const getEntity = useCallback(
    (id: string | null): Entity | null => {
      if (!id) return null
      return entities.find((e) => e.id === id) ?? null
    },
    [entities],
  )

  return {
    entities,
    addEntity,
    updateEntity,
    deleteEntity,
    getEntity,
  }
}
