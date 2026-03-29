import { test, expect } from '@playwright/test'
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

test.describe('Cross-client judgment and groupId', () => {
  const roomName = `judgment-e2e-${Date.now()}`

  test('Player sees judgment when GM rolls .dd', async ({ browser }) => {
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

    // GM rolls .dd (Daggerheart action check)
    await gmRoom.chat.expandChat()
    await gmRoom.chat.sendMessage('.dd 2d12+3')

    // GM sees judgment card
    await gmRoom.chat.expectJudgmentVisible()

    // Player ALSO sees judgment card (this is the key Sprint 2 feature)
    await playerRoom.chat.expandChat()
    await playerRoom.chat.expectJudgmentVisible()

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })

  test('toast appears when chat is collapsed and message arrives', async ({ browser }) => {
    // Setup: GM creates room and joins
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    const toastRoom = `toast-e2e-${Date.now()}`
    await admin.createRoom(toastRoom)
    await admin.enterRoom(toastRoom)
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

    // Player's chat starts collapsed (default state).
    // Ensure it is collapsed — collapseChat() is a safe no-op if already collapsed.
    await playerRoom.chat.collapseChat()

    // GM expands chat and sends a message
    await gmRoom.chat.expandChat()
    await gmRoom.chat.sendMessage('Hello from GM')

    // Player should see a toast notification with the message text.
    // ToastStack renders LogEntryCard → TextEntryRenderer with data-testid="entry-text".
    // The toast appears as a fixed overlay when chat is collapsed.
    await expect(
      playerPage.getByTestId('entry-text').filter({ hasText: 'Hello from GM' }).first(),
    ).toBeVisible({ timeout: 5000 })

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })

  test('entries from same workflow share groupId', async ({ page }) => {
    // Setup: create room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    const groupRoom = `groupid-e2e-${Date.now()}`
    await admin.createRoom(groupRoom)
    await admin.enterRoom(groupRoom)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Expand chat and roll
    await room.chat.expandChat()
    await room.chat.sendMessage('.dd 2d12+3')

    // Wait for judgment to appear (ensures all entries are in store)
    await room.chat.expectJudgmentVisible()

    // Verify groupId in store: roll-result and dh:judgment should share the same groupId
    const groupCheck = await page.waitForFunction(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      if (!store?.logEntries?.length) return null

      const entries = store.logEntries
      const rollEntry = entries.find((e: any) => e.type === 'core:roll-result')
      const judgmentEntry = entries.find((e: any) => e.type === 'dh:judgment')

      if (!rollEntry || !judgmentEntry) return null

      return {
        rollGroupId: rollEntry.groupId,
        judgmentGroupId: judgmentEntry.groupId,
        match: rollEntry.groupId === judgmentEntry.groupId,
        notEmpty: rollEntry.groupId != null && rollEntry.groupId !== '',
      }
    }, { timeout: 10000 })

    const result = await groupCheck.jsonValue()
    expect(result.match).toBe(true)
    expect(result.notEmpty).toBe(true)
  })
})
