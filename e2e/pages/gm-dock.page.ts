import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { GalleryPage } from './gallery.page'
import { BlueprintPage } from './blueprint.page'
import { CharacterLibraryPage } from './character-library.page'

export class GmDockPage {
  readonly page: Page
  readonly gallery: GalleryPage
  readonly blueprint: BlueprintPage
  readonly characterLibrary: CharacterLibraryPage
  readonly mapsTab: Locator
  readonly tokensTab: Locator
  readonly charactersTab: Locator
  readonly handoutsTab: Locator
  readonly diceTab: Locator
  readonly combatButton: Locator

  constructor(page: Page) {
    this.page = page
    this.gallery = new GalleryPage(page)
    this.blueprint = new BlueprintPage(page)
    this.characterLibrary = new CharacterLibraryPage(page)
    this.mapsTab = page.getByTestId('dock-tab-maps')
    this.tokensTab = page.getByTestId('dock-tab-tokens')
    this.charactersTab = page.getByTestId('dock-tab-characters')
    this.handoutsTab = page.getByTestId('dock-tab-handouts')
    this.diceTab = page.getByTestId('dock-tab-dice')
    this.combatButton = page.getByTestId('combat-toggle')
  }

  async expectVisible() {
    await expect(this.mapsTab).toBeVisible()
  }

  async expectNotVisible() {
    await expect(this.mapsTab).toBeHidden()
  }

  async openTab(tab: 'maps' | 'tokens' | 'characters' | 'handouts' | 'dice') {
    const tabMap = {
      maps: this.mapsTab,
      tokens: this.tokensTab,
      characters: this.charactersTab,
      handouts: this.handoutsTab,
      dice: this.diceTab,
    }
    const tabButton = tabMap[tab]

    // In GmDock, clicking an already-active tab toggles it OFF (collapses the panel).
    // To make openTab idempotent, check if the tab is already active before clicking.
    // Active tabs have 'border-b-accent' class; inactive tabs have 'bg-glass' class.
    const classes = (await tabButton.getAttribute('class')) ?? ''
    if (classes.includes('border-b-accent')) {
      // Tab is already active — content panel is already visible, do nothing.
      return
    }
    await tabButton.click()
  }

  async enterCombat() {
    await this.combatButton.click()
  }

  async exitCombat() {
    await this.combatButton.click()
  }

  async expectInCombat() {
    await expect(this.combatButton).toHaveClass(/bg-danger/, { timeout: 5_000 })
  }

  async expectNotInCombat() {
    await expect(this.combatButton).not.toHaveClass(/bg-danger/, { timeout: 5_000 })
  }
}
