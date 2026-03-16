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
})
