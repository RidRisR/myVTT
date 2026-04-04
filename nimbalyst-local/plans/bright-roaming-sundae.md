---
title: Dispatcher 自愈机制 — 消除初始化时序耦合
status: done
---

## Context

当前 `LogStreamDispatcher` 没有自己的"已处理到哪"的记忆。它依赖 zustand `subscribe` 只看到未来变更这个特性来避免重复处理。但这导致了严格的初始化时序要求：subscription 必须在 store init 之前就位，否则 window 期间到达的 `log:new` 条目会被永久丢失。

我们在此次重构中已将 `initWorkflowSystem()` 拆成两阶段（sync 构建 + async `startWorkflowTriggers`），并将 `onReady` 正确地放在 store init 之后。但这引入了一个 window：store init 完成 → subscribe 建立之间，`log:new` 事件可能写入 store 但 dispatcher 看不到。

**解决方案**：让 dispatcher 持有 `_lastDispatchedSeq`，subscribe 时先 catchUp store 中遗漏的条目，从而消除对初始化时序的依赖。

## 修改范围

### 1. `LogStreamDispatcher` 增加游标和 catchUp

**文件**: `src/workflow/logStreamDispatcher.ts`

- 新增字段 `private _lastDispatchedSeq = 0`
- 移除 `getWatermark` 构造参数（不再需要外部 watermark 回调）
- 移除 `dispatch()` 的 `watermarkOverride` 参数
- `dispatch()` 改用内部 `_lastDispatchedSeq` 做幂等检查：
  ```
  if (entry.seq <= this._lastDispatchedSeq) return
  // ... 原有 triggerable/chainDepth/executor 检查 ...
  this._lastDispatchedSeq = entry.seq
  ```
- 新增 `startFrom(watermark: number)` — 设置初始游标
- 新增 `catchUp(entries: GameLogEntry[])` — 遍历条目，对 `seq > _lastDispatchedSeq` 的逐一 dispatch

### 2. `startWorkflowTriggers` 接受 watermark 参数

**文件**: `src/workflow/useWorkflowSDK.ts`

- 签名改为 `startWorkflowTriggers(historyWatermark: number): Promise<() => void>`
- subscribe 前调用：
  ```
  dispatcher.startFrom(historyWatermark)
  dispatcher.catchUp(useWorldStore.getState().logEntries)
  ```
- subscribe 回调简化 — 不再传 `watermarkOverride`，dispatcher 自己判断幂等

### 3. `initWorkflowSystem` 构建 dispatcher 时不传 `getWatermark`

**文件**: `src/workflow/useWorkflowSDK.ts`

- `new LogStreamDispatcher(...)` 移除 `getWatermark` 参数

### 4. App.tsx 捕获 historyWatermark 并传入

**文件**: `src/App.tsx`

```
const [worldCleanup, identityCleanup] = await Promise.all([...])
const historyWatermark = useWorldStore.getState().logWatermark
cleanupTriggers = await startWorkflowTriggers(historyWatermark)
```

## 测试计划

### 4a. LogStreamDispatcher 单元测试

**文件**: `src/workflow/logStreamDispatcher.test.ts`（修改现有）

更新现有测试适配新 API（移除 `getWatermark` 构造参数、`watermarkOverride` 传参），新增：

- **`startFrom` 设置初始游标**: `startFrom(10)` 后 dispatch seq=8 → 跳过，seq=11 → 执行
- **`catchUp` 批量补漏**: 给定 entries [seq=3, seq=8, seq=12, seq=15]，`startFrom(10)` 后 catchUp → 只 dispatch seq=12 和 seq=15
- **幂等性**: dispatch 同一 seq 两次 → 只执行一次
- **游标推进**: dispatch seq=10, 然后 dispatch seq=8 → 第二次跳过（游标已过 8）
- **catchUp + subscribe 无重复**: catchUp 处理了 seq=12 后，subscribe 回调再次遇到 seq=12 → 跳过

### 4b. initWorkflowSystem + startWorkflowTriggers 集成测试

**文件**: `src/workflow/__tests__/initWorkflowSystem.test.ts`（修改现有）

更新 `startWorkflowTriggers()` 调用为 `startWorkflowTriggers(watermark)`，新增：

- **window 期间条目不丢失**: initWorkflowSystem → 向 store 写入 entry（模拟 window 期间的 log:new）→ startWorkflowTriggers(0) → entry 被 catchUp 触发
- **历史条目不触发**: store 中有 seq=1..5 的历史条目 → startWorkflowTriggers(5) → 无 dispatch

### 4c. onReady 测试

**文件**: `src/workflow/__tests__/onReady.test.ts`（修改现有）

更新 `startWorkflowTriggers()` 调用为 `startWorkflowTriggers(0)`（测试中 watermark 默认为 0）。

## 验证

1. `npx tsc --noEmit` — 零错误
2. `npx vitest run` — 全量测试通过
3. 重点测试文件：
   - `src/workflow/logStreamDispatcher.test.ts`
   - `src/workflow/__tests__/initWorkflowSystem.test.ts`
   - `src/workflow/__tests__/onReady.test.ts`
