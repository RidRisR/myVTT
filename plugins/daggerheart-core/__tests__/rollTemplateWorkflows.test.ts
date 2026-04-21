import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { DaggerHeartCorePlugin } from '../index'
import type { ContextDeps } from '../../../src/workflow/context'
import type { Entity } from '../../../src/shared/entityTypes'

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[8], [5]]),
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

  return { deps, sdk, runner }
}

describe('roll template workflows', () => {
  it('adds templates into daggerheart:roll-templates', async () => {
    const entity: Entity = {
      id: 'char-1',
      permissions: { default: 'owner', seats: {} },
      lifecycle: 'persistent',
      tags: [],
      components: {
        'daggerheart:roll-templates': { items: [] },
      },
    }

    const { runner, deps, sdk } = makeSetup({
      getEntity: vi
        .fn()
        .mockImplementation((id: string) => (id === entity.id ? entity : undefined)),
    })

    const handle = sdk.getWorkflow('daggerheart-core:roll-template-add')
    const result = await runner.runWorkflow(handle, {
      entityId: entity.id,
      name: 'Sneak Attack',
      icon: '🗡️',
      config: {
        dualityDice: null,
        diceGroups: [{ sides: 8, count: 1, operator: '+', label: 'd8' }],
        modifiers: [{ type: 'attribute', attributeKey: 'agility' }],
        constantModifier: 1,
        sideEffects: [],
        applyOutcomeEffects: false,
      },
    })

    expect(result.status).toBe('completed')
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (call) => (call[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)

    const update = componentUpdates[0]![0] as {
      payload: {
        entityId: string
        key: string
        data: { items: Array<{ id: string; name: string; icon?: string }> }
      }
    }
    expect(update.payload.entityId).toBe(entity.id)
    expect(update.payload.key).toBe('daggerheart:roll-templates')
    expect(update.payload.data.items).toHaveLength(1)
    expect(update.payload.data.items[0]?.id).toMatch(/^tmpl_/)
    expect(update.payload.data.items[0]?.name).toBe('Sneak Attack')
    expect(update.payload.data.items[0]?.icon).toBe('🗡️')
    expect(update.payload.data.items[0]).toMatchObject({
      config: { applyOutcomeEffects: false },
    })
  })

  it('resolves template refs through action-check', async () => {
    const entity: Entity = {
      id: 'char-1',
      permissions: { default: 'owner', seats: {} },
      lifecycle: 'persistent',
      tags: [],
      components: {
        'daggerheart:attributes': {
          agility: 3,
          strength: 0,
          finesse: 0,
          instinct: 0,
          presence: 0,
          knowledge: 0,
        },
        'daggerheart:experiences': {
          items: [{ key: 'exp-stealth', name: 'Stealth', modifier: 2 }],
        },
        'daggerheart:roll-templates': {
          items: [
            {
              id: 'tmpl-stealth',
              name: 'Stealth Roll',
              icon: '🕶️',
              createdAt: 1,
              updatedAt: 1,
              config: {
                dualityDice: { hopeFace: 12, fearFace: 12 },
                diceGroups: [],
                modifiers: [
                  { type: 'attribute', attributeKey: 'agility' },
                  { type: 'experience', experienceKey: 'exp-stealth' },
                ],
                constantModifier: 1,
                sideEffects: [],
                dc: 12,
                applyOutcomeEffects: true,
              },
            },
          ],
        },
      },
    }

    const { runner, deps, sdk } = makeSetup({
      getEntity: vi
        .fn()
        .mockImplementation((id: string) => (id === entity.id ? entity : undefined)),
    })

    const handle = sdk.getWorkflow('daggerheart-core:action-check')
    const result = await runner.runWorkflow(handle, {
      actorId: entity.id,
      rollTemplateId: 'tmpl-stealth',
      skipModifier: true,
      dc: 12,
    })

    expect(result.status).toBe('completed')
    expect(deps.serverRoll).toHaveBeenCalledWith(
      expect.objectContaining({
        dice: [
          { sides: 12, count: 1 },
          { sides: 12, count: 1 },
        ],
      }),
    )

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const actionCheckEntry = emitCalls.find(
      (call) => (call[0] as { type: string }).type === 'daggerheart-core:action-check',
    )
    expect(actionCheckEntry).toBeDefined()
    const payload = (actionCheckEntry![0] as { payload: Record<string, unknown> }).payload
    expect(payload.formula).toBe('2d12+6')
    expect(payload.total).toBe(19)
    expect(payload.formulaTokens).toEqual([
      { type: 'dice', text: '2d12', source: 'duality' },
      { type: 'op', text: '+' },
      { type: 'modifier', text: '3', source: '敏捷' },
      { type: 'op', text: '+' },
      { type: 'modifier', text: '2', source: 'Stealth' },
      { type: 'op', text: '+' },
      { type: 'constant', text: '1' },
    ])
  })

  it('uses template dc when skipModifier is true', async () => {
    const entity: Entity = {
      id: 'char-1',
      permissions: { default: 'owner', seats: {} },
      lifecycle: 'persistent',
      tags: [],
      components: {
        'daggerheart:attributes': {
          agility: 0,
          strength: 0,
          finesse: 0,
          instinct: 0,
          presence: 0,
          knowledge: 0,
        },
        'daggerheart:experiences': { items: [] },
        'daggerheart:roll-templates': {
          items: [
            {
              id: 'tmpl-dc',
              name: 'Template With DC',
              createdAt: 1,
              updatedAt: 1,
              config: {
                dualityDice: { hopeFace: 12, fearFace: 12 },
                diceGroups: [],
                modifiers: [],
                constantModifier: 0,
                sideEffects: [],
                dc: 11,
                applyOutcomeEffects: true,
              },
            },
          ],
        },
      },
    }

    const { runner, deps, sdk } = makeSetup({
      getEntity: vi
        .fn()
        .mockImplementation((id: string) => (id === entity.id ? entity : undefined)),
      serverRoll: vi.fn().mockResolvedValue([[8], [4]]),
    })

    const handle = sdk.getWorkflow('daggerheart-core:action-check')
    const result = await runner.runWorkflow(handle, {
      actorId: entity.id,
      rollTemplateId: 'tmpl-dc',
      skipModifier: true,
    })

    expect(result.status).toBe('completed')
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const actionCheckEntry = emitCalls.find(
      (call) => (call[0] as { type: string }).type === 'daggerheart-core:action-check',
    )
    const payload = (actionCheckEntry?.[0] as { payload: Record<string, unknown> }).payload
    expect(payload.dc).toBe(11)
    expect(payload.judgment).toMatchObject({
      type: 'daggerheart',
      outcome: 'success_hope',
    })
  })

  it('defaults applyOutcomeEffects to true for old template configs missing the field', async () => {
    const entity: Entity = {
      id: 'char-1',
      permissions: { default: 'owner', seats: {} },
      lifecycle: 'persistent',
      tags: [],
      components: {
        'daggerheart:attributes': {
          agility: 0,
          strength: 0,
          finesse: 0,
          instinct: 0,
          presence: 0,
          knowledge: 0,
        },
        'daggerheart:experiences': { items: [] },
        'daggerheart:roll-templates': {
          items: [
            {
              id: 'tmpl-old',
              name: 'Legacy Template',
              createdAt: 1,
              updatedAt: 1,
              config: {
                dualityDice: { hopeFace: 12, fearFace: 12 },
                diceGroups: [],
                modifiers: [],
                constantModifier: 0,
                sideEffects: [],
              },
            },
          ],
        },
      },
    }

    const { runner, deps, sdk } = makeSetup({
      getEntity: vi
        .fn()
        .mockImplementation((id: string) => (id === entity.id ? entity : undefined)),
      serverRoll: vi.fn().mockResolvedValue([[8], [4]]),
    })

    const handle = sdk.getWorkflow('daggerheart-core:action-check')
    const result = await runner.runWorkflow(handle, {
      actorId: entity.id,
      rollTemplateId: 'tmpl-old',
      skipModifier: true,
    })

    expect(result.status).toBe('completed')
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (call) => (call[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
  })

  it('registers template workflows', () => {
    const { sdk } = makeSetup()
    expect(sdk.inspectWorkflow(sdk.getWorkflow('daggerheart-core:roll-template-add'))).toEqual([
      'add',
    ])
    expect(sdk.inspectWorkflow(sdk.getWorkflow('daggerheart-core:roll-template-update'))).toEqual([
      'update',
    ])
    expect(sdk.inspectWorkflow(sdk.getWorkflow('daggerheart-core:roll-template-remove'))).toEqual([
      'remove',
    ])
    expect(
      sdk.inspectWorkflow(sdk.getWorkflow('daggerheart-core:roll-template-edit-config')),
    ).toEqual(['edit-config'])
  })
})
