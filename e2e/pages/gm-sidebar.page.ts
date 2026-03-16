import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { EntityPanelPage } from './entity-panel.page'

export class GmSidebarPage {
  readonly page: Page
  readonly entityPanel: EntityPanelPage
  readonly archivesTab: Locator
  readonly entitiesTab: Locator

  constructor(page: Page) {
    this.page = page
    this.entityPanel = new EntityPanelPage(page)
    this.archivesTab = page.getByRole('button', { name: '存档' })
    this.entitiesTab = page.getByRole('button', { name: '实体' })
  }

  async openArchives() {
    await this.archivesTab.click()
    await expect(this.page.getByText('存档').first()).toBeVisible()
  }

  async openEntities() {
    await this.entitiesTab.click()
    await expect(this.page.getByText('实体').first()).toBeVisible()
  }

  async expectVisible() {
    await expect(this.archivesTab).toBeVisible()
  }
}
