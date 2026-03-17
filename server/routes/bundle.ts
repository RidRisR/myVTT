// server/routes/bundle.ts — Single-request room init bundle
import { Router } from 'express'
import type { TypedServer } from '../socketTypes'
import { withRoom } from '../middleware'
import { getGlobalDb, toCamel, toCamelAll, parseJsonFields, toBoolFields } from '../db'
import { getTacticalState } from './tactical'
import type Database from 'better-sqlite3'

function getBundle(dataDir: string, roomDb: Database.Database, roomId: string) {
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

    const entities = (
      roomDb.prepare('SELECT * FROM entities').all() as Record<string, unknown>[]
    ).map((r) => parseJsonFields(toCamel(r), 'ruleData', 'permissions'))

    const seRows = roomDb
      .prepare('SELECT scene_id, entity_id, visible FROM scene_entities')
      .all() as { scene_id: string; entity_id: string; visible: number }[]

    const seats = toCamelAll(
      roomDb.prepare('SELECT * FROM seats ORDER BY sort_order').all() as Record<string, unknown>[],
    )

    const assets = (
      roomDb.prepare('SELECT * FROM assets ORDER BY created_at DESC').all() as Record<
        string,
        unknown
      >[]
    ).map((r) => parseJsonFields(toCamel(r), 'extra', 'tags'))

    const chat = (
      roomDb
        .prepare('SELECT * FROM chat_messages ORDER BY timestamp ASC LIMIT 200')
        .all() as Record<string, unknown>[]
    ).map((r) => {
      const msg = parseJsonFields(toCamel(r), 'rollData')
      if (msg.rollData && typeof msg.rollData === 'object') {
        const { rollData, ...rest } = msg
        return { ...rest, ...(rollData as Record<string, unknown>) }
      }
      return msg
    })

    const teamTrackers = toCamelAll(
      roomDb.prepare('SELECT * FROM team_trackers ORDER BY sort_order').all() as Record<
        string,
        unknown
      >[],
    )

    const showcase = (
      roomDb.prepare('SELECT * FROM showcase_items ORDER BY sort_order').all() as Record<
        string,
        unknown
      >[]
    ).map((r) => toBoolFields(parseJsonFields(toCamel(r), 'data'), 'pinned'))

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

    return {
      state: stateRow,
      scenes,
      entities,
      sceneEntityMap,
      seats,
      assets,
      chat,
      teamTrackers,
      showcase,
      tactical,
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
    chat: data.chat,
    teamTrackers: data.teamTrackers,
    showcase: data.showcase,
    tactical: data.tactical,
  }
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
