import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Multi-Client Sync', () => {
  const roomName = `sync-test-${Date.now()}`

  test("GM and Player see each other's chat messages", async ({ browser }) => {
    // Setup: GM creates room and joins
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('GM', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Setup: Player joins
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Fighter', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // GM sends a chat message
    await gmRoom.chat.expandChat()
    await gmRoom.chat.sendMessage('Hello adventurers!')

    // Player should see the message
    await playerRoom.chat.expandChat()
    await playerRoom.chat.expectMessageVisible('Hello adventurers!')

    // Player sends a message
    await playerRoom.chat.sendMessage('Ready to fight!')

    // GM should see it
    await gmRoom.chat.expectMessageVisible('Ready to fight!')

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })

  test('GM enters tactical, Player sees canvas', async ({ browser }) => {
    // Setup: GM and Player in same room
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    const tacticalRoom = `tactical-sync-${Date.now()}`
    await admin.createRoom(tacticalRoom)
    await admin.enterRoom(tacticalRoom)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('GM', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Mage', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // GM enters tactical
    await gmRoom.gmDock.enterCombat()
    await gmRoom.tactical.expectVisible()

    // Player should also see tactical canvas
    await playerRoom.tactical.expectVisible()

    // GM exits tactical
    await gmRoom.gmDock.exitCombat()
    await gmRoom.tactical.expectHidden()

    // Player should also see it disappear
    await playerRoom.tactical.expectHidden()

    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })
})
