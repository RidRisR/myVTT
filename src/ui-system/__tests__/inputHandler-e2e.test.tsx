// src/ui-system/__tests__/inputHandler-e2e.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { InputHandlerHost } from '../InputHandlerHost'
import { UIRegistry } from '../registry'
import { useSessionStore } from '../../stores/sessionStore'
import { WorkflowEngine } from '../../workflow/engine'
import { createWorkflowContext } from '../../workflow/context'
import { createEventBus } from '../../events/eventBus'
import type { InternalState } from '../../workflow/types'
import type { InputHandlerProps } from '../inputHandlerTypes'

// Simulates a dice modifier panel
function DiceModifierPanel({ context, resolve, cancel }: InputHandlerProps<{ attribute: string }, { bonus: number }>) {
  const attr = (context as { attribute: string }).attribute
  return (
    <div data-testid="dice-modifier">
      <span>Modifier for {attr}</span>
      <button data-testid="add-2" onClick={() => resolve({ bonus: 2 })}>+2</button>
      <button data-testid="cancel" onClick={() => cancel()}>Skip</button>
    </div>
  )
}

describe('E2E: workflow → InputHandler → resolve → workflow continues', () => {
  let registry: UIRegistry
  let engine: WorkflowEngine

  const makeDeps = (eng: WorkflowEngine) => ({
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue({
      seq: 0, id: '', type: '',
      origin: { seat: { id: '', name: '', color: '' } },
      executor: '', chainDepth: 0, triggerable: false,
      visibility: {}, baseSeq: 0, payload: {}, timestamp: 0,
    }),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    eventBus: createEventBus(),
    engine: eng,
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: '', name: '', color: '' } }),
    getSeatId: vi.fn().mockReturnValue(''),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
  })

  beforeEach(() => {
    registry = new UIRegistry()
    engine = new WorkflowEngine()
    useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
  })

  it('full cycle: workflow pauses → handler renders → user clicks → workflow resumes with value', async () => {
    // 1. Register input handler
    registry.registerInputHandler('dh:dice-modifiers', { component: DiceModifierPanel as never })

    // 2. Define workflow that requests input
    engine.defineWorkflow('test:roll-with-modifier', [
      {
        id: 'get-modifier',
        run: async (ctx) => {
          const result = await ctx.requestInput('dh:dice-modifiers', {
            context: { attribute: 'strength' },
          })
          ctx.vars.modifierResult = result
        },
      },
    ])

    // 3. Render InputHandlerHost
    render(<InputHandlerHost registry={registry} />)

    // 4. Run workflow
    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createWorkflowContext(makeDeps(engine), {}, internal)
    let workflowResult: unknown

    await act(async () => {
      const promise = engine.runWorkflow('test:roll-with-modifier', ctx, internal)
      promise.then((r) => { workflowResult = r })

      // Wait for requestInput to register
      await Promise.resolve()
      await Promise.resolve()
    })

    // 5. Verify handler is rendered
    expect(screen.getByTestId('dice-modifier')).toBeDefined()
    expect(screen.getByText('Modifier for strength')).toBeDefined()

    // 6. User clicks +2
    await act(async () => {
      screen.getByTestId('add-2').click()
      await Promise.resolve()
    })

    // 7. Handler unmounted
    expect(screen.queryByTestId('dice-modifier')).toBeNull()

    // 8. Wait for workflow to complete
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // 9. Verify workflow got the result
    expect(workflowResult).toBeDefined()
    const wf = workflowResult as { status: string; data: Record<string, unknown> }
    expect(wf.status).toBe('completed')
    expect(wf.data.modifierResult).toEqual({ ok: true, value: { bonus: 2 } })
  })

  it('full cycle with cancel: workflow receives cancelled result', async () => {
    registry.registerInputHandler('dh:dice-modifiers', { component: DiceModifierPanel as never })

    engine.defineWorkflow('test:roll-cancel', [
      {
        id: 'get-modifier',
        run: async (ctx) => {
          const result = await ctx.requestInput('dh:dice-modifiers', {
            context: { attribute: 'dex' },
          })
          ctx.vars.modifierResult = result
        },
      },
    ])

    render(<InputHandlerHost registry={registry} />)

    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createWorkflowContext(makeDeps(engine), {}, internal)
    let workflowResult: unknown

    await act(async () => {
      const promise = engine.runWorkflow('test:roll-cancel', ctx, internal)
      promise.then((r) => { workflowResult = r })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('dice-modifier')).toBeDefined()

    await act(async () => {
      screen.getByTestId('cancel').click()
      await Promise.resolve()
    })

    expect(screen.queryByTestId('dice-modifier')).toBeNull()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const wf = workflowResult as { status: string; data: Record<string, unknown> }
    expect(wf.status).toBe('completed')
    expect(wf.data.modifierResult).toEqual({ ok: false, reason: 'cancelled' })
  })
})
