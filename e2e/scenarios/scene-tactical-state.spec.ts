import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Scene Tactical State', () => {
  test('tokens persist after scene switch and return', async ({ page }) => {
    const roomName = `scene-persist-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Enter tactical -> create 1 token
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()

    // Wait for token to appear
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )

    // Exit tactical
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()

    // Record the initial scene's activeSceneId
    const originalSceneId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.room?.activeSceneId
    })

    // Open scene list -> create "Scene 2" -> select it
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.renameScene('New Scene', 'Scene 2')
    await room.scenes.selectScene('Scene 2')

    // Wait for active scene to change
    await page.waitForFunction(
      (origId: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.room?.activeSceneId !== origId
      },
      originalSceneId as string,
      { timeout: 10_000 },
    )

    // Select back to first scene
    const firstSceneName = await page.evaluate((origId: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const scene = store?.scenes?.find((s: any) => s.id === origId)
      return scene?.name
    }, originalSceneId as string)

    await room.scenes.selectScene(firstSceneName as string)

    // Wait for active scene to return to original
    await page.waitForFunction(
      (origId: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.room?.activeSceneId === origId
      },
      originalSceneId as string,
      { timeout: 10_000 },
    )

    // Enter tactical again
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Verify tokens persisted (still 1 token)
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )
  })

  test('different scenes have independent tactical state', async ({ page }) => {
    const roomName = `scene-independent-${Date.now()}`

    // Setup: create room, join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Record Scene 1 id
    const scene1Id = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.room?.activeSceneId
    })

    // Scene 1: enter tactical -> create 2 tokens
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()

    // Create first token
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

    // Create second token (right-click center again)
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 2
      },
      null,
      { timeout: 10_000 },
    )

    // Exit tactical
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()

    // Create Scene 2 and switch to it
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.renameScene('New Scene', 'Scene 2')
    await room.scenes.selectScene('Scene 2')

    // Wait for active scene to change
    await page.waitForFunction(
      (origId: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.room?.activeSceneId !== origId
      },
      scene1Id as string,
      { timeout: 10_000 },
    )

    // Scene 2: enter tactical -> create 1 token
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

    // Exit tactical
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()

    // Re-open scene list (may have closed after combat exit) and switch back to Scene 1
    await room.scenes.openSceneList()
    const scene1Name = await page.evaluate((s1Id: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const scene = store?.scenes?.find((s: any) => s.id === s1Id)
      return scene?.name
    }, scene1Id as string)

    await room.scenes.selectScene(scene1Name as string)
    await page.waitForFunction(
      (s1Id: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.room?.activeSceneId === s1Id
      },
      scene1Id as string,
      { timeout: 10_000 },
    )

    // Enter tactical -> verify 2 tokens
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 2
      },
      null,
      { timeout: 10_000 },
    )

    // Exit -> switch to Scene 2 -> enter tactical -> verify 1 token
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()
    await room.scenes.openSceneList()
    await room.scenes.selectScene('Scene 2')
    await page.waitForFunction(
      (s1Id: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.room?.activeSceneId !== s1Id
      },
      scene1Id as string,
      { timeout: 10_000 },
    )

    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) === 1
      },
      null,
      { timeout: 10_000 },
    )
  })
})
