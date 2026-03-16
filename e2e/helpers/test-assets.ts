// e2e/helpers/test-assets.ts
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

/** 1x1 red pixel PNG — 68 bytes, valid image/png MIME */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
)

const ASSETS_DIR = '/tmp/myvtt-e2e-assets'

export interface TestAssets {
  mapPath: string
  tokenPath: string
}

/**
 * Write minimal PNG test files to /tmp and return their paths.
 * Safe to call multiple times — mkdirSync is idempotent with recursive.
 */
export function createTestAssets(): TestAssets {
  mkdirSync(ASSETS_DIR, { recursive: true })
  const mapPath = join(ASSETS_DIR, 'test-map.png')
  const tokenPath = join(ASSETS_DIR, 'test-token.png')
  writeFileSync(mapPath, MINIMAL_PNG)
  writeFileSync(tokenPath, MINIMAL_PNG)
  return { mapPath, tokenPath }
}
