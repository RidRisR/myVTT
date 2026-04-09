// plugins/daggerheart-core/__tests__/FearManager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { FearManager } from '../FearManager'
import { HopeResolver } from '../HopeResolver'
import type { WorkflowContext, IDataReader } from '@myvtt/sdk'

/** Build a minimal WorkflowContext mock for unit testing FearManager / HopeResolver */
function mockCtx(
  overrides: {
    entityReturn?: ReturnType<IDataReader['entity']>
  } = {},
) {
  const read: IDataReader = {
    entity: vi.fn().mockReturnValue(overrides.entityReturn),
    component: vi.fn() as IDataReader['component'],
    query: vi.fn().mockReturnValue([]),
    formulaTokens: vi.fn().mockReturnValue({}),
  }

  const ctx = {
    vars: {} as Record<string, unknown>,
    read,
    serverRoll: vi.fn(),
    requestInput: vi.fn(),
    emitEntry: vi.fn(),
    updateComponent: vi.fn(),
    createEntity: vi.fn().mockResolvedValue('daggerheart-core:fear'),
    deleteEntity: vi.fn(),
    abort: vi.fn(),
    runWorkflow: vi.fn(),
  } satisfies WorkflowContext

  return ctx
}

describe('FearManager', () => {
  const mgr = new FearManager()

  describe('ensureEntity', () => {
    it('calls ctx.createEntity when entity does not exist', async () => {
      const ctx = mockCtx({ entityReturn: undefined })

      await mgr.ensureEntity(ctx)

      expect(ctx.read.entity).toHaveBeenCalledWith('daggerheart-core:fear')
      expect(ctx.createEntity).toHaveBeenCalledWith({
        id: 'daggerheart-core:fear',
        components: { 'daggerheart-core:fear-tracker': { current: 0, max: 10 } },
        lifecycle: 'persistent',
      })
    })

    it('skips creation when entity already exists', async () => {
      const ctx = mockCtx({
        entityReturn: {
          id: 'daggerheart-core:fear',
          components: { 'daggerheart-core:fear-tracker': { current: 3, max: 10 } },
          permissions: { default: 'observer', seats: {} },
          lifecycle: 'persistent',
          tags: [],
        },
      })

      await mgr.ensureEntity(ctx)

      expect(ctx.read.entity).toHaveBeenCalledWith('daggerheart-core:fear')
      expect(ctx.createEntity).not.toHaveBeenCalled()
    })
  })

  describe('addFear', () => {
    it('calls ctx.updateComponent with correct entity/component IDs', () => {
      const ctx = mockCtx()

      mgr.addFear(ctx)

      expect(ctx.updateComponent).toHaveBeenCalledWith(
        'daggerheart-core:fear',
        'daggerheart-core:fear-tracker',
        expect.any(Function),
      )
    })

    it('updater increments current by 1 from existing value', () => {
      const ctx = mockCtx()
      mgr.addFear(ctx)

      // Extract the updater function and verify behavior
      const updater = (ctx.updateComponent as ReturnType<typeof vi.fn>).mock.calls[0]![2] as (
        prev: unknown,
      ) => { current: number; max: number }

      const result = updater({ current: 3, max: 10 })
      expect(result).toEqual({ current: 4, max: 10 })
    })

    it('updater handles undefined (first call) with default values', () => {
      const ctx = mockCtx()
      mgr.addFear(ctx)

      const updater = (ctx.updateComponent as ReturnType<typeof vi.fn>).mock.calls[0]![2] as (
        prev: unknown,
      ) => { current: number; max: number }

      const result = updater(undefined)
      expect(result).toEqual({ current: 1, max: 10 })
    })
  })
})

describe('HopeResolver', () => {
  const resolver = new HopeResolver()

  describe('addHope', () => {
    it('calls ctx.updateComponent with correct entity/key', () => {
      const ctx = mockCtx()

      resolver.addHope(ctx, 'char:alice')

      expect(ctx.updateComponent).toHaveBeenCalledWith(
        'char:alice',
        'daggerheart:extras',
        expect.any(Function),
      )
    })

    it('updater increments hope by 1 from existing value', () => {
      const ctx = mockCtx()
      resolver.addHope(ctx, 'char:alice')

      const updater = (ctx.updateComponent as ReturnType<typeof vi.fn>).mock.calls[0]![2] as (
        prev: unknown,
      ) => Record<string, unknown>

      const result = updater({ hope: 5, otherField: 'kept' })
      expect(result).toEqual({ hope: 6, otherField: 'kept' })
    })

    it('updater handles undefined (first call) with hope = 1', () => {
      const ctx = mockCtx()
      resolver.addHope(ctx, 'char:bob')

      const updater = (ctx.updateComponent as ReturnType<typeof vi.fn>).mock.calls[0]![2] as (
        prev: unknown,
      ) => Record<string, unknown>

      const result = updater(undefined)
      expect(result).toEqual({ hope: 1 })
    })

    it('updater handles existing extras without hope field', () => {
      const ctx = mockCtx()
      resolver.addHope(ctx, 'char:carol')

      const updater = (ctx.updateComponent as ReturnType<typeof vi.fn>).mock.calls[0]![2] as (
        prev: unknown,
      ) => Record<string, unknown>

      const result = updater({ someOther: 'data' })
      expect(result).toEqual({ someOther: 'data', hope: 1 })
    })
  })
})
