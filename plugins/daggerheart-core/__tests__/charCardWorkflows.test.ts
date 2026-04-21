import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { DaggerHeartCorePlugin } from '../index'
import { CharCardManager } from '../CharCardManager'
import { useIdentityStore } from '../../../src/stores/identityStore'
import { createDefaultDHEntityData } from '../../daggerheart/templates'
import type { ContextDeps } from '../../../src/workflow/context'
import type { WorkflowContext, IDataReader } from '../../../src/workflow/types'
import type { Seat } from '../../../src/shared/storeTypes'

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[6, 6]]),
    createEntity: vi.fn().mockResolvedValue('test:entity-1'),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

function makeSetup(depsOverrides: Partial<ContextDeps> = {}) {
  const engine = new WorkflowEngine()
  registerBaseWorkflows(engine)
  const sdk = new PluginSDK(engine, 'daggerheart-core')
  const deps = makeDeps(depsOverrides)
  const runner = new WorkflowRunner(engine, deps)

  const plugin = new DaggerHeartCorePlugin()
  plugin.onActivate(sdk)

  return { engine, deps, sdk, runner, plugin }
}

/** Build a minimal mock WorkflowContext for testing CharCardManager.ensureCharacter */
function makeMockCtx(
  overrides: {
    entities?: import('../../../src/shared/entityTypes').Entity[]
    entityById?: Record<string, import('../../../src/shared/entityTypes').Entity>
  } = {},
) {
  const entities = overrides.entities ?? []
  const entityById = overrides.entityById ?? {}

  const createEntity = vi.fn().mockResolvedValue('created-id')

  const read: IDataReader = {
    entity: (id: string) => entityById[id],
    component: (() => undefined) as IDataReader['component'],
    query: () => entities,
    formulaTokens: () => ({}),
  }

  const ctx = {
    vars: {},
    read,
    createEntity,
    // Stubs for unused methods
    emitEntry: vi.fn(),
    updateComponent: vi.fn(),
    deleteEntity: vi.fn(),
    serverRoll: vi.fn(),
    requestInput: vi.fn(),
    abort: vi.fn(),
    runWorkflow: vi.fn(),
  } as unknown as WorkflowContext

  return { ctx, createEntity }
}

describe('charcard:update-attr workflow', () => {
  it('is registered on the engine via daggerheart-core:charcard-update-attr', () => {
    const { sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:charcard-update-attr')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['update'])
  })

  it('updates a single attribute on the entity', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:charcard-update-attr')

    await runner.runWorkflow(handle, {
      entityId: 'char1',
      attribute: 'agility',
      value: 3,
    })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.entityId).toBe('char1')
    expect(update.payload.key).toBe('daggerheart:attributes')
    expect(update.payload.data).toEqual({
      agility: 3,
      strength: 0,
      finesse: 0,
      instinct: 0,
      presence: 0,
      knowledge: 0,
    })
  })

  it('ignores invalid attribute names', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:charcard-update-attr')

    await runner.runWorkflow(handle, {
      entityId: 'char1',
      attribute: 'invalidattr',
      value: 5,
    })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(0)
  })
})

describe('CharCardManager.ensureCharacter', () => {
  const PL_SEAT: Seat = {
    id: 'seat-pl1',
    name: 'Alice',
    color: '#3b82f6',
    role: 'PL',
  }

  const GM_SEAT: Seat = {
    id: 'seat-gm',
    name: 'GM',
    color: '#ef4444',
    role: 'GM',
  }

  let manager: CharCardManager

  beforeEach(() => {
    manager = new CharCardManager()
    // Reset identity store to clean state
    useIdentityStore.setState({
      seats: [],
      mySeatId: null,
      onlineSeatIds: new Set(),
    })
  })

  it('creates a character entity for a PL seat with no existing character', async () => {
    useIdentityStore.setState({
      mySeatId: PL_SEAT.id,
      seats: [PL_SEAT],
    })

    const { ctx, createEntity } = makeMockCtx()
    await manager.ensureCharacter(ctx)

    expect(createEntity).toHaveBeenCalledTimes(1)
    expect(createEntity).toHaveBeenCalledWith({
      id: `dh-char-${PL_SEAT.id}`,
      components: {
        'core:identity': { name: PL_SEAT.name, imageUrl: '', color: PL_SEAT.color },
        ...createDefaultDHEntityData(),
      },
      lifecycle: 'persistent',
      permissions: { default: 'observer', seats: { [PL_SEAT.id]: 'owner' } },
    })
  })

  it('skips creation when no seat is claimed', async () => {
    useIdentityStore.setState({ mySeatId: null, seats: [PL_SEAT] })

    const { ctx, createEntity } = makeMockCtx()
    await manager.ensureCharacter(ctx)

    expect(createEntity).not.toHaveBeenCalled()
  })

  it('skips creation for GM seats', async () => {
    useIdentityStore.setState({ mySeatId: GM_SEAT.id, seats: [GM_SEAT] })

    const { ctx, createEntity } = makeMockCtx()
    await manager.ensureCharacter(ctx)

    expect(createEntity).not.toHaveBeenCalled()
  })

  it('skips creation when seat already has activeCharacterId', async () => {
    const seatWithChar: Seat = { ...PL_SEAT, activeCharacterId: 'existing-char' }
    useIdentityStore.setState({ mySeatId: seatWithChar.id, seats: [seatWithChar] })

    const { ctx, createEntity } = makeMockCtx()
    await manager.ensureCharacter(ctx)

    expect(createEntity).not.toHaveBeenCalled()
  })

  it('skips creation when seat already owns an entity', async () => {
    useIdentityStore.setState({ mySeatId: PL_SEAT.id, seats: [PL_SEAT] })

    const ownedEntity = {
      id: 'existing-entity',
      permissions: { default: 'observer' as const, seats: { [PL_SEAT.id]: 'owner' as const } },
      lifecycle: 'persistent' as const,
      tags: [],
      components: {},
    }

    const { ctx, createEntity } = makeMockCtx({ entities: [ownedEntity] })
    await manager.ensureCharacter(ctx)

    expect(createEntity).not.toHaveBeenCalled()
  })

  it('skips creation when entity with deterministic ID already exists', async () => {
    useIdentityStore.setState({ mySeatId: PL_SEAT.id, seats: [PL_SEAT] })

    const existingEntity = {
      id: `dh-char-${PL_SEAT.id}`,
      permissions: { default: 'observer' as const, seats: {} },
      lifecycle: 'persistent' as const,
      tags: [],
      components: {},
    }

    const { ctx, createEntity } = makeMockCtx({
      entityById: { [existingEntity.id]: existingEntity },
    })
    await manager.ensureCharacter(ctx)

    expect(createEntity).not.toHaveBeenCalled()
  })
})
