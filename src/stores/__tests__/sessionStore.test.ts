import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngine } from '../../workflow/engine'
import { WorkflowRunner } from '../../workflow/pluginSDK'
import { registerBaseWorkflows, getSetSelectionWorkflow } from '../../workflow/baseWorkflows'
import { createEventBus } from '../../events/eventBus'
import { useSessionStore, _setSelection } from '../sessionStore'

describe('Session State', () => {
  let engine: WorkflowEngine
  let runner: WorkflowRunner

  beforeEach(() => {
    engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const bus = createEventBus()
    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[1]], total: 1 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: bus,
    }
    runner = new WorkflowRunner(engine, deps)
    useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
  })

  it('setSelection workflow updates session store', async () => {
    await runner.runWorkflow(getSetSelectionWorkflow(), { entityId: 'goblin-01' })
    expect(useSessionStore.getState().selection).toEqual(['goblin-01'])
  })

  it('setSelection with null clears selection', async () => {
    _setSelection(['goblin-01'])
    expect(useSessionStore.getState().selection).toEqual(['goblin-01'])

    await runner.runWorkflow(getSetSelectionWorkflow(), { entityId: null })
    expect(useSessionStore.getState().selection).toEqual([])
  })

  it('instanceProps factory re-evaluates on session change', () => {
    const factory = (session: { selection: string[] }) => ({
      entityId: session.selection[0] ?? null,
    })

    expect(factory({ selection: [] })).toEqual({ entityId: null })
    expect(factory({ selection: ['hero-01'] })).toEqual({ entityId: 'hero-01' })
    expect(factory({ selection: ['goblin-01'] })).toEqual({ entityId: 'goblin-01' })
  })

  it('static instanceProps unaffected by selection', () => {
    const staticProps = { entityId: 'goblin-01' }
    _setSelection(['hero-01'])
    expect(staticProps.entityId).toBe('goblin-01')
  })

  it('getSetSelectionWorkflow returns a valid handle', () => {
    const handle = getSetSelectionWorkflow()
    expect(handle).toBeDefined()
    expect(handle.name).toBe('core:set-selection')
  })
})
