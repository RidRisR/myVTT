import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class EntityPanelPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** The entity panel container, scoped to avoid matching Characters dock items. */
  private get panel(): Locator {
    // The EntityPanel root is <div class="flex flex-col h-full"> containing
    // both the "Search NPCs..." input and the "New NPC" button.
    // Use .last() to get the innermost matching container (not a page-level ancestor).
    return this.page
      .locator('div', {
        has: this.page.getByPlaceholder('Search NPCs...'),
        hasText: 'New NPC',
      })
      .last()
  }

  /** Locate an entity row wrapper by name text within the panel */
  private entityRow(name: string): Locator {
    // Each entity is wrapped in: <div class="group relative flex items-center">
    // which contains the EntityRow (also has class "group") and a visibility button.
    return this.panel.locator('div.group').filter({ hasText: name }).first()
  }

  async createNpc() {
    await this.page.getByRole('button').filter({ hasText: 'New NPC' }).click()
  }

  async expectEntityVisible(name: string) {
    await expect(this.entityRow(name)).toBeVisible({
      timeout: 5_000,
    })
  }

  async expectEntityNotVisible(name: string) {
    await expect(this.entityRow(name)).toBeHidden({
      timeout: 5_000,
    })
  }

  async toggleVisibility(name: string) {
    const row = this.entityRow(name)
    await row.hover()
    const eyeButton = row.locator('button[title="Exit stage"], button[title="Enter stage"]').first()
    await eyeButton.click()
  }

  async renameEntity(oldName: string, newName: string) {
    const row = this.entityRow(oldName)
    await row.hover()
    // The three-dots menu button is inside EntityRow, uses lucide MoreVertical icon.
    // In lucide-react v0.577+, SVGs have class="lucide" (not per-icon class).
    // Target the button that contains the SVG icon.
    await row.locator('svg.lucide').locator('..').first().click()
    await this.page.getByText('Rename').click()
    // After clicking "Rename", React replaces the name <div> with an <input>.
    // The row's hasText no longer matches (input values are not textContent),
    // so locate the rename input via the panel. It's the only input without a placeholder.
    const input = this.panel.locator('div.group input:not([placeholder])')
    await input.fill(newName)
    await input.press('Enter')
  }

  async deleteEntity(name: string) {
    const row = this.entityRow(name)
    await row.hover()
    await row.locator('svg.lucide').locator('..').first().click()
    await this.page.getByText('Delete').click()
    await this.page.getByRole('button', { name: 'Delete', exact: true }).click()
  }
}
