# 插件系统探索：从 Pipeline 到 Slot 到未解之问

> **状态：探索中，未定稿。** 本文档记录了插件系统设计的完整思考过程，包括多个被否定的方案和尚未解决的核心问题。不应作为实现依据。

## Context

现有 RulePlugin 7 层接口存在三个根本性缺陷：插件只能声明不能执行、插件无法响应基座事件、缺乏规则系统与扩展插件之间的协作机制。

本文档经历了多次演进：

1. **Pipeline + Stage 方案**（Doc 16）→ 概念过多（9 个），共享可变状态问题严重
2. **Command + Flow 方案**（Doc 18 初版）→ 试图规定插件内部如何组织代码，但这不是基座该管的事
3. **Slot 方案**（Doc 18 二版）→ 更简洁，但发现 store action 天然就是 Slot
4. **"直接用 store"方案** → 扩展性无限，但分离性为零
5. **最终结论：核心问题尚未解决** → 扩展性与分离性的矛盾

> 基于 `17-FVTT架构缺陷分析与规避策略.md` 的分析成果。

---

## 一、已确认的认知

### 1.1 Hook vs Slot——两种完全不同的扩展模型

**Hook（钩子）**："我要做一件事，做之前/之后通知你一声。"——控制权在主系统。

```typescript
function placeToken(x, y) {
  Hooks.call('prePlaceToken', x, y) // 插件在这做点小动作
  const token = new Token(x, y) // 核心逻辑写死，插件无法改变
  Database.save(token)
  Canvas.draw(token)
  Hooks.call('postPlaceToken', token) // 插件在这发个通知
}
```

**Slot（插槽）**："我留了一个空位，你来决定这里该放什么、该怎么运行。"——控制权交给插件。

```typescript
const Slots = { TokenPlacement: DefaultPlacementLogic }

function placeToken(x, y) {
  Slots.TokenPlacement.execute(x, y) // 谁接管了这个 Slot，谁负责
}

// 插件合法替换
Slots.TokenPlacement = {
  execute: async (x, y) => {
    await play3DAnimation()
    await customDatabaseSave()
  },
}
```

FVTT 的根本问题不是 Hook 数量不够，而是核心行为被写死了，插件只能在前后的 Hook 里做有限的事。当插件想改变行为本身时，只能 monkey-patch。

### 1.2 基座不该管插件内部结构

基座提供 API，插件拿到 API 后内部怎么组织是自己的事。想写一个巨大函数？行。想拆成多步 Flow？也行。想用状态机？随便。Command + Flow 试图规定插件内部结构，这是越界。

### 1.3 规则逻辑是数据驱动的

PF2e 的 modifier 系统给了我们重要启发：加值/减值/条件效果不是通过插件协作实现的，而是**规则系统内部的数据驱动逻辑**。物品/法术/状态在 ruleData 中携带声明式规则，规则系统自己的代码在执行时遍历、收集、应用。基座不需要知道这套东西存在。

### 1.4 Proposal 机制不解决真实问题

"微调规则中某个参数"这个场景几乎不存在。通过分析 FVTT 生态：

- 规则内部的复杂性（多种 modifier 叠加）→ 规则系统自己用数据驱动解决
- 跨规则系统的通用规则插件 → FVTT 中也不存在（碰规则的插件全是单系统专用的）
- 第三方扩展要么不碰规则（UI/日志/集成），要么整个替换（House Rule）

因此 Proposal 机制可以移除。

### 1.5 扩展插件的真实需求

| 类型         | 示例                        | 实际做法                   |
| ------------ | --------------------------- | -------------------------- |
| **不碰规则** | UI 增强、日志分析、外部集成 | 观察数据变化、添加 UI 组件 |
| **改变规则** | House Rule 变体             | 整体替换规则行为           |

### 1.6 现有架构已具备无限扩展性

关键发现：**store action 就是天然的 Slot。**

```typescript
// zustand store action 本质上就是一个可替换的函数
const original = store.getState().createToken
store.setState({
  createToken: async (entityId, x, y) => {
    await playMeteorAnimation(x, y) // 插件的附加逻辑
    await original(entityId, x, y) // 原始逻辑
  },
})
```

- 插件可以 wrap/replace 任何 store action
- 所有写操作最终走 REST API，服务端校验安全性
- zustand subscribe 天然提供变更观察能力
- 不需要额外的 Slot 注册表——store 本身就是注册表

### 1.7 TTRPG 链式反应有限

桌游的级联效果一定会在有限步内停止（回合制、资源有限）。因此可以在内存中执行完整条链，最后一次性提交。不需要事件队列、排队机制、循环检测。

---

## 二、未解决的核心问题

### 2.1 扩展性与分离性的矛盾

这是我们一整晚讨论后触及的根本问题，也是目前没有答案的问题。

**直接暴露 store → 扩展性 100%，分离性 0%：**

```typescript
// 规则系统直接在 store action 里写动画——逻辑和表现耦合
async function handleAttack(attackerId, targetId) {
  await playSlashAnimation(target.position)  // 动画
  const damage = rollDamage(attacker)         // 逻辑
  await store.updateEntity(targetId, { ... }) // 数据
}
```

如果想换掉动画但保留规则逻辑——做不到，它们是一个函数。
如果想换掉规则逻辑但保留动画——做不到，它们是一个函数。

**抽象 API / SDK → 分离性好，扩展性受限：**

能做到分离，但限制了插件能做什么。回到现有 RulePlugin 7 层接口的老路。

**插件系统存在的真正理由**不是"提供能力"（store 已经有了），而是**让不同关注点能独立存在又能协作**。这需要某种"连接层"——规则系统产出结果，动画系统根据结果做表现，两者互不知道对方存在。

我们还不知道这个连接层应该长什么样。

### 2.2 "基座应该提供什么"

现有基座已经提供了：

- 表结构（entities、scenes、tokens 等）
- REST API（CRUD）
- Socket.io（实时同步）
- zustand stores（客户端状态）
- React + Konva（渲染）
- 权限（GM/PL）
- ruleData JSON 口袋

规则系统只需要：往 ruleData 里放数据、提供规则 UI、给 store action 加规则逻辑。这些不需要一个抽象的"插件框架"。

但如果没有框架，规则逻辑和 UI/动画/数据就耦合在一起。框架的价值在于提供分离，而非提供能力。

---

## 三、被否定的方案

### 3.1 Pipeline + Stage（Doc 16）

9 个核心概念、共享可变状态（ctx.data）、多 handler 竞争修改同一对象。

### 3.2 Command + Flow + Proposal（Doc 18 初版）

4 个概念。试图规定插件内部结构（命令必须拆步骤、步骤间数据传递、Flow 注册）。经过具体示例推演（Daggerheart 攻击流程），发现大量细节问题：FlowContext 构建、条件分支、命令独立性、flows.execute() API 定义等。

更根本的问题：Command + Flow 是在教插件作者怎么组织代码——这越界了。

### 3.3 Proposal 提议机制

设计初衷：让扩展插件"提议"参数值影响规则计算。经过 PF2e modifier 系统分析，发现：

- modifier 收集是规则系统内部的数据驱动逻辑，不需要跨插件协作
- "多个插件竞争修改同一参数"的场景在实践中不存在
- 扩展插件要么不碰规则，要么整个替换

### 3.4 基座 Hook/Collect 机制

考虑过在基座层引入 Hook 让多方贡献 modifier。分析后发现这是规则系统自己的事（PF2e 的 Rule Element 是数据驱动的，不是插件协作的），基座不需要提供。

### 3.5 Slot 注册表

设计了独立的 Slot 注册/替换/调用 API。后来发现 zustand store action 天然就是 Slot——不需要额外的注册表。但"直接用 store"又导致分离性为零。

---

## 四、下一步

**空想不如实战。** 直接开始写第一个规则系统（Daggerheart），不用任何插件框架，就用现有的 store 和 API 硬写。

写着写着自然会遇到"这里想分离但分不开"的地方——那个地方就是插件系统真正该出现的位置。从实践中长出设计，而不是在纸上推演。

---

## 附录：讨论记录

### 关键讨论路径

1. **Doc 16 Pipeline 方案的问题** → 9 个概念、共享可变状态、线性限制
2. **Hook-Only 方案** → 概念简单，但扩展点由规则系统控制
3. **命令模型** → 所有计算包装为命令，可替换不可修改
4. **Flow = 自愿暴露的命令队列** → 规则系统控制暴露什么
5. **提议机制** → 扩展插件提议参数，命令拥有者决定是否采纳
6. **libWrapper 类比** → WRAPPER（组合）vs OVERRIDE（独占）
7. **单提议者的合理性** → 规则作者拆分 openParams 解决组合问题
8. **具体示例推演：攻击流程** → 发现 FlowContext 构建、条件分支等问题
9. **PF2e modifier 系统分析** → modifier 收集是数据驱动的规则内部逻辑
10. **"谁真正需要介入规则层？"** → 几乎没人
11. **Proposal 机制不解决真实问题** → 砍掉
12. **Hook vs Slot 的本质区别** → Hook 是通知（控制权在系统），Slot 是接管（控制权交给插件）
13. **基座不该管插件内部结构** → 基座提供 API，插件自由组织代码
14. **Store action 天然是 Slot** → 不需要额外的注册表
15. **扩展性 vs 分离性的矛盾** → 直接暴露 store 扩展性满分但分离性为零
16. **插件系统的真正理由** → 不是提供能力，而是让不同关注点独立存在又能协作
17. **"连接层"该长什么样** → 不知道，需要从实践中发现

### 核心认知演进

```
"需要一个复杂的框架来管理插件协作"
  → "基座不该管插件内部结构"
    → "store action 就是天然的扩展点"
      → "那插件系统到底在做什么？"
        → "插件系统的价值不是能力，是分离"
          → "扩展性和分离性是一对矛盾"
            → "这个矛盾怎么解？不知道，去写代码"
```
