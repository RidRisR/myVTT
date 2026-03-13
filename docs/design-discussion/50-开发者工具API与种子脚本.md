# 50 — 开发者工具 API 与种子脚本

> 本文档讨论在开发模式下暴露 `window.__vtt` DevTools API 及预设种子脚本的方案，目的是解决开发和测试过程中**复现复杂状态成本过高**的问题。

---

## 一、背景与动机

### 1.1 当前痛点

myVTT 的业务逻辑通过 zustand store actions 操作 Yjs，但这些 actions 只能通过 UI 交互触发。开发过程中存在以下问题：

1. **状态复现成本高**：调试多 token 战斗场景时，每次都需要从零开始——创建场景 → 上传地图 → 添加实体 → 创建 token → 摆放位置，步骤繁琐
2. **缺少集成测试层**：现有测试覆盖了单元级和 Yjs 同步级，但缺少完整用户流程（创建场景→添加实体→进入战斗→移动 token）的集成测试手段
3. **手动验证效率低**：每次修改 UI 后想快速验证效果，都需要在界面上重复大量操作才能到达目标状态

### 1.2 目标

提供一种轻量级的开发辅助机制，使开发者能够：

- 在浏览器控制台直接调用任何 store action
- 一键加载预设场景（多 token 战斗、满编团队等）
- 通过脚本快速搭建任意测试状态，跳过 UI 操作

---

## 二、方案设计

### 2.1 整体架构

```
浏览器控制台 / AI 生成脚本
        ↓
  window.__vtt (DevTools API)
        ↓
  zustand store actions
        ↓
  Yjs Y.Doc → WebSocket 同步
```

核心思路：将已有的 zustand store actions 通过 `window.__vtt` 暴露给控制台，**不引入新的数据操作路径**，复用现有逻辑。

### 2.2 启用条件

- 仅在 `import.meta.env.DEV` 为 `true` 时启用（Vite 开发模式）
- 生产构建通过 tree-shaking 自动移除，不增加 bundle 体积
- 不影响现有代码和测试

---

## 三、API 接口设计

### 3.1 完整 Store 访问

| 方法               | 返回值        | 说明                                       |
| ------------------ | ------------- | ------------------------------------------ |
| `__vtt.world()`    | WorldState    | 完整的 world store state，包含所有 actions |
| `__vtt.ui()`       | UiState       | UI store state                             |
| `__vtt.identity()` | IdentityState | 身份/座位 store state                      |

通过 zustand 的 `getState()` 返回当前快照，可以访问任何 action：

```js
__vtt.world().addHandoutAsset({ id: 'h1', imageUrl: '/img.png', createdAt: Date.now() })
__vtt.ui().setActiveTool('measure')
__vtt.identity().createSeat('玩家1', 'PL')
```

### 3.2 便捷快捷方法

最常用的操作提升为顶层方法，减少输入：

| 快捷方法                                 | 等价于                                           |
| ---------------------------------------- | ------------------------------------------------ |
| `__vtt.addScene(scene)`                  | `__vtt.world().addScene(scene)`                  |
| `__vtt.addEntity(entity)`                | `__vtt.world().addEntity(entity)`                |
| `__vtt.addToken(token)`                  | `__vtt.world().addToken(token)`                  |
| `__vtt.updateToken(id, updates)`         | `__vtt.world().updateToken(id, updates)`         |
| `__vtt.deleteToken(id)`                  | `__vtt.world().deleteToken(id)`                  |
| `__vtt.setActiveScene(id)`               | `__vtt.world().setActiveScene(id)`               |
| `__vtt.setCombatActive(sceneId, active)` | `__vtt.world().setCombatActive(sceneId, active)` |

### 3.3 只读状态查询

通过 getter 属性提供当前状态的只读访问：

```js
__vtt.scenes // Scene[]
__vtt.entities // Entity[]
__vtt.tokens // MapToken[]
__vtt.room // RoomState
```

### 3.4 Seed 命名空间

预设场景脚本挂载在 `__vtt.seed` 下：

```js
__vtt.seed.basicCombat() // 基础战斗场景
__vtt.seed.tokenOverlap() // token 重叠测试
__vtt.seed.fullParty() // 5 人满编团队
__vtt.seed.massCombat() // 大规模战斗（性能测试）
__vtt.seed.reset() // 清空所有数据
```

---

## 四、Seed 脚本设计

### 4.1 设计原则

- 每个 seed 是一个独立函数，调用后立即搭建完整状态
- 使用 `crypto.randomUUID()` 生成唯一 ID，避免冲突
- 内部调用 store actions（addScene → addEntity → addToken），遵循正常的数据流
- seed 之间相互独立，可以叠加使用

### 4.2 预设场景

#### `basicCombat` — 基础战斗场景

- 创建 1 个场景（含战术地图）
- 创建 3 个实体（1 PC + 2 NPC）
- 放置 5 个 token 分布在网格不同位置
- 激活战斗模式

#### `tokenOverlap` — Token 重叠测试

- 创建 1 个场景
- 放置 4 个 token，其中 2-3 个重叠在同一网格位置
- 用于测试 token 堆叠选择 UI

#### `fullParty` — 5 人满编团队

- 创建 5 个 PC 实体（persistent: true）
- 创建 5 个座位并关联
- 创建 1 个场景，所有 PC 自动加入

#### `massCombat` — 大规模战斗

- 创建 1 个场景
- 放置 20+ 个 token
- 用于性能边界测试

#### `reset` — 清空重置

- 删除所有场景、实体、token、座位
- 恢复到初始空白状态

---

## 五、技术实现要点

### 5.1 文件结构

```
src/dev/
├── devtools.ts    ← DevTools API 主模块（installDevTools）
├── seeds.ts       ← 预设种子脚本
└── global.d.ts    ← window.__vtt 类型声明
```

### 5.2 注册时机

在 `src/main.tsx` 中，React render 之前调用 `installDevTools()`，确保控制台可用时 API 已就绪。

### 5.3 Dev-Only 保证

```ts
export function installDevTools() {
  if (import.meta.env.PROD) return // 生产环境直接返回
  // ...
}
```

Vite 在生产构建时会将 `import.meta.env.PROD` 替换为 `true`，配合 tree-shaking 移除整个 dev 模块。

### 5.4 TypeScript 类型声明

为 `window.__vtt` 提供类型声明，VSCode 调试时可获得自动补全。

---

## 六、使用示例

### 6.1 快速复现多 token 场景

```js
// 一键搭建
__vtt.seed.basicCombat()

// 或手动精细控制
const sceneId = crypto.randomUUID()
__vtt.addScene({ id: sceneId, name: '测试战斗', gridSize: 50, ... })
__vtt.setActiveScene(sceneId)
__vtt.setCombatActive(sceneId, true)

// 批量添加 token
for (let i = 0; i < 10; i++) {
  __vtt.addToken({ id: crypto.randomUUID(), x: i * 50, y: 100, size: 1, permissions: { default: 'owner', seats: {} } })
}
```

### 6.2 查看当前状态

```js
__vtt.scenes // 列出所有场景
__vtt.tokens // 列出当前场景的 token
__vtt.entities // 列出所有实体
__vtt.world().room // 查看房间状态
```

### 6.3 AI 辅助工作流

开发者描述需求："我需要一个有 5 个 token、其中 2 个重叠在 (100,100) 位置的战斗场景"

AI 生成脚本 → 开发者粘贴到控制台 → 状态立刻就位 → 开始调试

---

## 七、文件变更清单

| 操作 | 文件                  | 说明                         |
| ---- | --------------------- | ---------------------------- |
| 新建 | `src/dev/devtools.ts` | DevTools API 主模块          |
| 新建 | `src/dev/seeds.ts`    | 预设种子脚本                 |
| 新建 | `src/dev/global.d.ts` | `window.__vtt` 类型声明      |
| 修改 | `src/main.tsx`        | 入口调用 `installDevTools()` |

---

## 八、未来扩展可能

- **状态快照与恢复**：`__vtt.snapshot()` 保存当前状态，`__vtt.restore(snapshot)` 恢复
- **Playwright 集成**：E2E 测试中通过 `page.evaluate(() => __vtt.seed.basicCombat())` 快速搭建测试前置状态
- **服务端 REST API**：如果未来有外部集成需求（Discord bot 等），可在服务端添加 HTTP 端点直接操作 Y.Doc
