// server/routes/bundle.ts — Single-request room init bundle
import { Router } from 'express'
import type { TypedServer } from '../socketTypes'
import { withRoom } from '../middleware'
import { getGlobalDb, toCamel, toCamelAll, parseJsonFields, toBoolFields } from '../db'
import { getTacticalState } from './tactical'
import { assembleEntity } from './entities'
import type Database from 'better-sqlite3'
import type { BundleResponse } from '../../src/shared/bundleTypes'
import type { GameLogEntry } from '../../src/shared/logTypes'
import { getTagNames, getAllTags } from '../tagHelpers'
import { rowToEntry } from '../logUtils'

function getBundle(dataDir: string, roomDb: Database.Database, roomId: string): BundleResponse {
  const globalDb = getGlobalDb(dataDir)
  const roomRow = toCamel(
    globalDb.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Record<string, unknown>,
  )

  const data = roomDb.transaction(() => {
    const stateRow = toCamel(
      roomDb.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<string, unknown>,
    )

    const scenes = (
      roomDb.prepare('SELECT * FROM scenes ORDER BY sort_order').all() as Record<string, unknown>[]
    ).map((r) => toBoolFields(parseJsonFields(toCamel(r), 'atmosphere'), 'gmOnly'))

    const entityRows = roomDb.prepare('SELECT * FROM entities').all() as Record<string, unknown>[]
    const entities = entityRows.map((row) => {
      const id = row.id as string
      const componentRows = roomDb
        .prepare('SELECT component_key, data FROM entity_components WHERE entity_id = ?')
        .all(id) as { component_key: string; data: string }[]
      const tagNames = getTagNames(roomDb, 'entity_tags', 'entity_id', id)
      return assembleEntity(row, componentRows, tagNames)
    })

    const seRows = roomDb
      .prepare('SELECT scene_id, entity_id, visible FROM scene_entities')
      .all() as { scene_id: string; entity_id: string; visible: number }[]

    const seats = toCamelAll(
      roomDb.prepare('SELECT * FROM seats ORDER BY sort_order').all() as Record<string, unknown>[],
    )

    const assets = (
      roomDb
        .prepare('SELECT * FROM assets ORDER BY sort_order ASC, created_at DESC')
        .all() as Record<string, unknown>[]
    ).map((r) => {
      const base = parseJsonFields(toCamel(r), 'extra')
      base.tags = getTagNames(roomDb, 'asset_tags', 'asset_id', r.id as string)
      return base
    })

    const showcase = (
      roomDb.prepare('SELECT * FROM showcase_items ORDER BY sort_order').all() as Record<
        string,
        unknown
      >[]
    ).map((r) => toBoolFields(parseJsonFields(toCamel(r), 'data'), 'pinned'))

    const blueprints = (
      roomDb.prepare('SELECT * FROM blueprints ORDER BY created_at DESC').all() as Record<
        string,
        unknown
      >[]
    ).map((r) => {
      const base = parseJsonFields(toCamel(r), 'defaults')
      base.tags = getTagNames(roomDb, 'blueprint_tags', 'blueprint_id', r.id as string)
      return base
    })

    const allTags = getAllTags(roomDb)

    // NOTE: Bundle returns all log entries unfiltered by visibility.
    // REST endpoint has no seat/role context. Client-side rendering should
    // filter based on local seat. This is a known v1 limitation.
    const logRows = roomDb
      .prepare('SELECT * FROM game_log ORDER BY seq DESC LIMIT 200')
      .all() as Record<string, unknown>[]
    const logEntries = logRows.reverse().map(rowToEntry)
    const lastEntry = logEntries[logEntries.length - 1] as GameLogEntry | undefined
    const logWatermark = lastEntry?.seq ?? 0

    // Build sceneEntityMap: Record<sceneId, { entityId, visible }[]>
    const sceneEntityMap: Record<string, { entityId: string; visible: boolean }[]> = {}
    for (const row of seRows) {
      const sid = row.scene_id
      if (!sceneEntityMap[sid]) sceneEntityMap[sid] = []
      sceneEntityMap[sid].push({ entityId: row.entity_id, visible: row.visible === 1 })
    }

    // Tactical state — null when no active scene
    const tactical = stateRow.activeSceneId
      ? getTacticalState(roomDb, stateRow.activeSceneId as string)
      : null

    const layoutRow = roomDb.prepare('SELECT config FROM layout WHERE id = 1').get() as
      | { config: string }
      | undefined
    const layout = layoutRow
      ? (JSON.parse(layoutRow.config) as {
          narrative: Record<string, unknown>
          tactical: Record<string, unknown>
        })
      : { narrative: {}, tactical: {} }

    return {
      state: stateRow,
      scenes,
      entities,
      sceneEntityMap,
      seats,
      assets,
      blueprints,
      showcase,
      tactical,
      tags: allTags,
      logEntries,
      logWatermark,
      layout,
    }
  })()

  return {
    room: {
      id: roomRow.id,
      name: roomRow.name,
      ruleSystemId: roomRow.ruleSystemId,
      activeSceneId: data.state.activeSceneId,
    },
    scenes: data.scenes,
    entities: data.entities,
    sceneEntityMap: data.sceneEntityMap,
    seats: data.seats,
    assets: data.assets,
    blueprints: data.blueprints,
    showcase: data.showcase,
    tactical: data.tactical,
    tags: data.tags,
    logEntries: data.logEntries,
    logWatermark: data.logWatermark,
    layout: data.layout,
  } as unknown as BundleResponse
}

export function bundleRoutes(dataDir: string, _io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/bundle', room, (req, res) => {
    const bundle = getBundle(dataDir, req.roomDb!, req.roomId!)
    res.json(bundle)
  })

  return router
}
