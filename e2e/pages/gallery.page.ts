// e2e/pages/gallery.page.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class GalleryPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Upload an image file via the hidden file input. Waits for asset to appear in grid. */
  async uploadImage(filePath: string) {
    const fileInput = this.page.locator('input[type="file"][accept*="image"]')
    await fileInput.setInputFiles(filePath)
    // Wait for uploading state to finish (Upload button re-appears)
    await expect(this.page.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled({
      timeout: 15_000,
    })
  }

  /** Assert an asset with the given name is visible in the Gallery grid */
  async expectAssetVisible(name: string) {
    await expect(
      this.page
        .locator('div[role="button"]')
        .filter({ has: this.page.locator(`img[alt="${name}"]`) }),
    ).toBeVisible({ timeout: 10_000 })
  }

  /** Assert an asset with the given name is NOT visible */
  async expectAssetNotVisible(name: string) {
    await expect(this.page.locator(`img[alt="${name}"]`)).toBeHidden({ timeout: 10_000 })
  }

  /** Right-click on an asset tile to open context menu */
  async rightClickAsset(name: string) {
    const tile = this.page
      .locator('div[role="button"]')
      .filter({ has: this.page.locator(`img[alt="${name}"]`) })
    await tile.click({ button: 'right' })
  }

  /** Right-click asset → click "Set as Scene Background" */
  async setAsSceneBackground(name: string) {
    await this.rightClickAsset(name)
    await this.page.getByText('Set as Scene Background').click()
  }

  /** Right-click asset → click "Delete" */
  async deleteAsset(name: string) {
    await this.rightClickAsset(name)
    await this.page.getByText('Delete', { exact: true }).click()
  }
}
