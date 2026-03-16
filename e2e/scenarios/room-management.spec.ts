import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'

test.describe('Room Management', () => {
  test('create a room and see it in the list', async ({ page }) => {
    const roomName = `create-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.expectRoomExists(roomName)
  })

  test('empty name shows error', async ({ page }) => {
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createButton.click()
    await admin.expectError('Room name is required')
  })

  test('enter room navigates to seat select', async ({ page }) => {
    const roomName = `enter-${Date.now()}`
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    await expect(page.getByRole('heading', { name: 'Join Session' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('delete room removes it from list', async ({ page }) => {
    const admin = new AdminPage(page)
    await admin.goto()
    const deleteName = `delete-${Date.now()}`
    await admin.createRoom(deleteName)
    await admin.expectRoomExists(deleteName)
    await admin.deleteRoom(deleteName)
    await admin.expectRoomNotExists(deleteName)
  })
})
