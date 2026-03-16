import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Seat Presence', () => {
  test('occupied seat shows Online badge to other clients', async ({ browser }) => {
    const roomName = `presence-${Date.now()}`

    // GM creates room and claims a seat
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('Game Master', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Player opens same room → sees GM's seat as Online
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.expectVisible()
    await playerSeat.expectSeatOnline('Game Master')

    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })

  test('seat becomes available after user leaves', async ({ browser }) => {
    const roomName = `leave-${Date.now()}`

    // GM creates room and claims a seat
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('Game Master', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Player opens the room
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.expectSeatOnline('Game Master')

    // GM leaves the seat
    await gmRoom.leaveSeat()

    // Player should see the seat become available
    await playerSeat.expectSeatAvailable('Game Master')

    // Player can now claim the freed seat
    await playerSeat.claimSeat('Game Master')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })

  test('seat becomes available after user disconnects', async ({ browser }) => {
    const roomName = `disconnect-${Date.now()}`

    // GM creates room and claims a seat
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('Game Master', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Player opens the room, sees seat as Online
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.expectSeatOnline('Game Master')

    // GM disconnects (close the page)
    await gmPage.close()

    // Player should see the seat become available
    await playerSeat.expectSeatAvailable('Game Master')

    await playerPage.close()
    await playerCtx.close()
  })
})
