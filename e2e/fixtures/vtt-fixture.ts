/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures, not React hooks */
import { test as base, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'

/**
 * Custom fixture that creates a fresh room and joins as GM.
 * Each test using `gmPage` gets an isolated room.
 */
export const test = base.extend<{
  /** A page already inside a room as GM, past SeatSelect */
  gmPage: ReturnType<typeof base.extend> extends never ? never : Awaited<void>
  /** The room ID created for this test */
  roomId: string
  /** Admin page object for room management */
  adminPage: AdminPage
}>({
  // eslint-disable-next-line no-empty-pattern
  roomId: async ({}, use) => {
    // Generate unique room name per test run
    const id = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await use(id)
  },

  adminPage: async ({ page }, use) => {
    const admin = new AdminPage(page)
    await use(admin)
  },

  gmPage: async ({ page, roomId, adminPage }, use) => {
    // 1. Create room via admin UI
    await adminPage.goto()
    await adminPage.createRoom(roomId)

    // 2. Enter room
    await adminPage.enterRoom(roomId)

    // 3. Wait for SeatSelect to appear
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.expectVisible()

    // 4. Create GM seat and join
    await seatSelect.createAndJoin('Test GM', 'GM')

    // 5. Wait for room to fully load
    await expect(page.getByText('Connecting to server...')).toBeHidden({ timeout: 15_000 })

    await use()
  },
})

export { expect } from '@playwright/test'
