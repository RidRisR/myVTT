import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Scene Last Delete Guard', () => {
  test('delete button is hidden when only one scene remains', async ({ page }) => {
    const roomName = `last-scene-guard-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Open scene list — should have exactly 1 scene (Scene 1)
    await room.scenes.openSceneList()
    await room.scenes.expectSceneExists('Scene 1')

    // Hover over the single scene card — delete button should NOT appear
    const sceneCard = page
      .locator('[title="Double-click to rename"]', { hasText: 'Scene 1' })
      .locator('xpath=ancestor::div[contains(@class, "group")]')
    await sceneCard.hover()

    // The delete button (trash icon with title "Delete scene") should NOT be in the DOM
    await expect(sceneCard.getByTitle('Delete scene')).toBeHidden()

    // Verify there's only 1 scene via store
    const sceneCount = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.scenes?.length ?? 0
    })
    expect(sceneCount).toBe(1)
  })

  test('delete button appears when multiple scenes exist, disappears after deleting to one', async ({
    page,
  }) => {
    const roomName = `multi-scene-delete-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Open scene list and create a second scene
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.expectSceneExists('New Scene')

    // Now with 2 scenes, hover over "Scene 1" — delete button SHOULD appear
    const scene1Card = page
      .locator('[title="Double-click to rename"]', { hasText: 'Scene 1' })
      .locator('xpath=ancestor::div[contains(@class, "group")]')
    await scene1Card.hover()
    await expect(scene1Card.getByTitle('Delete scene')).toBeVisible()

    // Delete "New Scene" so only "Scene 1" remains
    await room.scenes.deleteScene('New Scene')
    await room.scenes.expectSceneNotExists('New Scene')

    // Hover over "Scene 1" again — delete button should be GONE
    await scene1Card.hover()
    await expect(scene1Card.getByTitle('Delete scene')).toBeHidden()
  })
})
