// e2e/scenarios/admin-presence.spec.ts
// E2E tests: admin page is purely socket-driven — no REST polling,
// real-time presence dots, and live room list updates across sessions.
import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'

test.describe('Admin Socket Presence', () => {
  test('admin page makes zero GET /api/rooms requests', async ({ page }) => {
    const getCount: number[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/rooms') && req.method() === 'GET') {
        getCount.push(Date.now())
      }
    })

    const admin = new AdminPage(page)
    await admin.goto()
    // Wait until the rooms panel header is visible — snapshot has arrived
    await expect(page.locator('text=Rooms (')).toBeVisible()

    // No REST polling — room list is delivered entirely via socket snapshot
    expect(getCount.length).toBe(0)
  })

  test('presence dot appears when a player claims a seat', async ({ browser }) => {
    const roomName = `e2e-dot-${Date.now()}`

    // Admin context: stays on admin page the whole time
    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()
    const admin = new AdminPage(adminPage)
    await admin.goto()
    await admin.createRoom(roomName)

    // Get the room URL from the Enter link (#room=<id>)
    const roomHref = await admin.getRoomUrl(roomName)
    const roomUrl = adminPage.url().replace(/#.*/, '') + roomHref

    // Player context: joins the room and claims a seat
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(roomUrl)
    const seat = new SeatSelectPage(playerPage)
    await seat.createAndJoin('Fighter', 'PL')

    // Admin page should receive room:presence and show a color dot
    await admin.expectPresenceDot(roomName)

    // Player disconnects → dot should disappear
    await playerPage.close()
    await admin.expectNoPresenceDots(roomName)

    await adminPage.close()
    await adminCtx.close()
    await playerCtx.close()
  })

  test('room appears in real-time on a second admin page when created', async ({ browser }) => {
    // Two admin pages open at the same time
    const ctx1 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const admin1 = new AdminPage(page1)
    await admin1.goto()
    await expect(page1.locator('text=Rooms (')).toBeVisible()

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    const admin2 = new AdminPage(page2)
    await admin2.goto()

    const newRoom = `rt-created-${Date.now()}`
    await admin2.createRoom(newRoom)

    // admin1 should receive room:created and show the room without any reload
    await admin1.expectRoomExists(newRoom)

    await page1.close()
    await page2.close()
    await ctx1.close()
    await ctx2.close()
  })

  test('room disappears in real-time on a second admin page when deleted', async ({ browser }) => {
    const roomName = `rt-deleted-${Date.now()}`

    // Create the room via admin1
    const ctx1 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const admin1 = new AdminPage(page1)
    await admin1.goto()
    await admin1.createRoom(roomName)

    // admin2 opens and can see the room
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    const admin2 = new AdminPage(page2)
    await admin2.goto()
    await admin2.expectRoomExists(roomName)

    // admin1 deletes the room
    await admin1.deleteRoom(roomName)

    // admin2 should receive room:deleted and remove it from the list
    await admin2.expectRoomNotExists(roomName)

    await page1.close()
    await page2.close()
    await ctx1.close()
    await ctx2.close()
  })
})
