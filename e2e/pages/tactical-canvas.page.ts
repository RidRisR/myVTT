import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class TacticalCanvasPage {
  readonly page: Page
  readonly canvas: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.locator('[data-testid="tactical-canvas"]')
  }

  async expectVisible() {
    await expect(this.canvas).toHaveClass(/opacity-100/, { timeout: 5000 })
  }

  async expectHidden() {
    await expect(this.canvas).toHaveClass(/opacity-0/, { timeout: 5000 })
  }

  async rightClickCenter() {
    const box = await this.canvas.boundingBox()
    if (!box) throw new Error('Canvas not found')
    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: 'right',
    })
  }
}
