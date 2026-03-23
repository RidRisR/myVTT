# 统一掷骰架构

## 两层分离

```
roll workflow          ← 纯计算，formula → { rolls, total }
  ↑
  被组合调用
  ↑
插件 workflow           ← 解释 + 广播 + 副作用（每个规则系统定义自己的）
```

掷骰（纯计算）和结果处理（业务逻辑）分离。

## roll workflow — 唯一掷骰原语

```
getRollWorkflow({ formula })
  → [generate]
  → { rolls, total }
```

- 输入: `formula`（如 `"2d12+5"`）
- 输出: `{ rolls: number[][], total: number }`
- **纯计算，不知道 rollType，不广播，不触发副作用**
- SDK 导出 `getRollWorkflow()`，所有插件可组合调用

跨规则的通用插件（如 cosmetic）attach 到 roll workflow，一次覆盖所有掷骰：

```typescript
sdk.attachStep(getRollWorkflow(), {
  id: 'cos:dice-animation',
  to: 'generate',
  run: (ctx) => playAnimation(ctx.vars.rolls),
})
```

## 插件 workflow — 组合 roll + 业务逻辑

每个规则系统定义自己的 workflow，内部调用 `getRollWorkflow()` 获取骰子结果，然后自己处理：

### daggerheart-core

```typescript
sdk.defineWorkflow('dh:action-check', [
  {
    id: 'roll',
    run: async (ctx) => {
      const result = await ctx.runWorkflow(getRollWorkflow(), { formula: ctx.vars.formula })
      ctx.vars.rolls = result.output.rolls
      ctx.vars.total = result.output.total
    },
  },
  {
    id: 'dh:judge',
    run: (ctx) => {
      // Hope/Fear 判定
    },
  },
  {
    id: 'dh:resolve',
    run: (ctx) => {
      // tracker 更新
    },
  },
  {
    id: 'broadcast',
    run: (ctx) => {
      // 广播到聊天（Socket.io）
    },
  },
])
```

### 通用掷骰（.r）

```typescript
// 核心系统定义
engine.defineWorkflow('generic-roll', [
  {
    id: 'roll',
    run: async (ctx) => {
      const result = await ctx.runWorkflow(getRollWorkflow(), { formula: ctx.vars.formula })
      ctx.vars.rolls = result.output.rolls
      ctx.vars.total = result.output.total
    },
  },
  {
    id: 'broadcast',
    run: (ctx) => {
      // 广播到聊天
    },
  },
])
```

### 假设未来 D&D 插件

```typescript
sdk.defineWorkflow('dnd:attack', [
  { id: 'roll', run: ... },       // 组合 roll workflow
  { id: 'dnd:hit-check', run: ... }, // AC 比较
  { id: 'dnd:damage', run: ... },    // 伤害骰
  { id: 'broadcast', run: ... },
])
```

## 入口统一

所有入口只做两件事：resolve formula + 选插件 workflow。

```
.r 2d12+3         →  generic-roll({ formula: "2d12+3" })
.dd @agility      →  dh:action-check({ formula: "2d12+5" })
Card 按钮 Agility  →  dh:action-check({ formula: "2d12+5" })
```

Card 按钮点击 = 输入 `.dd @agility`，完全等价。

`.dd` 不是一种"特殊掷骰"，它只是一个公式生成快捷方式（`resolveFormula` 把 `@agility` 展开为数字，再加上 `2d12` 前缀）。

## 插件注册接口

插件通过 `rollCommands` 注册聊天命令，声明公式生成器 + 使用哪个 workflow：

```typescript
rollCommands: {
  'daggerheart:dd': {
    resolveFormula(modifierExpr?: string): string {
      const mod = (modifierExpr ?? '').trim()
      if (!mod) return '2d12'
      return `2d12${mod.startsWith('+') || mod.startsWith('-') ? mod : '+' + mod}`
    },
    workflow: getDHActionCheckWorkflow(),
  },
}
```

`.r` 使用 `generic-roll` workflow，不需要插件注册。

## cosmetic 插件如何工作

cosmetic 插件通过 `readonly` 步骤安全地 attach 到 workflow：

```typescript
sdk.attachStep(dhActionCheck, {
  id: 'cos:dice-animation',
  to: 'dh:judge',
  readonly: true,   // Proxy 强制不可写 → 跨边界安全
  critical: false,   // 失败不中断 workflow
  run: (ctx) => {
    if (ctx.vars.rolls) {
      ctx.events.emit(animationEvent, { rolls: ctx.vars.rolls })
    }
  },
})
```

`readonly: true` 步骤通过 frozen Proxy 保证无法修改 `ctx.vars`（set/delete 抛 TypeError），因此可安全插入任何 workflow 的任何位置，包括跨 workflow 组合边界。

## Vars 契约

workflow 声明的 `WorkflowHandle<TData>` 中 `TData` 的字段就是**公共契约**——所有步骤都知道这些变量存在且有类型。

非契约数据使用命名空间约定（`pluginId:name`），声明的变量是共享契约，未声明的变量使用命名空间标识归属，这是约定而非强制。

## Workflow 变化

| Before | After |
|--------|-------|
| `roll` — 纯掷骰 | **保留，纯计算，不含 rollType** |
| `quick-roll` — roll + display | **重命名为 `generic-roll`**，组合 roll + broadcast |
| `dh:action-check` — 全部写在一个 workflow | **保留，组合 roll + judge + resolve + broadcast** |
| `core:set-selection` | **不变**（跟掷骰无关） |

## resolveFormula 提为公共 util

`@var` 变量解析（如 `@agility → 5`）从 ChatInput 提取为公共 util，Card 按钮和聊天命令共用。

## 设计原则

1. **roll workflow 是纯计算原语** — formula in, { rolls, total } out，零业务逻辑
2. **插件定义自己的 workflow** — 组合 roll + 业务逻辑（解释、副作用、广播）
3. **跨规则插件 attach 到 roll workflow** — 一次覆盖所有掷骰场景
4. **入口只做路由** — resolve formula + 选 workflow
5. **rollType 不进 roll workflow** — 调用方自己知道，用来选 workflow
