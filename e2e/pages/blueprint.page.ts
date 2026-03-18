// e2e/pages/blueprint.page.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class BlueprintPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Upload a token image via hidden file input. Waits for a new token to appear in the grid. */
  async uploadToken(filePath: string, expectedName: string) {
    const fileInput = this.page.locator('input[type="file"][accept="image/*"]')
    await fileInput.setInputFiles(filePath)
    // Wait for the uploaded token name to appear in the blueprint list
    await expect(this.page.locator('span').filter({ hasText: expectedName }).first()).toBeVisible({
      timeout: 15_000,
    })
  }

  /** Assert a token blueprint with the given name is visible */
  async expectTokenVisible(name: string) {
    await expect(
      this.page.locator('.rounded-full').locator('..').filter({ hasText: name }),
    ).toBeVisible({
      timeout: 10_000,
    })
  }

  /** Assert a token blueprint with the given name is NOT visible */
  async expectTokenNotVisible(name: string) {
    await expect(this.page.locator('span').filter({ hasText: name }).first()).toBeHidden({
      timeout: 10_000,
    })
  }

  /** Right-click on a token to open context menu, then click an item */
  async rightClickToken(name: string) {
    const tokenContainer = this.page
      .locator('.rounded-full')
      .locator('..')
      .filter({ hasText: name })
    await tokenContainer.click({ button: 'right' })
  }

  /** Right-click token → "Spawn on map" (must be in tactical mode) */
  async spawnOnMap(name: string) {
    await this.rightClickToken(name)
    await this.page.getByTestId('ctx-spawn-on-map').click()
  }

  /** Hover over token → click the X delete button (aria-label="Delete blueprint") */
  async deleteToken(name: string) {
    const tokenContainer = this.page
      .locator('.rounded-full')
      .locator('..')
      .filter({ hasText: name })
    await tokenContainer.hover()
    await this.page.getByLabel('Delete blueprint').click()
  }
}
