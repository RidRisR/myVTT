import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class SeatSelectPage {
  readonly page: Page
  readonly heading: Locator
  readonly createSeatButton: Locator
  readonly nameInput: Locator
  readonly joinButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'Join Session' })
    this.createSeatButton = page.getByRole('button', { name: 'Create New Seat' })
    this.nameInput = page.getByPlaceholder('Your character name')
    this.joinButton = page.getByRole('button', { name: 'Join' })
  }

  async expectVisible() {
    await expect(this.heading).toBeVisible()
  }

  async createAndJoin(name: string, role: 'GM' | 'PL') {
    await this.heading.waitFor({ timeout: 10_000 })
    await this.createSeatButton.click()
    await this.nameInput.fill(name)
    await this.page.getByRole('button', { name: role }).click()
    await this.joinButton.click()
    // Wait for SeatSelect to disappear (room loads)
    await expect(this.heading).toBeHidden({ timeout: 10_000 })
  }

  async claimSeat(name: string) {
    await this.page.getByRole('button', { name }).click()
    await expect(this.heading).toBeHidden({ timeout: 10_000 })
  }

  async expectSeatVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible()
  }

  async expectSeatOnline(name: string) {
    // Find the seat button containing this name, then check for "Online" badge.
    // Use locator filter (not getByRole name) because accessible name includes all child text.
    // Allow extra time for Socket.io awareness propagation between browser contexts.
    const seatButton = this.page.getByRole('button').filter({ hasText: name }).first()
    await expect(seatButton.getByText('Online')).toBeVisible({ timeout: 10_000 })
  }

  async expectSeatAvailable(name: string) {
    // Seat should be visible, enabled, and NOT show "Online" badge.
    const seatButton = this.page.getByRole('button').filter({ hasText: name }).first()
    await expect(seatButton).toBeVisible({ timeout: 10_000 })
    await expect(seatButton).toBeEnabled()
    await expect(seatButton.getByText('Online')).toBeHidden()
  }
}
