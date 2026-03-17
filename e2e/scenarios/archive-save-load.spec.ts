import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Archive Save & Load', () => {
  test('save-as-new captures current state, load restores it', async ({ page }) => {
    const roomName = `archive-e2e-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Enter tactical mode + create a token
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )

    // ── Step 1: Save as new archive (captures 1 token) ──
    await room.gmSidebar.openArchives()
    await page.getByTitle('存为新档').click()
    await expect(page.getByText('存档 1')).toBeVisible({ timeout: 5_000 })

    // ── Step 2: Delete the token ──
    await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const tokens = store?.tacticalInfo?.tokens ?? []
      if (tokens.length > 0) void store.deleteToken(tokens[0].id)
    })
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 0,
      null,
      { timeout: 10_000 },
    )

    // ── Step 3: Load the archive → restore 1 token ──
    await page.getByText('存档 1').click()
    await page.getByTitle('加载存档').click()
    // Confirm the load in the popover
    await page.getByText('确认').click()

    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 1,
      null,
      { timeout: 10_000 },
    )

    const finalState = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return {
        tokenCount: store?.tacticalInfo?.tokens?.length ?? 0,
        tacticalMode: store?.tacticalInfo?.tacticalMode,
      }
    })
    expect(finalState.tokenCount).toBe(1)
    expect(finalState.tacticalMode).toBe(1)
  })

  test('can load the same archive repeatedly', async ({ page }) => {
    const roomName = `archive-reload-${Date.now()}`

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
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 1,
      null,
      { timeout: 10_000 },
    )

    // Save as new
    await room.gmSidebar.openArchives()
    await page.getByTitle('存为新档').click()
    await expect(page.getByText('存档 1')).toBeVisible({ timeout: 5_000 })

    // Delete token
    await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      void store.deleteToken(store.tacticalInfo.tokens[0].id)
    })
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 0,
      null,
      { timeout: 10_000 },
    )

    // Load first time
    await page.getByText('存档 1').click()
    await page.getByTitle('加载存档').click()
    await page.getByText('确认').click()
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 1,
      null,
      { timeout: 10_000 },
    )

    // Delete token again
    await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      void store.deleteToken(store.tacticalInfo.tokens[0].id)
    })
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 0,
      null,
      { timeout: 10_000 },
    )

    // Load SECOND time — validates the original bug is fixed
    await page.getByText('存档 1').click()
    await page.getByTitle('加载存档').click()
    await page.getByText('确认').click()
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 1,
      null,
      { timeout: 10_000 },
    )

    const tokenCount = await page.evaluate(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length,
    )
    expect(tokenCount).toBe(1)
  })

  test('overwrite updates existing archive', async ({ page }) => {
    const roomName = `archive-overwrite-${Date.now()}`

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

    // Create 1 token, save as new archive
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 1,
      null,
      { timeout: 10_000 },
    )
    await room.gmSidebar.openArchives()
    await page.getByTitle('存为新档').click()
    await expect(page.getByText('存档 1')).toBeVisible({ timeout: 5_000 })

    // Create a second token (now 2 tokens on battlefield)
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 2,
      null,
      { timeout: 10_000 },
    )

    // Select archive and overwrite (now archive has 2 tokens)
    await page.getByText('存档 1').click()
    await page.getByTitle('覆盖存档').click()
    await page.waitForTimeout(500)

    // Delete all tokens
    await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      for (const t of store.tacticalInfo.tokens) void store.deleteToken(t.id)
    })
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 0,
      null,
      { timeout: 10_000 },
    )

    // Load archive — should restore 2 tokens (the overwritten version)
    await page.getByText('存档 1').click()
    await page.getByTitle('加载存档').click()
    await page.getByText('确认').click()
    await page.waitForFunction(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length === 2,
      null,
      { timeout: 10_000 },
    )

    const tokenCount = await page.evaluate(
      () => (window as any).__MYVTT_STORES__?.world()?.tacticalInfo?.tokens?.length,
    )
    expect(tokenCount).toBe(2)
  })
})
