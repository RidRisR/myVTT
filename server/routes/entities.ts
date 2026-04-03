// server/routes/entities.ts — Entity CRUD with ECS components
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { Entity } from '../../src/shared/entityTypes'
import type Database from 'better-sqlite3'
import { withRoom } from '../middleware'
import { syncTags, getTagNames } from '../tagHelpers'

/** Assemble a complete Entity object from DB rows */
export function assembleEntity(
  entityRow: Record<string, unknown>,
  componentRows: { component_key: string; data: string }[],
  tagNames: string[],
): Entity {
  const components: Record<string, unknown> = {}
  for (const row of componentRows) {
    components[row.component_key] = JSON.parse(row.data)
  }
  return {
    id: entityRow.id as string,
    blueprintId: (entityRow.blueprint_id as string) || undefined,
    permissions: JSON.parse(
      (entityRow.permissions as string) || '{"default":"none","seats":{}}',
    ) as Entity['permissions'],
    lifecycle: entityRow.lifecycle as Entity['lifecycle'],
    tags: tagNames,
    components,
  }
}

/** Load a complete Entity from DB by id */
export function loadEntity(db: Database.Database, id: string): Entity | undefined {
  const entityRow = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (!entityRow) return undefined
  const componentRows = db
    .prepare('SELECT component_key, data FROM entity_components WHERE entity_id = ?')
    .all(id) as { component_key: string; data: string }[]
  const tagNames = getTagNames(db, 'entity_tags', 'entity_id', id)
  return assembleEntity(entityRow, componentRows, tagNames)
}

export function degradeTokenReferences(_db: Database.Database, _entityId: string): void {
  // With the new normalized schema, tactical_tokens have FK CASCADE on entity_id.
  // When an entity is deleted, its tactical_tokens are automatically deleted by SQLite.
  // Archive tokens use snapshot_data and don't hold live entity references.
  // This function is kept for API compatibility but is now a no-op.
}

export function entityRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/entities', room, (req, res) => {
    const db = req.roomDb!
    const entityRows = db.prepare('SELECT * FROM entities').all() as Record<string, unknown>[]
    const entities = entityRows.map((row) => {
      const id = row.id as string
      const componentRows = db
        .prepare('SELECT component_key, data FROM entity_components WHERE entity_id = ?')
        .all(id) as { component_key: string; data: string }[]
      const tagNames = getTagNames(db, 'entity_tags', 'entity_id', id)
      return assembleEntity(row, componentRows, tagNames)
    })
    res.json(entities)
  })

  router.get('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const entity = loadEntity(req.roomDb!, req.params.id as string)
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }
    res.json(entity)
  })

  router.post('/api/rooms/:roomId/entities', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = (body.id as string | undefined) || 'e-' + crypto.randomUUID().slice(0, 8)
    const {
      components = {},
      permissions = { default: 'observer', seats: {} },
      lifecycle = 'persistent',
      blueprintId = null,
      tags = [],
    } = body

    const db = req.roomDb!
    const createEntity = db.transaction(() => {
      db.prepare(
        `INSERT INTO entities (id, permissions, lifecycle, blueprint_id)
         VALUES (?, ?, ?, ?)`,
      ).run(id, JSON.stringify(permissions), lifecycle, blueprintId)

      // Insert components
      const insertComp = db.prepare(
        'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
      )
      const comps = components as Record<string, unknown>
      for (const [key, data] of Object.entries(comps)) {
        insertComp.run(id, key, JSON.stringify(data))
      }

      // Sync tags
      const tagNames = Array.isArray(tags) ? (tags as string[]) : []
      if (tagNames.length > 0) {
        syncTags(db, 'entity_tags', 'entity_id', id, tagNames)
      }
    })
    createEntity()

    const entity = loadEntity(db, id)!
    io.to(req.roomId!).emit('entity:created', entity)
    res.status(201).json(entity)
  })

  router.patch('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const db = req.roomDb!
    const existing = db.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []

    // Simple entity-level fields
    if (body.permissions !== undefined) {
      sets.push('permissions = ?')
      values.push(JSON.stringify(body.permissions))
    }
    if (body.lifecycle !== undefined) {
      sets.push('lifecycle = ?')
      values.push(body.lifecycle)
    }

    if (sets.length > 0) {
      values.push(req.params.id)
      db.prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    // UPSERT components (only for keys provided)
    if (body.components !== undefined) {
      const comps = body.components as Record<string, unknown>
      const upsertComp = db.prepare(
        `INSERT INTO entity_components (entity_id, component_key, data)
         VALUES (?, ?, ?)
         ON CONFLICT(entity_id, component_key) DO UPDATE SET data = excluded.data`,
      )
      for (const [key, data] of Object.entries(comps)) {
        upsertComp.run(req.params.id, key, JSON.stringify(data))
      }
    }

    // Sync tags if provided
    if (body.tags !== undefined) {
      const tagNames = Array.isArray(body.tags) ? (body.tags as string[]) : []
      syncTags(db, 'entity_tags', 'entity_id', req.params.id as string, tagNames)
    }

    const updated = loadEntity(db, req.params.id as string)!
    io.to(req.roomId!).emit('entity:updated', updated)
    res.json(updated)
  })

  // PATCH single component by key
  router.patch('/api/rooms/:roomId/entities/:id/components/:key', room, (req, res) => {
    const db = req.roomDb!
    const entityExists = db.prepare('SELECT id FROM entities WHERE id = ?').get(req.params.id)
    if (!entityExists) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const componentData = req.body as unknown
    db.prepare(
      `INSERT INTO entity_components (entity_id, component_key, data)
       VALUES (?, ?, ?)
       ON CONFLICT(entity_id, component_key) DO UPDATE SET data = excluded.data`,
    ).run(req.params.id, req.params.key, JSON.stringify(componentData))

    const updated = loadEntity(db, req.params.id as string)!
    io.to(req.roomId!).emit('entity:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT id FROM entities WHERE id = ?').get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const deleteEntity = req.roomDb!.transaction(() => {
      degradeTokenReferences(req.roomDb!, req.params.id as string)
      // Clear dangling seats.active_character_id references
      req
        .roomDb!.prepare(
          'UPDATE seats SET active_character_id = NULL WHERE active_character_id = ?',
        )
        .run(req.params.id)
      // CASCADE handles entity_components and entity_tags
      req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.id)
    })
    deleteEntity()

    io.to(req.roomId!).emit('entity:deleted', { id: req.params.id as string })
    res.json({ ok: true })
  })

  return router
}
