import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Tactical Blank Canvas', () => {
  test('can enter tactical mode and create tokens without uploading a map', async ({ page }) => {
    const roomName = `blank-canvas-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Verify no map has been uploaded (mapUrl should be null)
    const mapUrlBefore = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.mapUrl ?? null
    })
    expect(mapUrlBefore).toBeNull()

    // Enter tactical mode on blank canvas (no map)
    await room.gmDock.enterCombat()
    await room.gmDock.expectInCombat()
    await room.tactical.expectVisible()

    // Explicitly verify tacticalInfo exists but mapUrl is null
    const state = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return {
        hasTacticalInfo: store?.tacticalInfo !== null && store?.tacticalInfo !== undefined,
        mapUrl: store?.tacticalInfo?.mapUrl ?? null,
        tacticalMode: store?.tacticalInfo?.tacticalMode,
      }
    })
    expect(state.hasTacticalInfo).toBe(true)
    expect(state.mapUrl).toBeNull()
    expect(state.tacticalMode).toBe(1)

    // Right-click on canvas should work (no "No combat scene selected" placeholder)
    await room.tactical.rightClickCenter()
    await expect(page.getByText('Create Token')).toBeVisible({ timeout: 3000 })

    // Create a token on the blank canvas
    await page.getByText('Create Token').click()

    // Verify token was created
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )

    // mapUrl should still be null after creating a token
    const mapUrlAfter = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.mapUrl ?? null
    })
    expect(mapUrlAfter).toBeNull()
  })
})
