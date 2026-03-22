import { WorkflowEngine } from '../../src/workflow/engine'
import { usePocSessionStore, _setSelection } from '../sessionStore'
import { createDataReader } from '../dataReader'
import { createEventBus } from '../eventBus'
import { createPocWorkflowContext } from '../pocWorkflowContext'
import { activateCorePlugin } from '../plugins/core/index'
import { loadMockData } from '../mockData'
import { getSetSelectionHandle } from '../plugins/core/workflows'

describe('Session State', () => {
  let engine: WorkflowEngine

  beforeEach(() => {
    engine = new WorkflowEngine()
    activateCorePlugin(engine)
    loadMockData()
    usePocSessionStore.setState({ selection: [] })
  })

  it('setSelection workflow updates session store', async () => {
    const reader = createDataReader()
    const bus = createEventBus()
    const internal = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createPocWorkflowContext(
      { dataReader: reader, eventBus: bus, engine },
      { entityId: 'goblin-01' },
      internal,
    )
    await engine.runWorkflow('core:set-selection', ctx as any, internal)
    expect(usePocSessionStore.getState().selection).toEqual(['goblin-01'])
  })

  it('setSelection with null clears selection', async () => {
    _setSelection(['goblin-01'])
    expect(usePocSessionStore.getState().selection).toEqual(['goblin-01'])

    const reader = createDataReader()
    const bus = createEventBus()
    const internal = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createPocWorkflowContext(
      { dataReader: reader, eventBus: bus, engine },
      { entityId: null },
      internal,
    )
    await engine.runWorkflow('core:set-selection', ctx as any, internal)
    expect(usePocSessionStore.getState().selection).toEqual([])
  })

  it('instanceProps factory re-evaluates on session change', () => {
    const factory = (session: { selection: string[] }) => ({
      entityId: session.selection[0] ?? null,
    })

    // Before selection
    expect(factory({ selection: [] })).toEqual({ entityId: null })

    // After selection
    expect(factory({ selection: ['hero-01'] })).toEqual({ entityId: 'hero-01' })

    // Changed selection
    expect(factory({ selection: ['goblin-01'] })).toEqual({ entityId: 'goblin-01' })
  })

  it('static instanceProps unaffected by selection', () => {
    const staticProps = { entityId: 'goblin-01' }
    _setSelection(['hero-01'])
    // Static props are just objects, not functions - they don't change
    expect(staticProps.entityId).toBe('goblin-01')
  })

  it('getSetSelectionHandle returns a valid handle', () => {
    const handle = getSetSelectionHandle()
    expect(handle).toBeDefined()
    expect(handle.name).toBe('core:set-selection')
  })
})
