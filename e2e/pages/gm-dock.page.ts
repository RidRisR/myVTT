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
  readonly galleryTab: Locator
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
    this.galleryTab = page.getByRole('button', { name: 'Gallery', exact: true })
    this.tokensTab = page.getByRole('button', { name: 'Blueprints' })
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
