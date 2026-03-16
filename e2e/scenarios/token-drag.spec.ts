import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'
import {
  getTokenPosition,
  getTokenScreenPosition,
  getTokenRadius,
  dragOnCanvas,
  getGridSettings,
} from '../helpers/canvas-helpers'

test.describe('Token Drag', () => {
  test('drag token updates store position', async ({ page }) => {
    const roomName = `token-drag-${Date.now()}`

    // Setup: create room, join as GM, enter combat
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Right-click canvas center to open context menu, then create token
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()

    // Wait for token to appear in store
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Record initial position
    const origPos = await getTokenPosition(page, 0)

    // Get screen position (top-left) and offset to center for Konva hit detection
    const topLeft = await getTokenScreenPosition(page, 0, room.tactical.canvas)
    const radius = await getTokenRadius(page)
    const from = { x: topLeft.x + radius, y: topLeft.y + radius }
    await dragOnCanvas(page, from, { x: from.x + 100, y: from.y + 80 })

    // Wait for position to change in store
    await page.waitForFunction(
      ({ origX, origY }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const token = store?.tacticalInfo?.tokens?.[0]
        if (!token) return false
        return token.x !== origX || token.y !== origY
      },
      { origX: origPos.x, origY: origPos.y },
      { timeout: 10_000 },
    )
  })

  test('grid snap aligns token to grid', async ({ page }) => {
    const roomName = `token-snap-${Date.now()}`

    // Setup: create room, join as GM, enter combat
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Create token via context menu
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()

    // Wait for token to appear
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Get grid settings and record initial position
    const grid = await getGridSettings(page)
    const origPos = await getTokenPosition(page, 0)

    // Get screen position (top-left) and offset to center for Konva hit detection
    const topLeft = await getTokenScreenPosition(page, 0, room.tactical.canvas)
    const radius = await getTokenRadius(page)
    const from = { x: topLeft.x + radius, y: topLeft.y + radius }
    await dragOnCanvas(page, from, { x: from.x + 73, y: from.y + 28 })

    // Wait for token to actually move (not just be at initial position)
    // then verify it snapped to grid
    await page.waitForFunction(
      ({ gridSize, offsetX, offsetY, origX, origY }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const token = store?.tacticalInfo?.tokens?.[0]
        if (!token) return false
        const moved = token.x !== origX || token.y !== origY
        const snapped = (token.x - offsetX) % gridSize === 0 && (token.y - offsetY) % gridSize === 0
        return moved && snapped
      },
      {
        gridSize: grid.size,
        offsetX: grid.offsetX,
        offsetY: grid.offsetY,
        origX: origPos.x,
        origY: origPos.y,
      },
      { timeout: 10_000 },
    )
  })

  test('player sees token position after GM drag', async ({ browser }) => {
    const roomName = `token-sync-${Date.now()}`

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

    await gmRoom.gmDock.enterCombat()
    await gmRoom.tactical.expectVisible()

    // Create token
    await gmRoom.tactical.rightClickCenter()
    await gmPage.getByText('Create Token').click()

    // Wait for token in GM store
    await gmPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // --- Player Setup ---
    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Player', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // Player waits for token to appear
    await playerPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // GM records initial position and drags token (offset to token center)
    const origPos = await getTokenPosition(gmPage, 0)
    const topLeft = await getTokenScreenPosition(gmPage, 0, gmRoom.tactical.canvas)
    const radius = await getTokenRadius(gmPage)
    const from = { x: topLeft.x + radius, y: topLeft.y + radius }
    await dragOnCanvas(gmPage, from, { x: from.x + 100, y: from.y + 80 })

    // GM waits for position change
    await gmPage.waitForFunction(
      ({ origX, origY }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const token = store?.tacticalInfo?.tokens?.[0]
        if (!token) return false
        return token.x !== origX || token.y !== origY
      },
      { origX: origPos.x, origY: origPos.y },
      { timeout: 10_000 },
    )

    // Record GM's final position
    const finalPos = await getTokenPosition(gmPage, 0)

    // Player waits for position to match GM's final position
    await playerPage.waitForFunction(
      ({ finalX }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const token = store?.tacticalInfo?.tokens?.[0]
        if (!token) return false
        return token.x === finalX
      },
      { finalX: finalPos.x },
      { timeout: 10_000 },
    )

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await gmContext.close()
    await playerContext.close()
  })
})
