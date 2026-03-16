import { test, expect } from '@playwright/test'

test.describe('Smoke Tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'myVTT' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Admin Panel' })).toBeVisible()
  })

  test('admin panel loads', async ({ page }) => {
    await page.goto('/#admin')
    await expect(page.getByRole('heading', { name: 'Room Management' })).toBeVisible()
    await expect(page.getByPlaceholder('Room name')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('server health check responds', async ({ page }) => {
    await page.goto('/')
    const result: { status: string } = await page.evaluate(async () => {
      const res = await fetch('/api/health')
      return res.json() as Promise<{ status: string }>
    })
    expect(result).toHaveProperty('status', 'ok')
  })
})
