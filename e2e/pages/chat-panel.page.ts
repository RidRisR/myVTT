import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class ChatPanelPage {
  readonly page: Page
  readonly chatInput: Locator

  constructor(page: Page) {
    this.page = page
    this.chatInput = page.getByTestId('chat-input')
  }

  async expandChat() {
    const btn = this.page.getByRole('button', { name: 'Expand chat history' })
    if (await btn.isVisible()) {
      // Use force:true — GmDock at bottom-center can overlap this button at bottom-right
      await btn.click({ force: true })
    }
  }

  async collapseChat() {
    const btn = this.page.getByRole('button', { name: 'Collapse chat history' })
    if (await btn.isVisible()) {
      await btn.click({ force: true })
    }
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text)
    await this.chatInput.press('Enter')
  }

  async expectMessageVisible(text: string) {
    await expect(this.page.getByText(text).first()).toBeVisible({ timeout: 5000 })
  }

  /** Wait for at least N log entry cards to be visible */
  async expectEntryCount(n: number) {
    await expect(this.page.getByTestId('log-entry-card')).toHaveCount(n, { timeout: 10000 })
  }

  /** Expect a dice roll card showing the given formula text */
  async expectDiceRollVisible(formula: string) {
    await expect(
      this.page.getByTestId('entry-roll-result').filter({ hasText: formula }).first(),
    ).toBeVisible({ timeout: 5000 })
  }

  /** Expect a daggerheart action-check card with judgment footer to be visible (Hope/Fear text) */
  async expectJudgmentVisible() {
    // daggerheart-core emits 'daggerheart-core:action-check' rendered by DHActionCheckCard
    await expect(
      this.page
        .getByTestId('entry-action-check')
        .filter({ hasText: /Hope|Fear|Critical|希望|恐惧|命运/ })
        .first(),
    ).toBeVisible({ timeout: 5000 })
  }
}
