import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class GmDockPage {
  readonly page: Page
  readonly galleryTab: Locator
  readonly tokensTab: Locator
  readonly charactersTab: Locator
  readonly handoutsTab: Locator
  readonly diceTab: Locator
  readonly combatButton: Locator

  constructor(page: Page) {
    this.page = page
    this.galleryTab = page.getByRole('button', { name: 'Gallery' })
    this.tokensTab = page.getByRole('button', { name: '蓝图' })
    this.charactersTab = page.getByRole('button', { name: 'Characters' })
    this.handoutsTab = page.getByRole('button', { name: 'Handouts' })
    this.diceTab = page.getByRole('button', { name: 'Dice' })
    this.combatButton = page.getByRole('button', { name: /Combat|Exit/ })
  }

  async expectVisible() {
    await expect(this.galleryTab).toBeVisible()
  }

  async expectNotVisible() {
    await expect(this.galleryTab).toBeHidden()
  }

  async openTab(tab: 'gallery' | 'tokens' | 'characters' | 'handouts' | 'dice') {
    const tabMap = {
      gallery: this.galleryTab,
      tokens: this.tokensTab,
      characters: this.charactersTab,
      handouts: this.handoutsTab,
      dice: this.diceTab,
    }
    await tabMap[tab].click()
  }

  async enterCombat() {
    await this.page.getByRole('button', { name: 'Combat' }).click()
  }

  async exitCombat() {
    await this.page.getByRole('button', { name: 'Exit' }).click()
  }

  async expectInCombat() {
    await expect(this.page.getByRole('button', { name: 'Exit' })).toBeVisible()
  }

  async expectNotInCombat() {
    await expect(this.page.getByRole('button', { name: 'Combat' })).toBeVisible()
  }
}
