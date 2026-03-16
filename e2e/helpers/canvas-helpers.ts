/**
 * @test-only — Canvas coordinate helpers for E2E tests.
 * NOT part of the Page Object layer. These deal with raw pixel math
 * and devBridge store reads that are only meaningful in test context.
 */
import type { Page, Locator } from '@playwright/test'

/** Read token map-coordinates from store */
export async function getTokenPosition(
  page: Page,
  tokenIndex: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate((idx) => {
    const store = (window as any).__MYVTT_STORES__?.world()
    const token = store?.tacticalInfo?.tokens?.[idx]
    if (!token) throw new Error(`Token at index ${idx} not found`)
    return { x: token.x, y: token.y }
  }, tokenIndex)
}

/** Convert token map-coords to screen-coords using canvas boundingBox.
 *  Assumes initial scale=1, stagePos={0,0} (no zoom/pan). */
export async function getTokenScreenPosition(
  page: Page,
  tokenIndex: number,
  canvasLocator: Locator,
): Promise<{ x: number; y: number }> {
  const box = await canvasLocator.boundingBox()
  if (!box) throw new Error('Canvas not visible')
  const mapPos = await getTokenPosition(page, tokenIndex)
  return {
    x: box.x + mapPos.x,
    y: box.y + mapPos.y,
  }
}

/** Full mouse drag sequence: mousedown → mousemove (multi-step) → mouseup */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options?: { steps?: number },
): Promise<void> {
  const steps = options?.steps ?? 5
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps
    await page.mouse.move(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)
  }
  await page.mouse.up()
}

/** Read grid settings from store */
export async function getGridSettings(page: Page): Promise<{
  size: number
  snap: boolean
  offsetX: number
  offsetY: number
}> {
  return page.evaluate(() => {
    const store = (window as any).__MYVTT_STORES__?.world()
    const grid = store?.tacticalInfo?.grid
    if (!grid) throw new Error('Grid not available (not in tactical mode?)')
    return {
      size: grid.size,
      snap: grid.snap,
      offsetX: grid.offsetX ?? 0,
      offsetY: grid.offsetY ?? 0,
    }
  })
}
