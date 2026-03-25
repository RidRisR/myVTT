# 阶段 3：DnD → Workflow → 双面板联动

> **POC 目标**：验证「面板不直接通信、通过数据层间接联动」这一核心设计在 DnD 场景下成立。
> **范围**：纯前端内存操作，DnD 使用标准单步模型。

---

## 一、验证场景

**拖拽状态标记给实体**：从标记列表拖拽一个状态条件（如「中毒」）到实体面板，实体获得该标记，所有绑定同一 entityId 的面板同步更新。

选择此场景的原因：

- 不依赖 Item 数据类型（暂未实现）
- workflow 逻辑足够简单，不干扰通路验证
- 能同时覆盖 DnD、写入、双面板同步三个目标

---

## 二、完整数据流

```
面板 A：拖起「中毒」标记卡
  makeDraggable({ type: 'status-tag', data: { tagId: 'poisoned' } })
          ↓ 用户放下
面板 B：onDrop(payload) 触发
  sdk.workflow.run(applyTagHandle, {
    tagId: payload.data.tagId,   // 来自被拖物（payload）
    targetId: props.entityId,    // 来自组件自身 context（闭包）
  })
          ↓
workflow 步骤：
  ctx.updateComponent(state.targetId, 'core:status-tags', (current: { tags: string[] } | undefined) => ({
    tags: [...(current?.tags ?? []), state.tagId],
  }))
          ↓
zustand store 更新
          ↓
面板 A + 面板 B 同时 re-render，标记列表更新
```

---

## 三、接口分析：无需修改现有 DnD SDK

### 3.1 落点 context 来自闭包，不需要放进 onDrop

`onDrop(payload)` 只携带「被拖物是什么」。落点的 context（目标 entityId）来自组件自身的 `props`，通过闭包自然可访问：

```tsx
const dropZoneProps = sdk.interaction.dnd.makeDropZone({
  accept: ['status-tag'],
  canDrop: (payload) => {
    // canDrop 在组件 scope 里，可直接读 sdk.data
    const tags = sdk.data.component(props.entityId, 'core:status-tags')
    return !tags?.tags.includes(payload.data.tagId)
  },
  onDrop: (payload) => {
    sdk.workflow.run(applyTagHandle, {
      tagId: payload.data.tagId,
      targetId: props.entityId,
    })
  },
})
```

`onDrop` 签名 `(payload: DnDPayload) => void` 无需修改。

### 3.2 已知约束：canDrop 是同步的

`canDrop` 在 `dragover` 期间实时调用，用于决定是否显示「可放置」视觉反馈，**必须同步返回**。

POC 阶段全是内存数据，同步读取 `sdk.data` 足够。但生产环境若拒绝条件需要异步验证（如查后端权限），此设计将无法支持。

**标记为已知限制**，暂不解决，生产阶段再评估。

---

## 四、sandbox 双面板布局

在布局配置里放两个面板实例，绑定同一 entityId：

```ts
{
  'poc-ui.entity-card#1': {
    x: 0, y: 0, width: 400, height: 500,
    instanceProps: { entityId: 'entity-1' },
  },
  'poc-ui.entity-card#2': {
    x: 420, y: 0, width: 400, height: 500,
    instanceProps: { entityId: 'entity-1' },
  },
}
```

两个面板各自独立渲染，互不感知对方存在。数据同步完全由 zustand store 驱动。

---

## 五、验收标准

1. **DnD 触发 workflow**：拖拽落下后 workflow 执行，`ctx.updateComponent` 被调用。

2. **双面板同步**：面板 A 拖拽落下，面板 A 和面板 B 的标记列表同时更新，无任何直接通信。

3. **canDrop 过滤**：已存在的标记无法重复添加，拖拽时视觉反馈正确反映是否可放置。

4. **跨面板拖放**：从面板 A 的标记列表拖起，落到面板 B 的放置区，流程同样成立。

---

## 六、与生产模型的差异

|              | POC（本阶段）          | 生产                           |
| ------------ | ---------------------- | ------------------------------ |
| DnD 模型     | 标准单步（拖起即落点） | 暂存容器模型（见下）           |
| canDrop      | 同步，内存读取         | 可能需要异步验证               |
| payload 传递 | HTML5 DnD              | HTML5 DnD（或 Pointer Events） |

---

## 七、开放设计方向：暂存容器模型

**当前问题**：标准 DnD 模型中，「持有物」的状态依附于浏览器拖拽手势，生命周期极短，无法支持动画、跨面板感知等需求。

**方向**：把拖拽拆成两个独立意图：

```
当前（单步）：
  source ──[拖拽手势]──→ target → workflow 执行

暂存容器（两步）：
  source ──[拾取]──→ 暂存容器（持有物可见、可动画）
  暂存容器 ──[放置]──→ target → workflow 执行
```

「当前持有什么」是典型的 session state——`sdk.session.get('holding')`，不属于持久游戏数据。

**依赖关系**：此模型需要 Session State SDK 设计完成（阶段 5）后才能正确实现。在阶段 5 中，暂存容器模型将作为 Session State 的验收场景之一。

**当前阶段不实现，不影响基础通路验证。**

---

## 八、二审补充

> 以下内容来自全链路验证二审讨论，对本阶段设计的修订和补充。

### 8.1 `canDrop` 中的数据读取需使用命令式 API

§3.1 的 `canDrop` 示例在事件回调中调用 `sdk.data.component()`。`canDrop` 在 `onDragOver` 事件中被调用，不在 React render 上下文中，**不能使用 hook 版 API**（会违反 React hooks 规则）。

应使用命令式 `sdk.data`（`IDataReader`），而非 `sdk.useComponent()`（hook）。参见 [01-响应式数据层设计.md](01-响应式数据层设计.md) §5.1 的 API 分层设计。

```ts
// ✅ 正确：canDrop 中用命令式 sdk.data
canDrop: (payload) => {
  const tags = sdk.data.component<Tags>(props.entityId, 'core:status-tags')
  return !tags?.tags.includes(payload.data.tagId)
}

// ❌ 错误：canDrop 中不能用 hook
canDrop: (payload) => {
  const tags = sdk.useComponent<Tags>(props.entityId, 'core:status-tags') // 💥 崩溃
}
```

### 8.2 `onDrop` payload 来源统一

当前实现（`src/ui-system/dnd.ts`）中，`onDrop` 从 `e.dataTransfer.getData()` 反序列化 payload（JSON 副本），而 `onDragOver` / `onDragEnter` 从模块级 `activeDragPayload` 读取（原始引用）。

这导致 `canDrop` 拿到的是原始引用，`onDrop` 拿到的是 JSON 副本（新对象）。虽然当前设计使用值比较不受影响，但为消除隐性不一致风险，建议 `onDrop` 优先使用 `activeDragPayload`（在 `dragEnd` 之前仍然有效），仅在 `activeDragPayload` 为 `null` 时 fallback 到 `dataTransfer`。
