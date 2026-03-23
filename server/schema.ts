// server/schema.ts — SQLite schema definitions
import type Database from 'better-sqlite3'

export function initGlobalSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT DEFAULT 'anonymous',
      created_at INTEGER NOT NULL,
      rule_system_id TEXT NOT NULL DEFAULT 'generic'
    )
  `)
}

export function initRoomSchema(db: Database.Database): void {
  db.exec(`
    -- Room-level state (singleton row)
    CREATE TABLE IF NOT EXISTS room_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_scene_id TEXT,
      plugin_config TEXT NOT NULL DEFAULT '{}'
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

    -- Blueprints (entity template factory)
    CREATE TABLE IF NOT EXISTS blueprints (
      id TEXT PRIMARY KEY,
      defaults TEXT DEFAULT '{"components":{}}',
      created_at INTEGER NOT NULL
    );

    -- Entities (slim: identity/appearance now live in entity_components)
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      permissions TEXT DEFAULT '{"default":"none","seats":{}}',
      lifecycle TEXT DEFAULT 'ephemeral' CHECK(lifecycle IN ('ephemeral','reusable','persistent')),
      blueprint_id TEXT REFERENCES blueprints(id) ON DELETE SET NULL
    );

    -- Entity components (ECS-style key/value store)
    CREATE TABLE IF NOT EXISTS entity_components (
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      component_key TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (entity_id, component_key)
    );

    -- Scene-Entity many-to-many
    CREATE TABLE IF NOT EXISTS scene_entities (
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      visible INTEGER DEFAULT 1,
      PRIMARY KEY (scene_id, entity_id)
    );

    -- Archives (replaces encounters)
    CREATE TABLE IF NOT EXISTS archives (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Archive',
      map_url TEXT,
      map_width INTEGER,
      map_height INTEGER,
      grid TEXT DEFAULT '{}',
      gm_only INTEGER DEFAULT 0,
      round_number INTEGER NOT NULL DEFAULT 0,
      current_turn_token_id TEXT
    );

    -- Archive tokens (normalized, replaces embedded JSON tokens in encounters)
    CREATE TABLE IF NOT EXISTS archive_tokens (
      id TEXT PRIMARY KEY,
      archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 1,
      height REAL NOT NULL DEFAULT 1,
      image_scale_x REAL NOT NULL DEFAULT 1,
      image_scale_y REAL NOT NULL DEFAULT 1,
      snapshot_lifecycle TEXT NOT NULL CHECK(snapshot_lifecycle IN ('ephemeral','reusable','persistent')),
      original_entity_id TEXT,
      snapshot_data TEXT
    );

    -- Tactical state (per-scene, replaces singleton combat_state)
    CREATE TABLE IF NOT EXISTS tactical_state (
      scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
      tactical_mode INTEGER NOT NULL DEFAULT 0,
      map_url TEXT,
      map_width INTEGER,
      map_height INTEGER,
      grid TEXT NOT NULL DEFAULT '{}',
      round_number INTEGER NOT NULL DEFAULT 0,
      current_turn_token_id TEXT
    );

    -- Tactical tokens (normalized, replaces embedded JSON tokens in combat_state)
    CREATE TABLE IF NOT EXISTS tactical_tokens (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES tactical_state(scene_id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 1,
      height REAL NOT NULL DEFAULT 1,
      image_scale_x REAL NOT NULL DEFAULT 1,
      image_scale_y REAL NOT NULL DEFAULT 1,
      initiative_position INTEGER,
      UNIQUE(scene_id, entity_id)
    );

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

    -- Assets (file management)
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      name TEXT DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'image',
      category TEXT NOT NULL DEFAULT 'map' CHECK(category IN ('map', 'token')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      extra TEXT DEFAULT '{}'
    );

    -- Tag definitions (room-level, first-class entities)
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Asset ↔ Tag junction
    CREATE TABLE IF NOT EXISTS asset_tags (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, tag_id)
    );

    -- Entity ↔ Tag junction
    CREATE TABLE IF NOT EXISTS entity_tags (
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entity_id, tag_id)
    );

    -- Blueprint ↔ Tag junction
    CREATE TABLE IF NOT EXISTS blueprint_tags (
      blueprint_id TEXT NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (blueprint_id, tag_id)
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
    CREATE INDEX IF NOT EXISTS idx_entities_lifecycle ON entities(lifecycle);
    CREATE INDEX IF NOT EXISTS idx_tactical_tokens_scene ON tactical_tokens(scene_id);
    CREATE INDEX IF NOT EXISTS idx_tactical_tokens_entity ON tactical_tokens(entity_id);
    CREATE INDEX IF NOT EXISTS idx_archive_tokens_archive ON archive_tokens(archive_id);
    CREATE INDEX IF NOT EXISTS idx_blueprints_created ON blueprints(created_at);
    CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_blueprint_tags_tag ON blueprint_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_entity_components_entity ON entity_components(entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id);
  `)
}
