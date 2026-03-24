import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getTokenScreenPosition, getTokenRadius } from '../helpers/canvas-helpers'

/** 1x1 red pixel PNG for cascade test */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
)
const ASSETS_DIR = '/tmp/myvtt-e2e-assets'
mkdirSync(ASSETS_DIR, { recursive: true })
const cascadePngPath = join(ASSETS_DIR, 'test-cascade.png')
writeFileSync(cascadePngPath, MINIMAL_PNG)

test.describe('Cascade Deletion', () => {
  test('delete gallery asset -> file returns 404', async ({ page }) => {
    const roomName = `cascade-asset-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Open Gallery tab and upload test-cascade.png
    await room.gmDock.openTab('maps')
    await room.gmDock.gallery.uploadImage(cascadePngPath)
    await room.gmDock.gallery.expectAssetVisible('test-cascade.png')

    // Get asset URL from worldStore (assets migrated from assetStore to worldStore)
    const assetUrl = await page.evaluate(() => {
      const assets = (window as any).__MYVTT_STORES__?.world()?.assets
      const asset = assets?.find((a: any) => a.name?.includes('test-cascade'))
      return asset?.url
    })
    expect(assetUrl).toBeTruthy()

    // Verify asset file returns 200
    const statusBefore = await page.evaluate(
      (url) => fetch(url).then((r) => r.status),
      assetUrl as string,
    )
    expect(statusBefore).toBe(200)

    // Delete asset via Gallery context menu
    await room.gmDock.gallery.deleteAsset('test-cascade.png')
    await room.gmDock.gallery.expectAssetNotVisible('test-cascade.png')

    // Gallery uses softRemove (5s delayed server DELETE), so poll until file returns 404
    await page.waitForFunction(
      async (url: string) => {
        const r = await fetch(url)
        return r.status === 404
      },
      assetUrl as string,
      { timeout: 15_000, polling: 1000 },
    )
  })

  test('delete entity -> tokens removed from client store', async ({ page }) => {
    const roomName = `cascade-entity-${Date.now()}`

    // Setup: create room, join as GM, enter combat
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Right-click canvas center -> Create Token
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()

    // Wait for token to appear
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Record the entityId from the first token
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.tokens?.[0]?.entityId
    })
    expect(entityId).toBeTruthy()

    // Open GmSidebar -> Entities tab
    await room.gmSidebar.openEntities()

    // Delete entity via EntityPanel (confirm immediately)
    // The entity name comes from the auto-created ephemeral entity
    // Find the entity name from the store
    const entityName = await page.evaluate((eid: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.entities?.[eid]?.name
    }, entityId as string)

    await room.gmSidebar.entityPanel.deleteEntity(entityName as string)

    // Wait for entity to be removed from store
    await page.waitForFunction(
      (eid: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.entities?.[eid] == null
      },
      entityId as string,
      { timeout: 10_000 },
    )

    // entity:deleted handler cleans up tacticalInfo.tokens for the deleted entityId
    await page.waitForFunction(
      (eid: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const tokens = store?.tacticalInfo?.tokens
        if (!tokens) return true
        return tokens.every((t: any) => t.entityId !== eid)
      },
      entityId as string,
      { timeout: 10_000 },
    )
  })

  test('delete scene -> scene removed from store', async ({ page }) => {
    const roomName = `cascade-scene-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Open scene list and create a new scene
    await room.scenes.openSceneList()
    await room.scenes.createScene()

    // Rename it to "Temp Battle"
    await room.scenes.renameScene('New Scene', 'Temp Battle')
    await room.scenes.expectSceneExists('Temp Battle')

    // Switch to "Temp Battle"
    await room.scenes.selectScene('Temp Battle')

    // Wait for active scene to switch
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.name === 'Temp Battle'
      },
      null,
      { timeout: 10_000 },
    )

    // Enter tactical -> create token -> confirm token exists
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Exit tactical
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()

    // Re-open scene list (may have closed after combat exit)
    await room.scenes.openSceneList()

    // Switch back to first scene (Scene 1 or whatever the default is)
    // The first scene name might vary -- get it from the store
    const firstSceneName = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const scenes = store?.scenes
      // Find the scene that is NOT "Temp Battle"
      const first = scenes?.find((s: any) => s.name !== 'Temp Battle')
      return first?.name
    })
    expect(firstSceneName).toBeTruthy()
    await room.scenes.selectScene(firstSceneName as string)

    // Wait for active scene to switch
    await page.waitForFunction(
      (name: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.name === name
      },
      firstSceneName as string,
      { timeout: 10_000 },
    )

    // Delete "Temp Battle"
    await room.scenes.deleteScene('Temp Battle')

    // Assert scene gone from UI
    await room.scenes.expectSceneNotExists('Temp Battle')

    // Assert scene gone from store
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.scenes?.every((s: any) => s.name !== 'Temp Battle')
      },
      null,
      { timeout: 10_000 },
    )
  })

  test('delete token does NOT delete entity (reverse non-cascade)', async ({ page }) => {
    const roomName = `cascade-reverse-token-${Date.now()}`

    // Setup: create room, join as GM, enter combat
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Right-click canvas center -> Create Token
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()

    // Wait for token to appear
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Record entityId from tokens[0]
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.tokens?.[0]?.entityId
    })
    expect(entityId).toBeTruthy()

    // Right-click ON THE TOKEN (need screen position offset to center for circle hit)
    const topLeft = await getTokenScreenPosition(page, 0, room.tactical.canvas)
    const radius = await getTokenRadius(page)
    await page.mouse.click(topLeft.x + radius, topLeft.y + radius, { button: 'right' })

    // Click "Delete Token" from context menu
    await expect(page.getByText('Delete Token')).toBeVisible({ timeout: 3000 })
    await page.getByText('Delete Token').click()

    // Wait for token to be removed
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 0
      },
      null,
      { timeout: 10_000 },
    )

    // CRITICAL: entity STILL exists in store
    const entityStillExists = await page.evaluate((eid: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.entities?.[eid] != null
    }, entityId as string)
    expect(entityStillExists).toBe(true)
  })

  test('delete scene does NOT delete reusable entity (reverse non-cascade)', async ({ page }) => {
    const roomName = `cascade-reverse-scene-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Open Characters tab -> create character (default name: "New Character", lifecycle=reusable)
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    // Get entityId from store
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      if (!store?.entities) return null
      const entity = Object.values(store.entities).find((e: any) => e.name === 'New Character')
      return (entity as any)?.id ?? null
    })
    expect(entityId).toBeTruthy()

    // Open scene list and create "Temp Scene"
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.renameScene('New Scene', 'Temp Scene')
    await room.scenes.expectSceneExists('Temp Scene')

    // Switch to "Temp Scene"
    await room.scenes.selectScene('Temp Scene')
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.name === 'Temp Scene'
      },
      null,
      { timeout: 10_000 },
    )

    // Switch back to first scene
    const firstSceneName = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const scenes = store?.scenes
      const first = scenes?.find((s: any) => s.name !== 'Temp Scene')
      return first?.name
    })
    expect(firstSceneName).toBeTruthy()
    await room.scenes.selectScene(firstSceneName as string)

    // Wait for scene switch
    await page.waitForFunction(
      (name: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.name === name
      },
      firstSceneName as string,
      { timeout: 10_000 },
    )

    // Delete "Temp Scene"
    await room.scenes.deleteScene('Temp Scene')
    await room.scenes.expectSceneNotExists('Temp Scene')

    // CRITICAL: entity STILL exists in store
    const entityStillExists = await page.evaluate((eid: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.entities?.[eid] != null
    }, entityId as string)
    expect(entityStillExists).toBe(true)

    // Also verify character still exists in the store (additional check beyond entityStillExists)
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        if (!store?.entities) return false
        return Object.values(store.entities).some((e: any) => e.name === 'New Character')
      },
      null,
      { timeout: 5_000 },
    )
  })
})
