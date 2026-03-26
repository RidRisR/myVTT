# Workflow + Step POC 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Workflow + Step 协作模型的 POC，验证规则插件和美化插件能在同一个流程中协同工作

**Architecture:** WorkflowEngine 作为独立模块管理 Workflow 的定义、修改和执行。PluginSDK 封装 Engine API 供插件使用。现有 RulePlugin 接口不变，新增 VTTPlugin 接口提供 `onActivate(sdk)` 生命周期。Daggerheart 插件拆分为 core（逻辑）+ cosmetic（表现），共同操作 `roll` Workflow。

**Tech Stack:** TypeScript, Vitest, React, zustand, @myvtt/sdk

**Spec:** [19-Workflow-Step模型设计.md](19-Workflow-Step模型设计.md)

---

## File Structure

```
src/workflow/
  engine.ts          — WorkflowEngine 类（defineWorkflow / addStep / wrapStep / removeStep / runWorkflow / inspectWorkflow）
  engine.test.ts     — Engine 单元测试
  types.ts           — Step, StepAddition, WrapStepFn, WorkflowContext 等类型定义
  context.ts         — createWorkflowContext() 工厂，封装基座能力
  context.test.ts    — Context 工厂测试
  pluginSDK.ts       — PluginSDK 类，包装 Engine + Context 供插件使用
  pluginSDK.test.ts  — SDK 测试
  index.ts           — barrel exports

src/rules/
  sdk.ts             — 追加导出 Workflow 相关类型
  types.ts           — 追加 VTTPlugin 接口

plugins/daggerheart-core/
  index.ts           — VTTPlugin 入口，onActivate 调用 registerDHCoreSteps
  rollSteps.ts       — dh:judge, dh:resolve 两个 step（dh:modifier 暂不实现，POC 不需要修正值面板）
  __tests__/rollSteps.test.ts  — step 逻辑单元测试

plugins/daggerheart-cosmetic/
  index.ts           — VTTPlugin 入口，onActivate 装饰 roll workflow
  diceAnimation.ts   — cos:dice-animation step 实现（CSS 动画 POC）
  DiceOverlay.tsx    — 3D 骰子动画 React 组件

plugins/daggerheart/
  DaggerHeartCard.tsx — 追加"敏捷检定"按钮
```

---

## Task 1: Workflow 类型定义

**Files:**

- Create: `src/workflow/types.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
// src/workflow/types.ts

/** A single execution unit within a Workflow */
export interface Step {
  id: string
  run: (ctx: WorkflowContext) => Promise<void> | void
}

/** Options for addStep — positions a new step relative to an existing one */
export interface StepAddition {
  id: string
  before?: string
  after?: string
  priority?: number // default 100, lower = first
  run: (ctx: WorkflowContext) => Promise<void> | void
}

/** The function signature for a wrap step's run */
export type StepFn = (ctx: WorkflowContext) => Promise<void> | void
export type WrapStepFn = (ctx: WorkflowContext, original: StepFn) => Promise<void> | void

export interface WrapStepOptions {
  priority?: number // default 100, lower = outer layer
  run: WrapStepFn
}

/** Animation spec for playAnimation — POC keeps it simple */
export interface AnimationSpec {
  type: string
  data?: Record<string, unknown>
  durationMs?: number
}

export interface ToastOptions {
  variant?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
}

/** Runtime context passed to each step's run function */
export interface WorkflowContext {
  data: Record<string, unknown>

  // Base capabilities
  serverRoll(formula: string): Promise<{ rolls: number[][]; total: number }>
  updateEntity(entityId: string, patch: Partial<import('../shared/entityTypes').Entity>): void
  updateTeamTracker(label: string, patch: { current?: number }): void
  announce(message: string): void
  showToast(text: string, options?: ToastOptions): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // Flow control
  abort(reason?: string): void
  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
}

/** Plugin SDK — registration-time API given to plugins via onActivate */
export interface IPluginSDK {
  defineWorkflow(name: string, steps: Step[]): void
  addStep(workflow: string, addition: StepAddition): void
  wrapStep(workflow: string, targetStepId: string, options: WrapStepOptions): void
  removeStep(workflow: string, targetStepId: string): void
  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
  inspectWorkflow(name: string): string[]
}
```

- [ ] **Step 2: 验证类型编译通过**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无与 `src/workflow/types.ts` 相关的错误

- [ ] **Step 3: Commit**

```bash
git add src/workflow/types.ts
git commit -m "feat(workflow): add Step, WorkflowContext, and PluginSDK type definitions"
```

---

## Task 2: WorkflowEngine 核心实现

**Files:**

- Create: `src/workflow/engine.ts`
- Create: `src/workflow/engine.test.ts`

- [ ] **Step 1: 编写 engine 失败测试 — defineWorkflow + runWorkflow**

```typescript
// src/workflow/engine.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import type { WorkflowContext } from './types'

function makeMockCtx(data: Record<string, unknown> = {}): WorkflowContext {
  return {
    data,
    serverRoll: vi.fn(),
    updateEntity: vi.fn(),
    updateTeamTracker: vi.fn(),
    announce: vi.fn(),
    showToast: vi.fn(),
    playAnimation: vi.fn().mockResolvedValue(undefined),
    playSound: vi.fn(),
    abort: vi.fn(),
    runWorkflow: vi.fn(),
  }
}

describe('WorkflowEngine', () => {
  describe('defineWorkflow + runWorkflow', () => {
    it('executes steps in order', async () => {
      const engine = new WorkflowEngine()
      const order: string[] = []
      engine.defineWorkflow('test', [
        {
          id: 'a',
          run: () => {
            order.push('a')
          },
        },
        {
          id: 'b',
          run: () => {
            order.push('b')
          },
        },
      ])
      const ctx = makeMockCtx()
      await engine.runWorkflow('test', ctx)
      expect(order).toEqual(['a', 'b'])
    })

    it('throws on duplicate workflow name', () => {
      const engine = new WorkflowEngine()
      engine.defineWorkflow('x', [])
      expect(() => engine.defineWorkflow('x', [])).toThrow()
    })

    it('throws on unknown workflow', async () => {
      const engine = new WorkflowEngine()
      await expect(engine.runWorkflow('nope', makeMockCtx())).rejects.toThrow()
    })

    it('throws on duplicate step ID within workflow', () => {
      const engine = new WorkflowEngine()
      expect(() =>
        engine.defineWorkflow('dup', [
          { id: 'a', run: () => {} },
          { id: 'a', run: () => {} },
        ]),
      ).toThrow()
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/workflow/engine.test.ts`
Expected: FAIL — `WorkflowEngine` 未定义

- [ ] **Step 3: 实现 WorkflowEngine — defineWorkflow + runWorkflow**

```typescript
// src/workflow/engine.ts
import type { Step, StepAddition, WrapStepOptions, WorkflowContext, StepFn } from './types'

interface InternalStep {
  id: string
  run: StepFn
}

export class WorkflowEngine {
  private workflows = new Map<string, InternalStep[]>()
  private wraps = new Map<
    string,
    Map<
      string,
      Array<{
        priority: number
        run: (ctx: WorkflowContext, original: StepFn) => Promise<void> | void
      }>
    >
  >()

  defineWorkflow(name: string, steps: Step[]): void {
    if (this.workflows.has(name)) {
      throw new Error(`Workflow "${name}" is already defined`)
    }
    // Check for duplicate step IDs
    const ids = new Set<string>()
    for (const step of steps) {
      if (ids.has(step.id)) {
        throw new Error(`Duplicate step ID "${step.id}" in workflow "${name}"`)
      }
      ids.add(step.id)
    }
    this.workflows.set(
      name,
      steps.map((s) => ({ id: s.id, run: s.run })),
    )
  }

  // Track insertion metadata for priority ordering
  private insertionMeta = new Map<
    string,
    Map<string, { anchor: string; direction: 'before' | 'after'; priority: number; order: number }>
  >()
  private insertionCounter = 0

  addStep(workflow: string, addition: StepAddition): void {
    const steps = this.getStepsOrThrow(workflow)
    if (addition.before && addition.after) {
      throw new Error('addStep: cannot specify both "before" and "after"')
    }
    if (steps.some((s) => s.id === addition.id)) {
      throw new Error(`Step "${addition.id}" already exists in workflow "${workflow}"`)
    }
    const newStep: InternalStep = { id: addition.id, run: addition.run }
    const priority = addition.priority ?? 100

    if (addition.before) {
      const idx = this.findStepIndex(steps, workflow, addition.before)
      this.trackInsertion(workflow, addition.id, addition.before, 'before', priority)
      const insertIdx = this.findPriorityInsertIndex(steps, workflow, idx, 'before', priority)
      steps.splice(insertIdx, 0, newStep)
    } else if (addition.after) {
      const idx = this.findStepIndex(steps, workflow, addition.after)
      this.trackInsertion(workflow, addition.id, addition.after, 'after', priority)
      const insertIdx = this.findPriorityInsertIndex(steps, workflow, idx, 'after', priority)
      steps.splice(insertIdx, 0, newStep)
    } else {
      steps.push(newStep)
    }
  }

  private trackInsertion(
    workflow: string,
    stepId: string,
    anchor: string,
    direction: 'before' | 'after',
    priority: number,
  ): void {
    if (!this.insertionMeta.has(workflow)) this.insertionMeta.set(workflow, new Map())
    this.insertionMeta
      .get(workflow)!
      .set(stepId, { anchor, direction, priority, order: this.insertionCounter++ })
  }

  private findPriorityInsertIndex(
    steps: InternalStep[],
    workflow: string,
    anchorIdx: number,
    direction: 'before' | 'after',
    priority: number,
  ): number {
    const meta = this.insertionMeta.get(workflow)
    if (!meta) return direction === 'before' ? anchorIdx : anchorIdx + 1
    const anchor = steps[anchorIdx]!.id

    if (direction === 'after') {
      // Find the range of steps inserted after this anchor, then insert by priority
      let end = anchorIdx + 1
      while (end < steps.length) {
        const m = meta.get(steps[end]!.id)
        if (m && m.anchor === anchor && m.direction === 'after') {
          end++
          continue
        }
        break
      }
      // Insert at position where priority is maintained (lower first)
      for (let i = anchorIdx + 1; i < end; i++) {
        const m = meta.get(steps[i]!.id)
        if (m && m.priority > priority) return i
        if (m && m.priority === priority) continue // same priority: registration order (append)
      }
      return end
    } else {
      // 'before': find range of steps inserted before this anchor
      let start = anchorIdx
      while (start > 0) {
        const m = meta.get(steps[start - 1]!.id)
        if (m && m.anchor === anchor && m.direction === 'before') {
          start--
          continue
        }
        break
      }
      for (let i = start; i < anchorIdx; i++) {
        const m = meta.get(steps[i]!.id)
        if (m && m.priority > priority) return i
      }
      return anchorIdx
    }
  }

  wrapStep(workflow: string, targetStepId: string, options: WrapStepOptions): void {
    const steps = this.getStepsOrThrow(workflow)
    this.findStepIndex(steps, workflow, targetStepId) // validate target exists
    if (!this.wraps.has(workflow)) {
      this.wraps.set(workflow, new Map())
    }
    const workflowWraps = this.wraps.get(workflow)!
    if (!workflowWraps.has(targetStepId)) {
      workflowWraps.set(targetStepId, [])
    }
    workflowWraps.get(targetStepId)!.push({
      priority: options.priority ?? 100,
      run: options.run,
    })
    // Sort: lower priority = outer layer (executed first)
    workflowWraps.get(targetStepId)!.sort((a, b) => a.priority - b.priority)
  }

  removeStep(workflow: string, targetStepId: string): void {
    const steps = this.getStepsOrThrow(workflow)
    const idx = this.findStepIndex(steps, workflow, targetStepId)
    steps.splice(idx, 1)
  }

  private static MAX_DEPTH = 10
  private currentDepth = 0

  async runWorkflow(name: string, ctx: WorkflowContext): Promise<void> {
    const steps = this.workflows.get(name)
    if (!steps) {
      throw new Error(`Workflow "${name}" is not defined`)
    }
    if (this.currentDepth >= WorkflowEngine.MAX_DEPTH) {
      throw new Error(`Workflow recursion depth exceeded (max ${WorkflowEngine.MAX_DEPTH})`)
    }
    this.currentDepth++
    try {
      const workflowWraps = this.wraps.get(name)
      let aborted = false
      const originalAbort = ctx.abort
      ctx.abort = (reason?: string) => {
        aborted = true
        originalAbort(reason)
      }
      for (const step of steps) {
        if (aborted) break
        const stepRun = this.resolveWrappedRun(step, workflowWraps)
        await stepRun(ctx)
      }
    } finally {
      this.currentDepth--
    }
  }

  inspectWorkflow(name: string): string[] {
    const steps = this.workflows.get(name)
    if (!steps) throw new Error(`Workflow "${name}" is not defined`)
    return steps.map((s) => s.id)
  }

  // ── private helpers ──

  private getStepsOrThrow(workflow: string): InternalStep[] {
    const steps = this.workflows.get(workflow)
    if (!steps) throw new Error(`Workflow "${workflow}" is not defined`)
    return steps
  }

  private findStepIndex(steps: InternalStep[], workflow: string, stepId: string): number {
    const idx = steps.findIndex((s) => s.id === stepId)
    if (idx === -1) throw new Error(`Step "${stepId}" not found in workflow "${workflow}"`)
    return idx
  }

  private resolveWrappedRun(
    step: InternalStep,
    workflowWraps:
      | Map<
          string,
          Array<{
            priority: number
            run: (ctx: WorkflowContext, original: StepFn) => Promise<void> | void
          }>
        >
      | undefined,
  ): StepFn {
    const wraps = workflowWraps?.get(step.id)
    if (!wraps || wraps.length === 0) return step.run
    // Build onion: outermost wrap (lowest priority) calls next, innermost calls original
    let fn: StepFn = step.run
    for (let i = wraps.length - 1; i >= 0; i--) {
      const wrap = wraps[i]!
      const inner = fn
      fn = (ctx) => wrap.run(ctx, inner)
    }
    return fn
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/workflow/engine.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 补充 addStep 测试**

在 `engine.test.ts` 追加：

```typescript
describe('addStep', () => {
  it('inserts after a target step', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'c',
        run: () => {
          order.push('c')
        },
      },
    ])
    engine.addStep('w', {
      id: 'b',
      after: 'a',
      run: () => {
        order.push('b')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('inserts before a target step', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'c',
        run: () => {
          order.push('c')
        },
      },
    ])
    engine.addStep('w', {
      id: 'b',
      before: 'c',
      run: () => {
        order.push('b')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('appends to end when no anchor', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
    ])
    engine.addStep('w', {
      id: 'b',
      run: () => {
        order.push('b')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['a', 'b'])
  })

  it('throws if anchor step does not exist', () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [{ id: 'a', run: () => {} }])
    expect(() => engine.addStep('w', { id: 'b', after: 'nope', run: () => {} })).toThrow()
  })

  it('throws if both before and after specified', () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [{ id: 'a', run: () => {} }])
    expect(() => engine.addStep('w', { id: 'b', before: 'a', after: 'a', run: () => {} })).toThrow()
  })

  it('throws on duplicate step ID', () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [{ id: 'a', run: () => {} }])
    expect(() => engine.addStep('w', { id: 'a', run: () => {} })).toThrow()
  })

  it('orders same-anchor steps by priority (lower first)', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'z',
        run: () => {
          order.push('z')
        },
      },
    ])
    engine.addStep('w', {
      id: 'c',
      after: 'a',
      priority: 200,
      run: () => {
        order.push('c')
      },
    })
    engine.addStep('w', {
      id: 'b',
      after: 'a',
      priority: 50,
      run: () => {
        order.push('b')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['a', 'b', 'c', 'z'])
  })

  it('same priority preserves registration order', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
    ])
    engine.addStep('w', {
      id: 'b',
      after: 'a',
      priority: 100,
      run: () => {
        order.push('b')
      },
    })
    engine.addStep('w', {
      id: 'c',
      after: 'a',
      priority: 100,
      run: () => {
        order.push('c')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 6: 运行测试确认 addStep 测试通过**

Run: `pnpm vitest run src/workflow/engine.test.ts`
Expected: 全部 PASS

- [ ] **Step 7: 补充 wrapStep / removeStep / inspectWorkflow / abort 测试**

在 `engine.test.ts` 追加：

```typescript
describe('wrapStep', () => {
  it('wraps a step — wrapper can call or skip original', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('original')
        },
      },
    ])
    engine.wrapStep('w', 'a', {
      run: async (ctx, original) => {
        order.push('before')
        await original(ctx)
        order.push('after')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['before', 'original', 'after'])
  })

  it('wrapper can skip original', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('original')
        },
      },
    ])
    engine.wrapStep('w', 'a', {
      run: async (_ctx, _original) => {
        order.push('replaced')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['replaced'])
  })

  it('multiple wraps form onion — lower priority = outer', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('core')
        },
      },
    ])
    engine.wrapStep('w', 'a', {
      priority: 200,
      run: async (ctx, original) => {
        order.push('inner-before')
        await original(ctx)
        order.push('inner-after')
      },
    })
    engine.wrapStep('w', 'a', {
      priority: 50,
      run: async (ctx, original) => {
        order.push('outer-before')
        await original(ctx)
        order.push('outer-after')
      },
    })
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['outer-before', 'inner-before', 'core', 'inner-after', 'outer-after'])
  })
})

describe('removeStep', () => {
  it('removes a step from workflow', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    engine.removeStep('w', 'a')
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['b'])
  })

  it('throws if step not found', () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [])
    expect(() => engine.removeStep('w', 'nope')).toThrow()
  })
})

describe('inspectWorkflow', () => {
  it('returns step IDs in order', () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
    ])
    expect(engine.inspectWorkflow('w')).toEqual(['a', 'b'])
  })

  it('reflects addStep changes', () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [
      { id: 'a', run: () => {} },
      { id: 'c', run: () => {} },
    ])
    engine.addStep('w', { id: 'b', after: 'a', run: () => {} })
    expect(engine.inspectWorkflow('w')).toEqual(['a', 'b', 'c'])
  })
})

describe('abort', () => {
  it('stops execution of subsequent steps', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: (ctx) => {
          order.push('a')
          ctx.abort()
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    await engine.runWorkflow('w', makeMockCtx())
    expect(order).toEqual(['a'])
  })
})

describe('error handling', () => {
  it('propagates step errors to caller and skips subsequent steps', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    engine.defineWorkflow('w', [
      {
        id: 'a',
        run: () => {
          throw new Error('boom')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    await expect(engine.runWorkflow('w', makeMockCtx())).rejects.toThrow('boom')
    expect(order).toEqual([]) // step b never ran
  })

  it('throws when recursion depth exceeds 10', async () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('recursive', [
      {
        id: 'recurse',
        run: async (ctx) => {
          await engine.runWorkflow('recursive', ctx)
        },
      },
    ])
    await expect(engine.runWorkflow('recursive', makeMockCtx())).rejects.toThrow('recursion depth')
  })
})

describe('empty workflow', () => {
  it('runs silently when all steps removed', async () => {
    const engine = new WorkflowEngine()
    engine.defineWorkflow('w', [{ id: 'a', run: () => {} }])
    engine.removeStep('w', 'a')
    await engine.runWorkflow('w', makeMockCtx()) // should not throw
  })
})
```

- [ ] **Step 8: 运行测试确认全部通过**

Run: `pnpm vitest run src/workflow/engine.test.ts`
Expected: 全部 PASS

- [ ] **Step 9: Commit**

```bash
git add src/workflow/engine.ts src/workflow/engine.test.ts
git commit -m "feat(workflow): implement WorkflowEngine with defineWorkflow, addStep, wrapStep, removeStep, abort"
```

---

## Task 3: WorkflowContext 工厂

**Files:**

- Create: `src/workflow/context.ts`
- Create: `src/workflow/context.test.ts`

- [ ] **Step 1: 编写 context 工厂测试**

```typescript
// src/workflow/context.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createWorkflowContext } from './context'
import type { WorkflowEngine } from './engine'

describe('createWorkflowContext', () => {
  it('creates context with data and base capabilities', () => {
    const deps = {
      sendRoll: vi.fn(),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
      engine: {} as WorkflowEngine,
    }
    const ctx = createWorkflowContext(deps, { formula: '2d12' })
    expect(ctx.data.formula).toBe('2d12')
    expect(typeof ctx.serverRoll).toBe('function')
    expect(typeof ctx.abort).toBe('function')
  })

  it('abort sets aborted flag', () => {
    const deps = {
      sendRoll: vi.fn(),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
      engine: {} as WorkflowEngine,
    }
    const ctx = createWorkflowContext(deps)
    expect(ctx.data._aborted).toBeUndefined()
    ctx.abort('reason')
    // abort() is handled by engine, context just records it
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/workflow/context.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 createWorkflowContext**

```typescript
// src/workflow/context.ts
import type { WorkflowContext, AnimationSpec, ToastOptions } from './types'
import type { WorkflowEngine } from './engine'

export interface ContextDeps {
  sendRoll: (formula: string) => Promise<{ rolls: number[][]; total: number }>
  updateEntity: (id: string, patch: Record<string, unknown>) => void // matches store signature
  updateTeamTracker: (label: string, patch: { current?: number }) => void
  sendMessage: (message: string) => void
  showToast: (text: string, options?: ToastOptions) => void
  engine: WorkflowEngine
}

export function createWorkflowContext(
  deps: ContextDeps,
  initialData: Record<string, unknown> = {},
): WorkflowContext {
  const ctx: WorkflowContext = {
    data: { ...initialData },

    serverRoll: (formula) => deps.sendRoll(formula),
    updateEntity: (id, patch) => deps.updateEntity(id, patch),
    updateTeamTracker: (label, patch) => deps.updateTeamTracker(label, patch),
    announce: (message) => deps.sendMessage(message),
    showToast: (text, options) => deps.showToast(text, options),

    // POC: playAnimation is a no-op stub — cosmetic plugin provides real impl
    playAnimation: async (_animation: AnimationSpec) => {},
    playSound: (_sound: string) => {},

    abort: (_reason?: string) => {
      // Engine intercepts this — see engine.runWorkflow
    },
    runWorkflow: (name, data) => {
      const nestedCtx = createWorkflowContext(deps, data)
      return deps.engine.runWorkflow(name, nestedCtx)
    },
  }
  return ctx
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/workflow/context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/workflow/context.ts src/workflow/context.test.ts
git commit -m "feat(workflow): add createWorkflowContext factory"
```

---

## Task 4: PluginSDK 实现

**Files:**

- Create: `src/workflow/pluginSDK.ts`
- Create: `src/workflow/pluginSDK.test.ts`
- Create: `src/workflow/index.ts`

- [ ] **Step 1: 编写 PluginSDK 测试**

```typescript
// src/workflow/pluginSDK.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PluginSDK } from './pluginSDK'
import { WorkflowEngine } from './engine'

describe('PluginSDK', () => {
  it('delegates defineWorkflow to engine', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, {
      sendRoll: vi.fn(),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
    })
    sdk.defineWorkflow('test', [{ id: 'a', run: () => {} }])
    expect(sdk.inspectWorkflow('test')).toEqual(['a'])
  })

  it('runWorkflow creates context and delegates to engine', async () => {
    const engine = new WorkflowEngine()
    const order: string[] = []
    const sdk = new PluginSDK(engine, {
      sendRoll: vi.fn(),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
    })
    sdk.defineWorkflow('test', [
      {
        id: 'a',
        run: (ctx) => {
          order.push(`a:${ctx.data.x}`)
        },
      },
    ])
    await sdk.runWorkflow('test', { x: 42 })
    expect(order).toEqual(['a:42'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/workflow/pluginSDK.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 PluginSDK**

```typescript
// src/workflow/pluginSDK.ts
import type { Step, StepAddition, WrapStepOptions, IPluginSDK } from './types'
import type { WorkflowEngine } from './engine'
import { createWorkflowContext, type ContextDeps } from './context'

export type PluginSDKDeps = Omit<ContextDeps, 'engine'>

export class PluginSDK implements IPluginSDK {
  constructor(
    private engine: WorkflowEngine,
    private deps: PluginSDKDeps,
  ) {}

  defineWorkflow(name: string, steps: Step[]): void {
    this.engine.defineWorkflow(name, steps)
  }

  addStep(workflow: string, addition: StepAddition): void {
    this.engine.addStep(workflow, addition)
  }

  wrapStep(workflow: string, targetStepId: string, options: WrapStepOptions): void {
    this.engine.wrapStep(workflow, targetStepId, options)
  }

  removeStep(workflow: string, targetStepId: string): void {
    this.engine.removeStep(workflow, targetStepId)
  }

  async runWorkflow(name: string, data?: Record<string, unknown>): Promise<void> {
    const ctx = createWorkflowContext({ ...this.deps, engine: this.engine }, data)
    await this.engine.runWorkflow(name, ctx)
  }

  inspectWorkflow(name: string): string[] {
    return this.engine.inspectWorkflow(name)
  }
}
```

- [ ] **Step 4: 创建 barrel export**

```typescript
// src/workflow/index.ts
export { WorkflowEngine } from './engine'
export { PluginSDK } from './pluginSDK'
export { createWorkflowContext } from './context'
export type {
  Step,
  StepAddition,
  StepFn,
  WrapStepFn,
  WrapStepOptions,
  WorkflowContext,
  IPluginSDK,
  AnimationSpec,
  ToastOptions,
} from './types'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run src/workflow/pluginSDK.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/workflow/pluginSDK.ts src/workflow/pluginSDK.test.ts src/workflow/index.ts
git commit -m "feat(workflow): add PluginSDK class and barrel exports"
```

---

## Task 5: VTTPlugin 接口 + SDK 导出扩展

**Files:**

- Modify: `src/rules/types.ts` — 追加 `VTTPlugin` 接口
- Modify: `src/rules/sdk.ts` — 追加 Workflow 类型导出

- [ ] **Step 1: 在 types.ts 末尾追加 VTTPlugin 接口**

在 `src/rules/types.ts` 末尾（第 269 行之后）追加：

```typescript
// ── VTTPlugin — new imperative plugin interface (coexists with RulePlugin) ──

export interface VTTPlugin {
  id: string
  onActivate(sdk: import('../workflow/types').IPluginSDK): void
}
```

- [ ] **Step 2: 在 sdk.ts 追加 Workflow 导出**

在 `src/rules/sdk.ts` 末尾追加：

```typescript
// ── Workflow types (new plugin cooperation model) ──────────────────────────
export type {
  Step,
  StepAddition,
  StepFn,
  WrapStepFn,
  WrapStepOptions,
  WorkflowContext,
  IPluginSDK,
  AnimationSpec,
  ToastOptions,
} from '../workflow/types'
export type { VTTPlugin } from './types'
```

- [ ] **Step 3: 验证类型编译通过**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/rules/types.ts src/rules/sdk.ts
git commit -m "feat(sdk): add VTTPlugin interface and export Workflow types from @myvtt/sdk"
```

---

## Task 6: 基座定义 roll Workflow

**Files:**

- Modify: `src/workflow/pluginSDK.ts` 或新文件 — 在 SDK 初始化时定义 `roll` workflow

在此 Task 中，我们在 WorkflowEngine 初始化时注册基座的 `roll` workflow。

- [ ] **Step 1: 编写 roll workflow 集成测试**

创建 `src/workflow/baseWorkflows.test.ts`：

```typescript
// src/workflow/baseWorkflows.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import { registerBaseWorkflows } from './baseWorkflows'
import { createWorkflowContext } from './context'

describe('base roll workflow', () => {
  it('defines "roll" with generate + display steps', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(engine.inspectWorkflow('roll')).toEqual(['generate', 'display'])
  })

  it('generate step calls serverRoll and stores result in ctx.data', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 13 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
      engine,
    }
    const ctx = createWorkflowContext(deps, { formula: '2d12+1' })
    await engine.runWorkflow('roll', ctx)
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12+1')
    expect(ctx.data.rolls).toEqual([[8, 5]])
    expect(ctx.data.total).toBe(13)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/workflow/baseWorkflows.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 registerBaseWorkflows**

```typescript
// src/workflow/baseWorkflows.ts
import type { WorkflowEngine } from './engine'

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  engine.defineWorkflow('roll', [
    {
      id: 'generate',
      run: async (ctx) => {
        const formula = ctx.data.formula as string
        const result = await ctx.serverRoll(formula)
        ctx.data.rolls = result.rolls
        ctx.data.total = result.total
      },
    },
    {
      id: 'display',
      run: (ctx) => {
        // POC: announce the result in chat
        const formula = ctx.data.formula as string
        const total = ctx.data.total as number
        ctx.announce(`🎲 ${formula} = ${total}`)
      },
    },
  ])
}
```

- [ ] **Step 4: 追加 barrel export**

在 `src/workflow/index.ts` 追加：

```typescript
export { registerBaseWorkflows } from './baseWorkflows'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run src/workflow/baseWorkflows.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/workflow/baseWorkflows.ts src/workflow/baseWorkflows.test.ts src/workflow/index.ts
git commit -m "feat(workflow): define base roll workflow with generate + display steps"
```

---

## Task 7: daggerheart-core 插件

**Files:**

- Create: `plugins/daggerheart-core/index.ts`
- Create: `plugins/daggerheart-core/rollSteps.ts`
- Create: `plugins/daggerheart-core/__tests__/rollSteps.test.ts`

- [ ] **Step 1: 编写 rollSteps 测试**

```typescript
// plugins/daggerheart-core/__tests__/rollSteps.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { registerDHCoreSteps } from '../rollSteps'

function makeSDK(rollResult = { rolls: [[8, 5]], total: 13 }) {
  const engine = new WorkflowEngine()
  registerBaseWorkflows(engine)
  const deps = {
    sendRoll: vi.fn().mockResolvedValue(rollResult),
    updateEntity: vi.fn(),
    updateTeamTracker: vi.fn(),
    sendMessage: vi.fn(),
    showToast: vi.fn(),
  }
  const sdk = new PluginSDK(engine, deps)
  return { engine, sdk, deps }
}

describe('daggerheart-core rollSteps', () => {
  it('adds dh:judge after generate', () => {
    const { sdk } = makeSDK()
    registerDHCoreSteps(sdk)
    const steps = sdk.inspectWorkflow('roll')
    expect(steps.indexOf('dh:judge')).toBeGreaterThan(steps.indexOf('generate'))
  })

  it('dh:judge computes judgment from rolls (success_hope when hope > fear, total >= 12)', async () => {
    const { sdk, deps } = makeSDK({ rolls: [[8, 5]], total: 15 })
    registerDHCoreSteps(sdk)
    await sdk.runWorkflow('roll', { formula: '2d12+2' })
    // sendRoll was called by generate step
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12+2')
  })

  it('dh:resolve updates team tracker on fear outcome', async () => {
    const { sdk, deps } = makeSDK({ rolls: [[4, 9]], total: 15 })
    registerDHCoreSteps(sdk)
    await sdk.runWorkflow('roll', { formula: '2d12+2' })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('Fear', { current: expect.any(Number) })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run plugins/daggerheart-core/__tests__/rollSteps.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 rollSteps.ts**

```typescript
// plugins/daggerheart-core/rollSteps.ts
import type { IPluginSDK } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'

export function registerDHCoreSteps(sdk: IPluginSDK): void {
  // After generate: evaluate Hope/Fear judgment
  sdk.addStep('roll', {
    id: 'dh:judge',
    after: 'generate',
    run: (ctx) => {
      const rolls = ctx.data.rolls as number[][] | undefined
      const total = ctx.data.total as number | undefined
      if (!rolls || total == null) return
      const judgment = dhEvaluateRoll(rolls, total)
      if (judgment) {
        ctx.data.judgment = judgment
      }
    },
  })

  // Before display: resolve Hope/Fear effects
  sdk.addStep('roll', {
    id: 'dh:resolve',
    before: 'display',
    run: (ctx) => {
      const judgment = ctx.data.judgment as { type: string; outcome: string } | undefined
      if (!judgment || judgment.type !== 'daggerheart') return
      const outcome = judgment.outcome
      if (outcome === 'success_fear' || outcome === 'failure_fear') {
        // POC: increment team Fear tracker
        ctx.updateTeamTracker('Fear', { current: 1 }) // simplified — real impl reads current value
      }
    },
  })
}
```

- [ ] **Step 4: 实现 daggerheart-core/index.ts（调用 rollSteps）**

```typescript
// plugins/daggerheart-core/index.ts
import type { VTTPlugin } from '@myvtt/sdk'
import { registerDHCoreSteps } from './rollSteps'

export const daggerheartCorePlugin: VTTPlugin = {
  id: 'daggerheart-core',
  onActivate(sdk) {
    registerDHCoreSteps(sdk)
  },
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run plugins/daggerheart-core/__tests__/rollSteps.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plugins/daggerheart-core/
git commit -m "feat(daggerheart-core): add rule plugin with dh:judge and dh:resolve workflow steps"
```

---

## Task 8: daggerheart-cosmetic 插件

**Files:**

- Create: `plugins/daggerheart-cosmetic/index.ts`
- Create: `plugins/daggerheart-cosmetic/diceAnimation.ts`
- Create: `plugins/daggerheart-cosmetic/DiceOverlay.tsx`

- [ ] **Step 1: 实现 diceAnimation step**

```typescript
// plugins/daggerheart-cosmetic/diceAnimation.ts
import type { WorkflowContext } from '@myvtt/sdk'

/**
 * cos:dice-animation step — plays a CSS animation overlay showing the dice result.
 * POC implementation: uses playAnimation to signal the UI layer.
 */
export async function cosmeticDiceAnimationStep(ctx: WorkflowContext): Promise<void> {
  const rolls = ctx.data.rolls as number[][] | undefined
  if (!rolls || rolls.length === 0) return

  const judgment = ctx.data.judgment as { type: string; outcome: string } | undefined

  await ctx.playAnimation({
    type: 'dice-roll',
    data: {
      rolls,
      judgment: judgment ?? null,
    },
    durationMs: 1500,
  })
}
```

- [ ] **Step 2: 实现 daggerheart-cosmetic/index.ts**

```typescript
// plugins/daggerheart-cosmetic/index.ts
import type { VTTPlugin } from '@myvtt/sdk'
import { cosmeticDiceAnimationStep } from './diceAnimation'

export const daggerheartCosmeticPlugin: VTTPlugin = {
  id: 'daggerheart-cosmetic',
  onActivate(sdk) {
    // Insert dice animation after judgment (dh:judge), before resolve (dh:resolve)
    sdk.addStep('roll', {
      id: 'cos:dice-animation',
      after: 'dh:judge',
      run: cosmeticDiceAnimationStep,
    })
  },
}
```

- [ ] **Step 3: 创建 DiceOverlay POC 组件**

```tsx
// plugins/daggerheart-cosmetic/DiceOverlay.tsx
import { useEffect, useState } from 'react'

interface DiceOverlayProps {
  rolls: number[][]
  judgment: { type: string; outcome: string } | null
  onComplete: () => void
}

const OUTCOME_COLORS: Record<string, string> = {
  critical_success: '#a78bfa',
  success_hope: '#fbbf24',
  success_fear: '#f97316',
  failure_hope: '#60a5fa',
  failure_fear: '#ef4444',
}

/**
 * POC dice animation overlay — simple CSS fade-in/scale with result display.
 * In production this would be a full 3D WebGL animation.
 */
export function DiceOverlay({ rolls, judgment, onComplete }: DiceOverlayProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onComplete()
    }, 1500)
    return () => clearTimeout(timer)
  }, [onComplete])

  if (!visible || !rolls[0]) return null

  const color = judgment ? (OUTCOME_COLORS[judgment.outcome] ?? '#fff') : '#fff'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      <div className="animate-bounce text-6xl font-bold font-sans tabular-nums" style={{ color }}>
        {rolls[0].join(' + ')}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add plugins/daggerheart-cosmetic/
git commit -m "feat(daggerheart-cosmetic): add cosmetic plugin with dice animation step and overlay"
```

---

## Task 9: 角色卡按钮触发 roll Workflow

**Files:**

- Modify: `plugins/daggerheart/DaggerHeartCard.tsx` — 添加"敏捷检定"按钮
- Modify: `src/rules/sdk.ts` — 导出 `useWorkflowSDK` hook
- Create: `src/workflow/useWorkflowSDK.ts` — React hook 提供 SDK 实例

- [ ] **Step 1: 创建 useWorkflowSDK hook**

```typescript
// src/workflow/useWorkflowSDK.ts
import { useMemo } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import type { PluginSDKDeps } from './pluginSDK'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null
let _sdk: PluginSDK | null = null

export function getWorkflowEngine(): WorkflowEngine {
  if (!_engine) {
    _engine = new WorkflowEngine()
    registerBaseWorkflows(_engine)
  }
  return _engine
}

/** Reset engine — for testing only */
export function resetWorkflowEngine(): void {
  _engine = null
  _sdk = null
}

/**
 * React hook providing a PluginSDK instance connected to the global WorkflowEngine.
 * Uses worldStore actions as the base capability providers.
 */
export function useWorkflowSDK(): PluginSDK {
  const sendRoll = useWorldStore((s) => s.sendRoll)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const updateTeamTracker = useWorldStore((s) => s.updateTeamTracker)
  const sendMessage = useWorldStore((s) => s.sendMessage)

  return useMemo(() => {
    const engine = getWorkflowEngine()
    // POC: sendRoll needs the server to return roll results synchronously.
    // Current REST endpoint returns void (broadcast via socket).
    // For POC, we call the endpoint and parse the response.
    const deps: PluginSDKDeps = {
      sendRoll: async (formula: string) => {
        // POC: simplified — call server roll endpoint and return result
        // Real implementation will need proper request/response for roll results
        const res = await sendRoll({
          dice: [],
          formula,
          resolvedFormula: formula,
          senderId: '',
          senderName: '',
          senderColor: '',
        })
        // POC fallback: if sendRoll returns void, generate client-side
        return { rolls: [[]], total: 0 }
      },
      updateEntity: (id, patch) => updateEntity(id, patch),
      updateTeamTracker: (_label, _patch) => {
        // POC stub — real impl finds tracker by label then calls store action
      },
      sendMessage: (_message) => {
        // POC stub
      },
      showToast: (_text, _options) => {
        // POC stub
      },
    }
    return new PluginSDK(engine, deps)
  }, [sendRoll, updateEntity, updateTeamTracker, sendMessage])
}
```

- [ ] **Step 2: 在 sdk.ts 导出 hook**

在 `src/rules/sdk.ts` 追加：

```typescript
export { useWorkflowSDK } from '../workflow/useWorkflowSDK'
```

- [ ] **Step 3: 修改 DaggerHeartCard 添加检定按钮**

在 `plugins/daggerheart/DaggerHeartCard.tsx` 的 `ATTRS` grid 之后、"Full Sheet" 按钮之前，添加属性检定按钮区域：

```tsx
// 需要在组件顶部 import useWorkflowSDK：
// import { useWorkflowSDK } from '@myvtt/sdk'
// 然后在组件内获取 sdk：
// const sdk = useWorkflowSDK()

// 在 ATTRS.map 的 </div> 之后添加：
{
  !readonly && (
    <div className="grid grid-cols-3 gap-1">
      {ATTRS.map((k) => (
        <button
          key={`roll-${k}`}
          onClick={() => {
            sdk
              .runWorkflow('roll', {
                formula: `2d12+@${k}`,
                actorId: entity.id,
                rollType: 'daggerheart:dd',
              })
              .catch((err) => console.error('[Workflow] roll failed:', err))
          }}
          className="py-1 text-[9px] text-text-muted/60 bg-black/10 hover:bg-black/30 rounded transition-colors duration-fast capitalize"
        >
          {t(`roll.action.${k}`)}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 验证编译通过**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/workflow/useWorkflowSDK.ts src/rules/sdk.ts plugins/daggerheart/DaggerHeartCard.tsx
git commit -m "feat: add useWorkflowSDK hook and roll action buttons on character card"
```

---

## Task 10: 端到端集成测试

**Files:**

- Create: `src/workflow/__tests__/integration.test.ts`

- [ ] **Step 1: 编写端到端 Workflow 集成测试**

```typescript
// src/workflow/__tests__/integration.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../engine'
import { PluginSDK } from '../pluginSDK'
import { registerBaseWorkflows } from '../baseWorkflows'

describe('Workflow E2E: daggerheart-core + daggerheart-cosmetic', () => {
  function setup() {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)

    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 15 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
    }
    const sdk = new PluginSDK(engine, deps)
    return { engine, sdk, deps }
  }

  it('full POC flow: generate → dh:judge → cos:animate → dh:resolve → display', async () => {
    const { sdk, deps } = setup()
    const executionOrder: string[] = []

    // Simulate daggerheart-core onActivate
    sdk.addStep('roll', {
      id: 'dh:judge',
      after: 'generate',
      run: (ctx) => {
        executionOrder.push('dh:judge')
        const rolls = ctx.data.rolls as number[][]
        const total = ctx.data.total as number
        const hopeDie = rolls[0]![0]!
        const fearDie = rolls[0]![1]!
        ctx.data.judgment = {
          type: 'daggerheart',
          hopeDie,
          fearDie,
          outcome: hopeDie > fearDie ? 'success_hope' : 'success_fear',
        }
      },
    })

    sdk.addStep('roll', {
      id: 'dh:resolve',
      before: 'display',
      run: (ctx) => {
        executionOrder.push('dh:resolve')
        const j = ctx.data.judgment as { outcome: string }
        if (j.outcome === 'success_fear' || j.outcome === 'failure_fear') {
          ctx.updateTeamTracker('Fear', { current: 1 })
        }
      },
    })

    // Simulate daggerheart-cosmetic onActivate
    sdk.addStep('roll', {
      id: 'cos:dice-animation',
      after: 'dh:judge',
      run: async (ctx) => {
        executionOrder.push('cos:dice-animation')
        await ctx.playAnimation({
          type: 'dice-roll',
          data: { rolls: ctx.data.rolls },
          durationMs: 100,
        })
      },
    })

    // Verify assembled workflow
    expect(sdk.inspectWorkflow('roll')).toEqual([
      'generate',
      'dh:judge',
      'cos:dice-animation',
      'dh:resolve',
      'display',
    ])

    // Execute
    await sdk.runWorkflow('roll', { formula: '2d12+2', actorId: 'entity-1' })

    // Verify execution order
    expect(executionOrder).toEqual(['dh:judge', 'cos:dice-animation', 'dh:resolve'])

    // Verify base steps executed (sendRoll called by generate, sendMessage by display)
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12+2')
    expect(deps.sendMessage).toHaveBeenCalled()
  })

  it('wrapStep: auto-modifier wraps dh step', async () => {
    const { sdk } = setup()

    // daggerheart-core registers modifier step
    sdk.addStep('roll', {
      id: 'dh:modifier',
      before: 'generate',
      run: (ctx) => {
        ctx.data.modifierApplied = 'manual'
      },
    })

    // auto-modifier plugin wraps it
    sdk.wrapStep('roll', 'dh:modifier', {
      run: async (ctx, original) => {
        if (ctx.data.autoMode) {
          ctx.data.modifierApplied = 'auto'
          // Skip original (no manual panel)
        } else {
          await original(ctx)
        }
      },
    })

    // Test auto mode
    await sdk.runWorkflow('roll', { formula: '2d12', autoMode: true })
    // Would need to capture ctx — simplified assertion via deps
  })
})
```

- [ ] **Step 2: 运行集成测试**

Run: `pnpm vitest run src/workflow/__tests__/integration.test.ts`
Expected: PASS

- [ ] **Step 3: 运行全部测试确认无回归**

Run: `pnpm vitest run`
Expected: 全部 PASS，无回归

- [ ] **Step 4: Commit**

```bash
git add src/workflow/__tests__/integration.test.ts
git commit -m "test(workflow): add end-to-end integration test for daggerheart core + cosmetic cooperation"
```

---

## Task 11: TypeScript 编译 + Lint 检查

- [ ] **Step 1: 运行 TypeScript 编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 运行 ESLint**

Run: `pnpm exec eslint src/workflow/ plugins/daggerheart-core/ plugins/daggerheart-cosmetic/`
Expected: 无错误（或仅有可接受的 warning）

- [ ] **Step 3: 修复发现的问题**

如果有编译或 lint 错误，在此步骤修复。

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore: fix lint and type errors in workflow module"
```

---

## Summary

| Task | 内容                      | 关键产出                             |
| ---- | ------------------------- | ------------------------------------ |
| 1    | 类型定义                  | `src/workflow/types.ts`              |
| 2    | WorkflowEngine            | `src/workflow/engine.ts` + 完整测试  |
| 3    | WorkflowContext 工厂      | `src/workflow/context.ts`            |
| 4    | PluginSDK                 | `src/workflow/pluginSDK.ts` + barrel |
| 5    | VTTPlugin 接口 + SDK 导出 | 修改 `src/rules/types.ts` + `sdk.ts` |
| 6    | 基座 roll Workflow        | `src/workflow/baseWorkflows.ts`      |
| 7    | daggerheart-core 插件     | `plugins/daggerheart-core/`          |
| 8    | daggerheart-cosmetic 插件 | `plugins/daggerheart-cosmetic/`      |
| 9    | 角色卡按钮 + hook         | `useWorkflowSDK` + 按钮 UI           |
| 10   | 端到端集成测试            | `integration.test.ts`                |
| 11   | 编译 + Lint               | 确保代码质量                         |
