# Advanced E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 E2E tests across 4 spec files covering token drag, entity lifecycle, cascade deletion, and scene tactical state.

**Architecture:** Extend existing Playwright E2E infrastructure with 2 new page objects (CharacterLibraryPage, EntityPanelPage), 1 test-only canvas helper, and 4 new spec files. All canvas state verification uses existing devBridge (`window.__MYVTT_STORES__`).

**Tech Stack:** Playwright, TypeScript, Page Object pattern, zustand devBridge

**Spec:** `docs/superpowers/specs/2026-03-16-advanced-e2e-tests-design.md`

---

## Chunk 1: Helpers + Page Objects (Tasks 1-4)

### Task 1: Canvas Helpers

**Files:**

- Create: `e2e/helpers/canvas-helpers.ts`

Creates `@test-only` helper functions for canvas coordinate math and drag operations. These are NOT part of the Page Object layer.

- [ ] **Step 1: Create canvas-helpers.ts**

```typescript
// e2e/helpers/canvas-helpers.ts
/**
 * @test-only — Canvas coordinate helpers for E2E tests.
 * NOT part of the Page Object layer. These deal with raw pixel math
 * and devBridge store reads that are only meaningful in test context.
 */
import type { Page, Locator } from '@playwright/test'

/** Read token map-coordinates from store */
export async function getTokenPosition(
  page: Page,
  tokenIndex: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate((idx) => {
    const store = (window as any).__MYVTT_STORES__?.world()
    const token = store?.tacticalInfo?.tokens?.[idx]
    if (!token) throw new Error(`Token at index ${idx} not found`)
    return { x: token.x, y: token.y }
  }, tokenIndex)
}

/** Convert token map-coords to screen-coords using canvas boundingBox.
 *  Assumes initial scale=1, stagePos={0,0} (no zoom/pan). */
export async function getTokenScreenPosition(
  page: Page,
  tokenIndex: number,
  canvasLocator: Locator,
): Promise<{ x: number; y: number }> {
  const box = await canvasLocator.boundingBox()
  if (!box) throw new Error('Canvas not visible')
  const mapPos = await getTokenPosition(page, tokenIndex)
  return {
    x: box.x + mapPos.x,
    y: box.y + mapPos.y,
  }
}

/** Full mouse drag sequence: mousedown → mousemove (multi-step) → mouseup */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options?: { steps?: number },
): Promise<void> {
  const steps = options?.steps ?? 5
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Move in increments to trigger drag detection (threshold = 3px in KonvaTokenLayer)
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps
    await page.mouse.move(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)
  }
  await page.mouse.up()
}

/** Read grid settings from store */
export async function getGridSettings(page: Page): Promise<{
  size: number
  snap: boolean
  offsetX: number
  offsetY: number
}> {
  return page.evaluate(() => {
    const store = (window as any).__MYVTT_STORES__?.world()
    const grid = store?.tacticalInfo?.grid
    if (!grid) throw new Error('Grid not available (not in tactical mode?)')
    return {
      size: grid.size,
      snap: grid.snap,
      offsetX: grid.offsetX ?? 0,
      offsetY: grid.offsetY ?? 0,
    }
  })
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx eslint e2e/helpers/canvas-helpers.ts`

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/canvas-helpers.ts
git commit -m "feat(e2e): add @test-only canvas coordinate helpers"
```

### Task 2: CharacterLibraryPage

**Files:**

- Create: `e2e/pages/character-library.page.ts`

Page object for the Characters tab in GmDock. Wraps character creation, visibility, deletion, and inspection.

- [ ] **Step 1: Create character-library.page.ts**

```typescript
// e2e/pages/character-library.page.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class CharacterLibraryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Click the "新建角色" (Create Character) button */
  async createCharacter() {
    await this.page.locator('button[title="新建角色"]').click()
  }

  /** Assert a character name is visible in the list */
  async expectCharacterVisible(name: string) {
    await expect(this.page.locator('button').filter({ hasText: name })).toBeVisible({
      timeout: 5_000,
    })
  }

  /** Assert a character name is NOT visible in the list */
  async expectCharacterNotVisible(name: string) {
    await expect(this.page.locator('button').filter({ hasText: name })).toBeHidden({
      timeout: 5_000,
    })
  }

  /** Hover the character row and click the delete button (title="删除角色").
   *  Note: CharacterLibraryTab uses soft-delete with 5s delay. */
  async deleteCharacter(name: string) {
    const row = this.page.locator('button').filter({ hasText: name })
    await row.hover()
    await this.page.locator('button[title="删除角色"]').click()
  }

  /** Double-click to open the character inspector */
  async inspectCharacter(name: string) {
    const row = this.page.locator('button').filter({ hasText: name })
    await row.dblclick()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/character-library.page.ts
git commit -m "feat(e2e): add CharacterLibraryPage page object"
```

### Task 3: EntityPanelPage

**Files:**

- Create: `e2e/pages/entity-panel.page.ts`

Page object for the Entity panel in GmSidebar. Wraps NPC creation, visibility toggle, rename, and deletion.

- [ ] **Step 1: Create entity-panel.page.ts**

Key notes for the implementer:

- EntityPanel lives inside GmSidebar's "实体" tab
- EntityRow uses hover-dependent buttons (opacity-0 → group-hover:opacity-100)
- EntityRow dropdown menu is absolutely positioned WITHIN the row (NOT portaled)
- ConfirmPopover IS portaled to document.body
- Deletion is IMMEDIATE (no soft-delete delay unlike CharacterLibraryTab)
- The confirm button text in ConfirmPopover is English "Delete"

```typescript
// e2e/pages/entity-panel.page.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class EntityPanelPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Click the "新建NPC" button at the bottom of EntityPanel */
  async createNpc() {
    await this.page.getByRole('button').filter({ hasText: '新建NPC' }).click()
  }

  /** Assert an entity name is visible in the panel */
  async expectEntityVisible(name: string) {
    await expect(this.page.getByText(name, { exact: false })).toBeVisible({ timeout: 5_000 })
  }

  /** Assert an entity name is NOT visible in the panel */
  async expectEntityNotVisible(name: string) {
    await expect(this.page.getByText(name, { exact: false })).toBeHidden({ timeout: 5_000 })
  }

  /** Hover entity row → click eye icon to toggle visibility.
   *  title="离场" means currently visible (click to hide).
   *  title="上场" means currently hidden (click to show). */
  async toggleVisibility(name: string) {
    // Find the entity row and hover it to reveal the eye button
    const row = this.page.locator('div.group').filter({ hasText: name }).first()
    await row.hover()
    // Click whichever eye button is visible (离场 or 上场)
    const eyeButton = row.locator('button[title="离场"], button[title="上场"]').first()
    await eyeButton.click()
  }

  /** Open context menu → click "重命名" → fill new name → press Enter */
  async renameEntity(oldName: string, newName: string) {
    const row = this.page.locator('div.group').filter({ hasText: oldName }).first()
    await row.hover()
    // Click the MoreVertical menu button
    await row.locator('svg.lucide-more-vertical').locator('..').click()
    // Click "重命名" in the dropdown
    await this.page.getByText('重命名').click()
    // Wait for the autoFocus input to appear, fill it, and press Enter
    const input = row.locator('input')
    await input.fill(newName)
    await input.press('Enter')
  }

  /** Open context menu → click "删除" → confirm in ConfirmPopover.
   *  Note: EntityPanel deletion is IMMEDIATE (no 5s soft-delete). */
  async deleteEntity(name: string) {
    const row = this.page.locator('div.group').filter({ hasText: name }).first()
    await row.hover()
    // Click the MoreVertical menu button
    await row.locator('svg.lucide-more-vertical').locator('..').click()
    // Click "删除" (danger item) in the dropdown
    await this.page.getByText('删除').click()
    // Confirm in ConfirmPopover (portaled to body, English "Delete" button)
    await this.page.getByRole('button', { name: 'Delete', exact: true }).click()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/entity-panel.page.ts
git commit -m "feat(e2e): add EntityPanelPage page object"
```

### Task 4: Wire Page Objects into GmDockPage + GmSidebarPage

**Files:**

- Modify: `e2e/pages/gm-dock.page.ts` — add `characterLibrary` child
- Modify: `e2e/pages/gm-sidebar.page.ts` — add `entityPanel` child

- [ ] **Step 1: Add CharacterLibraryPage to GmDockPage**

In `gm-dock.page.ts`:

- Import `CharacterLibraryPage`
- Add `readonly characterLibrary: CharacterLibraryPage` property
- Initialize in constructor: `this.characterLibrary = new CharacterLibraryPage(page)`

- [ ] **Step 2: Add EntityPanelPage to GmSidebarPage**

In `gm-sidebar.page.ts`:

- Import `EntityPanelPage`
- Add `readonly entityPanel: EntityPanelPage` property
- Initialize in constructor: `this.entityPanel = new EntityPanelPage(page)`

- [ ] **Step 3: Verify lint passes**

Run: `npx eslint e2e/pages/gm-dock.page.ts e2e/pages/gm-sidebar.page.ts`

- [ ] **Step 4: Commit**

```bash
git add e2e/pages/gm-dock.page.ts e2e/pages/gm-sidebar.page.ts
git commit -m "feat(e2e): wire CharacterLibraryPage and EntityPanelPage into dock/sidebar"
```

---

## Chunk 2: Token Drag + Entity Lifecycle Specs (Tasks 5-6)

### Task 5: token-drag.spec.ts

**Files:**

- Create: `e2e/scenarios/token-drag.spec.ts`

3 tests: drag updates store, grid snap, multi-client sync.

- [ ] **Step 1: Create token-drag.spec.ts**

Key implementation notes:

- Each test creates its own room (isolation via `Date.now()` suffix)
- Setup: admin → create room → enter → GM seat → enter combat → right-click center → Create Token → waitForFunction tokens.length > 0
- Use `getTokenPosition`, `getTokenScreenPosition`, `dragOnCanvas` from canvas-helpers
- For grid snap: use `getGridSettings` to read offsetX/offsetY, assert `(x - offsetX) % gridSize === 0`
- For multi-client: `browser.newContext()` pattern from asset-management.spec.ts
- Token is created at canvas center via right-click → "Create Token", so initial position ≈ center of canvas in map coords
- After drag, `waitForFunction` checks token position changed (REST PATCH completes async)

Test 1 structure:

```
test('drag token updates store position', async ({ page }) => {
  // Setup: room + combat + create token
  // Record initial position
  // Calculate screen position
  // dragOnCanvas(page, from, { x: from.x + 100, y: from.y + 80 })
  // waitForFunction: position changed
})
```

Test 2 structure:

```
test('grid snap aligns token to grid', async ({ page }) => {
  // Setup: room + combat + create token
  // Get grid settings
  // dragOnCanvas with non-grid-aligned delta
  // waitForFunction: (x - offsetX) % gridSize === 0 && (y - offsetY) % gridSize === 0
})
```

Test 3 structure:

```
test('player sees token position after GM drag', async ({ browser }) => {
  // GM context + setup + create token
  // Player context joins same room
  // Player waitForFunction: tokens.length > 0
  // GM drags token
  // GM waitForFunction: position changed
  // Get GM final position
  // Player waitForFunction: position matches GM
})
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- --grep "Token Drag"`

- [ ] **Step 3: Debug and fix any failures**

Common issues to watch for:

- Token not yet created when trying to read position (need waitForFunction first)
- Drag not exceeding 3px threshold (use enough steps in dragOnCanvas)
- Grid snap assertion with non-zero offsets
- Player sync timeout (use 10_000ms)

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/token-drag.spec.ts
git commit -m "feat(e2e): add token drag + grid snap + multi-client sync tests"
```

### Task 6: entity-lifecycle.spec.ts

**Files:**

- Create: `e2e/scenarios/entity-lifecycle.spec.ts`

2 tests: create + rename + Player sync, visibility toggle.

- [ ] **Step 1: Create entity-lifecycle.spec.ts**

Key implementation notes:

- Test 1: Use CharacterLibraryPage to create, EntityPanelPage to rename (more reliable menu path)
- `store.entities` is `Record<string, Entity>` — use `Object.values()` for iteration
- Test 2: `sceneEntityMap[sceneId]` for visibility check, NOT `scene.sceneEntityEntries`
- EntityPanel is in GmSidebar "实体" tab — call `room.gmSidebar.openEntities()` first
- After creating character in Characters tab, the entity also appears in EntityPanel

Test 1 structure:

```
test('create character, rename, Player sees it', async ({ browser }) => {
  // GM: open Characters tab → create → assert "新角色" visible
  // GM: open Entities tab → rename "新角色" to "Goblin Scout"
  // GM: assert "Goblin Scout" visible in EntityPanel
  // Player: join → waitForFunction Object.values(store.entities).some(e => e.name === 'Goblin Scout')
})
```

Test 2 structure:

```
test('toggle entity visibility', async ({ page }) => {
  // Setup + create entity
  // Open Entities tab
  // toggleVisibility("新角色")
  // waitForFunction: sceneEntityMap entry has visible=false
})
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- --grep "Entity Lifecycle"`

- [ ] **Step 3: Debug and fix any failures**

Watch for:

- Entity row locator matching multiple elements (use `.first()`)
- Hover-dependent buttons not appearing (Playwright hover should trigger group-hover)
- Rename input not receiving focus (wait for input to be visible before fill)

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/entity-lifecycle.spec.ts
git commit -m "feat(e2e): add entity lifecycle tests (create, rename, visibility, sync)"
```

---

## Chunk 3: Cascade Deletion + Scene Tactical State Specs (Tasks 7-8)

### Task 7: cascade-deletion.spec.ts

**Files:**

- Create: `e2e/scenarios/cascade-deletion.spec.ts`

5 tests covering forward CASCADE and reverse non-cascade.

- [ ] **Step 1: Create cascade-deletion.spec.ts**

Critical implementation notes:

- Test 1 (Gallery → 404): Use assetStore to get URL. `page.evaluate(url => fetch(url).then(r => r.status), url)`
- Test 2 (Entity → Token CASCADE): Use EntityPanel deletion (immediate, no 5s delay). After deleting entity, must exit+re-enter tactical to trigger server re-fetch (see spec "已知产品限制" section). Then verify token gone.
- Test 3 (Scene → tactical cleanup): Create scene, switch to it, enter tactical, create token, exit, switch back, delete scene. Verify scene gone from store.
- Test 4 (Delete Token ≠ Delete Entity): Right-click on token position (use getTokenScreenPosition), click "Delete Token". Verify token gone but entity still in `store.entities`.
- Test 5 (Delete Scene ≠ Delete Entity): Create reusable entity, create temp scene, delete scene, verify entity survives.

`store.entities` is `Record<string, Entity>` — check existence with `store.entities[id] != null`, iterate with `Object.values(store.entities)`.

For right-clicking a token (Test 4): use `getTokenScreenPosition` to find where the token is, then `page.mouse.click(x, y, { button: 'right' })`.

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- --grep "Cascade Deletion"`

- [ ] **Step 3: Debug and fix**

Watch for:

- Asset URL format (may need to construct from room uploads path)
- Entity still in pendingDeletes if using CharacterLibrary (use EntityPanel instead)
- tactical:activated not received after re-enter (was fixed in earlier commit)
- ConfirmPopover "Delete" button matching multiple elements (use exact: true)
- Scene deletion confirmation dialog

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/cascade-deletion.spec.ts
git commit -m "feat(e2e): add cascade deletion tests (forward CASCADE + reverse non-cascade)"
```

### Task 8: scene-tactical-state.spec.ts

**Files:**

- Create: `e2e/scenarios/scene-tactical-state.spec.ts`

2 tests: state persistence across scene switch, independent per-scene state.

- [ ] **Step 1: Create scene-tactical-state.spec.ts**

Key implementation notes:

- Scene switching: use ScenePanelPage (already exists with selectScene, createScene methods)
- After scene switch, need to re-enter tactical mode to see that scene's tokens
- Creating multiple tokens: right-click center multiple times, but each creates at same position. Use small offsets or just verify count.
- `waitForFunction` for `room.activeSceneId` change after scene switch

Test 1 structure:

```
test('tokens persist after scene switch and return', async ({ page }) => {
  // Scene 1: enter tactical → create 1 token → exit tactical
  // Create Scene 2 → switch to Scene 2
  // waitForFunction: activeSceneId changed
  // Switch back to Scene 1 → enter tactical
  // waitForFunction: tokens.length === 1
})
```

Test 2 structure:

```
test('different scenes have independent tactical state', async ({ page }) => {
  // Scene 1: enter tactical → create 2 tokens → exit tactical
  // Create + switch to Scene 2 → enter tactical → create 1 token → exit tactical
  // Switch to Scene 1 → enter tactical → verify 2 tokens
  // Exit → switch to Scene 2 → enter tactical → verify 1 token
})
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- --grep "Scene Tactical"`

- [ ] **Step 3: Debug and fix**

Watch for:

- Scene switch may auto-exit tactical mode (check behavior)
- ScenePanel might need to be opened first (openSceneList)
- Creating second token at same position as first (may overlap, but count should be correct)

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/scene-tactical-state.spec.ts
git commit -m "feat(e2e): add scene tactical state persistence tests"
```

---

## Chunk 4: Verification (Task 9)

### Task 9: Full Suite Verification

- [ ] **Step 1: Run full E2E suite**

Run: `npm run test:e2e`
Expected: All tests pass (15 existing + 12 new = 27 total)

- [ ] **Step 2: Run vitest**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 3: Run lint + typecheck**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

- [ ] **Step 4: Commit any fixes**

If fixes were needed, commit them with descriptive message.
