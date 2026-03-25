# Asset Management E2E Tests — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright E2E tests for Gallery (map/background) and Blueprint (token) asset workflows, including multi-client sync verification.

**Architecture:** Two new Page Objects (GalleryPage, BlueprintPage) as children of GmDockPage. A dev-mode bridge exposes zustand stores to `page.evaluate()` for canvas/store state verification. Tests follow the existing `multi-client-sync.spec.ts` pattern (manual room setup, `browser.newContext()` for Player).

**Tech Stack:** Playwright, TypeScript, zustand (dev bridge)

**Spec:** `docs/superpowers/specs/2026-03-16-asset-e2e-tests-design.md`

---

## Chunk 1: Source Code Changes + Test Helpers

### Task 1: Dev Bridge — expose zustand stores to window

**Files:**

- Create: `src/lib/devBridge.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create devBridge.ts**

```typescript
// src/lib/devBridge.ts
import { useWorldStore } from '../stores/worldStore'
import { useAssetStore } from '../stores/assetStore'

if (import.meta.env.DEV) {
  ;(window as any).__MYVTT_STORES__ = {
    world: () => useWorldStore.getState(),
    asset: () => useAssetStore.getState(),
  }
}
```

- [ ] **Step 2: Import devBridge in main.tsx**

Add to `src/main.tsx` before the `createRoot` call:

```typescript
import './lib/devBridge'
```

The full file should be:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/devBridge'
import './styles/global.css'
import App from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/devBridge.ts src/main.tsx
git commit -m "feat(e2e): add dev-mode zustand store bridge for page.evaluate"
```

### Task 2: Add aria-label to Blueprint delete button

**Files:**

- Modify: `src/dock/BlueprintDockTab.tsx:290`

- [ ] **Step 1: Add aria-label to the hover delete button**

In `src/dock/BlueprintDockTab.tsx`, find the hover delete button (line 290):

```typescript
// Old:
<button
  onClick={(e) => {
    e.stopPropagation()
    handleDelete(bp)
  }}
  className="absolute -top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 border-none cursor-pointer text-danger flex items-center justify-center p-0"
>
```

Replace with (add `aria-label`):

```typescript
// New:
<button
  aria-label="Delete blueprint"
  onClick={(e) => {
    e.stopPropagation()
    handleDelete(bp)
  }}
  className="absolute -top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 border-none cursor-pointer text-danger flex items-center justify-center p-0"
>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/dock/BlueprintDockTab.tsx
git commit -m "feat(e2e): add aria-label to blueprint delete button"
```

### Task 3: Test asset helper — generate minimal PNGs

**Files:**

- Create: `e2e/helpers/test-assets.ts`

- [ ] **Step 1: Create the test-assets helper**

```typescript
// e2e/helpers/test-assets.ts
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

/** 1x1 red pixel PNG — 68 bytes, valid image/png MIME */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
)

const ASSETS_DIR = '/tmp/myvtt-e2e-assets'

export interface TestAssets {
  mapPath: string
  tokenPath: string
}

/**
 * Write minimal PNG test files to /tmp and return their paths.
 * Safe to call multiple times — mkdirSync is idempotent with recursive.
 */
export function createTestAssets(): TestAssets {
  mkdirSync(ASSETS_DIR, { recursive: true })
  const mapPath = join(ASSETS_DIR, 'test-map.png')
  const tokenPath = join(ASSETS_DIR, 'test-token.png')
  writeFileSync(mapPath, MINIMAL_PNG)
  writeFileSync(tokenPath, MINIMAL_PNG)
  return { mapPath, tokenPath }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/helpers/test-assets.ts
git commit -m "feat(e2e): add test asset helper for minimal PNG generation"
```

## Chunk 2: Page Objects

### Task 4: GalleryPage — page object for Gallery tab

**Files:**

- Create: `e2e/pages/gallery.page.ts`

- [ ] **Step 1: Create GalleryPage**

```typescript
// e2e/pages/gallery.page.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class GalleryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Upload an image file via the hidden file input. Waits for asset to appear in grid. */
  async uploadImage(filePath: string) {
    const fileInput = this.page.locator('input[type="file"][accept*="image"]')
    await fileInput.setInputFiles(filePath)
    // Wait for uploading state to finish (Upload button re-appears)
    await expect(this.page.getByRole('button', { name: 'Upload' })).toBeEnabled({ timeout: 15_000 })
  }

  /** Assert an asset with the given name is visible in the Gallery grid */
  async expectAssetVisible(name: string) {
    await expect(
      this.page
        .locator('div[role="button"]')
        .filter({ has: this.page.locator(`img[alt="${name}"]`) }),
    ).toBeVisible({ timeout: 10_000 })
  }

  /** Assert an asset with the given name is NOT visible */
  async expectAssetNotVisible(name: string) {
    await expect(this.page.locator(`img[alt="${name}"]`)).toBeHidden({ timeout: 10_000 })
  }

  /** Right-click on an asset tile to open context menu */
  async rightClickAsset(name: string) {
    const tile = this.page
      .locator('div[role="button"]')
      .filter({ has: this.page.locator(`img[alt="${name}"]`) })
    await tile.click({ button: 'right' })
  }

  /** Right-click asset → click "Set as Scene Background" */
  async setAsSceneBackground(name: string) {
    await this.rightClickAsset(name)
    await this.page.getByText('Set as Scene Background').click()
  }

  /** Right-click asset → click "Delete" */
  async deleteAsset(name: string) {
    await this.rightClickAsset(name)
    await this.page.getByText('Delete', { exact: true }).click()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/gallery.page.ts
git commit -m "feat(e2e): add GalleryPage page object"
```

### Task 5: BlueprintPage — page object for Blueprint tab

**Files:**

- Create: `e2e/pages/blueprint.page.ts`

- [ ] **Step 1: Create BlueprintPage**

```typescript
// e2e/pages/blueprint.page.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class BlueprintPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Upload a token image via hidden file input. Waits for a new token to appear in the grid. */
  async uploadToken(filePath: string, expectedName: string) {
    const fileInput = this.page.locator('input[type="file"][accept="image/*"]')
    await fileInput.setInputFiles(filePath)
    // Wait for the uploaded token name to appear in the blueprint list
    await expect(this.page.locator('span').filter({ hasText: expectedName }).first()).toBeVisible({
      timeout: 15_000,
    })
  }

  /** Assert a token blueprint with the given name is visible */
  async expectTokenVisible(name: string) {
    await expect(
      this.page.locator('.rounded-full').locator('..').filter({ hasText: name }),
    ).toBeVisible({
      timeout: 10_000,
    })
  }

  /** Assert a token blueprint with the given name is NOT visible */
  async expectTokenNotVisible(name: string) {
    await expect(this.page.locator('span').filter({ hasText: name }).first()).toBeHidden({
      timeout: 10_000,
    })
  }

  /** Right-click on a token to open context menu, then click an item */
  async rightClickToken(name: string) {
    const tokenContainer = this.page
      .locator('.rounded-full')
      .locator('..')
      .filter({ hasText: name })
    await tokenContainer.click({ button: 'right' })
  }

  /** Right-click token → "Spawn on map" (must be in tactical mode) */
  async spawnOnMap(name: string) {
    await this.rightClickToken(name)
    await this.page.getByText('Spawn on map').click()
  }

  /** Hover over token → click the X delete button (aria-label="Delete blueprint") */
  async deleteToken(name: string) {
    const tokenContainer = this.page
      .locator('.rounded-full')
      .locator('..')
      .filter({ hasText: name })
    await tokenContainer.hover()
    await this.page.getByLabel('Delete blueprint').click()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/blueprint.page.ts
git commit -m "feat(e2e): add BlueprintPage page object"
```

### Task 6: Wire page objects into GmDockPage

**Files:**

- Modify: `e2e/pages/gm-dock.page.ts`

- [ ] **Step 1: Add gallery and blueprint as children of GmDockPage**

Replace the full content of `e2e/pages/gm-dock.page.ts`:

```typescript
import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { GalleryPage } from './gallery.page'
import { BlueprintPage } from './blueprint.page'

export class GmDockPage {
  readonly page: Page
  readonly gallery: GalleryPage
  readonly blueprint: BlueprintPage
  readonly galleryTab: Locator
  readonly tokensTab: Locator
  readonly charactersTab: Locator
  readonly handoutsTab: Locator
  readonly diceTab: Locator
  readonly combatButton: Locator

  constructor(page: Page) {
    this.page = page
    this.gallery = new GalleryPage(page)
    this.blueprint = new BlueprintPage(page)
    this.galleryTab = page.getByRole('button', { name: 'Gallery' })
    this.tokensTab = page.getByRole('button', { name: '蓝图' })
    this.charactersTab = page.getByRole('button', { name: 'Characters' })
    this.handoutsTab = page.getByRole('button', { name: 'Handouts' })
    this.diceTab = page.getByRole('button', { name: 'Dice' })
    this.combatButton = page.getByRole('button', { name: /Combat|Exit/ })
  }

  async expectVisible() {
    await expect(this.galleryTab).toBeVisible()
  }

  async expectNotVisible() {
    await expect(this.galleryTab).toBeHidden()
  }

  async openTab(tab: 'gallery' | 'tokens' | 'characters' | 'handouts' | 'dice') {
    const tabMap = {
      gallery: this.galleryTab,
      tokens: this.tokensTab,
      characters: this.charactersTab,
      handouts: this.handoutsTab,
      dice: this.diceTab,
    }
    await tabMap[tab].click()
  }

  async enterCombat() {
    await this.page.getByRole('button', { name: 'Combat' }).click()
  }

  async exitCombat() {
    await this.page.getByRole('button', { name: 'Exit' }).click()
  }

  async expectInCombat() {
    await expect(this.page.getByRole('button', { name: 'Exit' })).toBeVisible()
  }

  async expectNotInCombat() {
    await expect(this.page.getByRole('button', { name: 'Combat' })).toBeVisible()
  }
}
```

- [ ] **Step 2: Verify existing tests still compile**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx tsc --noEmit -p e2e/tsconfig.json`
Expected: No errors (existing tests import GmDockPage unchanged — same public API plus new children)

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/gm-dock.page.ts
git commit -m "feat(e2e): wire GalleryPage and BlueprintPage into GmDockPage"
```

## Chunk 3: Test Scenarios

### Task 7: Gallery test — upload → set background → Player sync → delete

**Files:**

- Create: `e2e/scenarios/asset-management.spec.ts`

- [ ] **Step 1: Create asset-management.spec.ts with Gallery test**

```typescript
// e2e/scenarios/asset-management.spec.ts
import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'
import { createTestAssets } from '../helpers/test-assets'

const testAssets = createTestAssets()

test.describe('Asset Management', () => {
  test('Gallery: upload → set as background → Player sees it → delete', async ({ browser }) => {
    // --- GM Setup ---
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    const roomName = `gallery-test-${Date.now()}`
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('GM', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Step 1: Open Gallery tab
    await gmRoom.gmDock.openTab('gallery')

    // Step 2: Upload test-map.png
    await gmRoom.gmDock.gallery.uploadImage(testAssets.mapPath)

    // Step 3: Assert asset visible in grid (name includes extension)
    await gmRoom.gmDock.gallery.expectAssetVisible('test-map.png')

    // Step 4: Set as scene background
    await gmRoom.gmDock.gallery.setAsSceneBackground('test-map.png')

    // Step 5: Verify background is set via store bridge
    // Note: activeScene is a derived value — must compute from room.activeSceneId + scenes array
    await gmPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.atmosphere?.imageUrl != null
      },
      null,
      { timeout: 10_000 },
    )

    // --- Player Setup ---
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Fighter', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // Step 6: Player verifies background is set
    await playerPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.atmosphere?.imageUrl != null
      },
      null,
      { timeout: 10_000 },
    )

    // Step 7: Re-open Gallery tab (dock may have collapsed)
    await gmRoom.gmDock.openTab('gallery')

    // Step 8: Delete the asset
    await gmRoom.gmDock.gallery.deleteAsset('test-map.png')

    // Step 9: Assert asset gone
    await gmRoom.gmDock.gallery.expectAssetNotVisible('test-map.png')

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })
})
```

- [ ] **Step 2: Run the Gallery test in isolation**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx playwright test --config e2e/playwright.config.ts -g "Gallery"`
Expected: 1 test passed

- [ ] **Step 3: Debug and fix any locator issues**

If the test fails, check:

1. Is the Gallery tab content rendered? (file input must exist in DOM)
2. Does `img[alt="test-map.png"]` match? (check the actual alt attribute)
3. Does the context menu "Set as Scene Background" appear? (requires `activeSceneId` to be non-null)
4. Does `__MYVTT_STORES__` exist on window? (devBridge must be loaded)

Fix any locator issues in the page objects.

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/asset-management.spec.ts
git commit -m "feat(e2e): add Gallery asset workflow test"
```

### Task 8: Blueprint test — upload → spawn → Player sync → delete

**Files:**

- Modify: `e2e/scenarios/asset-management.spec.ts`

- [ ] **Step 1: Add Blueprint test to asset-management.spec.ts**

Add inside the `test.describe('Asset Management', () => { ... })` block, after the Gallery test:

```typescript
test('Blueprint: upload → spawn on map → Player sees token → delete', async ({ browser }) => {
  // --- GM Setup ---
  const gmPage = await browser.newPage()
  const admin = new AdminPage(gmPage)
  await admin.goto()
  const roomName = `blueprint-test-${Date.now()}`
  await admin.createRoom(roomName)
  await admin.enterRoom(roomName)
  const gmSeat = new SeatSelectPage(gmPage)
  await gmSeat.createAndJoin('GM', 'GM')
  const gmRoom = new RoomPage(gmPage)
  await gmRoom.expectInRoom()

  // Step 1: Enter tactical mode
  await gmRoom.gmDock.enterCombat()
  await gmRoom.tactical.expectVisible()

  // Step 2: Open Blueprint tab (蓝图)
  await gmRoom.gmDock.openTab('tokens')

  // Step 3: Upload test-token.png (pass expected name for upload-complete wait)
  await gmRoom.gmDock.blueprint.uploadToken(testAssets.tokenPath, 'test-token')

  // Step 4: Assert token visible (name without extension — already verified by uploadToken)
  await gmRoom.gmDock.blueprint.expectTokenVisible('test-token')

  // Step 5: Spawn on map
  await gmRoom.gmDock.blueprint.spawnOnMap('test-token')

  // Step 6: Verify token exists on map via store bridge
  await gmPage.waitForFunction(
    () => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
    },
    null,
    { timeout: 10_000 },
  )

  // --- Player Setup ---
  const playerCtx = await browser.newContext()
  const playerPage = await playerCtx.newPage()
  await playerPage.goto(gmPage.url())
  const playerSeat = new SeatSelectPage(playerPage)
  await playerSeat.createAndJoin('Mage', 'PL')
  const playerRoom = new RoomPage(playerPage)
  await playerRoom.expectInRoom()

  // Step 7: Player sees tactical canvas
  await playerRoom.tactical.expectVisible()

  // Step 8: Player verifies token exists
  await playerPage.waitForFunction(
    () => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
    },
    null,
    { timeout: 10_000 },
  )

  // Step 9: Re-open Blueprint tab (dock may have collapsed)
  await gmRoom.gmDock.openTab('tokens')

  // Step 10: Delete the blueprint via hover X button
  await gmRoom.gmDock.blueprint.deleteToken('test-token')

  // Step 11: Assert blueprint gone from list
  await gmRoom.gmDock.blueprint.expectTokenNotVisible('test-token')

  // Cleanup
  await gmPage.close()
  await playerPage.close()
  await playerCtx.close()
})
```

- [ ] **Step 2: Run the Blueprint test in isolation**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx playwright test --config e2e/playwright.config.ts -g "Blueprint"`
Expected: 1 test passed

- [ ] **Step 3: Debug and fix any locator issues**

If the test fails, check:

1. Is the tokens tab content rendered? (tab name is `蓝图`, not `Characters`)
2. Does the token circle + name `test-token` appear? (extension stripped by BlueprintDockTab)
3. Does "Spawn on map" menu item exist? (only when `isTactical === true`)
4. Does hover reveal the X button? (button has `aria-label="Delete blueprint"`)
5. Does `__MYVTT_STORES__.world().tacticalInfo.tokens` contain spawned tokens?

Fix any locator issues.

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/asset-management.spec.ts
git commit -m "feat(e2e): add Blueprint asset workflow test"
```

## Chunk 4: Verification & Cleanup

### Task 9: Run full E2E suite — verify no regressions

- [ ] **Step 1: Run the entire E2E suite**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx playwright test --config e2e/playwright.config.ts`
Expected: All tests pass (existing 13 + 2 new = 15 total, minus 2 known failures in gm-session and player-session)

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat-e2e-playwright && npm run lint`
Expected: No errors

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(e2e): address issues found in full suite run"
```

(Skip if no fixes needed)
