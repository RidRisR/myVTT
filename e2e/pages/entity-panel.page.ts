import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class EntityPanelPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async createNpc() {
    await this.page.getByRole('button').filter({ hasText: '新建NPC' }).click()
  }

  async expectEntityVisible(name: string) {
    await expect(this.page.getByText(name, { exact: false })).toBeVisible({
      timeout: 5_000,
    })
  }

  async expectEntityNotVisible(name: string) {
    await expect(this.page.getByText(name, { exact: false })).toBeHidden({
      timeout: 5_000,
    })
  }

  async toggleVisibility(name: string) {
    const row = this.page.locator('div.group').filter({ hasText: name }).first()
    await row.hover()
    const eyeButton = row.locator('button[title="离场"], button[title="上场"]').first()
    await eyeButton.click()
  }

  async renameEntity(oldName: string, newName: string) {
    const row = this.page.locator('div.group').filter({ hasText: oldName }).first()
    await row.hover()
    await row.locator('svg.lucide-more-vertical').locator('..').click()
    await this.page.getByText('重命名').click()
    const input = row.locator('input')
    await input.fill(newName)
    await input.press('Enter')
  }

  async deleteEntity(name: string) {
    const row = this.page.locator('div.group').filter({ hasText: name }).first()
    await row.hover()
    await row.locator('svg.lucide-more-vertical').locator('..').click()
    await this.page.getByText('删除').click()
    await this.page.getByRole('button', { name: 'Delete', exact: true }).click()
  }
}
