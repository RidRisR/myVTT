import {
  getPermission,
  canSee,
  canEdit,
  defaultPCPermissions,
  defaultNPCPermissions,
  hiddenNPCPermissions,
} from '../permissions'
import { makeEntity } from '../../__test-utils__/fixtures'

const ownerEntity = makeEntity({
  permissions: { default: 'none', seats: { 'seat-1': 'owner' } },
})
const observerEntity = makeEntity({
  permissions: { default: 'observer', seats: {} },
})
const hiddenEntity = makeEntity({
  permissions: { default: 'none', seats: {} },
})

// ── getPermission ───────────────────────────────────────────────

describe('getPermission', () => {
  it('returns seat-specific permission when present', () => {
    expect(getPermission(ownerEntity, 'seat-1')).toBe('owner')
  })

  it('falls back to default when seat not in record', () => {
    expect(getPermission(ownerEntity, 'seat-unknown')).toBe('none')
  })

  it('returns default for entity with empty seats', () => {
    expect(getPermission(observerEntity, 'seat-1')).toBe('observer')
  })
})

// ── canSee ──────────────────────────────────────────────────────

describe('canSee', () => {
  it('GM can always see', () => {
    expect(canSee(hiddenEntity, 'seat-1', 'GM')).toBe(true)
  })

  it('PL with none permission cannot see', () => {
    expect(canSee(hiddenEntity, 'seat-1', 'PL')).toBe(false)
  })

  it('PL with observer permission can see', () => {
    expect(canSee(observerEntity, 'seat-1', 'PL')).toBe(true)
  })

  it('PL with owner permission can see', () => {
    expect(canSee(ownerEntity, 'seat-1', 'PL')).toBe(true)
  })
})

// ── canEdit ─────────────────────────────────────────────────────

describe('canEdit', () => {
  it('GM can always edit', () => {
    expect(canEdit(hiddenEntity, 'seat-1', 'GM')).toBe(true)
  })

  it('PL with owner permission can edit', () => {
    expect(canEdit(ownerEntity, 'seat-1', 'PL')).toBe(true)
  })

  it('PL with observer permission cannot edit', () => {
    expect(canEdit(observerEntity, 'seat-1', 'PL')).toBe(false)
  })

  it('PL with none permission cannot edit', () => {
    expect(canEdit(hiddenEntity, 'seat-1', 'PL')).toBe(false)
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
