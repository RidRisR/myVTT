import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Archive Save & Load', () => {
  test.skip('save tactical state to archive, delete token, then restore from archive', async ({
    page,
  }) => {
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

    // Enter tactical mode
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Create a token
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

    // ── Step 1: Create archive, activate, and save (1 token) ──

    await room.gmSidebar.openArchives()
    await page.getByTitle('新建存档').click()
    await expect(page.getByText('存档 1')).toBeVisible({ timeout: 5_000 })

    // Select and activate the archive
    await page.getByText('存档 1').click()
    await page.getByTitle('激活存档').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.tacticalInfo?.activeArchiveId != null
      },
      null,
      { timeout: 10_000 },
    )

    // Save current state (1 token) to the archive
    await page.getByTitle('保存当前战斗状态到存档').click()
    await page.waitForTimeout(500)

    // Capture the archive ID for later
    const archiveId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.activeArchiveId
    })
    expect(archiveId).toBeTruthy()

    // ── Step 2: Delete the token (change the state) ──

    await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const tokens = store?.tacticalInfo?.tokens ?? []
      if (tokens.length > 0) {
        void store.deleteToken(tokens[0].id)
      }
    })

    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 0
      },
      null,
      { timeout: 10_000 },
    )

    // ── Step 3: Load the saved archive — should restore the 1 token ──
    // The archive is already active, so the UI "激活" button won't appear.
    // Call loadArchive directly via the store — tests the actual API restore path.

    await page.evaluate((id: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      void store.loadArchive(id)
    }, archiveId as string)

    // Wait for token count to return to 1
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )

    // Verify final state
    const finalState = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return {
        tokenCount: store?.tacticalInfo?.tokens?.length ?? 0,
        activeArchiveId: store?.tacticalInfo?.activeArchiveId,
        tacticalMode: store?.tacticalInfo?.tacticalMode,
      }
    })
    expect(finalState.tokenCount).toBe(1)
    expect(finalState.activeArchiveId).toBeTruthy()
    expect(finalState.tacticalMode).toBe(1)
  })
})
