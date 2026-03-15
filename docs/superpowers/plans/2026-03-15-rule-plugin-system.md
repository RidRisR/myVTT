# Rule Plugin System — Phase 1: Foundation & Wiring

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the rule plugin infrastructure — replace `RuleSystem` with `RulePlugin`, create SDK boundary + registry + hook, add `ruleSystemId` to DB/store/API, implement the `generic` fallback plugin, and wire the entity card slot in `PortraitBar`.

**Architecture:** Four sequential chunks. Each chunk produces passing TypeScript checks and passes existing tests. The `generic` plugin wraps the existing `CharacterEditPanel`, so the UI is unchanged until DaggerHeart is implemented in a later PR. KonvaToken adapter wiring is explicitly deferred until PR C (tactical-ui-refactor) merges.

**Tech Stack:** TypeScript 5.9 strict, React 19.2, zustand v5, Vite 7.3 (path alias), better-sqlite3, Express 5.2

**Spec:** `docs/design/11-规则插件系统架构设计.md`

---

## File Map

### Created
- `src/rules/sdk.ts` — re-exports from `types.ts` + utility hook re-exports; the only legal import path for plugins
- `src/rules/registry.ts` — `getRulePlugin(id)` + plugin registration; only base file that knows about `plugins/`
- `src/rules/useRulePlugin.ts` — React hook returning the active `RulePlugin` for the current room
- `src/rules/__tests__/registry.test.ts` — unit tests for registry + generic plugin adapters
- `plugins/generic/GenericEntityCard.tsx` — wraps `CharacterEditPanel`; special exception: may import from `src/`
- `plugins/generic/index.ts` — `genericPlugin: RulePlugin` (full interface, adapters delegate to `entityAdapters`)
- `docs/superpowers/plans/2026-03-15-rule-plugin-system.md` — this file

### Modified
- `src/rules/types.ts` — full replacement: `RuleSystem` → `RulePlugin` + new supporting types
- `src/shared/entityAdapters.ts` — import `ResourceView`/`StatusView` from `src/rules/types.ts`
- `src/layout/CharacterEditPanel.tsx` — make `onClose` optional (hide X when undefined)
- `src/layout/PortraitBar.tsx` — replace direct `CharacterEditPanel` usage with `plugin.characterUI.EntityCard`
- `server/schema.ts` — add `rule_system_id TEXT NOT NULL DEFAULT 'generic'` to `room_state`
- `server/routes/state.ts` — add `ruleSystemId` to `fieldMap`
- `src/stores/worldStore.ts` — add `ruleSystemId: string` to `RoomState`; initial value from REST
- `tsconfig.app.json` — add `"plugins"` to include; add `paths` alias for `@myvtt/sdk`
- `vite.config.ts` — add `resolve.alias` for `@myvtt/sdk`

### NOT touched in this PR
- `src/combat/KonvaToken.tsx` — defer to after `feat/tactical-ui-refactor` merges
- `src/combat/KonvaMap.tsx` — same reason
- Any DaggerHeart plugin files — separate future PR

---

## Chunk 1: Foundation — Types, SDK, Registry, Hook, Build Config

### Task 1: Replace `src/rules/types.ts`

**Files:** Modify `src/rules/types.ts` (worktree path: `.worktrees/feat/rule-plugin-system/src/rules/types.ts`)

- [ ] **Step 1: Write the new types file**

Replace the entire file with:

```typescript
import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { DiceTermResult } from '../shared/diceUtils'
import type { TeamTracker } from '../stores/worldStore'

// ── Adapter view types (shared with entityAdapters.ts) ─────────────────────

export interface ResourceView {
  label: string
  current: number
  max: number
  color: string
}

export interface StatusView {
  label: string
}

// ── Dice types (unchanged from RuleSystem) ─────────────────────────────────

export interface RollAction {
  id: string
  name: string        // "Agility Check"
  formula: string     // "2d12+@Agility"
  category?: string
  targetAttributeKey?: string
}

export interface ModifierOption {
  id: string
  label: string
  type: 'toggle'
  mutuallyExclusiveWith?: string
}

export type DaggerheartOutcome =
  | 'critical_success'
  | 'success_hope'
  | 'success_fear'
  | 'failure_hope'
  | 'failure_fear'

export type JudgmentResult =
  | { type: 'daggerheart'; hopeDie: number; fearDie: number; outcome: DaggerheartOutcome }
  | { type: 'coc'; roll: number; targetValue: number; successLevel: string }
  | { type: 'target_check'; total: number; dc: number; success: boolean; margin: number }

export interface JudgmentDisplay {
  text: string
  color: string
  severity: 'critical' | 'success' | 'partial' | 'failure' | 'fumble'
}

export interface DieStyle {
  termIndex: number
  dieIndex: number
  label?: string
  color?: string
}

export interface RollContext {
  dc?: number
  targetValue?: number
  activeModifierIds: string[]
  tempModifier: number
}

// ── UI prop types ───────────────────────────────────────────────────────────

/** Props the base provides to the plugin's entity card */
export interface EntityCardProps {
  entity: Entity
  onUpdate: (patch: Partial<Entity>) => void
  readonly?: boolean
}

export interface PluginPanelDef {
  id: string
  component: React.ComponentType<PluginPanelProps>
  defaultSize?: { width: number; height: number }
  placement: 'floating' | 'fullscreen-overlay'
}

export interface PluginPanelProps {
  entity?: Entity
  onClose: () => void
  onUpdateEntity: (id: string, patch: Partial<Entity>) => void
  onCreateEntity: (data: Partial<Entity>) => void
}

export interface TeamPanelProps {
  trackers: TeamTracker[]
  onUpdate: (id: string, patch: Partial<TeamTracker>) => void
  onCreate: (data: Partial<TeamTracker>) => void
  onDelete: (id: string) => void
}

/** Preset content bundled with the plugin (not stored in DB until GM imports it) */
export interface PresetTemplate {
  id: string            // namespace ID e.g. 'dh:corrupt-elf-archer'
  name: string
  category: string      // 'adversary' | 'pc-archetype' | ...
  data: Partial<Entity>
}

export interface DockTabDef {
  id: string
  label: string
  component: React.ComponentType
}

export interface GMTabDef {
  id: string
  label: string
  component: React.ComponentType
}

export type HideableElement =
  | 'dock'
  | 'portrait-bar'
  | 'chat-panel'
  | 'gm-panel'
  | 'scene-controls'

// ── RulePlugin — the main interface ────────────────────────────────────────

export interface RulePlugin {
  id: string
  name: string
  sdkVersion: '1'

  // Layer 1: Adapters — read entity data for generic base UI
  adapters: {
    getMainResource(entity: Entity): ResourceView | null
    getPortraitResources(entity: Entity): ResourceView[]
    getStatuses(entity: Entity): StatusView[]
    getFormulaTokens(entity: Entity): Record<string, number>
  }

  // Layer 2: Character card UI slot
  characterUI: {
    EntityCard: React.ComponentType<EntityCardProps>
  }

  // Layer 3: Dice system (optional)
  diceSystem?: {
    getRollActions(entity: Entity): RollAction[]
    evaluateRoll(
      terms: DiceTermResult[],
      total: number,
      ctx: RollContext,
    ): JudgmentResult | null
    getDieStyles(terms: DiceTermResult[]): DieStyle[]
    getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
    getModifierOptions(): ModifierOption[]
  }

  // Layer 4: Data templates (optional)
  dataTemplates?: {
    createDefaultEntityData(): unknown
    getPresetTemplates?(): PresetTemplate[]
  }

  // Layer 5: UI surfaces (optional)
  surfaces?: {
    panels?: PluginPanelDef[]
    dockTabs?: DockTabDef[]
    gmTabs?: GMTabDef[]
    teamPanel?: React.ComponentType<TeamPanelProps>
  }

  // Layer 6: Declarative element hiding (optional)
  hideElements?: HideableElement[]

  // Layer 7: Rule resolution — reserved, not implemented
  // ruleResolution?: RuleResolutionModule
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd .worktrees/feat/rule-plugin-system
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors from this file. `DiceTermResult` is already in `src/shared/diceUtils.ts`. If `TeamTracker` is not exported from `worldStore.ts`, check in Step 3 and add the export if missing.

- [ ] **Step 3: Fix any import errors in the new types.ts**

If `TeamTracker` is not exported from `worldStore.ts`, extract it to a shared location or use `import type` with correct path. Check:
```bash
grep -n "export.*TeamTracker" src/stores/worldStore.ts
```

- [ ] **Step 4: Commit**
```bash
git add src/rules/types.ts
git commit -m "refactor: replace RuleSystem with RulePlugin interface"
```

---

### Task 2: Create `src/rules/sdk.ts`

**Files:** Create `src/rules/sdk.ts`

- [ ] **Step 1: Write the SDK boundary file**

```typescript
// src/rules/sdk.ts
// The ONLY legal import path for plugins. Plugins may NOT import from src/ directly.

// ── Type exports ────────────────────────────────────────────────────────────
export type { Entity } from '../shared/entityTypes'
export type {
  RulePlugin,
  ResourceView,
  StatusView,
  EntityCardProps,
  PluginPanelDef,
  PluginPanelProps,
  TeamPanelProps,
  PresetTemplate,
  DockTabDef,
  GMTabDef,
  HideableElement,
  RollAction,
  ModifierOption,
  JudgmentResult,
  JudgmentDisplay,
  DieStyle,
  RollContext,
  DaggerheartOutcome,
} from './types'
export type { DiceTermResult } from '../shared/diceUtils'

// ── Utility hook exports ─────────────────────────────────────────────────────
export { useHoldRepeat } from '../shared/useHoldRepeat'
export { useAwarenessResource } from '../shared/hooks/useAwarenessResource'
// usePluginPanels will be added when surfaces/panels system is implemented
```

- [ ] **Step 2: Verify no TypeScript errors**
```bash
npx tsc --noEmit 2>&1 | grep "sdk.ts" | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
git add src/rules/sdk.ts
git commit -m "feat: add SDK boundary file for plugin imports"
```

---

### Task 3: Create `src/rules/registry.ts`

**Files:** Create `src/rules/registry.ts`

- [ ] **Step 1: Write the registry**

```typescript
// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import type { RulePlugin } from './types'
import { genericPlugin } from '../../plugins/generic/index'

const registry = new Map<string, RulePlugin>([['generic', genericPlugin]])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? registry.get('generic')!
}
```

Note: `genericPlugin` import will fail until Task 9 creates the file. Use a temporary placeholder that throws a clear error instead of silently returning `undefined` (which would produce a confusing runtime crash):

```typescript
// Temporary until plugins/generic/index.ts is created (Task 9).
// DO NOT call getRulePlugin() in this state — will throw.
// import { genericPlugin } from '../../plugins/generic/index'
const registry = new Map<string, RulePlugin>()

export function getRulePlugin(_id: string): RulePlugin {
  throw new Error('Plugin registry not yet wired — complete Task 9 first')
}
```

- [ ] **Step 2: Commit (placeholder)**
```bash
git add src/rules/registry.ts
git commit -m "feat: add plugin registry (placeholder, wired in Task 9)"
```

---

### Task 4: Create `src/rules/useRulePlugin.ts`

**Files:** Create `src/rules/useRulePlugin.ts`

- [ ] **Step 1: Check how `ruleSystemId` will live in the store**

The plan adds `ruleSystemId` to `RoomState` in Task 8. Until then, use a temporary unsafe cast. Note: the spec design doc shows a flat `s.ruleSystemId` selector as a simplified example — **in this codebase, room state is always nested under `s.room`** (consistent with `activeSceneId`, `tacticalMode`, etc.), so the real selector is `s.room.ruleSystemId`.

```typescript
// src/rules/useRulePlugin.ts
import { useWorldStore } from '../stores/worldStore'
import { getRulePlugin } from './registry'
import type { RulePlugin } from './types'

export function useRulePlugin(): RulePlugin {
  // ruleSystemId will be added to RoomState in Task 8.
  // Room state is nested under s.room — see worldStore RoomState type.
  // Fall back to 'generic' until the store field exists.
  const ruleSystemId = useWorldStore((s) => (s.room as Record<string, unknown>).ruleSystemId as string | undefined) ?? 'generic'
  return getRulePlugin(ruleSystemId)
}
```

After Task 6 adds `ruleSystemId` to `RoomState`, simplify to:
```typescript
const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
```

- [ ] **Step 2: Commit**
```bash
git add src/rules/useRulePlugin.ts
git commit -m "feat: add useRulePlugin hook"
```

---

### Task 5: Add `@myvtt/sdk` path alias and `plugins/` include

**Files:** `tsconfig.app.json`, `vite.config.ts`

- [ ] **Step 1: Update `tsconfig.app.json`**

Add `"plugins"` to the include array and add a `paths` alias:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@myvtt/sdk": ["./src/rules/sdk.ts"]
    },
    ... (existing options unchanged)
  },
  "include": ["src", "plugins"],
  "exclude": ["src/**/__tests__", "src/**/__test-utils__"]
}
```

- [ ] **Step 2: Update `vite.config.ts`**

Add `resolve.alias` and import `path`:

```typescript
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'   // ADD THIS

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), tailwindcss()],
    resolve: {                              // ADD THIS BLOCK
      alias: {
        '@myvtt/sdk': resolve(__dirname, 'src/rules/sdk.ts'),
      },
    },
    server: { ... },   // unchanged
    test: {
      ...
      include: ['src/**/*.test.ts', 'server/**/*.test.{ts,mjs}', 'plugins/**/*.test.ts'],  // ADD plugins
      ...
    },
  }
})
```

- [ ] **Step 3: Verify TypeScript sees the alias**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors from the alias config

- [ ] **Step 4: Commit**
```bash
git add tsconfig.app.json vite.config.ts
git commit -m "chore: add @myvtt/sdk path alias and plugins/ include"
```

---

## Chunk 2: DB + Server + Store — ruleSystemId

### Task 6: Add `rule_system_id` to DB schema

**Files:** `server/schema.ts`

- [ ] **Step 1: Read current `room_state` definition**
```bash
grep -A 6 "CREATE TABLE IF NOT EXISTS room_state" server/schema.ts
```

- [ ] **Step 2: Add the column**

In `server/schema.ts`, update the `room_state` table definition to add two new columns:

```sql
CREATE TABLE IF NOT EXISTS room_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_scene_id TEXT,
  active_archive_id TEXT,
  tactical_mode INTEGER NOT NULL DEFAULT 0,
  rule_system_id TEXT NOT NULL DEFAULT 'generic',  -- ADD
  plugin_config TEXT NOT NULL DEFAULT '{}'         -- ADD (JSON, for room-level plugin settings)
);
```

Also add `ALTER TABLE` migration statements at the bottom of `initRoomSchema` (after the main CREATE statements) to handle existing DBs.

Note: SQLite doesn't support `IF NOT EXISTS` in `ALTER TABLE ADD COLUMN`. Wrap in try/catch — this is the only correct pattern:

```typescript
try {
  db.exec(`ALTER TABLE room_state ADD COLUMN rule_system_id TEXT NOT NULL DEFAULT 'generic'`)
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE room_state ADD COLUMN plugin_config TEXT NOT NULL DEFAULT '{}'`)
} catch { /* column already exists */ }
```

- [ ] **Step 3: Run server tests to verify schema still works**
```bash
npm test -- server/__tests__/routes.test.ts --reporter=verbose 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 4: Commit**
```bash
git add server/schema.ts
git commit -m "feat: add rule_system_id and plugin_config to room_state schema"
```

---

### Task 7: Update state route to expose `ruleSystemId`

**Files:** `server/routes/state.ts`

- [ ] **Step 1: Read current `fieldMap`**
```bash
cat server/routes/state.ts
```

- [ ] **Step 2: Add the new fields to `fieldMap`**

```typescript
const fieldMap: Record<string, string> = {
  activeSceneId: 'active_scene_id',
  activeArchiveId: 'active_archive_id',
  tacticalMode: 'tactical_mode',
  ruleSystemId: 'rule_system_id',   // ADD
  // pluginConfig intentionally NOT added here — it's stored in DB but not yet
  // consumed by the store (no RoomState.pluginConfig field). Add when needed.
}
```

- [ ] **Step 3: Verify the GET response now includes the fields**

Start the dev server briefly or just check that the `toCamel` function will map snake_case to camelCase properly (it already does this generically).

- [ ] **Step 4: Run state-related server tests**
```bash
npm test -- server/__tests__/routes.test.ts --reporter=verbose 2>&1 | grep -E "state|PASS|FAIL"
```
Expected: all pass

- [ ] **Step 5: Commit**
```bash
git add server/routes/state.ts
git commit -m "feat: expose ruleSystemId in state route"
```

---

### Task 8: Add `ruleSystemId` to `worldStore` / `RoomState`

**Files:** `src/stores/worldStore.ts`

- [ ] **Step 1: Add `ruleSystemId` to `RoomState`**

Find the `RoomState` interface (near top of file) and add the field:

Read the current `RoomState` definition first (`grep -n "RoomState" src/stores/worldStore.ts`) to get the exact field names, then add `ruleSystemId`. After PR B (feat/tactical-ui-refactor), `RoomState` uses `activeArchiveId` and `tacticalMode`:

```typescript
export interface RoomState {
  activeSceneId: string | null
  activeArchiveId: string | null   // renamed from activeEncounterId in PR B
  tacticalMode: number             // added in PR B — SQLite INTEGER (0/1), NOT boolean
  ruleSystemId: string             // ADD — defaults to 'generic'
}
```

Do NOT copy this snippet verbatim without first checking the real current fields — if PR B has not yet merged the field names may differ. Always verify with `grep -n "RoomState" src/stores/worldStore.ts` first.

- [ ] **Step 2: Update the initial state**

Find the `room` initial value in the store creation and add only the new field:

```typescript
room: { ...existingFields, ruleSystemId: 'generic' },
```

Concretely (after PR B): `room: { activeSceneId: null, activeArchiveId: null, tacticalMode: 0, ruleSystemId: 'generic' }`

The `room:state:updated` socket event already spreads the server payload into `s.room`, so `ruleSystemId` changes will sync automatically once the server sends it. No additional handler needed.

The `loadAll` function already fetches `/api/rooms/:roomId/state` and sets `room: state`, so `ruleSystemId` will be populated on init.

- [ ] **Step 3: Update `useRulePlugin.ts` to use proper typing**

Now that `RoomState.ruleSystemId` exists, simplify `useRulePlugin.ts`:

```typescript
// src/rules/useRulePlugin.ts
import { useWorldStore } from '../stores/worldStore'
import { getRulePlugin } from './registry'
import type { RulePlugin } from './types'

export function useRulePlugin(): RulePlugin {
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  return getRulePlugin(ruleSystemId)
}
```

- [ ] **Step 4: Run TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors

- [ ] **Step 5: Run store tests**
```bash
npm test -- src/stores/__tests__/ --reporter=verbose 2>&1 | tail -20
```
Expected: all pass (existing tests don't test ruleSystemId)

- [ ] **Step 6: Commit**
```bash
git add src/stores/worldStore.ts src/rules/useRulePlugin.ts
git commit -m "feat: add ruleSystemId to RoomState and worldStore"
```

---

## Chunk 3: Generic Plugin + Entity Card Slot

### Task 9: Create `plugins/generic/GenericEntityCard.tsx`

**Files:** Create `plugins/generic/GenericEntityCard.tsx`

This component is a special case: it wraps `CharacterEditPanel` from `src/`, so it imports from `src/` directly. This is documented as the only exception to the "plugins only import from @myvtt/sdk" rule — the generic plugin exists specifically to bridge the old and new systems.

**Prerequisite:** Make `CharacterEditPanel.onClose` optional first.

- [ ] **Step 1: Make `onClose` optional in `CharacterEditPanel.tsx`**

In `src/layout/CharacterEditPanel.tsx`, update the props interface:

```typescript
interface CharacterEditPanelProps {
  character: Entity
  onUpdateCharacter: (id: string, updates: Partial<Entity>) => void
  onClose?: () => void   // CHANGED: was required, now optional
}
```

And update the close button (line ~601) to only render when `onClose` is defined:

```tsx
{onClose && (
  <button
    onClick={onClose}
    className="bg-transparent border-none cursor-pointer text-text-muted/30 p-0.5 leading-none transition-colors duration-fast hover:text-text-muted/70"
  >
    <X size={16} strokeWidth={1.5} />
  </button>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
npx tsc --noEmit 2>&1 | grep "CharacterEditPanel" | head -10
```
Expected: no errors (callers that pass `onClose` still work; callers that don't pass it now work too)

- [ ] **Step 3: Create `plugins/generic/GenericEntityCard.tsx`**

```typescript
// plugins/generic/GenericEntityCard.tsx
// Special exception: imports CharacterEditPanel directly from src/.
// This is the only plugin allowed to do this — it's the legacy bridge.
import type { EntityCardProps } from '@myvtt/sdk'
import { CharacterEditPanel } from '../../src/layout/CharacterEditPanel'

export function GenericEntityCard({ entity, onUpdate, readonly }: EntityCardProps) {
  if (readonly) {
    // For read-only mode, CharacterEditPanel isn't great but works for Phase 1.
    // Replace with CharacterDetailPanel in a future iteration.
    return (
      <CharacterEditPanel
        character={entity}
        onUpdateCharacter={() => {}}
      />
    )
  }
  return (
    <CharacterEditPanel
      character={entity}
      onUpdateCharacter={(_id, patch) => onUpdate(patch)}
    />
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**
```bash
npx tsc --noEmit 2>&1 | grep -i "generic" | head -10
```
Expected: no errors

- [ ] **Step 5: Commit**
```bash
git add src/layout/CharacterEditPanel.tsx plugins/generic/GenericEntityCard.tsx
git commit -m "feat: make CharacterEditPanel.onClose optional; create GenericEntityCard"
```

---

### Task 10: Create `plugins/generic/index.ts`

**Files:** Create `plugins/generic/index.ts`

- [ ] **Step 1: Check current `entityAdapters.ts` to understand the adapter functions**
```bash
cat src/shared/entityAdapters.ts
```

- [ ] **Step 2: Write the generic plugin**

```typescript
// plugins/generic/index.ts
import type { RulePlugin, ResourceView, StatusView } from '@myvtt/sdk'
import type { Entity } from '@myvtt/sdk'
import { GenericEntityCard } from './GenericEntityCard'
import { getEntityResources, getEntityStatuses } from '../../src/shared/entityAdapters'

// Generic plugin: delegates adapters to entityAdapters.ts.
// This is the legacy fallback for rooms without a specific rule system.
export const genericPlugin: RulePlugin = {
  id: 'generic',
  name: 'Generic',
  sdkVersion: '1',

  adapters: {
    getMainResource(entity: Entity): ResourceView | null {
      // entityAdapters.getEntityResources returns ResourceView[] with { key, current, max, color }
      // Map to our { label, current, max, color }
      const resources = getEntityResources(entity)
      if (resources.length === 0) return null
      const r = resources[0]
      return { label: r.key, current: r.current, max: r.max, color: r.color }
    },

    getPortraitResources(entity: Entity): ResourceView[] {
      return getEntityResources(entity).map((r) => ({
        label: r.key,
        current: r.current,
        max: r.max,
        color: r.color,
      }))
    },

    getStatuses(entity: Entity): StatusView[] {
      return getEntityStatuses(entity)
    },

    getFormulaTokens(_entity: Entity): Record<string, number> {
      return {}
    },
  },

  characterUI: {
    EntityCard: GenericEntityCard,
  },
}
```

- [ ] **Step 3: Verify TypeScript compiles**
```bash
npx tsc --noEmit 2>&1 | grep -i "plugin" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**
```bash
git add plugins/generic/index.ts
git commit -m "feat: implement generic plugin (fallback rule system)"
```

---

### Task 11: Wire plugin into registry

**Files:** `src/rules/registry.ts`

- [ ] **Step 1: Update registry to import and register `genericPlugin`**

Replace the placeholder with the real import:

```typescript
// src/rules/registry.ts
import type { RulePlugin } from './types'
import { genericPlugin } from '../../plugins/generic/index'

const registry = new Map<string, RulePlugin>([['generic', genericPlugin]])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin
}
```

- [ ] **Step 2: Run TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 3: Write unit tests for the registry**

Create `src/rules/__tests__/registry.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { getRulePlugin, registerPlugin } from '../registry'
import { makeEntity } from '../../__test-utils__/fixtures'

describe('getRulePlugin', () => {
  it('returns generic plugin for "generic" id', () => {
    const plugin = getRulePlugin('generic')
    expect(plugin.id).toBe('generic')
    expect(plugin.sdkVersion).toBe('1')
  })

  it('falls back to generic for unknown id', () => {
    const plugin = getRulePlugin('unknown-system')
    expect(plugin.id).toBe('generic')
  })

  it('returns registered plugin after registerPlugin()', () => {
    const fakePlugin = {
      id: 'test-system',
      name: 'Test',
      sdkVersion: '1' as const,
      adapters: {
        getMainResource: () => null,
        getPortraitResources: () => [],
        getStatuses: () => [],
        getFormulaTokens: () => ({}),
      },
      characterUI: { EntityCard: () => null },
    }
    registerPlugin(fakePlugin)
    expect(getRulePlugin('test-system').id).toBe('test-system')
  })
})

describe('genericPlugin adapters', () => {
  it('getMainResource returns null for entity with no ruleData', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({ ruleData: null })
    expect(plugin.adapters.getMainResource(entity)).toBeNull()
  })

  it('getMainResource returns first resource from ruleData', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      ruleData: {
        resources: { hp: { current: 15, max: 20, color: '#f00' } },
      },
    })
    const resource = plugin.adapters.getMainResource(entity)
    expect(resource).not.toBeNull()
    expect(resource!.current).toBe(15)
    expect(resource!.max).toBe(20)
    expect(resource!.color).toBe('#f00')
  })

  it('getStatuses returns status labels', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      ruleData: { statuses: [{ label: 'Poisoned' }, { label: 'Stunned' }] },
    })
    const statuses = plugin.adapters.getStatuses(entity)
    expect(statuses).toHaveLength(2)
    expect(statuses[0].label).toBe('Poisoned')
  })

  it('getPortraitResources returns all resources', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      ruleData: {
        resources: [
          { key: 'hp', current: 10, max: 20, color: '#f00' },
          { key: 'mp', current: 5, max: 10, color: '#00f' },
        ],
      },
    })
    const resources = plugin.adapters.getPortraitResources(entity)
    expect(resources).toHaveLength(2)
  })
})
```

- [ ] **Step 4: Run the tests**
```bash
npm test -- src/rules/__tests__/registry.test.ts --reporter=verbose
```
Expected: all pass

- [ ] **Step 5: Commit**
```bash
git add src/rules/registry.ts src/rules/__tests__/registry.test.ts
git commit -m "feat: wire generic plugin into registry; add registry unit tests"
```

---

### Task 12: Wire entity card slot in `PortraitBar.tsx`

**Files:** `src/layout/PortraitBar.tsx`

- [ ] **Step 1: Read the current CharacterEditPanel usage in PortraitBar**
```bash
grep -n "CharacterEditPanel\|CharacterDetailPanel\|isLocked\|isEditable" src/layout/PortraitBar.tsx | head -20
```

- [ ] **Step 2: Add `useRulePlugin` import and replace the entity card**

In `PortraitBar.tsx`:

1. Add import:
```typescript
import { useRulePlugin } from '../rules/useRulePlugin'
```

2. Inside the component (before any early return), add:
```typescript
const plugin = useRulePlugin()
```

3. Replace the `isLocked && isEditable` branch:

**Before:**
```tsx
{isLocked ? (
  isEditable ? (
    <CharacterEditPanel
      character={popoverEntity}
      onUpdateCharacter={onUpdateEntity}
      onClose={() => onInspectCharacter(null)}
    />
  ) : (
    <CharacterDetailPanel
      character={popoverEntity}
      isOnline={false}
      onClose={() => onInspectCharacter(null)}
    />
  )
) : (
  <CharacterHoverPreview ... />
)}
```

**After:**
```tsx
{isLocked ? (
  (() => {
    const Card = plugin.characterUI.EntityCard
    return (
      <Card
        entity={popoverEntity}
        onUpdate={(patch) => onUpdateEntity(popoverEntity.id, patch)}
        readonly={!isEditable}
      />
    )
  })()
) : (
  <CharacterHoverPreview ... />
)}
```

Note: The close button (`onClose={() => onInspectCharacter(null)}`) was inside `CharacterEditPanel` before. After this change, `CharacterEditPanel` has no close button (we made `onClose` optional in Task 9). The close button must now live in `PortraitBar`'s container around the popover. Check if PortraitBar already has a close mechanism for the popover — if so, it will still work. If not, add one.

- [ ] **Step 3: Remove unused imports (if CharacterEditPanel / CharacterDetailPanel are no longer used directly)**
```bash
npx tsc --noEmit 2>&1 | grep "PortraitBar" | head -20
```
Remove any unused imports that TypeScript flags.

- [ ] **Step 4: Full TypeScript check and run tests**
```bash
npx tsc --noEmit 2>&1 | head -30
npm test -- src/ --reporter=verbose 2>&1 | tail -30
```
Expected: all pass; no TS errors

- [ ] **Step 5: Commit**
```bash
git add src/layout/PortraitBar.tsx
git commit -m "feat: wire plugin.characterUI.EntityCard slot in PortraitBar"
```

---

## Chunk 4: Integration + PR

### Task 13: Update `entityAdapters.ts` to align types with `types.ts`

**Files:** `src/shared/entityAdapters.ts`

The `ResourceView` in `entityAdapters.ts` has `key: string` while the new `ResourceView` in `types.ts` has `label: string`. To avoid confusion, keep them as separate types for now (the old `ResourceView` is used internally by `CharacterEditPanel`, `ChatPanel`, etc. and will be cleaned up when those components are ported to use plugin adapters). Just add a comment:

- [ ] **Step 1: Add a comment to `entityAdapters.ts`**

```typescript
// NOTE: ResourceView here uses 'key' (internal adapter field).
// The plugin-facing ResourceView in src/rules/types.ts uses 'label'.
// This file is temporary — will be deleted when all callers migrate to plugin.adapters.*
export interface ResourceView {
  key: string
  ...
```

- [ ] **Step 2: Commit**
```bash
git add src/shared/entityAdapters.ts
git commit -m "docs: clarify entityAdapters.ts is temporary pending plugin migration"
```

---

### Task 14: Full validation + create PR

- [ ] **Step 1: Run full test suite**
```bash
npm test -- --reporter=verbose 2>&1 | tail -40
```
Expected: all tests pass

- [ ] **Step 2: Run TypeScript check**
```bash
npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 3: Manual smoke test**

Start the dev server and verify:
1. Open a room — the character cards still appear and work (generic plugin active)
2. Open browser DevTools → no console errors
3. `getState().room.ruleSystemId` in console → `"generic"`

- [ ] **Step 4: Push and create PR**
```bash
git push -u origin feat/rule-plugin-system
gh pr create \
  --title "feat: rule plugin system Phase 1 — foundation + generic plugin + entity card slot" \
  --body "$(cat <<'EOF'
## Summary

- Replaces `RuleSystem` interface with layered `RulePlugin` (7 capability layers)
- Creates `src/rules/sdk.ts` as the only legal import path for plugins
- Adds `plugins/generic/` fallback plugin wrapping existing `CharacterEditPanel`
- Adds `rule_system_id` to DB + store + API (`GET/PATCH /state` now returns/accepts it)
- Wires `PortraitBar` entity card slot to `plugin.characterUI.EntityCard`
- KonvaToken adapter wiring deferred to after `feat/tactical-ui-refactor` merges
- DaggerHeart plugin implementation deferred to a separate PR

## Test plan

- [ ] `npm test` passes all existing tests
- [ ] `npx tsc --noEmit` no errors
- [ ] Open a room in browser: character cards still work (generic plugin)
- [ ] DevTools console: no errors on room load
EOF
)"
```

---

## Deferred (Future PRs)

| Item | Reason deferred | Depends on |
|------|----------------|------------|
| `KonvaToken` adapter wiring | `feat/tactical-ui-refactor` is modifying `KonvaToken.tsx` | PR C merging |
| DaggerHeart plugin | Separate PR, needs full DH UI design | This PR |
| `surfaces`/`panels` system | Needs DaggerHeart to validate design | DaggerHeart PR |
| `usePluginPanels` hook + sdk.ts export | Part of surfaces/panels system | DaggerHeart PR |
| `hideElements` wiring | Low priority, base UI elements are fine as-is | — |
| `GenericEntityCard` read-only path | Phase 1 uses `CharacterEditPanel` with empty `onUpdateCharacter` for readonly; a proper `CharacterDetailPanel` wrapper should replace this | — |
| `pluginConfig` in fieldMap + `RoomState` | Column exists in DB; expose only when a consumer exists | DaggerHeart or room settings PR |
