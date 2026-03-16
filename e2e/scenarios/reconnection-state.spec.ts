import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Reconnection State Restore', () => {
  test('page reload restores tactical state with tokens', async ({ page }) => {
    const roomName = `reconnect-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Enter tactical mode and create 2 tokens
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )

    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 2
      },
      null,
      { timeout: 10_000 },
    )

    // Capture state before reload
    const stateBefore = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return {
        activeSceneId: store?.room?.activeSceneId,
        tacticalMode: store?.tacticalInfo?.tacticalMode,
        tokenCount: store?.tacticalInfo?.tokens?.length ?? 0,
      }
    })
    expect(stateBefore.tokenCount).toBe(2)
    expect(stateBefore.tacticalMode).toBe(1)

    // Reload the page — simulates full browser reconnection
    await page.reload()

    // Re-claim seat (sessionStorage auto-claim)
    await room.expectInRoom()

    // Tactical state should be restored: tactical mode active with 2 tokens
    await room.tactical.expectVisible()

    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (
          store?.tacticalInfo?.tacticalMode === 1 &&
          (store?.tacticalInfo?.tokens?.length ?? 0) === 2
        )
      },
      null,
      { timeout: 10_000 },
    )

    // Verify scene ID is preserved
    const stateAfter = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return {
        activeSceneId: store?.room?.activeSceneId,
        tacticalMode: store?.tacticalInfo?.tacticalMode,
        tokenCount: store?.tacticalInfo?.tokens?.length ?? 0,
      }
    })
    expect(stateAfter.activeSceneId).toBe(stateBefore.activeSceneId)
    expect(stateAfter.tacticalMode).toBe(1)
    expect(stateAfter.tokenCount).toBe(2)
  })
})
