#!/usr/bin/env npx tsx
// scripts/preview-cli.ts — Multi-branch preview CLI for myVTT
// Manages isolated Docker containers per branch with auto port allocation and cleanup.

import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

const PREFIX = 'myvtt-preview'

// ── Utilities ──

function sanitizeBranch(branch: string): string {
  return branch
    .replace(/\//g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
}

function projectName(branch: string): string {
  return `${PREFIX}-${sanitizeBranch(branch)}`
}

/** CRC32-like hash to derive a deterministic port offset from branch name */
function hashBranch(branch: string): number {
  let hash = 0
  for (let i = 0; i < branch.length; i++) {
    hash = ((hash << 5) - hash + branch.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 100
}

function derivePorts(branch: string): { serverPort: number; vitePort: number } {
  const offset = hashBranch(branch)
  return {
    serverPort: 4400 + offset,
    vitePort: 5100 + offset,
  }
}

function isPortInUse(port: number): boolean {
  try {
    execSync(`lsof -i :${port} -sTCP:LISTEN`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function findFreePorts(branch: string): { serverPort: number; vitePort: number } {
  let { serverPort, vitePort } = derivePorts(branch)
  const maxTries = 20

  for (let i = 0; i < maxTries; i++) {
    if (!isPortInUse(serverPort) && !isPortInUse(vitePort)) {
      return { serverPort, vitePort }
    }
    // Increment both ports together
    const offset = ((serverPort - 4400 + 1) % 100)
    serverPort = 4400 + offset
    vitePort = 5100 + offset
  }

  error(`Could not find free ports after ${maxTries} attempts.`)
  process.exit(1)
}

function findWorktree(branch: string): string {
  // Parse `git worktree list --porcelain` to find the worktree for this branch
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const entries = output.split('\n\n')
    for (const entry of entries) {
      if (entry.includes(`branch refs/heads/${branch}`)) {
        const match = entry.match(/^worktree (.+)$/m)
        if (match) return match[1]
      }
    }
  } catch {
    // Fall through to error
  }

  error(`No worktree found for branch '${branch}'.`)
  console.log('')
  console.log('Create one with:')
  console.log(`  git worktree add .worktrees/${branch} -b ${branch}`)
  console.log('  # or if the branch already exists:')
  console.log(`  git worktree add .worktrees/${branch} ${branch}`)
  process.exit(1)
}

function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function composeExec(
  project: string,
  composePath: string,
  args: string[],
  env?: Record<string, string>,
): void {
  execSync(
    `docker compose -p ${project} -f "${composePath}" ${args.join(' ')}`,
    {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    },
  )
}

function getRunningProjects(): Array<{ project: string; name: string; ports: string; status: string }> {
  try {
    const output = execSync(
      `docker ps --filter "name=${PREFIX}-" --format "{{.Labels}}|||{{.Names}}|||{{.Ports}}|||{{.Status}}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    if (!output) return []

    const seen = new Set<string>()
    return output
      .split('\n')
      .map((line) => {
        const [labels, name, ports, status] = line.split('|||')
        const projectMatch = labels?.match(/com\.docker\.compose\.project=([^,]+)/)
        const project = projectMatch?.[1] || ''
        return { project, name: name || '', ports: ports || '', status: status || '' }
      })
      .filter((entry) => {
        if (!entry.project.startsWith(PREFIX + '-') || seen.has(entry.project)) return false
        seen.add(entry.project)
        return true
      })
  } catch {
    return []
  }
}

function extractVitePort(ports: string): string | null {
  // Parse Docker port format: "0.0.0.0:5142->5173/tcp, ..."
  const match = ports.match(/0\.0\.0\.0:(\d+)->5173\/tcp/)
  return match?.[1] || null
}

// ── Output helpers ──

function log(msg: string) {
  console.log(msg)
}

function error(msg: string) {
  console.error(`\x1b[31mError:\x1b[0m ${msg}`)
}

function warn(msg: string) {
  console.log(`\x1b[33m${msg}\x1b[0m`)
}

function bold(msg: string): string {
  return `\x1b[1m${msg}\x1b[0m`
}

// ── Commands ──

function cmdStart(branch: string) {
  if (branch === 'main' || branch === 'master') {
    error("Cannot preview 'main' or 'master'. Use a feature branch.")
    process.exit(1)
  }

  if (!isDockerRunning()) {
    error('Docker is not running. Please start Docker Desktop.')
    process.exit(1)
  }

  const worktreePath = findWorktree(branch)
  const composePath = resolve(worktreePath, 'docker-compose.dev.yml')

  if (!existsSync(composePath)) {
    error(`docker-compose.dev.yml not found in worktree at ${composePath}`)
    process.exit(1)
  }

  const { serverPort, vitePort } = findFreePorts(branch)
  const project = projectName(branch)

  const envVars: Record<string, string> = {
    HOST_SERVER_PORT: String(serverPort),
    HOST_VITE_PORT: String(vitePort),
    VITE_PROXY_MODE: 'true',
    CORS_ORIGIN: `http://localhost:${vitePort}`,
  }

  log('')
  log('\x1b[36m┌──────────────────────────────────────────────────┐\x1b[0m')
  log(`\x1b[36m│\x1b[0m  ${bold('myVTT Preview')}                                  \x1b[36m│\x1b[0m`)
  log(`\x1b[36m│\x1b[0m  Branch:  ${branch.padEnd(39)} \x1b[36m│\x1b[0m`)
  log(`\x1b[36m│\x1b[0m  UI:      http://localhost:${String(vitePort).padEnd(22)} \x1b[36m│\x1b[0m`)
  log(`\x1b[36m│\x1b[0m  API:     http://localhost:${String(serverPort).padEnd(22)} \x1b[36m│\x1b[0m`)
  log('\x1b[36m│\x1b[0m                                                  \x1b[36m│\x1b[0m')
  warn('│  ⚠ Data is ephemeral — deleted on stop           │')
  log('\x1b[36m│\x1b[0m  Ctrl+C to stop                                  \x1b[36m│\x1b[0m')
  log('\x1b[36m└──────────────────────────────────────────────────┘\x1b[0m')
  log('')

  // Spawn docker compose in foreground
  const child: ChildProcess = spawn(
    'docker',
    ['compose', '-p', project, '-f', composePath, 'up', '--build'],
    {
      stdio: 'inherit',
      env: { ...process.env, ...envVars },
    },
  )

  // Guard against double cleanup (SIGINT handler + child exit can both fire)
  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    log('')
    log(`Shutting down preview for '${branch}'...`)
    try {
      execSync(
        `docker compose -p ${project} -f "${composePath}" down -v --remove-orphans`,
        {
          stdio: 'inherit',
          env: { ...process.env, ...envVars },
        },
      )
    } catch {
      // Best-effort cleanup
    }
    log('Preview stopped. All data cleaned up.')
  }

  // Handle signals
  process.on('SIGINT', () => {
    child.kill('SIGINT')
    cleanup()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    child.kill('SIGTERM')
    cleanup()
    process.exit(0)
  })

  child.on('exit', (code) => {
    cleanup()
    process.exit(code ?? 0)
  })
}

function cmdStop(branchOrFlag: string) {
  if (!isDockerRunning()) {
    error('Docker is not running.')
    process.exit(1)
  }

  if (branchOrFlag === '--all') {
    const projects = getRunningProjects()
    if (projects.length === 0) {
      log('No running previews found.')
      return
    }

    for (const entry of projects) {
      log(`Stopping ${entry.project}...`)
      try {
        execSync(
          `docker compose -p ${entry.project} down -v --remove-orphans`,
          { stdio: 'inherit' },
        )
      } catch {
        // Best-effort
      }
    }
    log('All previews stopped. All data cleaned up.')
  } else {
    const project = projectName(branchOrFlag)
    log(`Stopping preview for '${branchOrFlag}'...`)
    try {
      execSync(
        `docker compose -p ${project} down -v --remove-orphans`,
        { stdio: 'inherit' },
      )
    } catch {
      // Best-effort
    }
    log('Preview stopped. All data cleaned up.')
  }
}

function cmdList() {
  if (!isDockerRunning()) {
    error('Docker is not running.')
    process.exit(1)
  }

  const projects = getRunningProjects()
  if (projects.length === 0) {
    log('No running previews.')
    return
  }

  log('')
  log(bold('BRANCH'.padEnd(30) + 'UI'.padEnd(30) + 'STATUS'))
  log('-'.repeat(80))

  for (const entry of projects) {
    // Extract branch from project name: myvtt-preview-feat-xxx → feat-xxx
    const branch = entry.project.replace(`${PREFIX}-`, '')
    const vitePort = extractVitePort(entry.ports)
    const url = vitePort ? `http://localhost:${vitePort}` : '(unknown)'
    log(`${branch.padEnd(30)}${url.padEnd(30)}${entry.status}`)
  }
  log('')
}

function cmdLogs(branch: string) {
  if (!isDockerRunning()) {
    error('Docker is not running.')
    process.exit(1)
  }

  const project = projectName(branch)
  const child = spawn(
    'docker',
    ['compose', '-p', project, 'logs', '-f'],
    { stdio: 'inherit' },
  )

  process.on('SIGINT', () => {
    child.kill('SIGINT')
    process.exit(0)
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}

function cmdOpen(branch: string) {
  if (!isDockerRunning()) {
    error('Docker is not running.')
    process.exit(1)
  }

  const projects = getRunningProjects()
  const project = projectName(branch)
  const entry = projects.find((p) => p.project === project)

  if (!entry) {
    error(`No running preview found for branch '${branch}'.`)
    log(`Start one with: ./scripts/preview start ${branch}`)
    process.exit(1)
  }

  const vitePort = extractVitePort(entry.ports)
  if (!vitePort) {
    error('Could not determine UI port from running container.')
    process.exit(1)
  }

  const url = `http://localhost:${vitePort}`
  log(`Opening ${url}...`)
  const openCmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  execSync(`${openCmd} "${url}"`)
}

function cmdClean() {
  if (!isDockerRunning()) {
    error('Docker is not running.')
    process.exit(1)
  }

  let containersRemoved = 0
  let volumesRemoved = 0

  // Remove stopped containers
  try {
    const containers = execSync(
      `docker ps -a --filter "name=${PREFIX}-" --filter "status=exited" --format "{{.ID}}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    if (containers) {
      const ids = containers.split('\n')
      containersRemoved = ids.length
      execSync(`docker rm ${ids.join(' ')}`, { stdio: 'pipe' })
    }
  } catch {
    // No stopped containers
  }

  // Remove orphaned volumes
  try {
    const volumes = execSync(
      `docker volume ls --filter "name=${PREFIX}-" --format "{{.Name}}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    if (volumes) {
      const names = volumes.split('\n')
      // Only remove volumes not attached to running containers
      for (const vol of names) {
        try {
          execSync(`docker volume rm ${vol}`, { stdio: 'pipe' })
          volumesRemoved++
        } catch {
          // Volume in use, skip
        }
      }
    }
  } catch {
    // No volumes
  }

  if (containersRemoved === 0 && volumesRemoved === 0) {
    log('Nothing to clean up.')
  } else {
    if (containersRemoved > 0) log(`Removed ${containersRemoved} stopped container(s).`)
    if (volumesRemoved > 0) log(`Removed ${volumesRemoved} orphaned volume(s).`)
    log('Cleanup complete.')
  }
}

function printUsage() {
  log('')
  log(bold('myVTT Preview CLI') + ' — Multi-branch preview environments')
  log('')
  log('Usage: ./scripts/preview <command> [options]')
  log('')
  log('Commands:')
  log('  start <branch>   Start a preview for the given branch')
  log('  stop <branch>    Stop a preview and delete all its data')
  log('  stop --all       Stop all running previews')
  log('  list             List running previews')
  log('  logs <branch>    Tail logs for a preview')
  log('  open <branch>    Open preview in browser')
  log('  clean            Remove orphaned containers and volumes')
  log('')
  warn('⚠ Preview data is ephemeral — all data (DB, uploads) is deleted on stop.')
  log('')
}

// ── Main ──

const [command, arg] = process.argv.slice(2)

switch (command) {
  case 'start':
    if (!arg) {
      error('Branch name required. Usage: ./scripts/preview start <branch>')
      process.exit(1)
    }
    cmdStart(arg)
    break

  case 'stop':
    if (!arg) {
      error('Branch name or --all required. Usage: ./scripts/preview stop <branch|--all>')
      process.exit(1)
    }
    cmdStop(arg)
    break

  case 'list':
    cmdList()
    break

  case 'logs':
    if (!arg) {
      error('Branch name required. Usage: ./scripts/preview logs <branch>')
      process.exit(1)
    }
    cmdLogs(arg)
    break

  case 'open':
    if (!arg) {
      error('Branch name required. Usage: ./scripts/preview open <branch>')
      process.exit(1)
    }
    cmdOpen(arg)
    break

  case 'clean':
    cmdClean()
    break

  default:
    printUsage()
    break
}
