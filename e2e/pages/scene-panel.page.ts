import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class ScenePanelPage {
  readonly page: Page
  readonly scenesButton: Locator

  constructor(page: Page) {
    this.page = page
    this.scenesButton = page.getByRole('button', { name: 'Scenes' })
  }

  async openSceneList() {
    await this.scenesButton.click()
    // Wait for scene list panel header to appear
    await expect(
      this.page.locator('.text-sm.font-semibold').filter({ hasText: 'Scenes' }),
    ).toBeVisible()
  }

  async createScene() {
    // The create button is a dashed-border div, distinct from scene name spans
    await this.page.locator('.border-dashed', { hasText: 'New Scene' }).click()
  }

  async selectScene(name: string) {
    // Click the scene name span (not buttons)
    await this.page.locator('[title="Double-click to rename"]', { hasText: name }).click()
  }

  async renameScene(oldName: string, newName: string) {
    // Double-click the scene name span (has title attribute) to trigger inline edit
    const nameSpan = this.page.locator('[title="Double-click to rename"]', { hasText: oldName })
    await nameSpan.dblclick()
    const input = this.page.locator('input.text-xs')
    await input.waitFor({ timeout: 3000 })
    await input.fill(newName)
    await input.press('Enter')
  }

  async deleteScene(name: string) {
    // Find scene name span, then walk up to its card container (.group)
    const nameSpan = this.page.locator('[title="Double-click to rename"]', { hasText: name })
    const sceneCard = nameSpan.locator('xpath=ancestor::div[contains(@class, "group")]')
    await sceneCard.hover()
    await sceneCard.getByTitle('Delete scene').click()
    // Confirm deletion via ConfirmPopover (exact match avoids "Delete scene" buttons)
    await this.page.getByRole('button', { name: 'Delete', exact: true }).click()
  }

  async expectSceneExists(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible()
  }

  async expectSceneNotExists(name: string) {
    await expect(this.page.getByText(name)).toBeHidden()
  }
}
