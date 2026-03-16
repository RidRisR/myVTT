import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Player Session', () => {
  const roomName = `player-test-${Date.now()}`

  test('player joins and sees limited UI', async ({ browser }) => {
    // 1. GM creates room and joins
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)

    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('Game Master', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Extract room URL for the player
    const roomUrl = gmPage.url()

    // 2. Player joins in a separate browser context
    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    await playerPage.goto(roomUrl)

    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.expectVisible()

    // Verify GM's seat is visible in the seat list
    await playerSeat.expectSeatVisible('Game Master')

    // NOTE: seat:online/offline events are not yet implemented server-side,
    // so we cannot assert the "Online" badge. When the feature is added,
    // uncomment: await playerSeat.expectSeatOnline('Game Master')

    // Create player seat
    await playerSeat.createAndJoin('Warrior', 'PL')

    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // Player should NOT see GM-only tools
    await playerRoom.gmDock.expectNotVisible()
    await expect(playerRoom.scenes.scenesButton).toBeHidden()

    // Player should see the hamburger menu (always visible)
    await expect(playerRoom.hamburgerMenu).toBeVisible()

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerContext.close()
  })
})
