import { rm, mkdir } from 'fs/promises'
import path from 'path'

const DATA_DIR = '/tmp/myvtt-e2e'
const BASE_URL = 'http://localhost:5174'

async function globalSetup() {
  // Clean test data directory before the suite
  await rm(DATA_DIR, { recursive: true, force: true })
  await mkdir(path.join(DATA_DIR, 'rooms'), { recursive: true })

  // Wait for the API server to be ready behind the Vite proxy.
  // Playwright's webServer only waits for the Vite port (5174), but the Express
  // API server (port 4445) may still be starting. Retry until it responds.
  const MAX_RETRIES = 20
  const RETRY_INTERVAL = 500
  let res: Response | undefined
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      res = await fetch(`${BASE_URL}/api/rooms`)
      if (res.ok) break
    } catch {
      // ECONNREFUSED — server not ready yet
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL))
  }

  if (!res) {
    throw new Error(
      `API server did not become ready within ${(MAX_RETRIES * RETRY_INTERVAL) / 1000}s`,
    )
  }
  if (res.status === 429) {
    throw new Error(
      'API returned 429 Too Many Requests — rate limiter is blocking e2e tests. ' +
        'Check server/index.ts rate limit configuration.',
    )
  }
  if (!res.ok) {
    throw new Error(`API health check failed: ${res.status} ${res.statusText}`)
  }
}

export default globalSetup
