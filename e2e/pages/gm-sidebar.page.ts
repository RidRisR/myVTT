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

  /** Sidebar header text — only visible when the panel is expanded */
  private get panelHeader() {
    return this.page.locator('.text-sm.font-semibold').filter({ hasText: /存档|实体/ })
  }

  async openArchives() {
    // Idempotent: if the archives panel header is already visible, don't toggle it off
    const headerVisible = await this.panelHeader
      .filter({ hasText: '存档' })
      .isVisible()
      .catch(() => false)
    if (headerVisible) return
    await this.archivesTab.click()
    await expect(this.panelHeader.filter({ hasText: '存档' })).toBeVisible()
  }

  async openEntities() {
    const headerVisible = await this.panelHeader
      .filter({ hasText: '实体' })
      .isVisible()
      .catch(() => false)
    if (headerVisible) return
    await this.entitiesTab.click()
    await expect(this.panelHeader.filter({ hasText: '实体' })).toBeVisible()
  }

  async expectVisible() {
    await expect(this.archivesTab).toBeVisible()
  }
}
