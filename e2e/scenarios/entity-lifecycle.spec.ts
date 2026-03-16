import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Entity Lifecycle', () => {
  test('create character, rename, Player sees it', async ({ browser }) => {
    const roomName = `entity-rename-${Date.now()}`

    // --- GM Setup ---
    const gmContext = await browser.newContext()
    const gmPage = await gmContext.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('GM', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // GM opens Characters tab and creates a character
    await gmRoom.gmDock.openTab('characters')
    await gmRoom.gmDock.characterLibrary.createCharacter()
    await gmRoom.gmDock.characterLibrary.expectCharacterVisible('新角色')

    // GM opens Entities tab and renames the character
    await gmRoom.gmSidebar.openEntities()
    await gmRoom.gmSidebar.entityPanel.renameEntity('新角色', 'Goblin Scout')
    await gmRoom.gmSidebar.entityPanel.expectEntityVisible('Goblin Scout')

    // --- Player Setup ---
    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Player', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // Player verifies entity exists with renamed name via store
    await playerPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        if (!store?.entities) return false
        return Object.values(store.entities).some((e: any) => e.name === 'Goblin Scout')
      },
      null,
      { timeout: 10_000 },
    )

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await gmContext.close()
    await playerContext.close()
  })

  test('toggle entity visibility', async ({ page }) => {
    const roomName = `entity-visibility-${Date.now()}`

    // Setup: create room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Create a character via Characters tab
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('新角色')

    // Open Entities tab
    await room.gmSidebar.openEntities()

    // Assert entity is visible in the panel
    await room.gmSidebar.entityPanel.expectEntityVisible('新角色')

    // Toggle visibility (remove from scene)
    await room.gmSidebar.entityPanel.toggleVisibility('新角色')

    // Verify sceneEntityMap entry has visible=false
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const entries = store?.sceneEntityMap?.[store?.room?.activeSceneId]
        return entries?.some((e: any) => e.visible === false)
      },
      null,
      { timeout: 10_000 },
    )
  })
})
