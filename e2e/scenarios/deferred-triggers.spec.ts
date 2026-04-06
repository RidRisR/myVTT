import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Deferred workflow triggers (seat claim timing)', () => {
  test('new user enters DH room without "No seat claimed" error, Fear entity created after seat claim', async ({
    browser,
  }) => {
    const roomName = `deferred-triggers-${Date.now()}`

    // Use a fresh browser context (no sessionStorage = new user)
    const context = await browser.newContext()
    const page = await context.newPage()

    // Capture all console errors
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(msg.text())
      }
    })

    // Create DH room via admin
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    // At this point, SeatSelect should be visible — no seat claimed yet.
    // The old bug would fire startWorkflowTriggers here, causing "No seat claimed".
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()

    // Verify no "No seat claimed" errors occurred before seat selection
    const preSeatErrors = consoleErrors.filter((e) => e.includes('No seat claimed'))
    expect(preSeatErrors).toHaveLength(0)

    // Now claim a seat — this should trigger workflow initialization
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Wait for Fear entity to be created by DH plugin onReady
    // (proof that startWorkflowTriggers ran successfully after seat claim)
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return !!store?.entities?.['daggerheart-core:fear']
      },
      null,
      { timeout: 10_000 },
    )

    // Verify Fear entity has the expected component
    const fearEntity = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const entity = store?.entities?.['daggerheart-core:fear']
      return {
        exists: !!entity,
        hasTracker: !!entity?.components?.['daggerheart-core:fear-tracker'],
      }
    })
    expect(fearEntity.exists).toBe(true)
    expect(fearEntity.hasTracker).toBe(true)

    // Final check: still no "No seat claimed" errors in the entire session
    const allSeatErrors = consoleErrors.filter((e) => e.includes('No seat claimed'))
    expect(allSeatErrors).toHaveLength(0)

    // Cleanup
    await page.close()
    await context.close()
  })

  test('returning user (cached seat) triggers start immediately', async ({ browser }) => {
    const roomName = `cached-seat-${Date.now()}`

    // First visit: create room and claim seat (populates sessionStorage)
    const context = await browser.newContext()
    const page = await context.newPage()
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Wait for Fear entity (first visit)
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return !!store?.entities?.['daggerheart-core:fear']
      },
      null,
      { timeout: 10_000 },
    )

    // Capture the room URL for revisit
    const roomUrl = page.url()

    // Second visit: reload the page (sessionStorage has cached seatId)
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(msg.text())
      }
    })
    await page.goto(roomUrl)
    await room.expectInRoom()

    // Fear entity should exist (triggers ran on auto-claim path)
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return !!store?.entities?.['daggerheart-core:fear']
      },
      null,
      { timeout: 10_000 },
    )

    // No "No seat claimed" errors on revisit either
    const seatErrors = consoleErrors.filter((e) => e.includes('No seat claimed'))
    expect(seatErrors).toHaveLength(0)

    // Cleanup
    await page.close()
    await context.close()
  })
})
