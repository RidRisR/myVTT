/**
 * UX Journey Review — Automated screenshot capture for all user journeys.
 *
 * Run: npx playwright test e2e/scenarios/ux-review.spec.ts
 * Screenshots saved to: screenshots/ux-review/
 *
 * Each test covers multiple steps within a journey. Tests are independent —
 * each creates its own room state so failures don't cascade.
 */
import { test, type Page } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { RoomPage } from '../pages/room.page'
import { createTestAssets } from '../helpers/test-assets'

const SCREENSHOT_DIR = 'screenshots/ux-review'

let counter = 0
async function snap(page: Page, name: string) {
  counter++
  const num = String(counter).padStart(2, '0')
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${num}-${name}.png`,
    fullPage: false,
  })
}

/** Helper: create room + join as GM, return RoomPage */
async function setupGmSession(page: Page, roomSuffix: string) {
  const admin = new AdminPage(page)
  await admin.goto()
  const roomName = `ux-${roomSuffix}`
  await admin.createRoom(roomName)
  await admin.enterRoom(roomName)

  const room = new RoomPage(page)
  await room.waitForRoomLoaded()
  await room.seatSelect.expectVisible()
  await room.seatSelect.createAndJoin('Game Master', 'GM')
  await room.expectInRoom()
  return { admin, room, roomName }
}

test.describe('UX Journey Review', () => {
  // ─── Journey 1 & 2: Admin Panel + Seat Selection ─────────────────
  test('J1-J2: Landing, Admin, Seat Selection', async ({ page }) => {
    // Landing page
    const admin = new AdminPage(page)
    await admin.goto()
    await snap(page, 'admin-empty')

    // Fill room name
    await admin.roomNameInput.fill('ux-j1-room')
    await snap(page, 'admin-room-name-filled')

    // Create room
    await admin.createRoom('ux-j1-room')
    await snap(page, 'admin-room-created')

    // Enter room → seat select
    await admin.enterRoom('ux-j1-room')
    const room = new RoomPage(page)
    await room.waitForRoomLoaded()
    await room.seatSelect.expectVisible()
    await snap(page, 'seat-select-initial')

    // Open create seat form
    await room.seatSelect.createSeatButton.click()
    await snap(page, 'seat-select-create-form')

    // Fill in seat details
    await room.seatSelect.nameInput.fill('Game Master')
    await page.getByRole('button', { name: 'GM' }).click()
    await snap(page, 'seat-select-form-filled')

    // Join as GM
    await room.seatSelect.joinButton.click()
    await room.expectInRoom()
    await snap(page, 'seat-joined-gm')
  })

  // ─── Journey 3: Main Layout & Navigation ─────────────────────────
  test('J3: Main layout, hamburger menu', async ({ page }) => {
    const { room } = await setupGmSession(page, 'j3')

    // Default scene view
    await snap(page, 'main-layout-default')

    // Hamburger menu
    await room.hamburgerMenu.click()
    await page.waitForTimeout(300)
    await snap(page, 'hamburger-menu-open')

    // Close
    await page.keyboard.press('Escape')
  })

  // ─── Journey 4: Scene Mode ───────────────────────────────────────
  test('J4: Scene management & background', async ({ page }) => {
    const { room } = await setupGmSession(page, 'j4')

    // Scene list
    await room.scenes.openSceneList()
    await snap(page, 'scene-list-open')

    // Create scene
    await room.scenes.createScene()
    await page.waitForTimeout(500)
    await snap(page, 'scene-created')

    // Rename
    await room.scenes.renameScene('New Scene', 'Tavern Night')
    await page.waitForTimeout(500)
    await snap(page, 'scene-renamed')

    // Upload background via Gallery
    const { mapPath } = createTestAssets()
    await room.gmDock.openTab('gallery')
    await snap(page, 'gallery-tab')

    await room.gmDock.gallery.uploadImage(mapPath)
    await snap(page, 'gallery-image-uploaded')

    // Set as background — use the actual filename shown in the gallery
    // The alt text matches the original filename without extension
    const assetTile = page
      .locator('div[role="button"]')
      .filter({ has: page.locator('img') })
      .first()
    await assetTile.click({ button: 'right' })
    await page.getByText('Set as Scene Background').click()
    await page.waitForTimeout(1000)
    await snap(page, 'scene-with-background')
  })

  // ─── Journey 5: Character System ─────────────────────────────────
  test('J5: Character creation', async ({ page }) => {
    const { room } = await setupGmSession(page, 'j5')

    // Characters tab
    await room.gmDock.openTab('characters')
    await snap(page, 'characters-tab-empty')

    // Create character
    await room.gmDock.characterLibrary.createCharacter()
    await page.waitForTimeout(500)
    await snap(page, 'character-created')
  })

  // ─── Journey 6: Chat & Dice ──────────────────────────────────────
  test('J6: Chat & dice rolls', async ({ page }) => {
    const { room } = await setupGmSession(page, 'j6')

    // Expand chat
    await room.chat.expandChat()
    await page.waitForTimeout(300)
    await snap(page, 'chat-expanded-empty')

    // Regular message
    await room.chat.sendMessage('Welcome to the tavern!')
    await page.waitForTimeout(500)
    await snap(page, 'chat-message-sent')

    // Dice roll
    await room.chat.sendMessage('.r 2d6+3')
    await page.waitForTimeout(1000)
    await snap(page, 'chat-dice-roll')
  })

  // ─── Journey 7: Tactical Combat ──────────────────────────────────
  test('J7: Tactical mode & tokens', async ({ page }) => {
    const { room } = await setupGmSession(page, 'j7')

    // Enter combat
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await page.waitForTimeout(500)
    await snap(page, 'tactical-mode-entered')

    // Tokens tab
    await room.gmDock.openTab('tokens')
    await snap(page, 'tokens-tab')

    // Upload token
    const { tokenPath } = createTestAssets()
    await room.gmDock.blueprint.uploadToken(tokenPath, 'test-token')
    await snap(page, 'token-uploaded')

    // Spawn on map
    await room.gmDock.blueprint.spawnOnMap('test-token')
    await page.waitForTimeout(1000)
    await snap(page, 'token-spawned')

    // Right-click canvas
    await room.tactical.rightClickCenter()
    await page.waitForTimeout(300)
    await snap(page, 'tactical-context-menu')

    // Exit combat
    await page.keyboard.press('Escape') // close context menu first
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()
    await snap(page, 'tactical-exited')
  })

  // ─── Journey 8: GM Tools ─────────────────────────────────────────
  test('J8: GM Dock tabs & Sidebar', async ({ page }) => {
    const { room } = await setupGmSession(page, 'j8')

    // All dock tabs
    await room.gmDock.openTab('gallery')
    await snap(page, 'gm-dock-gallery')

    await room.gmDock.openTab('tokens')
    await snap(page, 'gm-dock-tokens')

    await room.gmDock.openTab('characters')
    await snap(page, 'gm-dock-characters')

    await room.gmDock.openTab('handouts')
    await snap(page, 'gm-dock-handouts')

    await room.gmDock.openTab('dice')
    await snap(page, 'gm-dock-dice')

    // Sidebar — entities
    await room.gmSidebar.openEntities()
    await snap(page, 'gm-sidebar-entities')

    // Create NPC
    await room.gmSidebar.entityPanel.createNpc()
    await page.waitForTimeout(500)
    await snap(page, 'gm-sidebar-npc-created')

    // Sidebar — archives
    await room.gmSidebar.openArchives()
    await snap(page, 'gm-sidebar-archives')
  })

  // ─── Journey 10: Team Dashboard ──────────────────────────────────
  test('J10: Team dashboard', async ({ page }) => {
    await setupGmSession(page, 'j10')
    // Team dashboard is visible in top-right
    await snap(page, 'team-dashboard-area')
  })

  // ─── Journey 11: Multi-client ────────────────────────────────────
  test('J11: Multi-client GM + Player', async ({ page, browser }) => {
    const { room, roomName } = await setupGmSession(page, 'j11')

    // Player in new context
    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    const playerAdmin = new AdminPage(playerPage)
    await playerAdmin.goto()
    await playerAdmin.enterRoom(roomName)

    const playerRoom = new RoomPage(playerPage)
    await playerRoom.waitForRoomLoaded()
    await playerRoom.seatSelect.expectVisible()
    await snap(playerPage, 'player-seat-select')

    // Player joins
    await playerRoom.seatSelect.createAndJoin('Adventurer', 'PL')
    await playerRoom.expectInRoom()
    await snap(playerPage, 'player-in-room')

    // GM view with player
    await page.waitForTimeout(1000) // wait for presence sync
    await snap(page, 'gm-with-player')

    await playerContext.close()
  })
})
