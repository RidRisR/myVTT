# 高级 E2E 测试设计：Token 拖拽、Entity 生命周期、级联删除、场景战术状态

## 概述

在现有 E2E 基础设施上增量扩展，覆盖 4 个高价值测试场景：Token 拖拽与网格吸附、Entity 创建与编辑、资源删除的级联验证（正向 CASCADE + 反向不级联）、跨场景战术状态保持。

## 决策记录

| 决策点                  | 选择                                 | 理由                                                                  |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Canvas 辅助方法位置     | 独立 `e2e/helpers/canvas-helpers.ts` | 用户要求测试辅助与 page object 保持物理隔离                           |
| 删除验证深度            | 黑盒 + API 探测（方案 B）            | 验证文件 404 + FK CASCADE 效果 + 反向不级联                           |
| Entity 创建路径         | CharacterLibraryTab（"+"按钮）       | 最常用的 GM 操作路径                                                  |
| 多端同步                | Token 拖拽 + Entity 创建各一个       | 复用现有 `browser.newContext()` 模式                                  |
| Entity 级联删除路径     | EntityPanel（立即删除）              | CharacterLibraryTab 有 5 秒 soft-delete 延迟，EntityPanel 直接调 API  |
| Token→Entity 不级联验证 | 右键 canvas 创建 ephemeral token     | "Create Token" 创建新 ephemeral entity，删 token 后验证 entity 仍存在 |

## 已知产品限制

### entity:deleted 不级联清理客户端 tacticalInfo.tokens

服务端 `DELETE /entities/:id` 通过 FK CASCADE 删除 SQLite 中的 `tactical_tokens`，但只 emit `entity:deleted`，**不 emit `tactical:token:removed`**。客户端 `entity:deleted` handler 仅从 `entities` dict 移除 entity，不触碰 `tacticalInfo.tokens`。

**影响**：删除 entity 后，`tacticalInfo.tokens` 中仍残留该 entity 的 token 条目（直到重新进入战术模式触发 re-fetch）。

**测试策略**：cascade-deletion Test 2 在删除 entity 后，执行退出战术 → 重新进入战术（触发服务端 re-fetch），然后验证 token 已消失。这同时验证了 SQLite CASCADE 确实生效。

### CharacterLibraryTab 删除有 5 秒延迟

CharacterLibraryTab 使用 `pendingDeletes` + `setTimeout(5000)` 实现 soft-delete with undo。实际 API 调用在 5 秒后才发生。EntityPanel 删除则是立即调用 API。

**测试策略**：需要立即验证 server-side 效果的 cascade 测试使用 EntityPanel 路径删除。

## 文件结构

```
e2e/
  helpers/
    canvas-helpers.ts           ← 新增：@test-only Canvas 坐标计算 + 拖拽操作
    test-assets.ts              — 已有
  pages/
    character-library.page.ts   ← 新增：Characters tab 交互
    entity-panel.page.ts        ← 新增：EntityPanel/EntityRow 交互
    tactical-canvas.page.ts     — 已有，不修改
    gm-dock.page.ts             — 已有，扩展挂载 characterLibrary 子对象
    gm-sidebar.page.ts          — 已有，扩展挂载 entityPanel 子对象
  scenarios/
    token-drag.spec.ts          ← 新增：3 个 test
    entity-lifecycle.spec.ts    ← 新增：2 个 test
    cascade-deletion.spec.ts    ← 新增：5 个 test
    scene-tactical-state.spec.ts ← 新增：2 个 test
src/
  lib/devBridge.ts              — 已有，无需扩展（已暴露 world + asset store）
```

## zustand Store 访问

沿用现有 devBridge 模式，通过 `page.evaluate()` / `page.waitForFunction()` 读取 `window.__MYVTT_STORES__`。

关键 store 路径：

```typescript
// token 列表
store.tacticalInfo?.tokens // MapToken[]

// token 位置
store.tacticalInfo?.tokens[index]?.x / y

// grid 设置
store.tacticalInfo?.grid // { size, snap, visible, color, offsetX, offsetY }

// entity dict（注意：Record<string, Entity>，不是数组）
store.entities // Record<string, Entity>
// 检查某 entity 是否存在：store.entities[entityId] != null
// 遍历所有 entity：Object.values(store.entities)

// sceneEntityEntries（注意：在 sceneEntityMap 中，不在 scene 对象上）
store.sceneEntityMap[sceneId] // SceneEntityEntry[] = [{ entityId, visible }]

// 活跃场景 id
store.room?.activeSceneId
```

## Page Object 设计

### CharacterLibraryPage

作为 `GmDockPage.characterLibrary` 的子对象。

```typescript
class CharacterLibraryPage {
  createCharacter() // 点击 title="新建角色" 按钮
  expectCharacterVisible(name) // 断言角色名出现在列表
  expectCharacterNotVisible(name) // 断言角色已消失
  deleteCharacter(name) // hover 行 → 点击 title="删除角色" 按钮
  inspectCharacter(name) // 双击角色行打开角色卡
}
```

**Locator 策略**：

- 创建按钮：`page.locator('button[title="新建角色"]')`
- 角色行：`page.locator('button').filter({ hasText: name })`（CharacterLibraryTab 每行是 button）
- 删除按钮：hover 角色行后，`page.locator('button[title="删除角色"]')` 变为可见
- 双击：角色行的 `dblclick()` 事件

**注意**：

- 删除按钮是 hover-dependent（`opacity-0 group-hover:opacity-100`），必须先 hover 父容器
- CharacterLibraryTab 删除有 5 秒 soft-delete 延迟（`pendingDeletes` + `setTimeout`），UI 立即隐藏但 API 调用 5 秒后才发生
- 本设计不测试 undo 功能

### EntityPanelPage

作为 `GmSidebarPage.entityPanel` 的子对象。

```typescript
class EntityPanelPage {
  createNpc() // 点击 "新建NPC" 按钮
  expectEntityVisible(name) // 断言 entity 名出现
  expectEntityNotVisible(name) // 断言 entity 已消失
  toggleVisibility(name) // hover 行 → 点击眼睛图标
  renameEntity(oldName, newName) // 点击菜单 → "重命名" → 输入 → Enter
  deleteEntity(name) // 点击菜单 → "删除" → 确认（ConfirmPopover）
}
```

**Locator 策略**：

- 创建按钮：`page.getByRole('button').filter({ hasText: '新建NPC' })`
- Entity 行：EntityRow 是 div，定位用 `page.locator('div').filter({ hasText: name })`
- 可见性切换：hover 行后，`page.locator('button[title="离场"]')` 或 `page.locator('button[title="上场"]')`
- 菜单按钮：hover 行后，MoreVertical 图标按钮变为可见（`opacity-0 group-hover:opacity-100`）
- 菜单项：下拉菜单（absolute positioned 在 EntityRow 内部，非 portal）中的 `page.getByText('重命名')` / `page.getByText('删除')`
- 重命名输入：autoFocus input，出现后直接 `fill()` + Enter
- 删除确认：ConfirmPopover（portaled 到 body）的确认按钮，文字为英文 "Delete"

**注意**：

- EntityPanel 在 GmSidebar 的 "实体" tab 中
- Entity 分两组："在场"（On-Stage）和"离场"（Backstage）
- hover-dependent 按钮需要先 hover 行
- EntityPanel 删除是**立即生效**的（直接调 `deleteEntity(id)` API），无 soft-delete 延迟

### Page Object 层级更新

```
RoomPage
  ├── gmDock: GmDockPage
  │     ├── gallery: GalleryPage
  │     ├── blueprint: BlueprintPage
  │     └── characterLibrary: CharacterLibraryPage  ← 新增
  ├── gmSidebar: GmSidebarPage
  │     └── entityPanel: EntityPanelPage            ← 新增
  ├── tactical: TacticalCanvasPage
  └── scenes: ScenePanelPage
```

## Canvas Helpers（`e2e/helpers/canvas-helpers.ts`）

```typescript
/**
 * @test-only — Canvas coordinate helpers for E2E tests.
 * NOT part of the Page Object layer. These deal with raw pixel math
 * and devBridge store reads that are only meaningful in test context.
 */

/** 从 store 读取 token 的 map 坐标，结合 canvas boundingBox 换算为屏幕坐标 */
async function getTokenScreenPosition(
  page: Page,
  tokenIndex: number,
  canvasLocator: Locator,
): Promise<{ x: number; y: number }>

/** 完整鼠标拖拽序列：mousedown → mousemove(多步) → mouseup */
async function dragOnCanvas(
  page: Page,
  fromScreen: { x: number; y: number },
  toScreen: { x: number; y: number },
  options?: { steps?: number },
): Promise<void>

/** 从 store 读取 grid 设置 */
async function getGridSettings(page: Page): Promise<{
  size: number
  snap: boolean
  visible: boolean
  color: string
  offsetX: number
  offsetY: number
}>

/** 从 store 读取指定 index 的 token map 坐标 */
async function getTokenPosition(page: Page, tokenIndex: number): Promise<{ x: number; y: number }>
```

**坐标换算逻辑**：

初始状态（无缩放/平移）下，canvas 左上角对应 map 坐标 (0,0)。Token 的屏幕坐标 = canvas 的 boundingBox 左上角 + token 的 map 坐标。

```
screenX = canvasBox.x + token.x * scale + stagePos.x
screenY = canvasBox.y + token.y * scale + stagePos.y
```

初始 scale=1, stagePos={x:0, y:0}，简化为：

```
screenX = canvasBox.x + token.x
screenY = canvasBox.y + token.y
```

注意：通过右键 canvas 中心创建 token，token 初始位置接近 canvas 中心，确保在可视范围内。

**网格吸附验证**：`snapToGrid` 公式考虑 grid offset：

```
snapped = round((mapCoord - gridOffset) / gridSize) * gridSize + gridOffset
```

当 gridOffset 为默认值 0 时简化为 `round(mapCoord / gridSize) * gridSize`。
测试断言应使用完整公式：`(x - offsetX) % gridSize === 0`。

## 测试场景

### Spec 1: `token-drag.spec.ts` — Token 拖拽 + 网格吸附

#### Test 1: Token 拖拽后位置更新到 store

```
步骤:
1. 创建房间，GM 加入
2. 进入战术模式
3. 右键 canvas 中心 → "Create Token"
4. waitForFunction 确认 tacticalInfo.tokens.length > 0
5. 通过 getTokenPosition(page, 0) 记录初始位置 (origX, origY)
6. 通过 getTokenScreenPosition 计算屏幕坐标
7. dragOnCanvas(page, from, { x: from.x + 100, y: from.y + 80 })
8. waitForFunction 验证 token 位置已改变（x !== origX || y !== origY）
```

#### Test 2: 网格吸附 — 拖拽后位置对齐 gridSize

```
步骤:
1. 独立 setup（房间 + 战术 + token）
2. 通过 getGridSettings 获取 gridSize（默认 50）、snap=true、offsetX/offsetY
3. dragOnCanvas 拖拽 token +73px, +28px（非 gridSize 整数倍）
4. waitForFunction 验证 token 最终位置对齐网格：
   (token.x - offsetX) % gridSize === 0 && (token.y - offsetY) % gridSize === 0
```

#### Test 3: 多端同步 — Player 看到 token 位置变化

```
步骤:
1. 独立 setup（房间 + 战术 + token）
2. 创建 Player context（browser.newContext()）加入同一房间
3. Player waitForFunction 确认 tacticalInfo.tokens.length > 0
4. GM 拖拽 token +100px, +0px
5. GM waitForFunction 确认 x 已改变
6. 获取 GM 端 token.x 最终值
7. Player waitForFunction 验证 token.x 与 GM 端一致（timeout: 10_000）
```

### Spec 2: `entity-lifecycle.spec.ts` — Entity 创建 + 编辑 + 可见性

#### Test 1: 创建角色 + 改名 + Player 同步

```
步骤:
1. 创建房间，GM 加入
2. GM 打开 Characters tab
3. 点击 title="新建角色" 按钮
4. 断言 "新角色" 出现在列表中
5. GM 打开 GmSidebar → Entities tab
6. 在 EntityPanel 中找到 "新角色" → 点击菜单 → "重命名"
7. 在 autoFocus input 中 fill("Goblin Scout") → Enter
8. 断言 EntityPanel 中名称变为 "Goblin Scout"
9. 创建 Player context 加入
10. Player waitForFunction 验证：
    Object.values(store.entities).some(e => e.name === 'Goblin Scout')
```

注意：使用 EntityPanel 重命名而非 CharacterLibraryTab 双击 inspector，因为 EntityPanel 的 EntityRow 有明确的菜单交互路径，更可靠。

#### Test 2: Entity 可见性控制

```
步骤:
1. 复用 setup（房间 + GM + 已有 entity "Goblin Scout"）
2. GM 打开 GmSidebar → Entities tab（如果还没打开）
3. 确认 entity 在 "在场" 分组中
4. Hover entity 行 → 点击眼睛图标（title="离场"）
5. 断言 entity 移到 "离场" 分组（DOM 验证）
6. 通过 store 验证：
   const entries = store.sceneEntityMap[store.room.activeSceneId]
   entries.find(e => e.entityId === id).visible === false
```

### Spec 3: `cascade-deletion.spec.ts` — 级联删除验证

#### Test 1: 删除 Gallery 资源 → 文件 404

```
步骤:
1. 创建房间，GM 加入
2. 打开 Gallery tab → 上传 test-cascade.png
3. 断言 "test-cascade.png" 出现在 Gallery
4. 通过 assetStore 获取 asset 的 url：
   const assets = store.asset().assets  // 或遍历找到 name match
   const url = asset.url
5. page.evaluate(url => fetch(url).then(r => r.status), url) → 确认 200
6. 右键 "test-cascade.png" → Delete
7. 断言 "test-cascade.png" 从 Gallery 消失
8. page.evaluate(url => fetch(url).then(r => r.status), url) → 确认 404
```

#### Test 2: 删除 Entity → Token 级联消失（正向 CASCADE）

```
步骤:
1. 创建房间，GM 加入
2. 进入战术模式
3. 右键 canvas 中心 → "Create Token"（创建 ephemeral entity + token）
4. waitForFunction 确认 tacticalInfo.tokens.length > 0
5. 通过 store 记录 token 的 entityId：
   const entityId = store.tacticalInfo.tokens[0].entityId
6. GM 打开 GmSidebar → Entities tab
7. 在 EntityPanel 中找到该 entity → 删除（菜单 → "删除" → 确认）
   注意：EntityPanel 删除是立即的，无 5 秒延迟
8. waitForFunction 验证 store.entities[entityId] == null
9. 退出战术模式 → 重新进入战术模式（触发 server re-fetch）
10. waitForFunction 验证 tacticalInfo.tokens 中不含 entityId 的 token：
    store.tacticalInfo.tokens.every(t => t.entityId !== entityId)
```

注意：步骤 9 的 re-enter 是必要的——见「已知产品限制」章节。

#### Test 3: 删除 Scene → tactical_state 清理（正向 CASCADE）

```
步骤:
1. 创建房间，GM 加入
2. 创建新场景 "Temp Battle" → 切换到该场景
3. 进入战术模式 → 右键创建 token
4. 确认 tacticalInfo.tokens.length > 0
5. 退出战术 → 切换回 Scene 1
6. 删除 "Temp Battle"（ScenePanel.deleteScene）
7. 断言场景列表中 "Temp Battle" 消失
8. 通过 store 验证 scenes 不含 "Temp Battle"：
   store.scenes.every(s => s.name !== 'Temp Battle')
```

#### Test 4: 删除 Token ≠ 删除 Entity（反向不级联）

```
步骤:
1. 创建房间，GM 加入
2. 进入战术模式
3. 右键 canvas 中心 → "Create Token"（创建 ephemeral entity）
4. waitForFunction 确认 tacticalInfo.tokens.length > 0
5. 记录 entityId = tacticalInfo.tokens[0].entityId
6. 右键 token → "Delete Token"
   右键 token 需要精确点击 token 位置（使用 getTokenScreenPosition）
7. waitForFunction 验证 tacticalInfo.tokens.length === 0
8. 关键断言：store.entities[entityId] != null（entity 仍然存在）
```

#### Test 5: 删除 Scene ≠ 删除 reusable Entity（反向不级联）

```
步骤:
1. 创建房间，GM 加入
2. Characters tab → 创建角色（默认 lifecycle='reusable'）
3. 通过 store 获取 entityId：
   Object.values(store.entities).find(e => e.name === '新角色')?.id
4. 创建新场景 "Temp Scene X"
5. 切换到 "Temp Scene X"
6. 切回 Scene 1
7. 删除 "Temp Scene X"
8. 验证 store.entities[entityId] != null（entity 仍存在）
9. Characters tab → 断言角色名仍可见
```

### Spec 4: `scene-tactical-state.spec.ts` — 场景切换 + 战术状态保持

#### Test 1: 切场景 → 切回 → Token 保持

```
步骤:
1. 创建房间，GM 加入
2. 在 Scene 1 进入战术模式 → 创建 token
3. waitForFunction 确认 tokens.length === 1
4. 退出战术
5. 创建 Scene 2 → 切换到 Scene 2
6. waitForFunction 确认 room.activeSceneId 已变
7. 切换回 Scene 1
8. 进入战术模式
9. waitForFunction 验证 tacticalInfo.tokens.length === 1
```

#### Test 2: 不同场景各自独立的战术状态

```
步骤:
1. 创建房间，GM 加入
2. Scene 1：进入战术 → 创建 2 个 token → 退出战术
3. 创建 Scene 2 → 切换到 Scene 2
4. Scene 2：进入战术 → 创建 1 个 token → 退出战术
5. 切回 Scene 1 → 进入战术 → waitForFunction tokens.length === 2
6. 退出战术 → 切到 Scene 2 → 进入战术 → waitForFunction tokens.length === 1
```

## 等待策略

| 操作                            | 等待方式                                              |
| ------------------------------- | ----------------------------------------------------- |
| 创建 entity                     | 等待名称出现在列表（DOM locator `.toBeVisible`）      |
| 删除 entity（EntityPanel）      | waitForFunction 验证 `store.entities[id] == null`     |
| 删除 entity（CharacterLibrary） | 等待 UI 消失（5s soft-delete，API 延迟调用）          |
| Token 位置变化                  | waitForFunction 比较 x/y                              |
| 网格吸附                        | waitForFunction 检查 `(x - offsetX) % gridSize === 0` |
| Player 同步                     | waitForFunction 超时 10s                              |
| 文件 404                        | page.evaluate fetch 检查 status                       |
| Token CASCADE 验证              | 退出+重进战术 → waitForFunction 检查 tokens           |
| 场景切换                        | waitForFunction 检查 `room.activeSceneId` 变化        |

## 源码改动

除了 E2E 测试代码外，需要修改以下文件：

1. **`e2e/pages/gm-dock.page.ts`**（修改）— 挂载 `characterLibrary` 子对象
2. **`e2e/pages/gm-sidebar.page.ts`**（修改）— 挂载 `entityPanel` 子对象

不需要新增 `data-testid`：现有 DOM 提供了足够的 title 属性和文本内容作为 locator。

## 不在范围内

| 场景                                         | 原因                                   |
| -------------------------------------------- | -------------------------------------- |
| Token 拖拽的实时 awareness 广播              | 纯视觉反馈，E2E 难以精确验证中间状态   |
| Archive save/load                            | 需要 UI 操作路径较深，后续补充         |
| Entity 角色卡详细编辑                        | 涉及 rule plugin 渲染，复杂度高        |
| 撤销删除（undo toast）                       | 前端 timer 逻辑，unit test 覆盖        |
| 并发拖拽冲突                                 | 极低概率边界                           |
| CharacterLibrary 软删除后的 server-side 验证 | 需等 5 秒，用 EntityPanel 立即删除替代 |
