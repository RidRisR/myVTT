import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class CharacterLibraryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async createCharacter() {
    await this.page.getByTestId('create-character').click()
  }

  async expectCharacterVisible(name: string) {
    await expect(this.page.locator('button').filter({ hasText: name })).toBeVisible({
      timeout: 5_000,
    })
  }

  async expectCharacterNotVisible(name: string) {
    await expect(this.page.locator('button').filter({ hasText: name })).toBeHidden({
      timeout: 5_000,
    })
  }

  async deleteCharacter(name: string) {
    const row = this.page.locator('button').filter({ hasText: name })
    await row.hover()
    await this.page.getByTestId('delete-character').click()
  }

  async inspectCharacter(name: string) {
    const row = this.page.locator('button').filter({ hasText: name })
    await row.dblclick()
  }
}
