import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Tactical Combat', () => {
  const roomName = `tactical-${Date.now()}`

  test('full tactical combat workflow', async ({ page }) => {
    // Setup: create room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('Battle GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // 1. Enter tactical mode
    await room.gmDock.enterCombat()
    await room.gmDock.expectInCombat()
    await room.tactical.expectVisible()

    // 2. Right-click on canvas opens context menu
    await room.tactical.rightClickCenter()
    await expect(page.getByText('Create Token')).toBeVisible({ timeout: 3000 })

    // 3. Create token via context menu
    await page.getByText('Create Token').click()
    await page.waitForTimeout(1000)

    // 4. Exit and re-enter tactical — state persists
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // 5. Exit tactical mode
    await room.gmDock.exitCombat()
    await room.gmDock.expectNotInCombat()
    await room.tactical.expectHidden()
  })
})
