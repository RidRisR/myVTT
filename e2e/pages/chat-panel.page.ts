import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class ChatPanelPage {
  readonly page: Page
  readonly chatInput: Locator

  constructor(page: Page) {
    this.page = page
    this.chatInput = page.getByPlaceholder('Type a message or .r 1d20+@STR')
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
}
