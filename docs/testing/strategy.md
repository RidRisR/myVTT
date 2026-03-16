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

### 第 2 层：Store 集成测试

直接调用 zustand store actions，验证状态变更逻辑。Mock REST API 和 Socket.io 事件。

```ts
// 例：worldStore action
vi.spyOn(api, 'createEntity').mockResolvedValue(mockEntity)
const { createEntity } = worldStore.getState()
await createEntity(entityData)
expect(worldStore.getState().entities).toContainEqual(mockEntity)
```

- 测试 store 内的业务逻辑，不渲染 UI
- 适用于：worldStore actions、identityStore、assetStore 等数据层

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

### P1：Store 集成测试 + 服务端路由测试

| 文件/模块                     | 关键场景                                  |
| ----------------------------- | ----------------------------------------- |
| `src/stores/worldStore.ts`    | 场景 CRUD、实体 CRUD、Socket 事件处理     |
| `src/stores/identityStore.ts` | 座位认领、角色切换                        |
| `server/routes/entities.ts`   | Entity CRUD、lifecycle 约束、CASCADE 删除 |
| `server/routes/tactical.ts`   | tactical_state CRUD、token 放置/移除      |
| `server/routes/archives.ts`   | Archive save/load、snapshot 策略          |

### P2：暂不测试

| 类别                             | 原因                                         |
| -------------------------------- | -------------------------------------------- |
| React 组件渲染                   | 全内联样式 + 复杂指针事件，mock 成本高收益低 |
| E2E 测试                         | 需启动服务器 + 多浏览器，留到后续阶段        |
| uploadAsset / getMediaDimensions | I/O 函数，逻辑简单                           |

---

## 测试文件组织

`__tests__/` 目录与源码同级放置（就近原则）：

```
src/
├── __test-utils__/
│   ├── setup.ts           # jest-dom 扩展
│   └── fixtures.ts        # makeEntity(), makeToken(), makeSeat() 工厂
├── shared/__tests__/      # 纯函数测试
├── combat/__tests__/      # 战斗逻辑测试
├── stores/__tests__/      # Store 集成测试
└── rules/__tests__/       # 规则插件测试

server/
└── __tests__/             # 服务端路由测试
```

---

## 关键技术要点

- **骰子随机性**：用 `vi.spyOn(Math, 'random')` 控制返回值，或断言结果范围
- **zustand store 测试**：直接 `getState()` / `setState()` 操作，mock `api` 模块的 HTTP 调用
- **Socket.io 事件测试**：mock `socket.on` / `socket.emit`，验证 store 响应
- **sessionStorage**：jsdom 中可用，测试前 `sessionStorage.clear()`
- **import.meta.env.DEV**：Vitest 自动提供 Vite 的 env 变量
- **crypto.randomUUID()**：Node.js 22 下全局可用，无需 polyfill
- **DOMRect mock**：`{ left, top } as DOMRect`
- **服务端测试**：使用 supertest，`server/index.ts` 中 `app` 已导出
