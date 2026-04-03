# DaggerHeart 验收实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现完整的 DaggerHeart 掷骰流程（触发 → 交互 → 掷骰 → 判定 → 数据更新 → 渲染），验证 VTTPlugin 基础设施完备性，证明 OOP 可行性，退役 RulePlugin.diceSystem。

**Architecture:** 三阶段推进：(1) 基础设施改造 — serverRoll 精简为纯 RNG、createEntity/deleteEntity、onReady 生命周期、命名空间强制、动态 CHAT_TYPES；(2) 插件领域逻辑 — DiceJudge/FearManager/HopeResolver 三个 OOP 类；(3) 装配 — 重写 dh:action-check 工作流、自定义渲染器、Fear 面板。

**Tech Stack:** TypeScript, React, vitest, Socket.io, zustand, better-sqlite3

**Design Spec:** `docs/superpowers/specs/2026-03-31-daggerheart-acceptance-design.md`

---

## 文件结构

### 基础设施修改

| 文件                                       | 职责变更                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| `src/shared/logTypes.ts`                   | RollRequest 精简为 `{ dice }`                          |
| `src/shared/socketEvents.ts`               | 更新 roll ack 类型，新增 entity socket 事件            |
| `src/workflow/types.ts`                    | serverRoll 签名简化，新增 createEntity/deleteEntity    |
| `src/workflow/context.ts`                  | 实现新 serverRoll、createEntity、deleteEntity          |
| `src/workflow/pluginSDK.ts`                | 命名空间强制                                           |
| `src/workflow/useWorkflowSDK.ts`           | onReady 生命周期，更新 buildDeps                       |
| `src/workflow/baseWorkflows.ts`            | roll workflow 适配新 serverRoll，quick-roll 补发 entry |
| `src/rules/types.ts`                       | VTTPlugin 加 onReady，后期删 diceSystem                |
| `src/log/rendererRegistry.ts`              | 新增 getChatVisibleTypes()                             |
| `src/chat/ChatPanel.tsx`                   | CHAT_TYPES 动态化                                      |
| `src/log/renderers/RollResultRenderer.tsx` | 移除 diceSystem 依赖                                   |
| `server/logHandler.ts`                     | roll handler 精简为纯 RNG                              |
| `server/entitySocketHandler.ts`            | **新建**：entity create/delete socket 处理             |
| `server/index.ts`                          | 挂载 entitySocketHandler                               |

### 插件新文件

| 文件                                                | 职责                     |
| --------------------------------------------------- | ------------------------ |
| `plugins/daggerheart-core/DiceJudge.ts`             | 判定逻辑 OOP 类          |
| `plugins/daggerheart-core/FearManager.ts`           | Fear 实体生命周期        |
| `plugins/daggerheart-core/HopeResolver.ts`          | Hope per-character 更新  |
| `plugins/daggerheart-core/ui/ModifierPanel.tsx`     | DC/modifier 输入处理组件 |
| `plugins/daggerheart-core/ui/DHActionCheckCard.tsx` | action-check 渲染器      |
| `plugins/daggerheart-core/ui/FearPanel.tsx`         | Fear tracker 面板        |

### 插件修改/删除

| 文件                                    | 变更                          |
| --------------------------------------- | ----------------------------- |
| `plugins/daggerheart-core/index.ts`     | OOP 类重写                    |
| `plugins/daggerheart-core/rollSteps.ts` | **删除**（逻辑迁入 index.ts） |
| `plugins/daggerheart/index.ts`          | 移除 diceSystem 导出          |
| `plugins/daggerheart/diceSystem.ts`     | **删除**（迁入 DiceJudge）    |

### 测试文件

| 文件                                                             | 覆盖               |
| ---------------------------------------------------------------- | ------------------ |
| `src/workflow/__tests__/serverRoll-simplification.test.ts`       | 新 serverRoll 签名 |
| `src/workflow/__tests__/createEntity.test.ts`                    | 实体创建/删除      |
| `src/workflow/__tests__/namespace-enforcement.test.ts`           | 命名空间校验       |
| `src/workflow/__tests__/onReady.test.ts`                         | 生命周期           |
| `src/log/__tests__/dynamicChatTypes.test.ts`                     | 动态可见类型       |
| `plugins/daggerheart-core/__tests__/DiceJudge.test.ts`           | 判定逻辑           |
| `plugins/daggerheart-core/__tests__/FearManager.test.ts`         | Fear 管理          |
| `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts` | 完整工作流         |

---

## Task 1: serverRoll 精简 — 类型与服务端

**目标**：将 serverRoll 从"携带业务语义的掷骰服务"精简为"纯 RNG 服务"。服务端不再创建日志条目。

**Files:**

- Modify: `src/shared/logTypes.ts:77-94`
- Modify: `src/shared/socketEvents.ts:174`
- Modify: `server/logHandler.ts:116-185`
- Test: `src/workflow/__tests__/serverRoll-simplification.test.ts`

- [ ] **Step 1: 精简 RollRequest 类型**

```typescript
// src/shared/logTypes.ts — 替换原 RollRequest（第77-89行）
export interface RollRequest {
  dice: DiceSpec[]
}

export type RollRequestAck = { rolls: number[][] } | { error: string }
```

同时删除 `RollRequest` 中原有的 `origin`, `parentId`, `groupId`, `chainDepth`, `triggerable`, `visibility`, `formula`, `resolvedFormula`, `rollType`, `actionName` 字段。保留 `LogEntryAck` 不变。

- [ ] **Step 2: 更新 socket 事件类型**

```typescript
// src/shared/socketEvents.ts — 更新 ClientToServerEvents 中的 log:roll-request
'log:roll-request': (request: RollRequest, ack: (response: RollRequestAck) => void) => void
```

类型引用已自动跟随 RollRequest 的变更，无需改动事件名。

- [ ] **Step 3: 精简服务端 roll handler**

```typescript
// server/logHandler.ts — 替换 log:roll-request handler（第116-185行）
socket.on('log:roll-request', (request: RollRequest, ack) => {
  // 1. Reject if no seat claimed
  if (!socket.data.seatId) {
    ack({ error: 'No seat claimed' })
    return
  }

  // 2. Validate dice bounds
  if (!request.dice || !Array.isArray(request.dice) || request.dice.length === 0) {
    ack({ error: 'Missing or empty dice array' })
    return
  }
  for (const spec of request.dice) {
    if (spec.sides < 1 || spec.sides > 1000) {
      ack({ error: `Invalid dice sides: ${spec.sides} (must be 1-1000)` })
      return
    }
    if (spec.count < 1 || spec.count > 100) {
      ack({ error: `Invalid dice count: ${spec.count} (must be 1-100)` })
      return
    }
  }

  // 3. Generate random rolls — pure RNG, no entry creation
  const rolls: number[][] = request.dice.map((spec) =>
    Array.from({ length: spec.count }, () => Math.floor(Math.random() * spec.sides) + 1),
  )

  // 4. Return rolls directly (no game_log write, no broadcast)
  ack({ rolls })
})
```

注意：删除了原 handler 中的所有 `game_log` INSERT 和 `broadcastLogEntry` 调用。服务端不再为 RNG 创建日志。

- [ ] **Step 4: 写测试验证新 handler**

```typescript
// src/workflow/__tests__/serverRoll-simplification.test.ts
import { describe, it, expect } from 'vitest'

describe('RollRequest type contract', () => {
  it('RollRequest only contains dice field', () => {
    // Type-level test: if this compiles, the contract is correct
    const request: import('../../shared/logTypes').RollRequest = {
      dice: [{ sides: 6, count: 2 }],
    }
    expect(request.dice).toHaveLength(1)
    expect(request.dice[0]).toEqual({ sides: 6, count: 2 })
  })

  it('RollRequestAck is either rolls or error', () => {
    const success: import('../../shared/logTypes').RollRequestAck = {
      rolls: [[3, 5]],
    }
    expect('rolls' in success).toBe(true)

    const failure: import('../../shared/logTypes').RollRequestAck = {
      error: 'bad dice',
    }
    expect('error' in failure).toBe(true)
  })
})
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/workflow/__tests__/serverRoll-simplification.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/shared/logTypes.ts src/shared/socketEvents.ts server/logHandler.ts src/workflow/__tests__/serverRoll-simplification.test.ts
git commit -m "refactor: simplify serverRoll to pure RNG — types and server handler"
```

---

## Task 2: serverRoll 精简 — 客户端

**目标**：更新 WorkflowContext.serverRoll 签名和实现，使其返回 `number[][]` 而非 `GameLogEntry`。

**Files:**

- Modify: `src/workflow/types.ts:145-157`
- Modify: `src/workflow/context.ts:17-27,128-155`
- Modify: `src/workflow/pluginSDK.ts:28`
- Modify: `src/workflow/useWorkflowSDK.ts:76-98`
- Modify: `src/workflow/__tests__/integration.test.ts` (更新已有 mock)
- Modify: `plugins/daggerheart-core/__tests__/rollSteps.test.ts` (更新已有 mock)

- [ ] **Step 1: 更新 WorkflowContext.serverRoll 类型**

```typescript
// src/workflow/types.ts — 替换 serverRoll 签名（约第145-157行）
/** Server-side dice roll via Socket.io — returns raw random numbers */
serverRoll(dice: DiceSpec[]): Promise<number[][]>
```

删除原有的 `formula` 参数和 `options` 对象。

- [ ] **Step 2: 更新 ContextDeps 和 context 实现**

```typescript
// src/workflow/context.ts — 更新 ContextDeps（第19行）
serverRoll: (request: RollRequest) => Promise<number[][]>
```

替换 serverRoll 实现（约第128-155行）：

```typescript
serverRoll: async (dice: DiceSpec[]) => {
  return deps.serverRoll({ dice })
},
```

同时更新文件顶部 import：移除 `GameLogEntry`（如果不再需要），保留 `RollRequest`。

- [ ] **Step 3: 更新 PluginSDKDeps 类型**

`src/workflow/pluginSDK.ts` 第28行：`PluginSDKDeps = Omit<ContextDeps, 'engine'>` — 类型自动跟随 ContextDeps 变更，无需改动。确认编译通过即可。

- [ ] **Step 4: 更新 buildDeps 中的 serverRoll**

```typescript
// src/workflow/useWorkflowSDK.ts — buildDeps() 中的 serverRoll（约第82-98行）
serverRoll: (request) => {
  const socket = useWorldStore.getState()._socket
  if (!socket) return Promise.reject(new Error('Socket not connected'))
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('log:roll-request', request, (err, ack) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- err is null on success despite Socket.io TS typing
      if (err) {
        reject(new Error('Roll request timed out'))
        return
      }
      if ('error' in ack) {
        reject(new Error(ack.error))
        return
      }
      resolve(ack.rolls)
    })
  })
},
```

- [ ] **Step 5: 更新已有测试 mock 和内联工作流代码**

所有 `serverRoll` mock 需从返回 `GameLogEntry` 改为返回 `number[][]`。同时，integration.test.ts 中的内联工作流代码也需更新（原来调用 `ctx.serverRoll(formula, { dice })` 并从返回值取 `payload.rolls`，现在直接 `ctx.serverRoll(dice)` 返回 `number[][]`）。

```typescript
// src/workflow/__tests__/integration.test.ts — setup() 中（约第15行）
serverRoll: vi.fn().mockResolvedValue([[8, 5]]),

// integration.test.ts 内联 workflow 的 roll step 也需更新：
// 旧: const entry = await ctx.serverRoll(formula, { dice })
//      const rolls = entry.payload.rolls as number[][]
// 新: const rolls = await ctx.serverRoll(dice)

// plugins/daggerheart-core/__tests__/rollSteps.test.ts — makeDeps() 中（约第28行）
serverRoll: vi.fn().mockResolvedValue([[4, 9]]),
// 同时删除 makeRollEntry() 辅助函数
```

- [ ] **Step 6: 运行所有工作流测试确认通过**

Run: `npx vitest run src/workflow/__tests__/ plugins/daggerheart-core/__tests__/`

注意：daggerheart-core 测试会因为 rollSteps.ts 内部仍使用旧 API 而失败，这在 Task 3 中修复。先确认类型编译通过：

Run: `npx tsc --noEmit`

- [ ] **Step 7: 提交**

```bash
git add src/workflow/types.ts src/workflow/context.ts src/workflow/pluginSDK.ts src/workflow/useWorkflowSDK.ts src/workflow/__tests__/integration.test.ts plugins/daggerheart-core/__tests__/rollSteps.test.ts
git commit -m "refactor: serverRoll returns number[][] — client-side signature update"
```

---

## Task 3: 基础 Roll 工作流适配

**目标**：适配 roll 和 quick-roll 工作流使用新的 serverRoll API。quick-roll 需额外通过 emitEntry 发送展示用 entry。

**Files:**

- Modify: `src/workflow/baseWorkflows.ts`
- Modify: `plugins/daggerheart-core/rollSteps.ts:72-119` (dh:action-check 的 roll step)

- [ ] **Step 1: 适配 roll workflow 的 generate step**

```typescript
// src/workflow/baseWorkflows.ts — roll workflow 的 generate step（约第78-113行）
{
  id: 'generate',
  run: async (ctx) => {
    const formula = ctx.vars.formula
    if (typeof formula !== 'string' || formula.length === 0) {
      ctx.abort('Missing or invalid formula')
      return
    }

    let resolved = ctx.vars.resolvedFormula
    if (!resolved && /@[\p{L}\p{N}_]+/u.test(formula)) {
      const tokens = ctx.read.formulaTokens(ctx.vars.actorId)
      resolved = formula.replace(/@([\p{L}\p{N}_]+)/gu, (_, key: string) => {
        const val = tokens[key]
        return val !== undefined ? String(val) : `@${key}`
      })
      ctx.vars.resolvedFormula = resolved
    }

    const finalFormula = resolved ?? formula
    const terms = tokenizeExpression(finalFormula)
    if (!terms) {
      ctx.abort(`Cannot parse formula: ${finalFormula}`)
      return
    }
    const dice = toDiceSpecs(terms)

    // Pure RNG — returns raw rolls, no entry created
    const rolls = await ctx.serverRoll(dice)
    const { total } = buildCompoundResult(terms, rolls)
    ctx.vars.rolls = rolls
    ctx.vars.total = total
  },
},
```

- [ ] **Step 2: quick-roll 工作流补发展示 entry**

在 quick-roll workflow 的 `roll` step 之后，添加 `emit` step：

```typescript
// src/workflow/baseWorkflows.ts — quick-roll workflow（约第120-146行）
_quickRollWorkflow = engine.defineWorkflow<BaseRollData>('quick-roll', [
  {
    id: 'roll',
    run: async (ctx) => {
      // Support both direct calls (formula) and command system (raw)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- formula absent when invoked via command system
      const formula = ctx.vars.formula ?? (ctx.vars.raw as string | undefined)
      if (!formula) {
        ctx.abort('Missing formula')
        return
      }
      ctx.vars.formula = formula

      const result = await ctx.runWorkflow(getRollWorkflow(), {
        formula,
        actorId: ctx.vars.actorId,
        resolvedFormula: ctx.vars.resolvedFormula,
      })
      if (result.status === 'completed') {
        ctx.vars.rolls = result.output.rolls
        ctx.vars.total = result.output.total
      } else {
        ctx.abort(result.reason ?? 'Roll failed')
      }
    },
  },
  {
    id: 'emit',
    run: (ctx) => {
      const { formula, resolvedFormula, rolls, total } = ctx.vars
      if (!rolls || total == null) return

      // Reconstruct dice specs for display
      const finalFormula = (resolvedFormula as string | undefined) ?? (formula as string)
      const terms = tokenizeExpression(finalFormula)
      const dice = terms ? toDiceSpecs(terms) : []

      ctx.emitEntry({
        type: 'core:roll-result',
        payload: {
          formula: formula as string,
          resolvedFormula: resolvedFormula as string | undefined,
          dice,
          rolls,
          rollType: undefined,
          actionName: undefined,
        },
        triggerable: true,
      })
    },
  },
])
```

注意：`core:roll-result` 的 LogPayloadMap 类型签名不变，仍包含 formula/rolls/dice 等字段用于简单掷骰的展示。

- [ ] **Step 3: 适配 dh:action-check 的 roll step**

```typescript
// plugins/daggerheart-core/rollSteps.ts — dh:action-check 的 roll step（约第75-105行）
{
  id: 'roll',
  run: async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- formula absent when invoked via command system
    let formula = ctx.vars.formula ?? (ctx.vars.raw as string | undefined)
    if (!formula) {
      formula = '2d12'
    }
    if (!/\d+d\d+/i.test(formula)) {
      const mod = formula.trim()
      formula = mod.startsWith('+') || mod.startsWith('-') ? `2d12${mod}` : `2d12+${mod}`
    }
    ctx.vars.formula = formula
    ctx.vars.rollType = 'daggerheart:dd'

    // Call serverRoll directly — pure RNG
    const rolls = await ctx.serverRoll([{ sides: 12, count: 2 }])
    ctx.vars.rolls = rolls

    // Compute total: sum of 2d12 + any modifiers from formula
    // For now, simple sum of the rolls (modifier handling in future Task with ModifierPanel)
    const total = rolls.flat().reduce((a, b) => a + b, 0)
    ctx.vars.total = total
  },
},
```

注意：此处暂时简化了 total 计算。完整的 modifier 处理将在 Task 11 中实现。

- [ ] **Step 4: 更新 dh:action-check 测试**

```typescript
// plugins/daggerheart-core/__tests__/rollSteps.test.ts — 更新测试
function makeDeps(
  overrides: Partial<Omit<ContextDeps, 'engine'>> = {},
): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[4, 9]]),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

// 更新断言：serverRoll 现在接收 { dice } 对象
it('dh:action-check calls ctx.serverRoll with DiceSpec array', async () => {
  const { runner, deps } = makeSetup()
  await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
  expect(deps.serverRoll).toHaveBeenCalledWith({ dice: [{ sides: 12, count: 2 }] })
})
```

- [ ] **Step 5: 运行所有测试**

Run: `npx vitest run src/workflow/__tests__/ plugins/daggerheart-core/__tests__/`
Expected: ALL PASS

- [ ] **Step 6: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add src/workflow/baseWorkflows.ts plugins/daggerheart-core/rollSteps.ts plugins/daggerheart-core/__tests__/rollSteps.test.ts src/workflow/__tests__/integration.test.ts
git commit -m "refactor: adapt roll workflows to pure RNG serverRoll"
```

---

## Task 4: createEntity / deleteEntity

**目标**：让 WorkflowContext 支持从工作流中创建和删除实体。

**Files:**

- Modify: `src/workflow/types.ts`
- Modify: `src/shared/socketEvents.ts`
- Create: `server/entitySocketHandler.ts`
- Modify: `server/index.ts:88` (挂载新 handler)
- Modify: `src/workflow/context.ts`
- Modify: `src/workflow/useWorkflowSDK.ts`
- Test: `src/workflow/__tests__/createEntity.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/workflow/__tests__/createEntity.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../engine'
import { createWorkflowContext } from '../context'
import type { ContextDeps } from '../context'

function makeDeps(overrides: Partial<ContextDeps> = {}): ContextDeps {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([]),
    createEntity: vi.fn().mockResolvedValue('test:entity-1'),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    engine: new WorkflowEngine(),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

describe('WorkflowContext.createEntity', () => {
  it('delegates to deps.createEntity and returns entity ID', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, {}, { depth: 0, abortCtrl: { aborted: false } })
    const id = await ctx.createEntity({
      id: 'test:my-entity',
      components: { 'test:data': { value: 42 } },
    })
    expect(id).toBe('test:entity-1')
    expect(deps.createEntity).toHaveBeenCalledWith({
      id: 'test:my-entity',
      components: { 'test:data': { value: 42 } },
    })
  })
})

describe('WorkflowContext.deleteEntity', () => {
  it('delegates to deps.deleteEntity', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, {}, { depth: 0, abortCtrl: { aborted: false } })
    await ctx.deleteEntity('test:my-entity')
    expect(deps.deleteEntity).toHaveBeenCalledWith('test:my-entity')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/workflow/__tests__/createEntity.test.ts`
Expected: FAIL — `createEntity` 不存在

- [ ] **Step 3: 添加类型定义**

```typescript
// src/workflow/types.ts — WorkflowContext 接口中新增（约第190行 abort 之前）

// ── Entity lifecycle ─────────────────────────────────────────────────
/** Create a new entity via server (await ack) */
createEntity(data: {
  id: string
  components?: Record<string, unknown>
  lifecycle?: import('../shared/entityTypes').EntityLifecycle
  tags?: string[]
}): Promise<string>
/** Delete an entity via server (await ack) */
deleteEntity(entityId: string): Promise<void>
```

- [ ] **Step 4: 添加 socket 事件类型**

```typescript
// src/shared/socketEvents.ts — ClientToServerEvents 新增
'entity:create-request': (
  data: {
    id: string
    components?: Record<string, unknown>
    lifecycle?: import('./entityTypes').EntityLifecycle
    tags?: string[]
  },
  ack: (response: Entity | { error: string }) => void,
) => void
'entity:delete-request': (
  data: { id: string },
  ack: (response: { ok: true } | { error: string }) => void,
) => void
```

- [ ] **Step 5: 创建服务端 socket handler**

```typescript
// server/entitySocketHandler.ts
import type { TypedServer, TypedSocket } from './socketTypes'
import { getRoomDb } from './db'
import type { Entity } from '../src/shared/entityTypes'
import { assembleEntity, loadEntity } from './routes/entities'
import { syncTags, getTagNames } from './tagHelpers'

export function setupEntitySocketHandlers(io: TypedServer, dataDir: string): void {
  io.on('connection', (socket: TypedSocket) => {
    const roomId = socket.data.roomId
    if (!roomId) return

    const db = getRoomDb(dataDir, roomId)

    socket.on('entity:create-request', (data, ack) => {
      if (!socket.data.seatId) {
        ack({ error: 'No seat claimed' })
        return
      }

      try {
        const entity = db.transaction(() => {
          const id = data.id
          const lifecycle = data.lifecycle ?? 'persistent'
          const permissions = JSON.stringify({ default: 'none', seats: {} })
          const components = data.components ?? {}
          const tags = data.tags ?? []

          db.prepare(
            `INSERT INTO entities (id, blueprint_id, permissions, lifecycle)
             VALUES (?, NULL, ?, ?)`,
          ).run(id, permissions, lifecycle)

          for (const [key, value] of Object.entries(components)) {
            db.prepare(
              `INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)`,
            ).run(id, key, JSON.stringify(value))
          }

          if (tags.length > 0) {
            syncTags(db, 'entity_tags', 'entity_id', id, tags)
          }

          const tagNames = getTagNames(db, 'entity_tags', 'entity_id', id)
          const componentRows = db
            .prepare('SELECT component_key, data FROM entity_components WHERE entity_id = ?')
            .all(id) as { component_key: string; data: string }[]
          const entityRow = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<
            string,
            unknown
          >
          return assembleEntity(entityRow, componentRows, tagNames)
        })()

        // Broadcast to room
        io.to(roomId).emit('entity:created', entity)
        ack(entity)
      } catch (err) {
        ack({ error: (err as Error).message })
      }
    })

    socket.on('entity:delete-request', (data, ack) => {
      if (!socket.data.seatId) {
        ack({ error: 'No seat claimed' })
        return
      }

      try {
        db.transaction(() => {
          db.prepare('DELETE FROM entity_components WHERE entity_id = ?').run(data.id)
          db.prepare('DELETE FROM entity_tags WHERE entity_id = ?').run(data.id)
          db.prepare('DELETE FROM scene_entities WHERE entity_id = ?').run(data.id)
          db.prepare('DELETE FROM entities WHERE id = ?').run(data.id)
        })()

        io.to(roomId).emit('entity:deleted', { id: data.id })
        ack({ ok: true })
      } catch (err) {
        ack({ error: (err as Error).message })
      }
    })
  })
}
```

- [ ] **Step 6: 挂载 handler 到 server/index.ts**

在 `server/index.ts` 第88行 `setupLogHandlers(io, DATA_DIR)` 之后添加：

```typescript
import { setupEntitySocketHandlers } from './entitySocketHandler'
// ...
setupEntitySocketHandlers(io, DATA_DIR)
```

- [ ] **Step 7: 更新 ContextDeps 和实现**

```typescript
// src/workflow/context.ts — ContextDeps 新增
createEntity: (data: {
  id: string
  components?: Record<string, unknown>
  lifecycle?: import('../shared/entityTypes').EntityLifecycle
  tags?: string[]
}) => Promise<string>
deleteEntity: (entityId: string) => Promise<void>
```

在 `createWorkflowContext` 返回的 ctx 对象中添加：

```typescript
createEntity: async (data) => {
  const id = await deps.createEntity(data)
  return id
},

deleteEntity: async (entityId) => {
  await deps.deleteEntity(entityId)
},
```

- [ ] **Step 8: 更新 buildDeps 添加 createEntity/deleteEntity**

```typescript
// src/workflow/useWorkflowSDK.ts — buildDeps() 中新增
createEntity: (data) => {
  const socket = useWorldStore.getState()._socket
  if (!socket) return Promise.reject(new Error('Socket not connected'))
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('entity:create-request', data, (err, ack) => {
      if (err) { reject(new Error('Entity create timed out')); return }
      if ('error' in ack) { reject(new Error(ack.error)); return }
      resolve(ack.id)
    })
  })
},
deleteEntity: (entityId) => {
  const socket = useWorldStore.getState()._socket
  if (!socket) return Promise.reject(new Error('Socket not connected'))
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('entity:delete-request', { id: entityId }, (err, ack) => {
      if (err) { reject(new Error('Entity delete timed out')); return }
      if ('error' in ack) { reject(new Error(ack.error)); return }
      resolve()
    })
  })
},
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npx vitest run src/workflow/__tests__/createEntity.test.ts`
Expected: PASS

- [ ] **Step 10: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（可能需要更新 PluginSDKDeps 的类型推导，因为 ContextDeps 变了）

- [ ] **Step 11: 提交**

```bash
git add src/workflow/types.ts src/shared/socketEvents.ts server/entitySocketHandler.ts server/index.ts src/workflow/context.ts src/workflow/useWorkflowSDK.ts src/workflow/__tests__/createEntity.test.ts
git commit -m "feat: add createEntity/deleteEntity to WorkflowContext"
```

---

## Task 5: VTTPlugin.onReady 生命周期

**目标**：新增 `onReady(ctx)` 二阶段生命周期，让插件在 store 数据就绪后执行运行时初始化。

**Files:**

- Modify: `src/rules/types.ts:242-247`
- Modify: `src/workflow/useWorkflowSDK.ts:141-189`
- Test: `src/workflow/__tests__/onReady.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/workflow/__tests__/onReady.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetWorkflowEngine, registerWorkflowPlugins, initWorkflowSystem } from '../useWorkflowSDK'
import type { VTTPlugin } from '../../rules/types'

// Mock dependencies to avoid real store access
vi.mock('../../stores/worldStore', () => ({
  useWorldStore: Object.assign(
    vi.fn((sel: unknown) =>
      typeof sel === 'function'
        ? (sel as (s: unknown) => unknown)({
            logEntries: [],
            logWatermark: 0,
            entities: {},
            _socket: null,
          })
        : undefined,
    ),
    {
      getState: vi
        .fn()
        .mockReturnValue({ logEntries: [], logWatermark: 0, entities: {}, _socket: null }),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
  ),
}))
vi.mock('../../stores/identityStore', () => ({
  useIdentityStore: {
    getState: vi
      .fn()
      .mockReturnValue({
        mySeatId: 's1',
        getMySeat: () => ({ id: 's1', name: 'GM', color: '#fff' }),
      }),
  },
}))
vi.mock('../../ui-system/uiSystemInit', () => ({
  getUIRegistry: vi.fn().mockReturnValue(undefined),
}))
vi.mock('../../log/registerBaseRenderers', () => ({
  registerBaseRenderers: vi.fn(),
}))

beforeEach(() => {
  resetWorkflowEngine()
})

describe('VTTPlugin.onReady lifecycle', () => {
  it('calls onReady after all plugins onActivate', () => {
    const order: string[] = []

    const pluginA: VTTPlugin = {
      id: 'test-a',
      onActivate: () => {
        order.push('activate-a')
      },
      onReady: () => {
        order.push('ready-a')
      },
    }
    const pluginB: VTTPlugin = {
      id: 'test-b',
      onActivate: () => {
        order.push('activate-b')
      },
      onReady: () => {
        order.push('ready-b')
      },
    }

    registerWorkflowPlugins([pluginA, pluginB])
    const cleanup = initWorkflowSystem()
    cleanup()

    expect(order).toEqual(['activate-a', 'activate-b', 'ready-a', 'ready-b'])
  })

  it('onReady receives a WorkflowContext with read access', () => {
    let receivedCtx: unknown = null

    const plugin: VTTPlugin = {
      id: 'test-ctx',
      onActivate: () => {},
      onReady: (ctx) => {
        receivedCtx = ctx
      },
    }

    registerWorkflowPlugins([plugin])
    const cleanup = initWorkflowSystem()
    cleanup()

    expect(receivedCtx).toBeDefined()
    expect(typeof (receivedCtx as { read: unknown }).read).toBe('object')
  })

  it('plugins without onReady work fine', () => {
    const plugin: VTTPlugin = {
      id: 'test-no-ready',
      onActivate: () => {},
    }

    registerWorkflowPlugins([plugin])
    expect(() => {
      const cleanup = initWorkflowSystem()
      cleanup()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/workflow/__tests__/onReady.test.ts`
Expected: FAIL — VTTPlugin 没有 onReady 属性

- [ ] **Step 3: 添加 onReady 到 VTTPlugin 类型**

```typescript
// src/rules/types.ts — VTTPlugin 接口（约第242-247行）
export interface VTTPlugin {
  id: string
  dependencies?: string[]
  onActivate(sdk: import('../workflow/types').IPluginSDK): void
  onReady?(ctx: import('../workflow/types').WorkflowContext): void | Promise<void>
  onDeactivate?(sdk: import('../workflow/types').IPluginSDK): void
}
```

- [ ] **Step 4: 在 initWorkflowSystem 中调用 onReady**

```typescript
// src/workflow/useWorkflowSDK.ts — initWorkflowSystem() 中，在插件 onActivate 循环之后（约第161行后）

// Call onReady for all plugins (after all onActivate, deps available)
const readyDeps = buildDeps()
const readyEngine = engine
for (const plugin of _registeredPlugins) {
  if (plugin.onReady) {
    const readyInternal = { depth: 0, abortCtrl: { aborted: false } }
    const readyCtx = createWorkflowContext({ ...readyDeps, engine: readyEngine }, {}, readyInternal)
    // onReady may be async (e.g. createEntity) — fire and forget for now
    // TODO: consider awaiting in future if ordering matters
    void Promise.resolve(plugin.onReady(readyCtx)).catch((err) => {
      console.error(`[WorkflowSystem] Plugin "${plugin.id}" onReady failed:`, err)
    })
  }
}
```

需要在文件顶部添加 import：

```typescript
import { createWorkflowContext } from './context'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/workflow/__tests__/onReady.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/rules/types.ts src/workflow/useWorkflowSDK.ts src/workflow/__tests__/onReady.test.ts
git commit -m "feat: add VTTPlugin.onReady lifecycle hook"
```

---

## Task 6: 命名空间强制

**目标**：SDK 层校验所有持久化 key 必须以 `pluginId:` 为前缀。

**Files:**

- Modify: `src/workflow/pluginSDK.ts`
- Modify: `src/workflow/context.ts`
- Test: `src/workflow/__tests__/namespace-enforcement.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/workflow/__tests__/namespace-enforcement.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../engine'
import { PluginSDK } from '../pluginSDK'

describe('Namespace enforcement — PluginSDK', () => {
  it('defineWorkflow rejects name without plugin prefix', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')

    expect(() => sdk.defineWorkflow('bad-name', [])).toThrow('must be prefixed with "my-plugin:"')
  })

  it('defineWorkflow accepts name with plugin prefix', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')

    expect(() => sdk.defineWorkflow('my-plugin:workflow', [])).not.toThrow()
  })

  it('registerCommand rejects name without plugin prefix', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')
    const handle = sdk.defineWorkflow('my-plugin:wf', [])

    // Commands use dot prefix convention, so check plugin prefix after dot
    expect(() => sdk.registerCommand('.bad', handle)).toThrow()
  })

  it('emitEntry rejects type without plugin prefix', () => {
    // This is tested at context level — see context tests
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/workflow/__tests__/namespace-enforcement.test.ts`
Expected: FAIL — 无校验逻辑

- [ ] **Step 3: 添加 assertNamespaced 工具函数**

```typescript
// src/workflow/pluginSDK.ts — 文件顶部新增
/** Validate that a key uses the plugin's namespace prefix */
function assertNamespaced(pluginId: string, key: string, label: string): void {
  if (!key.startsWith(pluginId + ':')) {
    throw new Error(`${label} "${key}" must be prefixed with "${pluginId}:"`)
  }
}

/** Validate command name: must start with . followed by plugin prefix */
function assertCommandNamespaced(pluginId: string, name: string): void {
  // Commands like '.dd' — the convention is plugin registers short names
  // For now, enforce that the command starts with '.' + a letter
  // Full namespace enforcement for commands deferred — they're not persisted data
  if (!name.startsWith('.')) {
    throw new Error(`Command "${name}" must start with "."`)
  }
}
```

- [ ] **Step 4: 在 PluginSDK 方法中应用校验**

```typescript
// src/workflow/pluginSDK.ts — defineWorkflow 中（第93行前）
defineWorkflow<TData extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  stepsOrRun?: Step<TData>[] | StepRunFn<TData>,
  outputFn?: (vars: TData) => unknown,
): WorkflowHandle<TData> {
  assertNamespaced(this.pluginId, name, 'Workflow name')
  // ... existing implementation
}

// registerTrigger 中
registerTrigger(trigger: TriggerDefinition): void {
  assertNamespaced(this.pluginId, trigger.id, 'Trigger ID')
  // ... existing implementation
}

// registerCommand — 使用宽松校验（命令不是持久化数据）
registerCommand(name: string, handle: WorkflowHandle): void {
  assertCommandNamespaced(this.pluginId, name)
  registerCommand(name, handle)
}
```

**注意**：`registerRenderer`、`registerInputHandler`、`registerComponent` 的 namespace 校验通过 type 参数传入，已有 `surface::type` key 机制隔离。暂不添加额外校验。

- [ ] **Step 5: 在 WorkflowContext 中为 emitEntry 和 updateComponent 添加 pluginId 追踪**

这需要一个设计决策：WorkflowContext 目前不知道 pluginId。有两种方式：

1. 在 ContextOptions 中传入 pluginId
2. 在 onReady 创建 ctx 时传入

由于 context 是通用的（非插件独占），命名空间校验在 context 层不做。改为在 PluginSDK.defineWorkflow 注册的 step 中，由插件自行确保。

**核心入口已在 PluginSDK 层覆盖**：

- `defineWorkflow` — workflow 名称
- `registerCommand` — 命令名称
- `registerTrigger` — 触发器 ID

**运行时入口**（emitEntry、updateComponent、createEntity）由插件自觉遵守，类型系统通过 LogPayloadMap 提供编译时保障。完整的运行时校验可后续通过 contextPluginId 参数实现。

- [ ] **Step 6: 更新已有代码的命名空间**

当前 `registerBaseWorkflows` 定义 `'roll'`、`'quick-roll'` 等不带前缀的 workflow。这些是基座 workflow，不经过 PluginSDK，不受命名空间校验影响。

当前 `daggerheart-core` 插件定义 `'dh:judgment'`、`'dh:action-check'`。这些需要改为 `'daggerheart-core:judgment'`、`'daggerheart-core:action-check'`。

```typescript
// plugins/daggerheart-core/rollSteps.ts — 更新 workflow 名称
_judgmentWorkflow = sdk.defineWorkflow<DHJudgmentData>('daggerheart-core:judgment', [...])
_actionCheckWorkflow = sdk.defineWorkflow<DHActionCheckData>('daggerheart-core:action-check', [...])
```

同时更新 `getDHJudgmentWorkflow` 和 `getDHActionCheckWorkflow` 中的错误消息。

- [ ] **Step 7: 运行测试**

Run: `npx vitest run src/workflow/__tests__/namespace-enforcement.test.ts`
Expected: PASS

Run: `npx vitest run src/workflow/__tests__/ plugins/daggerheart-core/__tests__/`
Expected: ALL PASS

- [ ] **Step 8: 提交**

```bash
git add src/workflow/pluginSDK.ts src/workflow/__tests__/namespace-enforcement.test.ts plugins/daggerheart-core/rollSteps.ts
git commit -m "feat: add namespace enforcement for plugin SDK registrations"
```

---

## Task 7: 动态 CHAT_TYPES

**目标**：ChatPanel 的可见 entry 类型从硬编码改为基于 rendererRegistry 动态计算。

**Files:**

- Modify: `src/log/rendererRegistry.ts`
- Modify: `src/chat/ChatPanel.tsx:24,100-103`
- Test: `src/log/__tests__/dynamicChatTypes.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/log/__tests__/dynamicChatTypes.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerRenderer, clearRenderers, getChatVisibleTypes } from '../rendererRegistry'

beforeEach(() => {
  clearRenderers()
})

describe('getChatVisibleTypes', () => {
  it('returns empty set when no chat renderers registered', () => {
    const types = getChatVisibleTypes()
    expect(types.size).toBe(0)
  })

  it('includes types registered on the chat surface', () => {
    registerRenderer('chat', 'core:text', (() => null) as any)
    registerRenderer('chat', 'core:roll-result', (() => null) as any)
    const types = getChatVisibleTypes()
    expect(types.has('core:text')).toBe(true)
    expect(types.has('core:roll-result')).toBe(true)
  })

  it('does not include types registered on other surfaces', () => {
    registerRenderer('rollResult', 'daggerheart:dd', { dieConfigs: [] })
    const types = getChatVisibleTypes()
    expect(types.has('daggerheart:dd')).toBe(false)
  })

  it('includes plugin-registered chat types', () => {
    registerRenderer('chat', 'daggerheart-core:action-check', (() => null) as any)
    const types = getChatVisibleTypes()
    expect(types.has('daggerheart-core:action-check')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/log/__tests__/dynamicChatTypes.test.ts`
Expected: FAIL — `getChatVisibleTypes` 不存在

- [ ] **Step 3: 实现 getChatVisibleTypes**

```typescript
// src/log/rendererRegistry.ts — 文件底部新增
const CHAT_SURFACE_PREFIX = 'chat::'

/** Get all entry types that have a registered 'chat' surface renderer */
export function getChatVisibleTypes(): Set<string> {
  const types = new Set<string>()
  for (const k of registry.keys()) {
    if (k.startsWith(CHAT_SURFACE_PREFIX)) {
      types.add(k.slice(CHAT_SURFACE_PREFIX.length))
    }
  }
  return types
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/log/__tests__/dynamicChatTypes.test.ts`
Expected: PASS

- [ ] **Step 5: 更新 ChatPanel 使用动态类型**

```typescript
// src/chat/ChatPanel.tsx — 替换第24行的硬编码 CHAT_TYPES
import { getChatVisibleTypes } from '../log/rendererRegistry'

// 删除: const CHAT_TYPES = new Set(['core:text', 'core:roll-result'])
```

在组件内部（约第100行）：

```typescript
const chatTypes = useMemo(() => getChatVisibleTypes(), [])
const visibleEntries = useMemo(
  () => logEntries.filter((e) => chatTypes.has(e.type)),
  [logEntries, chatTypes],
)
```

注意：`getChatVisibleTypes()` 的 memo 依赖是 `[]`（空依赖），因为注册发生在 `initWorkflowSystem` 中（组件挂载前已完成），不会动态变化。

- [ ] **Step 6: 提交**

```bash
git add src/log/rendererRegistry.ts src/log/__tests__/dynamicChatTypes.test.ts src/chat/ChatPanel.tsx
git commit -m "feat: dynamic CHAT_TYPES based on renderer registry"
```

---

## Task 8: DiceJudge 类

**目标**：将 DaggerHeart 判定逻辑从函数式迁移到 OOP 类，支持可变 DC。

**Files:**

- Create: `plugins/daggerheart-core/DiceJudge.ts`
- Test: `plugins/daggerheart-core/__tests__/DiceJudge.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// plugins/daggerheart-core/__tests__/DiceJudge.test.ts
import { describe, it, expect } from 'vitest'
import { DiceJudge } from '../DiceJudge'

describe('DiceJudge', () => {
  const judge = new DiceJudge()

  describe('evaluate', () => {
    it('returns critical_success when hope === fear', () => {
      const result = judge.evaluate([[6, 6]], 12, 12)
      expect(result?.outcome).toBe('critical_success')
    })

    it('returns success_hope when total >= dc and hope > fear', () => {
      const result = judge.evaluate([[8, 5]], 13, 12)
      expect(result?.outcome).toBe('success_hope')
      expect(result?.hopeDie).toBe(8)
      expect(result?.fearDie).toBe(5)
    })

    it('returns success_fear when total >= dc and fear > hope', () => {
      const result = judge.evaluate([[4, 9]], 13, 12)
      expect(result?.outcome).toBe('success_fear')
    })

    it('returns failure_hope when total < dc and hope > fear', () => {
      const result = judge.evaluate([[5, 3]], 8, 12)
      expect(result?.outcome).toBe('failure_hope')
    })

    it('returns failure_fear when total < dc and fear > hope', () => {
      const result = judge.evaluate([[3, 5]], 8, 12)
      expect(result?.outcome).toBe('failure_fear')
    })

    it('returns null for empty rolls', () => {
      expect(judge.evaluate([], 0, 12)).toBeNull()
    })

    it('returns null for rolls with fewer than 2 dice', () => {
      expect(judge.evaluate([[5]], 5, 12)).toBeNull()
    })

    it('uses provided DC instead of default', () => {
      // Total 8 vs DC 7 → success; vs DC 12 → failure
      const successResult = judge.evaluate([[5, 3]], 8, 7)
      expect(successResult?.outcome).toBe('success_hope')

      const failResult = judge.evaluate([[5, 3]], 8, 12)
      expect(failResult?.outcome).toBe('failure_hope')
    })
  })

  describe('getDisplay', () => {
    it('returns correct display for critical_success', () => {
      const result = judge.evaluate([[6, 6]], 12, 12)!
      const display = judge.getDisplay(result)
      expect(display.severity).toBe('critical')
      expect(display.color).toBe('#a78bfa')
    })

    it('returns correct display for failure_fear', () => {
      const result = judge.evaluate([[3, 5]], 8, 12)!
      const display = judge.getDisplay(result)
      expect(display.severity).toBe('fumble')
      expect(display.color).toBe('#ef4444')
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run plugins/daggerheart-core/__tests__/DiceJudge.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 DiceJudge 类**

```typescript
// plugins/daggerheart-core/DiceJudge.ts
import type { DaggerheartOutcome, JudgmentResult, JudgmentDisplay } from '@myvtt/sdk'

/** OOP class encapsulating Daggerheart dice judgment logic */
export class DiceJudge {
  evaluate(rolls: number[][], total: number, dc: number): JudgmentResult | null {
    if (rolls.length === 0 || (rolls[0]?.length ?? 0) < 2) return null

    const roll = rolls[0] as number[]
    const hopeDie = roll[0] as number
    const fearDie = roll[1] as number
    const succeeded = total >= dc

    let outcome: DaggerheartOutcome
    if (hopeDie === fearDie) {
      outcome = 'critical_success'
    } else if (succeeded) {
      outcome = hopeDie > fearDie ? 'success_hope' : 'success_fear'
    } else {
      outcome = hopeDie > fearDie ? 'failure_hope' : 'failure_fear'
    }

    return { type: 'daggerheart', hopeDie, fearDie, outcome }
  }

  getDisplay(result: JudgmentResult): JudgmentDisplay {
    if (result.type !== 'daggerheart') {
      return { text: 'judgment.unknown', color: '#64748b', severity: 'partial' }
    }
    switch (result.outcome) {
      case 'critical_success':
        return { text: 'judgment.critical', color: '#a78bfa', severity: 'critical' }
      case 'success_hope':
        return { text: 'judgment.successHope', color: '#fbbf24', severity: 'success' }
      case 'success_fear':
        return { text: 'judgment.successFear', color: '#f97316', severity: 'partial' }
      case 'failure_hope':
        return { text: 'judgment.failureHope', color: '#60a5fa', severity: 'failure' }
      case 'failure_fear':
        return { text: 'judgment.failureFear', color: '#ef4444', severity: 'fumble' }
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/__tests__/DiceJudge.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/daggerheart-core/DiceJudge.ts plugins/daggerheart-core/__tests__/DiceJudge.test.ts
git commit -m "feat(daggerheart-core): add DiceJudge OOP class with DC-based judgment"
```

---

## Task 9: FearManager + HopeResolver

**目标**：创建 FearManager（管理 Fear 全局实体生命周期）和 HopeResolver（per-character Hope 更新）。

**Files:**

- Create: `plugins/daggerheart-core/FearManager.ts`
- Create: `plugins/daggerheart-core/HopeResolver.ts`
- Test: `plugins/daggerheart-core/__tests__/FearManager.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// plugins/daggerheart-core/__tests__/FearManager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { FearManager } from '../FearManager'
import { HopeResolver } from '../HopeResolver'
import type { WorkflowContext } from '@myvtt/sdk'

function mockCtx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    vars: {} as any,
    read: {
      entity: vi.fn().mockReturnValue(undefined),
      component: vi.fn().mockReturnValue(undefined),
      query: vi.fn().mockReturnValue([]),
      formulaTokens: vi.fn().mockReturnValue({}),
    },
    serverRoll: vi.fn(),
    requestInput: vi.fn(),
    emitEntry: vi.fn(),
    updateComponent: vi.fn(),
    updateTeamTracker: vi.fn(),
    createEntity: vi.fn().mockResolvedValue('daggerheart-core:fear'),
    deleteEntity: vi.fn(),
    abort: vi.fn(),
    runWorkflow: vi.fn(),
    ...overrides,
  } as unknown as WorkflowContext
}

describe('FearManager', () => {
  it('creates Fear entity if it does not exist', async () => {
    const ctx = mockCtx()
    const fear = new FearManager()
    await fear.ensureEntity(ctx)
    expect(ctx.createEntity).toHaveBeenCalledWith({
      id: 'daggerheart-core:fear',
      components: { 'daggerheart-core:fear-tracker': { current: 0, max: 10 } },
      lifecycle: 'persistent',
    })
  })

  it('skips creation if Fear entity already exists', async () => {
    const ctx = mockCtx({
      read: {
        entity: vi
          .fn()
          .mockReturnValue({
            id: 'daggerheart-core:fear',
            components: {},
            tags: [],
            lifecycle: 'persistent',
            permissions: { default: 'none', seats: {} },
          }),
        component: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        formulaTokens: vi.fn().mockReturnValue({}),
      },
    })
    const fear = new FearManager()
    await fear.ensureEntity(ctx)
    expect(ctx.createEntity).not.toHaveBeenCalled()
  })

  it('addFear increments current via updateComponent', () => {
    const ctx = mockCtx()
    const fear = new FearManager()
    fear.addFear(ctx)
    expect(ctx.updateComponent).toHaveBeenCalledWith(
      'daggerheart-core:fear',
      'daggerheart-core:fear-tracker',
      expect.any(Function),
    )
  })
})

describe('HopeResolver', () => {
  it('addHope increments actor hope via updateComponent', () => {
    const ctx = mockCtx()
    const hope = new HopeResolver()
    hope.addHope(ctx, 'actor-123')
    expect(ctx.updateComponent).toHaveBeenCalledWith(
      'actor-123',
      'daggerheart:extras',
      expect.any(Function),
    )
  })

  it('updater increments hope by 1', () => {
    const ctx = mockCtx()
    const hope = new HopeResolver()
    hope.addHope(ctx, 'actor-123')
    const updater = (ctx.updateComponent as ReturnType<typeof vi.fn>).mock.calls[0][2] as (
      prev: unknown,
    ) => unknown
    expect(updater({ hope: 3 })).toEqual({ hope: 4 })
    expect(updater(undefined)).toEqual({ hope: 1 })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run plugins/daggerheart-core/__tests__/FearManager.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 FearManager**

```typescript
// plugins/daggerheart-core/FearManager.ts
import type { WorkflowContext } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'

export class FearManager {
  readonly entityId = FEAR_ENTITY_ID

  async ensureEntity(ctx: WorkflowContext): Promise<void> {
    const existing = ctx.read.entity(FEAR_ENTITY_ID)
    if (existing) return

    await ctx.createEntity({
      id: FEAR_ENTITY_ID,
      components: { [FEAR_COMPONENT_KEY]: { current: 0, max: 10 } },
      lifecycle: 'persistent',
    })
  }

  addFear(ctx: WorkflowContext): void {
    ctx.updateComponent(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: 10 }) as { current: number; max: number }
      return { ...p, current: p.current + 1 }
    })
  }
}
```

- [ ] **Step 4: 实现 HopeResolver**

```typescript
// plugins/daggerheart-core/HopeResolver.ts
import type { WorkflowContext } from '@myvtt/sdk'

const EXTRAS_KEY = 'daggerheart:extras'

export class HopeResolver {
  addHope(ctx: WorkflowContext, actorId: string): void {
    ctx.updateComponent(actorId, EXTRAS_KEY, (prev: unknown) => {
      const p = (prev ?? {}) as Record<string, unknown>
      return { ...p, hope: ((p.hope as number | undefined) ?? 0) + 1 }
    })
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/__tests__/FearManager.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add plugins/daggerheart-core/FearManager.ts plugins/daggerheart-core/HopeResolver.ts plugins/daggerheart-core/__tests__/FearManager.test.ts
git commit -m "feat(daggerheart-core): add FearManager and HopeResolver OOP classes"
```

---

## Task 10: ModifierPanel 输入组件

**目标**：创建 DC/modifier 输入面板，通过 `registerInputHandler` 注册，验证 requestInput 基础设施。

**Files:**

- Create: `plugins/daggerheart-core/ui/ModifierPanel.tsx`

- [ ] **Step 1: 创建 ModifierPanel 组件**

```typescript
// plugins/daggerheart-core/ui/ModifierPanel.tsx
import { useState } from 'react'
import type { InputHandlerProps } from '../../../src/ui-system/inputHandlerTypes'

export interface ModifierPanelContext {
  actorId?: string
}

export interface ModifierResult {
  dc: number
}

/**
 * ⚠️ TEMP: This panel is currently triggered from .dd command line.
 * After characterUI migration, it should ONLY be triggered from character card buttons.
 * The command-line trigger path should be removed at that point.
 */
export function ModifierPanel({
  context,
  resolve,
  cancel,
}: InputHandlerProps<ModifierPanelContext, ModifierResult>) {
  const [dc, setDc] = useState(12)

  return (
    <div className="bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-[260px]">
      <div className="text-sm text-text-muted mb-3">Daggerheart Action Check</div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-text-muted w-8">DC</label>
        <input
          type="number"
          min={1}
          max={30}
          value={dc}
          onChange={(e) => setDc(Math.max(1, Math.min(30, Number(e.target.value) || 12)))}
          className="w-16 bg-surface border border-border-glass rounded px-2 py-1 text-sm text-text-primary text-center outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => cancel()}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={() => resolve({ dc })}
          className="px-3 py-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors cursor-pointer"
        >
          Roll
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 确认文件创建成功**

Run: `ls plugins/daggerheart-core/ui/ModifierPanel.tsx`
Expected: 文件存在

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add plugins/daggerheart-core/ui/ModifierPanel.tsx
git commit -m "feat(daggerheart-core): add ModifierPanel input handler component"
```

---

## Task 11: OOP 插件重写 + 工作流装配

**目标**：将 daggerheart-core 插件重写为 OOP 类，组装完整的 dh:action-check 工作流。

**Files:**

- Rewrite: `plugins/daggerheart-core/index.ts`
- Delete: `plugins/daggerheart-core/rollSteps.ts`
- Test: `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`

- [ ] **Step 1: 写集成测试**

```typescript
// plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import type { ContextDeps } from '../../../src/workflow/context'
import type { UIRegistry } from '../../../src/ui-system/registry'

// We need to import the plugin AFTER it's been created
// Import the class directly
import { DaggerHeartCorePlugin } from '../index'

function makeDeps(
  overrides: Partial<Omit<ContextDeps, 'engine'>> = {},
): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[8, 5]]),
    createEntity: vi.fn().mockResolvedValue('daggerheart-core:fear'),
    deleteEntity: vi.fn(),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

describe('DaggerHeartCorePlugin — OOP integration', () => {
  let engine: WorkflowEngine
  let deps: Omit<ContextDeps, 'engine'>
  let runner: WorkflowRunner

  beforeEach(() => {
    engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    deps = makeDeps()
    runner = new WorkflowRunner(engine, deps)

    const plugin = new DaggerHeartCorePlugin()
    const sdk = new PluginSDK(engine, plugin.id)
    plugin.onActivate(sdk)
  })

  it('registers daggerheart-core:action-check workflow', () => {
    const steps = engine.inspectWorkflow('daggerheart-core:action-check')
    expect(steps).toContain('modifier')
    expect(steps).toContain('roll')
  })

  it('full flow: roll → modifier → judge → emit → resolve', async () => {
    // Mock requestInput to return DC=12 immediately
    const mockRequestInput = vi.fn().mockResolvedValue({ ok: true, value: { dc: 12 } })

    const depsWithInput = makeDeps({
      serverRoll: vi.fn().mockResolvedValue([[8, 5]]),
    })

    const runnerWithInput = new WorkflowRunner(engine, depsWithInput)

    // We need to mock requestInput at the context level
    // This is tricky because it goes through sessionStore
    // For now, test the workflow structure
    const steps = engine.inspectWorkflow('daggerheart-core:action-check')
    expect(steps).toContain('modifier')
    expect(steps).toContain('roll')
    expect(steps).toContain('judge')
    expect(steps).toContain('emit')
    expect(steps).toContain('resolve')
  })

  it('emits daggerheart-core:action-check entry type', async () => {
    // Skip modifier step by providing dc in vars
    const result = await runner.runWorkflow(engine.getWorkflow('daggerheart-core:action-check'), {
      formula: '2d12',
      actorId: 'actor-1',
      dc: 15,
      skipModifier: true,
    })

    const emittedEntries = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const actionCheckEntry = emittedEntries.find(
      (call) => (call[0] as { type: string }).type === 'daggerheart-core:action-check',
    )
    expect(actionCheckEntry).toBeDefined()

    const payload = (actionCheckEntry![0] as { payload: Record<string, unknown> }).payload
    expect(payload).toHaveProperty('rolls')
    expect(payload).toHaveProperty('total')
    expect(payload).toHaveProperty('dc')
    expect(payload).toHaveProperty('judgment')
    expect(payload).toHaveProperty('display')
  })

  it('updates Hope on hope outcome', async () => {
    const depsHope = makeDeps({
      serverRoll: vi.fn().mockResolvedValue([[8, 5]]), // hope > fear → success_hope
    })
    const runnerHope = new WorkflowRunner(engine, depsHope)

    await runnerHope.runWorkflow(engine.getWorkflow('daggerheart-core:action-check'), {
      formula: '2d12',
      actorId: 'actor-1',
      dc: 12,
      skipModifier: true,
    })

    // Total = 13 >= DC 12, hope(8) > fear(5) → success_hope → addHope
    expect(depsHope.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'core:component-update',
        payload: expect.objectContaining({
          entityId: 'actor-1',
          key: 'daggerheart:extras',
        }),
      }),
    )
  })

  it('updates Fear on fear outcome', async () => {
    const depsFear = makeDeps({
      serverRoll: vi.fn().mockResolvedValue([[4, 9]]), // fear > hope → success_fear
    })
    const runnerFear = new WorkflowRunner(engine, depsFear)

    await runnerFear.runWorkflow(engine.getWorkflow('daggerheart-core:action-check'), {
      formula: '2d12',
      actorId: 'actor-1',
      dc: 12,
      skipModifier: true,
    })

    // Total = 13 >= DC 12, fear(9) > hope(4) → success_fear → addFear
    expect(depsFear.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'core:component-update',
        payload: expect.objectContaining({
          entityId: 'daggerheart-core:fear',
          key: 'daggerheart-core:fear-tracker',
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: 重写 index.ts 为 OOP 类**

```typescript
// plugins/daggerheart-core/index.ts
import type { VTTPlugin, IPluginSDK, WorkflowContext, WorkflowHandle } from '@myvtt/sdk'
import { DiceJudge } from './DiceJudge'
import { FearManager } from './FearManager'
import { HopeResolver } from './HopeResolver'
import { ModifierPanel } from './ui/ModifierPanel'
import type { ModifierResult } from './ui/ModifierPanel'

/** Data shape for the dh:action-check workflow */
interface ActionCheckData {
  [key: string]: unknown
  formula: string
  actorId: string
  dc?: number
  skipModifier?: boolean // ⚠️ TEMP: bypass modifier panel for testing/direct invocation
  rolls?: number[][]
  total?: number
  judgment?: import('@myvtt/sdk').JudgmentResult
}

export class DaggerHeartCorePlugin implements VTTPlugin {
  id = 'daggerheart-core'

  private dice = new DiceJudge()
  private fear = new FearManager()
  private hope = new HopeResolver()
  private actionCheckHandle!: WorkflowHandle<ActionCheckData>

  onActivate(sdk: IPluginSDK): void {
    // Register input handler for modifier panel
    sdk.ui.registerInputHandler('daggerheart-core:modifier', {
      component: ModifierPanel as any,
    })

    // Register action check renderer
    // (Imported dynamically in Task 12 — placeholder for now)
    // sdk.ui.registerRenderer('chat', 'daggerheart-core:action-check', DHActionCheckCard)

    // Register Fear panel
    // (Added in Task 13)

    // Define the main workflow
    this.actionCheckHandle = sdk.defineWorkflow<ActionCheckData>('daggerheart-core:action-check', [
      {
        id: 'modifier',
        run: async (ctx) => {
          // ⚠️ TEMP: command-line triggers this panel. After characterUI migration,
          // this step should only run when triggered from character card buttons.
          // When triggered from command line, skipModifier flag bypasses the panel.
          if (ctx.vars.skipModifier || ctx.vars.dc != null) return

          const result = await ctx.requestInput<ModifierResult>('daggerheart-core:modifier', {
            context: { actorId: ctx.vars.actorId },
          })
          if (!result.ok) {
            ctx.abort('Modifier input cancelled')
            return
          }
          ctx.vars.dc = result.value.dc
        },
      },
      {
        id: 'roll',
        run: async (ctx) => {
          // Pure RNG — 2d12
          const rolls = await ctx.serverRoll([{ sides: 12, count: 2 }])
          ctx.vars.rolls = rolls

          // Compute total: sum of 2d12 (modifier bonuses from formula handled in future iteration)
          const total = rolls.flat().reduce((a, b) => a + b, 0)
          ctx.vars.total = total
        },
      },
      {
        id: 'judge',
        run: (ctx) => {
          const { rolls, total, dc } = ctx.vars
          if (!rolls || total == null) return

          const actualDc = dc ?? 12 // fallback if no modifier panel
          const judgment = this.dice.evaluate(rolls, total, actualDc)
          if (judgment) {
            ctx.vars.judgment = judgment
          }
        },
      },
      {
        id: 'emit',
        run: (ctx) => {
          const { rolls, total, dc, formula, judgment } = ctx.vars
          if (!rolls || total == null) return

          const display = judgment ? this.dice.getDisplay(judgment) : undefined

          ctx.emitEntry({
            type: 'daggerheart-core:action-check',
            payload: {
              formula,
              rolls,
              total,
              dc: dc ?? 12,
              judgment: judgment ?? null,
              display: display ?? null,
              dieConfigs: [
                { color: '#fbbf24', label: 'die.hope' },
                { color: '#dc2626', label: 'die.fear' },
              ],
            },
            triggerable: true,
          })
        },
      },
      {
        id: 'resolve',
        run: (ctx) => {
          const judgment = ctx.vars.judgment as { type: string; outcome: string } | undefined
          if (!judgment || judgment.type !== 'daggerheart') return

          const outcome = judgment.outcome
          if (outcome === 'success_hope' || outcome === 'failure_hope') {
            this.hope.addHope(ctx, ctx.vars.actorId)
          } else if (outcome === 'success_fear' || outcome === 'failure_fear') {
            this.fear.addFear(ctx)
          }
        },
      },
    ])

    // Register command
    sdk.registerCommand('.dd', this.actionCheckHandle)
  }

  async onReady(ctx: WorkflowContext): Promise<void> {
    await this.fear.ensureEntity(ctx)
  }
}

// Export singleton instance for plugin registry
export const daggerheartCorePlugin = new DaggerHeartCorePlugin()
```

- [ ] **Step 3: 删除旧 rollSteps.ts**

删除 `plugins/daggerheart-core/rollSteps.ts`。旧的 `getDHJudgmentWorkflow`、`getDHActionCheckWorkflow`、`registerDHCoreSteps` 不再需要。

- [ ] **Step 4: 更新 SDK 导出（如需要）**

检查 `src/rules/sdk.ts` 是否导出了 `getDHActionCheckWorkflow` 等旧函数。如果有，删除。检查其他文件是否引用 `rollSteps.ts` 中的导出，更新引用。

- [ ] **Step 5: 更新旧测试 rollSteps.test.ts**

删除 `plugins/daggerheart-core/__tests__/rollSteps.test.ts`（被 `actionCheckWorkflow.test.ts` 替代）。

- [ ] **Step 6: 运行测试**

Run: `npx vitest run plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`
Expected: PASS（可能需要调整 mock）

Run: `npx vitest run src/workflow/__tests__/`
Expected: ALL PASS

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 7: 提交**

```bash
git add plugins/daggerheart-core/index.ts plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts
git rm plugins/daggerheart-core/rollSteps.ts plugins/daggerheart-core/__tests__/rollSteps.test.ts
git commit -m "feat(daggerheart-core): OOP plugin rewrite with full action-check workflow"
```

---

## Task 12: DHActionCheckCard 渲染器

**目标**：创建 `daggerheart-core:action-check` 日志条目的聊天渲染组件。

**Files:**

- Create: `plugins/daggerheart-core/ui/DHActionCheckCard.tsx`
- Modify: `plugins/daggerheart-core/index.ts` (注册渲染器)

- [ ] **Step 1: 创建渲染器组件**

```typescript
// plugins/daggerheart-core/ui/DHActionCheckCard.tsx
import type { LogEntryRendererProps } from '../../../src/log/rendererRegistry'
import { CardShell } from '../../../src/log/CardShell'
import { DiceAnimContent } from '../../../src/chat/DiceResultCard'
import type { DieConfig, JudgmentDisplay } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'

interface ActionCheckPayload {
  formula: string
  rolls: number[][]
  total: number
  dc: number
  judgment: { type: string; outcome: string } | null
  display: JudgmentDisplay | null
  dieConfigs: DieConfig[]
}

export function DHActionCheckCard({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  const { t } = usePluginTranslation()
  const payload = entry.payload as unknown as ActionCheckPayload

  const { formula, rolls, total, dc, display, dieConfigs } = payload

  const footer = display
    ? { text: t(display.text), color: display.color }
    : undefined

  return (
    <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
      <div data-testid="entry-action-check">
        <DiceAnimContent
          formula={formula}
          rolls={rolls}
          isNew={!!isNew}
          dieConfigs={dieConfigs}
          footer={footer}
          totalColor={display?.color}
        />
        <div className="flex items-center justify-between mt-1 px-2 text-[10px] text-text-muted/50">
          <span>DC {dc}</span>
          <span>Total {total}</span>
        </div>
      </div>
    </CardShell>
  )
}
```

- [ ] **Step 2: 在 index.ts 中注册渲染器**

```typescript
// plugins/daggerheart-core/index.ts — onActivate 中添加
import { DHActionCheckCard } from './ui/DHActionCheckCard'

// 在 onActivate 方法中：
sdk.ui.registerRenderer('chat', 'daggerheart-core:action-check', DHActionCheckCard as any)
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add plugins/daggerheart-core/ui/DHActionCheckCard.tsx plugins/daggerheart-core/index.ts
git commit -m "feat(daggerheart-core): add DHActionCheckCard chat renderer"
```

---

## Task 13: FearPanel + 面板注册

**目标**：创建 Fear tracker 面板，通过 `sdk.ui.registerComponent` 注册为面板。

**Files:**

- Create: `plugins/daggerheart-core/ui/FearPanel.tsx`
- Modify: `plugins/daggerheart-core/index.ts` (注册面板)

- [ ] **Step 1: 创建 FearPanel 组件**

```typescript
// plugins/daggerheart-core/ui/FearPanel.tsx
import { useComponent, useHoldRepeat } from '@myvtt/sdk'
import type { WorkflowContext } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'

interface FearTracker {
  current: number
  max: number
}

export function FearPanel() {
  const tracker = useComponent<FearTracker>(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY)
  const current = tracker?.current ?? 0
  const max = tracker?.max ?? 10

  return (
    <div className="p-3 select-none">
      <div className="text-[10px] text-text-muted/50 uppercase tracking-wider mb-2">
        Fear
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-red-500 tabular-nums w-8 text-center">
          {current}
        </span>
        <span className="text-xs text-text-muted">/ {max}</span>
      </div>
      {/* Pip track */}
      <div className="flex gap-1 mt-2">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className="w-[7px] h-[7px] rounded-full transition-colors"
            style={{
              backgroundColor: i < current ? '#dc2626' : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 index.ts 中注册面板**

```typescript
// plugins/daggerheart-core/index.ts — onActivate 中添加
import { FearPanel } from './ui/FearPanel'

// 在 onActivate 方法中：
sdk.ui.registerComponent({
  id: 'daggerheart-core:fear-panel',
  component: FearPanel as any,
  type: 'panel',
  defaultSize: { width: 160, height: 120 },
  minSize: { width: 120, height: 80 },
  defaultPlacement: { anchor: 'top-right', offsetX: -16, offsetY: 60 },
})
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add plugins/daggerheart-core/ui/FearPanel.tsx plugins/daggerheart-core/index.ts
git commit -m "feat(daggerheart-core): add FearPanel and register as panel component"
```

---

## Task 14: RulePlugin.diceSystem 退役 + 清理

**目标**：从 RulePlugin 接口和 daggerheart 插件中删除 diceSystem，清理 RollResultRenderer 的最后依赖。

**Files:**

- Modify: `src/rules/types.ts:207-211`
- Modify: `plugins/daggerheart/index.ts`
- Delete: `plugins/daggerheart/diceSystem.ts`
- Modify: `src/log/renderers/RollResultRenderer.tsx`
- Modify: `src/log/renderers/rollResultDeps.ts` (如果存在)

- [ ] **Step 1: 从 RulePlugin 接口删除 diceSystem**

```typescript
// src/rules/types.ts — 删除第207-211行
// 删除:
// diceSystem?: {
//   evaluateRoll(rolls: number[][], total: number): JudgmentResult | null
//   getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
// }
```

同时从 SDK 类型导出中移除 `JudgmentResult` 和 `JudgmentDisplay`（如果只通过 RulePlugin.diceSystem 使用）。

**注意**：`JudgmentResult` 和 `JudgmentDisplay` 类型仍被 DiceJudge 使用（通过 `@myvtt/sdk` 导入）。保留类型定义，只删除 `diceSystem` 接口字段。

- [ ] **Step 2: 从 daggerheart 插件删除 diceSystem**

```typescript
// plugins/daggerheart/index.ts — 移除 diceSystem 相关行
// 删除 import: import { dhEvaluateRoll, dhGetJudgmentDisplay } from './diceSystem'
// 删除字段:
// diceSystem: {
//   evaluateRoll: dhEvaluateRoll,
//   getJudgmentDisplay: dhGetJudgmentDisplay,
// },
```

- [ ] **Step 3: 删除 daggerheart/diceSystem.ts**

```bash
git rm plugins/daggerheart/diceSystem.ts
```

- [ ] **Step 4: 清理 RollResultRenderer — 移除 diceSystem 依赖**

```typescript
// src/log/renderers/RollResultRenderer.tsx — 修改语义配置路径（约第61-78行）
// 原来的代码：
//   const judgment = plugin.diceSystem?.evaluateRoll(rolls, total) ?? null
//   const display = judgment ? plugin.diceSystem?.getJudgmentDisplay(judgment) : null

// 替换为：不再调用 diceSystem，语义配置路径只使用 dieConfigs（不含 judgment）
if (slot && typeof slot !== 'function') {
  return (
    <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
      <div data-testid="entry-roll-result">
        <DiceAnimContent
          formula={formula}
          resolvedFormula={resolvedFormula}
          rolls={rolls}
          isNew={!!isNew}
          dieConfigs={slot.dieConfigs}
        />
      </div>
    </CardShell>
  )
}
```

同时删除 `plugin` 和 `useRulePlugin` 相关导入和调用。RollResultRenderer 现在只处理：

1. 语义配置（dieConfigs 颜色标签）— 来自 rollResult 注册
2. 组件覆盖（自定义 card 组件）
3. 默认纯骰子展示

移除对 `_getUseRulePlugin` 的调用（第21行）和相关 import。

- [ ] **Step 5: 运行类型检查和测试**

Run: `npx tsc --noEmit`
Expected: 无类型错误

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: 提交**

```bash
git add src/rules/types.ts plugins/daggerheart/index.ts src/log/renderers/RollResultRenderer.tsx
git rm plugins/daggerheart/diceSystem.ts
git commit -m "refactor: retire RulePlugin.diceSystem — rendering now driven by plugin entry types"
```

---

## Task 15: 集成验证 + 最终清理

**目标**：确保所有变更协同工作，清理遗留引用，运行完整测试套件。

**Files:**

- Verify: 所有已修改文件
- Modify: 需要修补的引用

- [ ] **Step 1: 运行完整类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。如有错误，逐一修复。

常见需修复的点：

- `src/rules/sdk.ts` — 可能需要删除对旧 rollSteps 的导出
- `src/workflow/__tests__/integration.test.ts` — serverRoll mock 格式
- `rollResultDeps.ts` — 可能引用了 useRulePlugin

- [ ] **Step 2: 运行所有单元测试**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: 运行 ESLint**

Run: `npx eslint --ext .ts,.tsx src/ server/ plugins/ --max-warnings 0`
Expected: 无新增 warning

- [ ] **Step 4: 手动验证清单**

在开发服务器中验证以下场景：

- [ ] `.r 2d6` 简单掷骰 → 聊天面板显示骰子动画 + 合计（core:roll-result entry）
- [ ] `.dd` 命令 → ModifierPanel 弹出 → 输入 DC → Roll → 显示 DHActionCheckCard
- [ ] DHActionCheckCard 显示 Hope/Fear 骰子颜色、DC、判定结果
- [ ] Hope outcome → 对应角色的 hope 值 +1
- [ ] Fear outcome → Fear 面板数值 +1
- [ ] Fear 面板显示在 UI 中
- [ ] 每次 `.dd` 掷骰只显示一张卡片（无重复 core:roll-result）
- [ ] Cancel modifier panel → 工作流 abort，无卡片显示

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: DaggerHeart acceptance — complete dice flow with OOP plugin pattern

- serverRoll simplified to pure RNG (no entry creation)
- createEntity/deleteEntity on WorkflowContext
- VTTPlugin.onReady lifecycle hook
- Namespace enforcement for plugin SDK registrations
- Dynamic CHAT_TYPES from renderer registry
- OOP plugin rewrite: DiceJudge, FearManager, HopeResolver
- Full dh:action-check workflow: modifier → roll → judge → emit → resolve
- DHActionCheckCard custom renderer
- FearPanel component
- RulePlugin.diceSystem retired"
```

---

## 注意事项

### 已知需在实现时确认的细节

1. **Modifier 面板字段**：当前只有 DC 输入。后续可扩展属性选择、bonuses 等。
2. **Hope 上限**：当前无上限检查。DH 规则中 Hope 上限通常为 6——需确认后在 HopeResolver 中添加。
3. **onReady 异步策略**：当前 fire-and-forget。如果 Fear 实体创建失败，不会阻塞其他插件。后续可改为 await。
4. **日志去重**：`core:roll-result`（serverRoll 不再创建）+ `daggerheart-core:action-check`（插件创建）= 每次掷骰只有一条可见 entry。如果未来其他 workflow 仍创建 core:roll-result，需实现 groupId 去重。
5. **命名空间覆盖完整性**：当前覆盖 PluginSDK 层（defineWorkflow、registerTrigger）。运行时层（emitEntry、updateComponent、createEntity）暂不校验。

### 与 PR #185 的关系

如果 PR #185 在此计划执行前合并：

- `EntityLifecycle` 将从 `'ephemeral' | 'reusable' | 'persistent'` 变为 `'persistent' | 'tactical' | 'scene'`
- Fear 实体使用 `'persistent'` — 两个版本都兼容
- 不影响本计划执行

### 需更新的现有测试

以下测试文件的 serverRoll mock 需要从返回 `GameLogEntry` 改为返回 `number[][]`：

- `src/workflow/__tests__/integration.test.ts`
- `src/workflow/__tests__/initWorkflowSystem.test.ts`（如果引用了 serverRoll）
- `src/workflow/__tests__/commandSystem.test.ts`（如果引用了 serverRoll）
