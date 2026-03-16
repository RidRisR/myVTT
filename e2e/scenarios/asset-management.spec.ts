// e2e/scenarios/asset-management.spec.ts
import { test } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'
import { createTestAssets } from '../helpers/test-assets'

const testAssets = createTestAssets()

test.describe('Asset Management', () => {
  test('Gallery: upload → set as background → Player sees it → delete', async ({ browser }) => {
    // --- GM Setup ---
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    const roomName = `gallery-test-${Date.now()}`
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('GM', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Step 1: Open Gallery tab
    await gmRoom.gmDock.openTab('gallery')

    // Step 2: Upload test-map.png
    await gmRoom.gmDock.gallery.uploadImage(testAssets.mapPath)

    // Step 3: Assert asset visible in grid (name includes extension)
    await gmRoom.gmDock.gallery.expectAssetVisible('test-map.png')

    // Step 4: Set as scene background
    await gmRoom.gmDock.gallery.setAsSceneBackground('test-map.png')

    // Step 5: Verify background is set via store bridge
    // Note: activeScene is a derived value — must compute from room.activeSceneId + scenes array
    await gmPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.atmosphere?.imageUrl != null
      },
      null,
      { timeout: 10_000 },
    )

    // --- Player Setup ---
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Fighter', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // Step 6: Player verifies background is set
    await playerPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.atmosphere?.imageUrl != null
      },
      null,
      { timeout: 10_000 },
    )

    // Step 7: Re-open Gallery tab (dock may have collapsed)
    await gmRoom.gmDock.openTab('gallery')

    // Step 8: Delete the asset
    await gmRoom.gmDock.gallery.deleteAsset('test-map.png')

    // Step 9: Assert asset gone
    await gmRoom.gmDock.gallery.expectAssetNotVisible('test-map.png')

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })

  test('Blueprint: upload → spawn on map → Player sees token → delete', async ({ browser }) => {
    // --- GM Setup ---
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    const roomName = `blueprint-test-${Date.now()}`
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('GM', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    // Step 1: Enter tactical mode
    await gmRoom.gmDock.enterCombat()
    await gmRoom.tactical.expectVisible()

    // Step 2: Open Blueprint tab (蓝图)
    await gmRoom.gmDock.openTab('tokens')

    // Step 3: Upload test-token.png (pass expected name for upload-complete wait)
    await gmRoom.gmDock.blueprint.uploadToken(testAssets.tokenPath, 'test-token')

    // Step 4: Assert token visible (name without extension — already verified by uploadToken)
    await gmRoom.gmDock.blueprint.expectTokenVisible('test-token')

    // Step 5: Spawn on map
    await gmRoom.gmDock.blueprint.spawnOnMap('test-token')

    // Step 6: Verify token exists on map via store bridge
    await gmPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // --- Player Setup ---
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(gmPage.url())
    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.createAndJoin('Mage', 'PL')
    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()

    // Step 7: Player sees tactical canvas
    await playerRoom.tactical.expectVisible()

    // Step 8: Player verifies token exists
    await playerPage.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Step 9: Re-open Blueprint tab (dock may have collapsed)
    await gmRoom.gmDock.openTab('tokens')

    // Step 10: Delete the blueprint via hover X button
    await gmRoom.gmDock.blueprint.deleteToken('test-token')

    // Step 11: Assert blueprint gone from list
    await gmRoom.gmDock.blueprint.expectTokenNotVisible('test-token')

    // Cleanup
    await gmPage.close()
    await playerPage.close()
    await playerCtx.close()
  })
})
