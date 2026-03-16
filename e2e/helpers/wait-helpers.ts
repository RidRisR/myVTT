import type { Page } from '@playwright/test'

/**
 * Wait for room to fully initialize — past "Connecting to server..." and past SeatSelect
 */
export async function waitForRoomReady(page: Page) {
  await page.waitForFunction(
    () => {
      // No "Connecting to server..." text visible
      return !document.body.textContent.includes('Connecting to server...')
    },
    { timeout: 15_000 },
  )
}

/**
 * Retry-based wait for a condition, checking at intervals.
 * Useful for waiting on Socket.io-driven UI updates.
 */
export async function waitForCondition(
  check: () => Promise<boolean>,
  timeout = 5000,
  interval = 200,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`Condition not met within ${timeout}ms`)
}
