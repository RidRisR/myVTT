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
    this.archivesTab = page.getByRole('button', { name: 'Archives' })
    this.entitiesTab = page.getByRole('button', { name: 'Entities' })
  }

  /** Sidebar header text — only visible when the panel is expanded */
  private get panelHeader() {
    return this.page.locator('.text-sm.font-semibold').filter({ hasText: /Archives|Entities/ })
  }

  async openArchives() {
    // Idempotent: if the archives panel header is already visible, don't toggle it off
    const headerVisible = await this.panelHeader
      .filter({ hasText: 'Archives' })
      .isVisible()
      .catch(() => false)
    if (headerVisible) return
    await this.archivesTab.click()
    await expect(this.panelHeader.filter({ hasText: 'Archives' })).toBeVisible()
  }

  async openEntities() {
    const headerVisible = await this.panelHeader
      .filter({ hasText: 'Entities' })
      .isVisible()
      .catch(() => false)
    if (headerVisible) return
    await this.entitiesTab.click()
    await expect(this.panelHeader.filter({ hasText: 'Entities' })).toBeVisible()
  }

  async expectVisible() {
    await expect(this.archivesTab).toBeVisible()
  }
}
