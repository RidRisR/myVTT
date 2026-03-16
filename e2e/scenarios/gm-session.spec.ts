import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('GM Session Journey', () => {
  const roomName = `gm-session-${Date.now()}`

  test('full GM session workflow', async ({ page }) => {
    // 1. Create room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)

    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()
    await seatSelect.createAndJoin('Dungeon Master', 'GM')

    const room = new RoomPage(page)
    await room.expectInRoom()

    // 2. Verify default Scene 1 exists
    await expect(room.scenes.scenesButton).toBeVisible()
    await room.scenes.openSceneList()
    await room.scenes.expectSceneExists('Scene 1')

    // 3. Create a new scene
    await room.scenes.createScene()
    await room.scenes.expectSceneExists('New Scene')

    // 4. Rename the new scene
    await room.scenes.renameScene('New Scene', 'Tavern')
    await room.scenes.expectSceneExists('Tavern')

    // 5. Switch active scene
    await room.scenes.selectScene('Scene 1')
    await page.waitForTimeout(300)
    await room.scenes.selectScene('Tavern')
    await page.waitForTimeout(300)

    // 6. Delete Scene 1
    await room.scenes.deleteScene('Scene 1')
    await room.scenes.expectSceneNotExists('Scene 1')
    await room.scenes.expectSceneExists('Tavern')

    // 7. Close scene list, verify GM Dock
    await page.keyboard.press('Escape')
    await room.gmDock.expectVisible()

    // 8. Open GM Dock tabs
    await room.gmDock.openTab('gallery')
    await page.waitForTimeout(200)
    await room.gmDock.openTab('characters')
    await page.waitForTimeout(200)
    await room.gmDock.openTab('handouts')
    await page.waitForTimeout(200)

    // 9. Enter tactical mode
    await room.gmDock.enterCombat()
    await room.gmDock.expectInCombat()
    await room.tactical.expectVisible()

    // 10. Exit tactical mode
    await room.gmDock.exitCombat()
    await room.gmDock.expectNotInCombat()
    await room.tactical.expectHidden()

    // 11. GM Sidebar
    await room.gmSidebar.expectVisible()
    await room.gmSidebar.openEntities()
    await room.gmSidebar.openArchives()

    // 12. Leave seat → back to SeatSelect
    await room.leaveSeat()
    await room.seatSelect.expectVisible()
    await room.seatSelect.expectSeatVisible('Dungeon Master')
  })
})
