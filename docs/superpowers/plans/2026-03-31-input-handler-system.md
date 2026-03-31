# Input Handler System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge `requestInput` to transient UI components so workflows can pause, display a registered input handler, and resume with the user's response.

**Architecture:** Add `InputHandlerDef` to `UIRegistry`, refactor `requestInput` to return a discriminated `InputResult<T>` with `ok/cancelled/timeout`, and mount a React Portal host (`InputHandlerHost`) that auto-renders registered handlers when interactions appear in `sessionStore.pendingInteractions`.

**Tech Stack:** TypeScript, React 19, zustand, Radix UI (for Portal), vitest

**Out of scope (P1, separate plan):** Portrait slot registration point for EntityCard migration — requires reading the portrait bar component to add a `registerRenderer('portrait-slot', ...)` call. Straightforward feature work once the target component is identified.

---

### Task 1: InputResult type + InputHandlerDef interface

**Files:**

- Create: `src/ui-system/inputHandlerTypes.ts`
- Test: `src/ui-system/__tests__/inputHandlerTypes.test.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
// src/ui-system/inputHandlerTypes.ts
import type React from 'react'

/** Discriminated result returned by requestInput */
export type InputResult<T> = { ok: true; value: T } | { ok: false; reason: 'cancelled' | 'timeout' }

/** Props injected into input handler components */
export interface InputHandlerProps<TContext = unknown, TResult = unknown> {
  context: TContext
  resolve: (value: TResult) => void
  cancel: () => void
}

/** Definition registered by plugins via sdk.ui.registerInputHandler */
export interface InputHandlerDef {
  /** React component to render. Receives InputHandlerProps with context/resolve/cancel. */
  component: React.ComponentType<InputHandlerProps<unknown, unknown>>
}
```

- [ ] **Step 2: Write compile-time type test**

```typescript
// src/ui-system/__tests__/inputHandlerTypes.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { InputResult, InputHandlerProps, InputHandlerDef } from '../inputHandlerTypes'

describe('inputHandlerTypes compile-time checks', () => {
  it('InputResult discriminates on ok field', () => {
    const success: InputResult<number> = { ok: true, value: 42 }
    const failure: InputResult<number> = { ok: false, reason: 'cancelled' }
    expectTypeOf(success).toMatchTypeOf<InputResult<number>>()
    expectTypeOf(failure).toMatchTypeOf<InputResult<number>>()
  })

  it('InputHandlerProps has context, resolve, cancel', () => {
    expectTypeOf<InputHandlerProps<{ x: number }, string>>().toHaveProperty('context')
    expectTypeOf<InputHandlerProps<{ x: number }, string>>().toHaveProperty('resolve')
    expectTypeOf<InputHandlerProps<{ x: number }, string>>().toHaveProperty('cancel')
  })

  it('InputHandlerDef has component field', () => {
    expectTypeOf<InputHandlerDef>().toHaveProperty('component')
  })
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/ui-system/__tests__/inputHandlerTypes.test.ts --reporter=verbose`
Expected: 3 PASS

- [ ] **Step 4: Commit**

```
feat(ui-system): add InputResult, InputHandlerProps, InputHandlerDef types
```

---

### Task 2: Register and retrieve input handlers in UIRegistry

**Files:**

- Modify: `src/ui-system/registry.ts`
- Modify: `src/ui-system/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/ui-system/__tests__/registry.test.ts`:

```typescript
import type { InputHandlerDef } from '../inputHandlerTypes'

const mockHandlerComponent = (() => null) as never

describe('UIRegistry — input handlers', () => {
  let registry: UIRegistry

  beforeEach(() => {
    registry = new UIRegistry()
  })

  it('stores and retrieves a registered input handler', () => {
    const def: InputHandlerDef = { component: mockHandlerComponent }
    registry.registerInputHandler('test:modifier', def)
    expect(registry.getInputHandler('test:modifier')).toBe(def)
  })

  it('returns undefined for unknown input handler type', () => {
    expect(registry.getInputHandler('unknown')).toBeUndefined()
  })

  it('throws on duplicate input handler type', () => {
    const def: InputHandlerDef = { component: mockHandlerComponent }
    registry.registerInputHandler('test:modifier', def)
    expect(() => {
      registry.registerInputHandler('test:modifier', def)
    }).toThrow('test:modifier')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/registry.test.ts --reporter=verbose`
Expected: FAIL — `registry.registerInputHandler is not a function`

- [ ] **Step 3: Implement registerInputHandler and getInputHandler**

Add to `src/ui-system/registry.ts`:

```typescript
import type { InputHandlerDef } from './inputHandlerTypes'
```

Add a private field and two methods to `UIRegistry`:

```typescript
  private inputHandlers = new Map<string, InputHandlerDef>()

  registerInputHandler(inputType: string, def: InputHandlerDef): void {
    if (this.inputHandlers.has(inputType)) {
      throw new Error(`UIRegistry: input handler "${inputType}" already registered`)
    }
    this.inputHandlers.set(inputType, def)
  }

  getInputHandler(inputType: string): InputHandlerDef | undefined {
    return this.inputHandlers.get(inputType)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/registry.test.ts --reporter=verbose`
Expected: All PASS (existing + 3 new)

- [ ] **Step 5: Commit**

```
feat(ui-system): add registerInputHandler / getInputHandler to UIRegistry
```

---

### Task 3: Expose registerInputHandler on IUIRegistrationSDK

**Files:**

- Modify: `src/ui-system/registrationTypes.ts`
- Modify: `src/ui-system/types.ts` (re-export)

- [ ] **Step 1: Add registerInputHandler to IUIRegistrationSDK**

In `src/ui-system/registrationTypes.ts`, add the import and method:

```typescript
import type { InputHandlerDef } from './inputHandlerTypes'
```

Add to `IUIRegistrationSDK`:

```typescript
  registerInputHandler(inputType: string, def: InputHandlerDef): void
```

- [ ] **Step 2: Re-export InputHandlerDef from types.ts**

In `src/ui-system/types.ts`, add to the re-export block:

```typescript
export type { InputResult, InputHandlerProps, InputHandlerDef } from './inputHandlerTypes'
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). The `UIRegistry` already implements `registerInputHandler` from Task 2, and the `IUIRegistrationSDK` interface is structural (not class-implemented), so existing wiring in `uiSystemInit.ts` will need updating in Task 4.

- [ ] **Step 4: Commit**

```
feat(ui-system): expose registerInputHandler on IUIRegistrationSDK
```

---

### Task 4: Wire registerInputHandler into plugin SDK creation

**Files:**

- Modify: `src/ui-system/uiSystemInit.ts` (add method delegation)
- Modify: `src/ui-system/__tests__/production-wiring.test.ts`

The `IUIRegistrationSDK` is wired in `plugins/daggerheart-core/index.ts` via `sdk.ui`. We need to find where the SDK is assembled and ensure `registerInputHandler` is forwarded to the registry. Let me check how the plugin SDK `ui` property is built.

- [ ] **Step 1: Write the failing test**

Append to `src/ui-system/__tests__/production-wiring.test.ts`:

```typescript
it('getUIRegistry().registerInputHandler stores handler retrievable by getInputHandler', () => {
  const registry = getUIRegistry()
  const mockComp = (() => null) as never
  registry.registerInputHandler('test:input', { component: mockComp })
  expect(registry.getInputHandler('test:input')).toEqual({ component: mockComp })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/ui-system/__tests__/production-wiring.test.ts --reporter=verbose`
Expected: PASS (since UIRegistry already has the method from Task 2). This test validates production wiring.

- [ ] **Step 3: Verify the plugin SDK wiring compiles**

The plugin SDK `ui` property is created somewhere that implements `IUIRegistrationSDK`. Search for where it's assembled:

Run: `npx tsc --noEmit`

If there's a type error because something doesn't implement `registerInputHandler`, fix the wiring site (likely in the VTTPlugin activation path) by forwarding to `registry.registerInputHandler(...)`.

- [ ] **Step 4: Commit**

```
feat(ui-system): wire registerInputHandler into production plugin SDK
```

---

### Task 5: Refactor sessionStore requestInput — InputResult + inputType tracking

**Files:**

- Modify: `src/stores/sessionStore.ts`
- Modify: `src/stores/__tests__/requestInput.test.ts`

- [ ] **Step 1: Write new failing tests for InputResult-based API**

Replace the contents of `src/stores/__tests__/requestInput.test.ts` with updated tests. The key changes: `requestInput` now takes `(inputType, options?)`, returns `Promise<InputResult<T>>`, and `PendingInteraction` tracks `inputType` + `context`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSessionStore, requestInput, resolveInput, cancelInput } from '../sessionStore'
import type { InputResult } from '../../ui-system/inputHandlerTypes'

beforeEach(() => {
  useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
})

describe('requestInput — InputResult API', () => {
  it('requestInput pauses (Promise hangs until resolved)', async () => {
    let settled = false
    const promise = requestInput('test:modifier').then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(useSessionStore.getState().pendingInteractions.size).toBe(1)

    // Get the interaction ID from the store
    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    resolveInput(interactionId!, 'done')
    await promise
    expect(settled).toBe(true)
  })

  it('resolveInput returns ok result with value', async () => {
    const promise = requestInput<{ x: number }>('test:position')

    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    resolveInput(interactionId!, { x: 10 })

    const result = await promise
    expect(result).toEqual({ ok: true, value: { x: 10 } })
  })

  it('cancelInput returns cancelled result (not rejection)', async () => {
    const promise = requestInput('test:confirm')

    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    cancelInput(interactionId!)

    const result = await promise
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('stores inputType and context in PendingInteraction', async () => {
    requestInput('test:modifier', { context: { attr: 'str' } })

    const [, pending] = [...useSessionStore.getState().pendingInteractions.entries()][0]!
    expect(pending.inputType).toBe('test:modifier')
    expect(pending.context).toEqual({ attr: 'str' })
  })

  it('multiple parallel interactions supported', async () => {
    const p1 = requestInput('test:a')
    const p2 = requestInput('test:b')

    expect(useSessionStore.getState().pendingInteractions.size).toBe(2)

    const ids = [...useSessionStore.getState().pendingInteractions.keys()]
    resolveInput(ids[1]!, 'second')
    resolveInput(ids[0]!, 'first')

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ ok: true, value: 'first' })
    expect(r2).toEqual({ ok: true, value: 'second' })
    expect(useSessionStore.getState().pendingInteractions.size).toBe(0)
  })

  it('timeout returns timeout result', async () => {
    vi.useFakeTimers()

    const promise = requestInput('test:timed', { timeout: 5000 })

    vi.advanceTimersByTime(5000)

    const result = await promise
    expect(result).toEqual({ ok: false, reason: 'timeout' })
    expect(useSessionStore.getState().pendingInteractions.size).toBe(0)

    vi.useRealTimers()
  })

  it('resolveInput on unknown id is a no-op', () => {
    resolveInput('nonexistent', 'value')
  })

  it('cancelInput on unknown id is a no-op', () => {
    cancelInput('nonexistent')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/__tests__/requestInput.test.ts --reporter=verbose`
Expected: FAIL — new tests fail because API hasn't changed yet

- [ ] **Step 3: Implement the refactored sessionStore**

Replace `src/stores/sessionStore.ts`:

```typescript
// src/stores/sessionStore.ts
// Client-only session state: UI selection + pending interactions.
import { create } from 'zustand'
import type { InputResult } from '../ui-system/inputHandlerTypes'
import { uuidv7 } from '../shared/uuidv7'

export interface PendingInteraction {
  interactionId: string
  inputType: string
  context: unknown
  resolve: (value: unknown) => void
}

interface SessionState {
  selection: string[]
  pendingInteractions: Map<string, PendingInteraction>
}

export const useSessionStore = create<SessionState>(() => ({
  selection: [],
  pendingInteractions: new Map(),
}))

// Write function — only called by core:set-selection workflow step
export function _setSelection(entityIds: string[]): void {
  useSessionStore.setState({ selection: entityIds })
}

export interface RequestInputOptions<TContext = unknown> {
  context?: TContext
  timeout?: number
}

export function requestInput<TResult = unknown>(
  inputType: string,
  options?: RequestInputOptions,
): Promise<InputResult<TResult>> {
  const interactionId = uuidv7()

  return new Promise<InputResult<TResult>>((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      useSessionStore.setState((s) => {
        const next = new Map(s.pendingInteractions)
        next.delete(interactionId)
        return { pendingInteractions: next }
      })
    }

    const pending: PendingInteraction = {
      interactionId,
      inputType,
      context: options?.context,
      resolve: (value: unknown) => {
        cleanup()
        resolve({ ok: true, value: value as TResult })
      },
    }

    useSessionStore.setState((s) => {
      const next = new Map(s.pendingInteractions)
      next.set(interactionId, pending)
      return { pendingInteractions: next }
    })

    if (options?.timeout !== undefined) {
      timeoutId = setTimeout(() => {
        cleanup()
        resolve({ ok: false, reason: 'timeout' })
      }, options.timeout)
    }
  })
}

export function resolveInput(interactionId: string, value: unknown): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.resolve(value)
}

export function cancelInput(interactionId: string): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  // Remove from store and resolve with cancelled
  useSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
  // Resolve the outer promise with cancelled result by calling a "cancel" path.
  // Since resolve is already the inner resolve, we need a separate cancel callback.
  // Refactor: store both resolve paths in PendingInteraction.
}
```

Wait — the cancel path needs a different approach. Let me restructure `PendingInteraction` to store the full promise resolver:

```typescript
// src/stores/sessionStore.ts
import { create } from 'zustand'
import type { InputResult } from '../ui-system/inputHandlerTypes'
import { uuidv7 } from '../shared/uuidv7'

export interface PendingInteraction {
  interactionId: string
  inputType: string
  context: unknown
  /** Called with the user's value — resolves the outer promise as { ok: true, value } */
  complete: (value: unknown) => void
  /** Called on cancel — resolves the outer promise as { ok: false, reason: 'cancelled' } */
  cancel: () => void
}

interface SessionState {
  selection: string[]
  pendingInteractions: Map<string, PendingInteraction>
}

export const useSessionStore = create<SessionState>(() => ({
  selection: [],
  pendingInteractions: new Map(),
}))

export function _setSelection(entityIds: string[]): void {
  useSessionStore.setState({ selection: entityIds })
}

export interface RequestInputOptions<TContext = unknown> {
  context?: TContext
  timeout?: number
}

export function requestInput<TResult = unknown>(
  inputType: string,
  options?: RequestInputOptions,
): Promise<InputResult<TResult>> {
  const interactionId = uuidv7()

  return new Promise<InputResult<TResult>>((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const removePending = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      useSessionStore.setState((s) => {
        const next = new Map(s.pendingInteractions)
        next.delete(interactionId)
        return { pendingInteractions: next }
      })
    }

    const pending: PendingInteraction = {
      interactionId,
      inputType,
      context: options?.context,
      complete: (value: unknown) => {
        removePending()
        resolve({ ok: true, value: value as TResult })
      },
      cancel: () => {
        removePending()
        resolve({ ok: false, reason: 'cancelled' })
      },
    }

    useSessionStore.setState((s) => {
      const next = new Map(s.pendingInteractions)
      next.set(interactionId, pending)
      return { pendingInteractions: next }
    })

    if (options?.timeout !== undefined) {
      timeoutId = setTimeout(() => {
        removePending()
        resolve({ ok: false, reason: 'timeout' })
      }, options.timeout)
    }
  })
}

export function resolveInput(interactionId: string, value: unknown): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.complete(value)
}

export function cancelInput(interactionId: string): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.cancel()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/__tests__/requestInput.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```
refactor(stores): requestInput returns InputResult<T> with inputType tracking
```

---

### Task 6: Update WorkflowContext to use new requestInput API

**Files:**

- Modify: `src/workflow/types.ts:159` (signature change)
- Modify: `src/workflow/context.ts:158` (implementation)
- Modify: `src/stores/__tests__/requestInput.test.ts` (workflow integration test)

- [ ] **Step 1: Write the failing workflow integration test**

Append to `src/stores/__tests__/requestInput.test.ts`:

```typescript
import { WorkflowEngine } from '../../workflow/engine'
import { createWorkflowContext } from '../../workflow/context'
import { createEventBus } from '../../events/eventBus'
import type { InternalState } from '../../workflow/types'

describe('ctx.requestInput — workflow integration with InputResult', () => {
  const makeDeps = () => ({
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue({
      seq: 0,
      id: '',
      type: '',
      origin: { seat: { id: '', name: '', color: '' } },
      executor: '',
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      payload: {},
      timestamp: 0,
    }),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    eventBus: createEventBus(),
    engine: new WorkflowEngine(),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: '', name: '', color: '' } }),
    getSeatId: vi.fn().mockReturnValue(''),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
  })

  it('workflow step receives InputResult on resolve', async () => {
    const deps = makeDeps()
    deps.engine.defineWorkflow('test:input-result', [
      {
        id: 'ask',
        run: async (ctx) => {
          const result = await ctx.requestInput('test:choice', { context: { options: ['a', 'b'] } })
          ctx.vars.result = result
        },
      },
    ])

    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctxObj = createWorkflowContext(deps, {}, internal)
    const resultPromise = deps.engine.runWorkflow('test:input-result', ctxObj, internal)

    await Promise.resolve()
    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    expect(interactionId).toBeDefined()

    resolveInput(interactionId!, 'picked-a')

    const wfResult = await resultPromise
    expect(wfResult.status).toBe('completed')
    expect(wfResult.data.result).toEqual({ ok: true, value: 'picked-a' })
  })

  it('workflow step receives cancelled InputResult', async () => {
    const deps = makeDeps()
    deps.engine.defineWorkflow('test:input-cancel', [
      {
        id: 'ask',
        run: async (ctx) => {
          const result = await ctx.requestInput('test:choice')
          ctx.vars.result = result
        },
      },
    ])

    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctxObj = createWorkflowContext(deps, {}, internal)
    const resultPromise = deps.engine.runWorkflow('test:input-cancel', ctxObj, internal)

    await Promise.resolve()
    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    cancelInput(interactionId!)

    const wfResult = await resultPromise
    expect(wfResult.status).toBe('completed')
    expect(wfResult.data.result).toEqual({ ok: false, reason: 'cancelled' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/__tests__/requestInput.test.ts --reporter=verbose`
Expected: FAIL — `ctx.requestInput` signature doesn't match yet

- [ ] **Step 3: Update WorkflowContext.requestInput signature**

In `src/workflow/types.ts`, change line 159:

```typescript
// Before:
requestInput(interactionId: string): Promise<unknown>

// After:
import type { InputResult, RequestInputOptions } from '../ui-system/inputHandlerTypes'

requestInput<TResult = unknown>(
  inputType: string,
  options?: RequestInputOptions,
): Promise<InputResult<TResult>>
```

Also add to the imports at the top of the file:

```typescript
import type { InputResult } from '../ui-system/inputHandlerTypes'
```

And add `RequestInputOptions` to the exports from `inputHandlerTypes.ts`:

```typescript
// src/ui-system/inputHandlerTypes.ts — add:
export interface RequestInputOptions<TContext = unknown> {
  context?: TContext
  timeout?: number
}
```

Remove the duplicate `RequestInputOptions` from `sessionStore.ts` and import it instead:

```typescript
import type { InputResult, RequestInputOptions } from '../ui-system/inputHandlerTypes'
```

- [ ] **Step 4: Update context.ts to forward new signature**

In `src/workflow/context.ts`, change line 158:

```typescript
// Before:
requestInput: (interactionId: string) => sessionRequestInput(interactionId),

// After:
requestInput: ((inputType: string, options?: { context?: unknown; timeout?: number }) =>
  sessionRequestInput(inputType, options)) as WorkflowContext['requestInput'],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/stores/__tests__/requestInput.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 6: Run full test suite to check no regressions**

Run: `npx vitest run --reporter=verbose`
Expected: All 1252+ tests PASS

- [ ] **Step 7: Commit**

```
refactor(workflow): ctx.requestInput returns InputResult<T> with typed context
```

---

### Task 7: InputHandlerHost — React Portal that renders active input handlers

**Files:**

- Create: `src/ui-system/InputHandlerHost.tsx`
- Create: `src/ui-system/__tests__/InputHandlerHost.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ui-system/__tests__/InputHandlerHost.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { InputHandlerHost } from '../InputHandlerHost'
import { UIRegistry } from '../registry'
import { useSessionStore, requestInput, resolveInput, cancelInput } from '../../stores/sessionStore'
import type { InputHandlerProps } from '../inputHandlerTypes'

// A simple test handler that renders a button to resolve
function TestHandler({ context, resolve, cancel }: InputHandlerProps<{ label: string }, string>) {
  return (
    <div data-testid="test-handler">
      <span>{(context as { label: string }).label}</span>
      <button onClick={() => resolve('picked')}>Pick</button>
      <button onClick={() => cancel()}>Cancel</button>
    </div>
  )
}

describe('InputHandlerHost', () => {
  let registry: UIRegistry

  beforeEach(() => {
    registry = new UIRegistry()
    useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
  })

  it('renders nothing when no pending interactions', () => {
    const { container } = render(<InputHandlerHost registry={registry} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders registered handler when interaction is pending', async () => {
    registry.registerInputHandler('test:choice', { component: TestHandler as never })

    render(<InputHandlerHost registry={registry} />)

    // Trigger requestInput (adds to pendingInteractions)
    act(() => {
      requestInput('test:choice', { context: { label: 'Choose one' } })
    })

    expect(screen.getByTestId('test-handler')).toBeDefined()
    expect(screen.getByText('Choose one')).toBeDefined()
  })

  it('unmounts handler after resolve', async () => {
    registry.registerInputHandler('test:choice', { component: TestHandler as never })

    render(<InputHandlerHost registry={registry} />)

    let result: unknown
    act(() => {
      requestInput('test:choice', { context: { label: 'Pick' } }).then((r) => {
        result = r
      })
    })

    expect(screen.getByTestId('test-handler')).toBeDefined()

    // Click resolve
    act(() => {
      screen.getByText('Pick').click()
    })

    // Handler should be gone
    expect(screen.queryByTestId('test-handler')).toBeNull()
  })

  it('unmounts handler after cancel', async () => {
    registry.registerInputHandler('test:choice', { component: TestHandler as never })

    render(<InputHandlerHost registry={registry} />)

    act(() => {
      requestInput('test:choice', { context: { label: 'Pick' } })
    })

    act(() => {
      screen.getByText('Cancel').click()
    })

    expect(screen.queryByTestId('test-handler')).toBeNull()
  })

  it('does not render handler if inputType has no registered handler', () => {
    render(<InputHandlerHost registry={registry} />)

    act(() => {
      requestInput('unregistered:type')
    })

    // No handler rendered (but interaction is still pending)
    expect(screen.queryByTestId('test-handler')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui-system/__tests__/InputHandlerHost.test.tsx --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement InputHandlerHost**

```typescript
// src/ui-system/InputHandlerHost.tsx
import { createPortal } from 'react-dom'
import { useSessionStore } from '../stores/sessionStore'
import type { UIRegistry } from './registry'
import type { PendingInteraction } from '../stores/sessionStore'

interface Props {
  registry: UIRegistry
}

function InputHandlerInstance({
  pending,
  registry,
}: {
  pending: PendingInteraction
  registry: UIRegistry
}) {
  const def = registry.getInputHandler(pending.inputType)
  if (!def) return null

  const HandlerComponent = def.component

  return (
    <HandlerComponent
      context={pending.context}
      resolve={(value: unknown) => pending.complete(value)}
      cancel={() => pending.cancel()}
    />
  )
}

export function InputHandlerHost({ registry }: Props) {
  const pendingInteractions = useSessionStore((s) => s.pendingInteractions)

  if (pendingInteractions.size === 0) return null

  return createPortal(
    <>
      {[...pendingInteractions.values()].map((pending) => (
        <InputHandlerInstance
          key={pending.interactionId}
          pending={pending}
          registry={registry}
        />
      ))}
    </>,
    document.body,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/InputHandlerHost.test.tsx --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat(ui-system): add InputHandlerHost — Portal-based renderer for input handlers
```

---

### Task 8: Mount InputHandlerHost in the app

**Files:**

- Modify: The root component or layout component that renders `PanelRenderer` (find via grep for `<PanelRenderer`)
- Modify: `src/ui-system/__tests__/production-wiring.test.ts`

- [ ] **Step 1: Find where PanelRenderer is mounted**

Run: `grep -r "PanelRenderer" --include="*.tsx" -l` to find the mount point.

- [ ] **Step 2: Add InputHandlerHost next to PanelRenderer**

Import and render `<InputHandlerHost registry={registry} />` as a sibling of `PanelRenderer` in the same parent component. It must be rendered unconditionally (not inside a layout container).

```tsx
import { InputHandlerHost } from './ui-system/InputHandlerHost'

// In the render tree, after PanelRenderer:
;<InputHandlerHost registry={registry} />
```

- [ ] **Step 3: Add integration test**

Append to `src/ui-system/__tests__/production-wiring.test.ts`:

```typescript
it('InputHandlerHost is importable and constructable', async () => {
  const { InputHandlerHost } = await import('../InputHandlerHost')
  expect(InputHandlerHost).toBeTypeOf('function')
})
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(ui-system): mount InputHandlerHost in app root
```

---

### Task 9: E2E integration test — full workflow → InputHandler → resolve cycle

**Files:**

- Create: `src/ui-system/__tests__/inputHandler-e2e.test.tsx`

This test validates the entire chain: workflow calls `requestInput` → `InputHandlerHost` renders the handler → user action resolves → workflow continues.

- [ ] **Step 1: Write the E2E integration test**

```typescript
// src/ui-system/__tests__/inputHandler-e2e.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { InputHandlerHost } from '../InputHandlerHost'
import { UIRegistry } from '../registry'
import { useSessionStore, resolveInput } from '../../stores/sessionStore'
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
```

- [ ] **Step 2: Run the E2E test**

Run: `npx vitest run src/ui-system/__tests__/inputHandler-e2e.test.tsx --reporter=verbose`
Expected: All PASS (all infrastructure from Tasks 1-8 wired up)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```
test(ui-system): E2E test — workflow → InputHandler → resolve cycle
```

---

### Task 10: openPanel initial position support

**Files:**

- Modify: `src/ui-system/types.ts:109` (openPanel signature)
- Modify: `src/stores/layoutStore.ts` (addEntry called by openPanel)
- Modify: `src/ui-system/uiSystemInit.ts` (SDK factory wiring)
- Modify: `src/ui-system/__tests__/production-wiring.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/ui-system/__tests__/production-wiring.test.ts`:

```typescript
it('openPanel passes initial position to layout addEntry', () => {
  const store = createLayoutStore()
  store.getState().loadLayout({ narrative: {}, tactical: {} })

  const registry = getUIRegistry()
  registry.registerComponent({
    id: 'test.positioned',
    component: (() => null) as never,
    type: 'panel',
    defaultSize: { width: 200, height: 150 },
  })

  const sdk = createProductionSDK({
    instanceKey: 'test.positioned#1',
    instanceProps: {},
    role: 'GM',
    layoutMode: 'play',
    read: {
      entity: () => undefined,
      component: () => undefined,
      query: () => [],
      formulaTokens: () => ({}),
    },
    workflow: { runWorkflow: vi.fn() } as never,
    awarenessManager: null,
    layoutActions: {
      openPanel: (componentId, instanceProps, position) => {
        const def = registry.getComponent(componentId)
        const key = `${componentId}#${Date.now()}`
        store.getState().addEntry(key, {
          x: position?.x ?? 100,
          y: position?.y ?? 100,
          width: def?.defaultSize.width ?? 200,
          height: def?.defaultSize.height ?? 150,
          zOrder: 0,
          instanceProps: instanceProps,
        })
        return key
      },
      closePanel: () => {},
    },
    logSubscribe: null,
  })

  sdk.ui.openPanel('test.positioned', {}, { x: 300, y: 400 })

  const layout = store.getState().activeLayout
  const keys = Object.keys(layout)
  expect(keys).toHaveLength(1)
  expect(layout[keys[0]!]!.x).toBe(300)
  expect(layout[keys[0]!]!.y).toBe(400)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui-system/__tests__/production-wiring.test.ts --reporter=verbose`
Expected: FAIL — `openPanel` doesn't accept position parameter

- [ ] **Step 3: Update openPanel signature**

In `src/ui-system/types.ts`, update the `ui` section of `IComponentSDK`:

```typescript
  ui: {
    openPanel(
      componentId: string,
      instanceProps?: Record<string, unknown>,
      position?: { x: number; y: number },
    ): string
    closePanel(instanceKey: string): void
  }
```

Update `SDKFactoryArgs.layoutActions` in `src/ui-system/uiSystemInit.ts`:

```typescript
  layoutActions: {
    openPanel(
      componentId: string,
      instanceProps?: Record<string, unknown>,
      position?: { x: number; y: number },
    ): string
    closePanel(instanceKey: string): void
  } | null
```

Update the fallback:

```typescript
    ui: args.layoutActions ?? {
      openPanel: () => '',
      closePanel: () => {},
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui-system/__tests__/production-wiring.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat(ui-system): openPanel accepts optional initial position
```

---

### Task 11: Type check + full regression

- [ ] **Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS (1252 + new tests)

- [ ] **Step 3: Final commit if any remaining changes**

```
chore: type check clean-up after input handler system
```
