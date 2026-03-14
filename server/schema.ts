// server/schema.ts — SQLite schema definitions
import type Database from 'better-sqlite3'

export function initGlobalSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT DEFAULT 'anonymous',
      created_at INTEGER NOT NULL
    )
  `)
}

export function initRoomSchema(db: Database.Database): void {
  db.exec(`
    -- Room-level state (singleton row)
    CREATE TABLE IF NOT EXISTS room_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_scene_id TEXT,
      active_encounter_id TEXT
    );
    INSERT OR IGNORE INTO room_state (id) VALUES (1);

    -- Seats
    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      role TEXT NOT NULL DEFAULT 'PL' CHECK (role IN ('GM', 'PL')),
      user_id TEXT,
      portrait_url TEXT,
      active_character_id TEXT,
      sort_order INTEGER DEFAULT 0
    );

    -- Scenes
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      gm_only INTEGER DEFAULT 0,
      atmosphere TEXT DEFAULT '{}'
    );

    -- Entities
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      color TEXT DEFAULT '#888888',
      size REAL DEFAULT 1,
      notes TEXT DEFAULT '',
      rule_data TEXT DEFAULT '{}',
      permissions TEXT DEFAULT '{"default":"none","seats":{}}',
      persistent INTEGER DEFAULT 0,
      blueprint_id TEXT
    );

    -- Scene-Entity many-to-many
    CREATE TABLE IF NOT EXISTS scene_entities (
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (scene_id, entity_id)
    );

    -- Encounters (combat presets)
    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Encounter',
      map_url TEXT,
      map_width INTEGER,
      map_height INTEGER,
      grid TEXT DEFAULT '{}',
      tokens TEXT DEFAULT '{}',
      gm_only INTEGER DEFAULT 0
    );

    -- Combat state (singleton row, active encounter runtime)
    CREATE TABLE IF NOT EXISTS combat_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      map_url TEXT,
      map_width INTEGER,
      map_height INTEGER,
      grid TEXT DEFAULT '{}',
      tokens TEXT DEFAULT '{}',
      initiative_order TEXT DEFAULT '[]',
      initiative_index INTEGER DEFAULT 0
    );
    INSERT OR IGNORE INTO combat_state (id) VALUES (1);

    -- Chat messages
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'text',
      sender_id TEXT,
      sender_name TEXT,
      sender_color TEXT,
      portrait_url TEXT,
      content TEXT,
      roll_data TEXT,
      timestamp INTEGER NOT NULL
    );

    -- Assets (unified: maps, tokens, handouts, blueprints)
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      name TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'image',
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      extra TEXT DEFAULT '{}'
    );

    -- Team trackers
    CREATE TABLE IF NOT EXISTS team_trackers (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      current INTEGER DEFAULT 0,
      max INTEGER DEFAULT 0,
      color TEXT DEFAULT '#3b82f6',
      sort_order INTEGER DEFAULT 0
    );

    -- Showcase items
    CREATE TABLE IF NOT EXISTS showcase_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'image',
      data TEXT DEFAULT '{}',
      pinned INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_scene_entities_scene ON scene_entities(scene_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_ts ON chat_messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_entities_persistent ON entities(persistent);
  `)
}
