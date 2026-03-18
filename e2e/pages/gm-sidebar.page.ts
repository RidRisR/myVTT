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
    this.archivesTab = page.getByTestId('sidebar-tab-archives')
    this.entitiesTab = page.getByTestId('sidebar-tab-entities')
  }

  /** Sidebar header text — only visible when the panel is expanded */
  private get panelHeader() {
    return this.page.getByTestId('sidebar-header')
  }

  async openArchives() {
    // Idempotent: if the archives tab is already active, don't toggle it off
    const classes = (await this.archivesTab.getAttribute('class')) ?? ''
    if (classes.includes('text-accent')) return
    await this.archivesTab.click()
    await expect(this.panelHeader).toBeVisible()
  }

  async openEntities() {
    const classes = (await this.entitiesTab.getAttribute('class')) ?? ''
    if (classes.includes('text-accent')) return
    await this.entitiesTab.click()
    await expect(this.panelHeader).toBeVisible()
  }

  async expectVisible() {
    await expect(this.archivesTab).toBeVisible()
  }
}
