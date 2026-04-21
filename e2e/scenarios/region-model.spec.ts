/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions guard against null before ! usage */
import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

// All region-model tests use daggerheart rooms because generic rooms have no
// persistent regions. The fear-panel is the simplest always-visible region.
const REGION_SELECTOR = '[data-region="daggerheart-core:fear-panel"]'
const REGION_LABEL = 'daggerheart-core:fear-panel'

test.describe('Region Model', () => {
  test('persistent region renders with correct data attributes and size', async ({ page }) => {
    const roomName = `region-render-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()
    await seatSelect.createAndJoin('GM Render', 'GM')

    const room = new RoomPage(page)
    await room.expectInRoom()

    // Region container should exist with correct data attributes
    const region = page.locator(REGION_SELECTOR)
    await expect(region).toBeVisible({ timeout: 10_000 })

    // Verify accessibility attributes
    await expect(region).toHaveAttribute('role', 'region')
    await expect(region).toHaveAttribute('aria-label', REGION_LABEL)

    // Verify it has non-zero size (actually rendered, not collapsed)
    const box = await region.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('edit mode shows drag and resize handles', async ({ page }) => {
    const roomName = `region-edit-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()
    await seatSelect.createAndJoin('GM Edit', 'GM')

    const room = new RoomPage(page)
    await room.expectInRoom()

    const region = page.locator(REGION_SELECTOR)
    await expect(region).toBeVisible({ timeout: 10_000 })

    // In play mode, no drag handle should exist
    await expect(region.locator('[data-drag-handle]')).toBeHidden()

    // Toggle edit mode via hamburger menu
    await page.getByTestId('hamburger-menu').click()
    const editButton = page.locator('button').filter({ hasText: /edit layout/i })
    await editButton.click()

    // Drag and resize handles should now be visible
    await expect(region.locator('[data-drag-handle]')).toBeVisible()
    await expect(region.locator('[data-resize-handle]')).toBeVisible()

    // Drag handle should have move cursor
    const cursor = await region
      .locator('[data-drag-handle]')
      .evaluate((el) => window.getComputedStyle(el).cursor)
    expect(cursor).toBe('move')
  })

  test('drag in edit mode moves region position', async ({ page }) => {
    const roomName = `region-drag-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()
    await seatSelect.createAndJoin('GM Drag', 'GM')

    const room = new RoomPage(page)
    await room.expectInRoom()

    const region = page.locator(REGION_SELECTOR)
    await expect(region).toBeVisible({ timeout: 10_000 })

    // Record initial position
    const initialBox = await region.boundingBox()
    expect(initialBox).not.toBeNull()

    // Enter edit mode (close menu afterward so popover doesn't block drag handle)
    await page.getByTestId('hamburger-menu').click()
    await page
      .locator('button')
      .filter({ hasText: /edit layout/i })
      .click()
    await page.keyboard.press('Escape')

    // Wait for drag handle to appear
    const dragHandle = region.locator('[data-drag-handle]')
    await expect(dragHandle).toBeVisible()
    const handleBox = await dragHandle.boundingBox()
    expect(handleBox).not.toBeNull()

    // Drag the region 100px right, 50px down
    const startX = handleBox!.x + handleBox!.width / 2
    const startY = handleBox!.y + handleBox!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 100, startY + 50, { steps: 5 })
    await page.mouse.up()

    // Verify position changed (±10px tolerance for rounding/clamping)
    const newBox = await region.boundingBox()
    expect(newBox).not.toBeNull()
    expect(Math.abs(newBox!.x - initialBox!.x - 100)).toBeLessThan(10)
    expect(Math.abs(newBox!.y - initialBox!.y - 50)).toBeLessThan(10)
  })

  test('position persists after toggling edit mode off', async ({ page }) => {
    const roomName = `region-persist-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()
    await seatSelect.createAndJoin('GM Persist', 'GM')

    const room = new RoomPage(page)
    await room.expectInRoom()

    const region = page.locator(REGION_SELECTOR)
    await expect(region).toBeVisible({ timeout: 10_000 })

    // Enter edit mode (close menu so popover doesn't block drag handle)
    await page.getByTestId('hamburger-menu').click()
    await page
      .locator('button')
      .filter({ hasText: /edit layout/i })
      .click()
    await page.keyboard.press('Escape')

    const dragHandle = region.locator('[data-drag-handle]')
    await expect(dragHandle).toBeVisible()
    const handleBox = await dragHandle.boundingBox()
    expect(handleBox).not.toBeNull()

    // Drag
    const startX = handleBox!.x + handleBox!.width / 2
    const startY = handleBox!.y + handleBox!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 80, startY + 60, { steps: 5 })
    await page.mouse.up()

    // Record position after drag
    const afterDragBox = await region.boundingBox()
    expect(afterDragBox).not.toBeNull()

    // Lock layout (back to play mode)
    await page.getByTestId('hamburger-menu').click()
    await page
      .locator('button')
      .filter({ hasText: /lock layout/i })
      .click()

    // Drag handle should be gone
    await expect(region.locator('[data-drag-handle]')).toBeHidden()

    // Position should be preserved (±5px tolerance)
    const afterLockBox = await region.boundingBox()
    expect(afterLockBox).not.toBeNull()
    expect(Math.abs(afterLockBox!.x - afterDragBox!.x)).toBeLessThan(5)
    expect(Math.abs(afterLockBox!.y - afterDragBox!.y)).toBeLessThan(5)
  })

  test('multiple regions render independently (daggerheart room)', async ({ page }) => {
    const roomName = `region-multi-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()
    await seatSelect.createAndJoin('GM Multi', 'GM')

    const room = new RoomPage(page)
    await room.expectInRoom()

    // Both daggerheart regions should render
    const fearPanel = page.locator('[data-region="daggerheart-core:fear-panel"]')
    const charCard = page.locator('[data-region="daggerheart-core:character-card"]')
    await expect(fearPanel).toBeVisible({ timeout: 10_000 })
    await expect(charCard).toBeVisible({ timeout: 10_000 })

    // Both should have role="region" (accessibility)
    await expect(fearPanel).toHaveAttribute('role', 'region')
    await expect(charCard).toHaveAttribute('role', 'region')

    // Both should have non-zero, independent bounding boxes
    const box1 = await fearPanel.boundingBox()
    const box2 = await charCard.boundingBox()
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    expect(box1!.width).toBeGreaterThan(0)
    expect(box2!.width).toBeGreaterThan(0)
  })
})
