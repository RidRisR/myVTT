// src/__tests__/store-init-wiring.test.ts
// Systemic prevention: ensures App.tsx calls init() for every store that has one.
// If you add a new store with init(), this test will fail until you wire it into App.tsx.

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('store init wiring', () => {
  const storesDir = path.resolve(__dirname, '../stores')
  const appFile = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8')

  // Find all store files that export a zustand store with an init method
  const storeFiles = fs.readdirSync(storesDir).filter((f) => f.endsWith('Store.ts'))

  for (const file of storeFiles) {
    const content = fs.readFileSync(path.join(storesDir, file), 'utf-8')
    const hasInit = /^\s+init:\s/m.test(content)
    if (!hasInit) continue

    const storeName = file.replace('.ts', '')

    it(`App.tsx imports and calls init for ${storeName}`, () => {
      // Check the store is imported in App.tsx
      const importPattern = new RegExp(`from.*['\\./ ]+stores/${storeName}`)
      expect(appFile).toMatch(importPattern)

      // Check init is called somewhere (either via hook selector or getState().init)
      // Patterns: initWorld(, initIdentity(, useAssetStore.getState().init(
      const initCallPattern = new RegExp(`(init\\w*\\(|${storeName}.*\\.init\\()`)
      expect(appFile).toMatch(initCallPattern)
    })
  }
})
