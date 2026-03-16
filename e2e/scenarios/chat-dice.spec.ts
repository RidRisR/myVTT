import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Chat and Dice', () => {
  const roomName = `chat-dice-${Date.now()}`

  test('send messages and roll dice', async ({ page }) => {
    // Setup: create room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('Test GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Expand chat
    await room.chat.expandChat()

    // Send a text message
    await room.chat.sendMessage('Roll for initiative')
    await room.chat.expectMessageVisible('Roll for initiative')

    // Roll dice with .r command
    await room.chat.sendMessage('.r 1d20')
    await room.chat.expectMessageVisible('1d20')

    // Roll dice with formula
    await room.chat.sendMessage('.r 2d6+3')
    await room.chat.expectMessageVisible('2d6+3')
  })
})
