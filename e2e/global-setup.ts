import { rm, mkdir } from 'fs/promises'
import path from 'path'

const DATA_DIR = '/tmp/myvtt-e2e'
const BASE_URL = 'http://localhost:5174'

async function globalSetup() {
  // Clean test data directory before the suite
  await rm(DATA_DIR, { recursive: true, force: true })
  await mkdir(path.join(DATA_DIR, 'rooms'), { recursive: true })

  // Sanity check: ensure the API is reachable and not rate-limited.
  // Catches misconfigured rate limiters before 37 tests cascade-fail with cryptic timeouts.
  const res = await fetch(`${BASE_URL}/api/rooms`)
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
