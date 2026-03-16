import { rm, mkdir } from 'fs/promises'
import path from 'path'

const DATA_DIR = '/tmp/myvtt-e2e'

async function globalSetup() {
  // Clean test data directory before the suite
  await rm(DATA_DIR, { recursive: true, force: true })
  await mkdir(path.join(DATA_DIR, 'rooms'), { recursive: true })
}

export default globalSetup
