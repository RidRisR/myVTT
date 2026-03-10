import {
  getPermission,
  canSee,
  canEdit,
  defaultPCPermissions,
  defaultNPCPermissions,
  hiddenNPCPermissions,
} from '../permissions'
import type { EntityPermissions } from '../entityTypes'

const ownerPerms: EntityPermissions = { default: 'none', seats: { 'seat-1': 'owner' } }
const observerPerms: EntityPermissions = { default: 'observer', seats: {} }
const hiddenPerms: EntityPermissions = { default: 'none', seats: {} }

// ── getPermission ───────────────────────────────────────────────

describe('getPermission', () => {
  it('returns seat-specific permission when present', () => {
    expect(getPermission(ownerPerms, 'seat-1')).toBe('owner')
  })

  it('falls back to default when seat not in record', () => {
    expect(getPermission(ownerPerms, 'seat-unknown')).toBe('none')
  })

  it('returns default for entity with empty seats', () => {
    expect(getPermission(observerPerms, 'seat-1')).toBe('observer')
  })
})

// ── canSee ──────────────────────────────────────────────────────

describe('canSee', () => {
  it('GM can always see', () => {
    expect(canSee(hiddenPerms, 'seat-1', 'GM')).toBe(true)
  })

  it('PL with none permission cannot see', () => {
    expect(canSee(hiddenPerms, 'seat-1', 'PL')).toBe(false)
  })

  it('PL with observer permission can see', () => {
    expect(canSee(observerPerms, 'seat-1', 'PL')).toBe(true)
  })

  it('PL with owner permission can see', () => {
    expect(canSee(ownerPerms, 'seat-1', 'PL')).toBe(true)
  })
})

// ── canEdit ─────────────────────────────────────────────────────

describe('canEdit', () => {
  it('GM can always edit', () => {
    expect(canEdit(hiddenPerms, 'seat-1', 'GM')).toBe(true)
  })

  it('PL with owner permission can edit', () => {
    expect(canEdit(ownerPerms, 'seat-1', 'PL')).toBe(true)
  })

  it('PL with observer permission cannot edit', () => {
    expect(canEdit(observerPerms, 'seat-1', 'PL')).toBe(false)
  })

  it('PL with none permission cannot edit', () => {
    expect(canEdit(hiddenPerms, 'seat-1', 'PL')).toBe(false)
  })
})

// ── default permission factories ────────────────────────────────

describe('permission factories', () => {
  it('defaultPCPermissions sets owner for given seat', () => {
    const perms = defaultPCPermissions('seat-1')
    expect(perms.default).toBe('observer')
    expect(perms.seats['seat-1']).toBe('owner')
  })

  it('defaultNPCPermissions has observer default, empty seats', () => {
    const perms = defaultNPCPermissions()
    expect(perms.default).toBe('observer')
    expect(Object.keys(perms.seats)).toHaveLength(0)
  })

  it('hiddenNPCPermissions has none default, empty seats', () => {
    const perms = hiddenNPCPermissions()
    expect(perms.default).toBe('none')
    expect(Object.keys(perms.seats)).toHaveLength(0)
  })
})
