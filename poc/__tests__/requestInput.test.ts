import { usePocSessionStore, requestInput, resolveInput, cancelInput } from '../sessionStore'

describe('requestInput — pause/resume/cancel', () => {
  beforeEach(() => {
    usePocSessionStore.setState({ selection: [], pendingInteractions: new Map() })
  })

  it('requestInput pauses (Promise hangs until resolved)', async () => {
    let resolved = false
    const promise = requestInput('interaction-1').then(() => {
      resolved = true
    })

    // Promise should be pending
    await Promise.resolve() // flush microtasks
    expect(resolved).toBe(false)

    // Pending interaction should be in store
    expect(usePocSessionStore.getState().pendingInteractions.has('interaction-1')).toBe(true)

    // Resolve to clean up
    resolveInput('interaction-1', 'done')
    await promise
    expect(resolved).toBe(true)
  })

  it('resolveInput resumes workflow with value', async () => {
    const promise = requestInput('interaction-2')

    resolveInput('interaction-2', { x: 10, y: 20 })
    const result = await promise
    expect(result).toEqual({ x: 10, y: 20 })

    // Pending interaction should be removed
    expect(usePocSessionStore.getState().pendingInteractions.has('interaction-2')).toBe(false)
  })

  it('cancelInput rejects with cancelled error', async () => {
    const promise = requestInput('interaction-3')

    cancelInput('interaction-3')
    await expect(promise).rejects.toThrow('cancelled')

    // Pending interaction should be removed
    expect(usePocSessionStore.getState().pendingInteractions.has('interaction-3')).toBe(false)
  })

  it('multiple parallel interactions supported', async () => {
    const p1 = requestInput('ia-1')
    const p2 = requestInput('ia-2')

    expect(usePocSessionStore.getState().pendingInteractions.size).toBe(2)

    resolveInput('ia-2', 'second')
    resolveInput('ia-1', 'first')

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('first')
    expect(r2).toBe('second')
    expect(usePocSessionStore.getState().pendingInteractions.size).toBe(0)
  })

  it('resolveInput on unknown id is a no-op', () => {
    // Should not throw
    resolveInput('nonexistent', 'value')
  })

  it('cancelInput on unknown id is a no-op', () => {
    // Should not throw
    cancelInput('nonexistent')
  })
})
