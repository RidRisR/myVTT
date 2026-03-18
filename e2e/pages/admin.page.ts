import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class AdminPage {
  readonly page: Page
  readonly heading: Locator
  readonly roomNameInput: Locator
  readonly createButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByTestId('admin-heading')
    this.roomNameInput = page.getByTestId('room-name-input')
    this.createButton = page.getByTestId('create-room-btn')
  }

  async goto() {
    await this.page.goto('/#admin')
    await this.heading.waitFor()
  }

  async createRoom(name: string) {
    await this.roomNameInput.fill(name)
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/rooms') && resp.request().method() === 'POST',
    )
    await this.createButton.click()
    await responsePromise
    // Optimistic update renders the room immediately after POST response
    await this.page
      .locator('.text-sm.font-semibold', { hasText: name })
      .first()
      .waitFor({ timeout: 10_000 })
  }

  /**
   * Get the room row by locating the exact room-name element,
   * then walking up to the row container that also has Enter/Delete buttons.
   */
  private roomRow(name: string): Locator {
    // The room name is in a .text-sm.font-semibold div inside the row
    // The row is the nearest ancestor that contains Enter/Delete/Copy Link
    return this.page
      .locator('.text-sm.font-semibold', { hasText: name })
      .first()
      .locator('xpath=ancestor::div[contains(@class, "flex items-center gap-3")]')
  }

  async enterRoom(name: string) {
    const row = this.roomRow(name)
    await row.getByTestId('enter-room').click()
  }

  async deleteRoom(name: string) {
    this.page.once('dialog', (dialog) => void dialog.accept())
    const row = this.roomRow(name)
    await row.getByTestId('delete-room').click()
    // Wait for the room name to disappear
    await expect(this.page.locator('.text-sm.font-semibold', { hasText: name })).toBeHidden({
      timeout: 5000,
    })
  }

  async expectRoomExists(name: string) {
    await expect(
      this.page.locator('.text-sm.font-semibold', { hasText: name }).first(),
    ).toBeVisible()
  }

  async expectRoomNotExists(name: string) {
    await expect(this.page.locator('.text-sm.font-semibold', { hasText: name })).toBeHidden()
  }

  async expectError(text: string) {
    await expect(this.page.getByText(text)).toBeVisible()
  }

  /** Returns the href of the Enter link for a room, e.g. "#room=abc123" */
  async getRoomUrl(name: string): Promise<string> {
    const href = await this.roomRow(name).getByTestId('enter-room').getAttribute('href')
    return href ?? ''
  }

  /** Waits for at least one presence dot to appear in the room row. */
  async expectPresenceDot(name: string) {
    await expect(this.roomRow(name).locator('.w-2.h-2.rounded-full').first()).toBeVisible({
      timeout: 8_000,
    })
  }

  /** Waits for all presence dots to disappear from the room row. */
  async expectNoPresenceDots(name: string) {
    await expect(this.roomRow(name).locator('.w-2.h-2.rounded-full').first()).toBeHidden({
      timeout: 8_000,
    })
  }
}
