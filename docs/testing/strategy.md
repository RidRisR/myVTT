# myVTT 测试策略

## 前端测试分层

前端测试通常分为 4 层，从快到慢、从简单到复杂：

### 第 1 层：单元测试（Unit Test）

测试纯函数和逻辑，不涉及 UI 渲染。

```ts
// 例：骰子解析
const terms = tokenizeExpression('2d6+3')
expect(terms).toHaveLength(2)

// 例：权限检查
expect(canEdit(entity, seatId, 'PL')).toBe(true)
```

- 速度极快（毫秒级），无需任何 mock
- 适用于：diceUtils、permissions、combatUtils、entityAdapters 等纯函数

### 第 2 层：Hook 集成测试

用 `renderHook()` 单独测试 React Hook 的逻辑，不渲染任何 UI 组件。

```ts
const { result } = renderHook(() => useRoom(yRoom))
act(() => result.current.enterCombat('scene-1'))
expect(result.current.room.mode).toBe('combat')
```

- 对本项目特别有价值 — Yjs Hook 可用真实 Y.Doc 在内存中运行，无需网络
- 适用于：useRoom、useScenes、useEntities、useSceneTokens 等数据层 Hook

### 第 3 层：组件测试（Component Test）

用虚拟 DOM（jsdom）渲染 React 组件，模拟用户操作（点击、输入），检查渲染结果。不需要打开真实浏览器。

```ts
render(<MyButton onClick={handleClick} />)
await userEvent.click(screen.getByText('确认'))
expect(handleClick).toHaveBeenCalled()
```

- `@testing-library/react` + `@testing-library/user-event` 可模拟点击、键盘输入、hover
- 拖拽等复杂交互支持有限
- 适用于：ChatInput、MyCharacterCard 等表单/交互组件

### 第 4 层：E2E 端到端测试（Playwright / Cypress）

启动真实浏览器，模拟完整用户操作流程。

- 可测试所有 UI 交互：拖拽 token、多用户实时同步、文件上传、右键菜单
- 成本最高（启动慢、维护重），但覆盖最真实
- 适合项目稳定后再引入

---

## 框架选择：Vitest

- 项目使用 Vite 7.3，Vitest 直接复用 `vite.config.ts`，零额外配置
- 项目全 ESM（`"type": "module"`），Vitest 原生支持（Jest 需 `--experimental-vm-modules`）
- API 与 Jest 完全兼容（`describe/it/expect/vi.fn()/vi.mock()`）
- 内置 v8 代码覆盖率

---

## myVTT 测试优先级

### P0：纯函数单元测试（最高 ROI）

| 文件                           | 核心函数                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| `src/shared/diceUtils.ts`      | tokenizeExpression, validateTerm, rollTerm, rollCompound, resolveFormula |
| `src/shared/permissions.ts`    | getPermission, canSee, canEdit                                           |
| `src/combat/combatUtils.ts`    | snapToGrid, screenToMap, canDragToken                                    |
| `src/shared/entityAdapters.ts` | getEntityResources, getEntityAttributes, getEntityStatuses               |
| `src/shared/tokenUtils.ts`     | barColorForKey, statusColor, readResources/Attributes/Statuses           |
| `src/shared/characterUtils.ts` | nextNpcName                                                              |
| `src/shared/panelUtils.ts`     | adjustNumericValue                                                       |
| `src/shared/assetUpload.ts`    | isVideoUrl                                                               |
| `src/shared/roleState.ts`      | roleStore, popoverStore                                                  |

### P1：Yjs Hook 集成测试

| 文件                           | 关键场景                                       |
| ------------------------------ | ---------------------------------------------- |
| `src/yjs/useRoom.ts`           | 模式切换、enterCombat/exitCombat、外部变更同步 |
| `src/yjs/useScenes.ts`         | 场景 CRUD、子 Map 自动创建、排序               |
| `src/combat/useSceneTokens.ts` | Token CRUD、gmOnly 过滤                        |
| `src/entities/useEntities.ts`  | 三源 Entity CRUD、promoteToGM                  |
| `src/showcase/useShowcase.ts`  | Showcase CRUD、pin/unpin                       |
| `src/dock/useHandoutAssets.ts` | Handout CRUD                                   |

### P2：暂不测试

| 类别                             | 原因                                         |
| -------------------------------- | -------------------------------------------- |
| React 组件渲染                   | 全内联样式 + 复杂指针事件，mock 成本高收益低 |
| E2E 测试                         | 需启动服务器 + 多浏览器，留到 Milestone 5    |
| Server API                       | 需重构 server/index.mjs 分离 app             |
| useYjsConnection                 | 15 行代码，失败时界面直观可见                |
| uploadAsset / getMediaDimensions | I/O 函数，逻辑简单                           |

---

## 测试文件组织

`__tests__/` 目录与源码同级放置（就近原则）：

```
src/
├── __test-utils__/
│   ├── setup.ts           # jest-dom 扩展
│   ├── fixtures.ts        # makeEntity(), makeToken(), makeSeat() 工厂
│   └── yjs-helpers.ts     # createTestDoc() 内存 Y.Doc
├── shared/__tests__/      # 纯函数测试
├── combat/__tests__/      # 战斗逻辑测试
├── entities/__tests__/    # 实体 Hook 测试
├── yjs/__tests__/         # 房间/场景 Hook 测试
├── showcase/__tests__/    # 展示 Hook 测试
└── dock/__tests__/        # 底栏 Hook 测试
```

---

## 关键技术要点

- **骰子随机性**：用 `vi.spyOn(Math, 'random')` 控制返回值，或断言结果范围
- **Yjs 不需网络**：直接创建 Y.Doc，observe 回调在 transact() 内同步触发
- **sessionStorage**：jsdom 中可用，测试前 `sessionStorage.clear()`
- **import.meta.env.DEV**：Vitest 自动提供 Vite 的 env 变量
- **crypto.randomUUID()**：Node.js 22 下全局可用，无需 polyfill
- **DOMRect mock**：`{ left, top } as DOMRect`
