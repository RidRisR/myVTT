# E2E 资源管理测试设计

## 概述

为 Gallery（地图/背景）和 Blueprint（Token 蓝图）两个资产类型新增端到端测试，验证完整的用户工作流：上传 → 使用 → 多端同步 → 删除。

## 决策记录

| 决策点         | 选择                                | 理由                                         |
| -------------- | ----------------------------------- | -------------------------------------------- |
| 覆盖范围       | Gallery + Blueprint（不含 Handout） | 核心工作流，Handout 使用频率低且交互模式相似 |
| 多端同步       | 包含 Player 验证                    | 资源的核心价值是让玩家看到效果               |
| 撤销功能       | 不测试                              | 纯前端 timer 逻辑，unit test 已覆盖          |
| 文件组织       | 单文件多 test()，每个 test 独立房间 | 故障隔离 + fixture 自动清理                  |
| Store 访问方式 | dev-mode window bridge              | 见「zustand Store 访问」章节                 |

## 文件结构

```
e2e/
  helpers/
    test-assets.ts              — 代码生成最小 PNG 测试图片
  pages/
    gallery.page.ts             — Gallery 标签页 Page Object
    blueprint.page.ts           — Blueprint 标签页 Page Object
    gm-dock.page.ts             — 扩展：挂载 gallery / blueprint 子对象
  scenarios/
    asset-management.spec.ts    — 两个独立 test()
src/
  lib/
    devBridge.ts                — dev-mode 暴露 zustand store 到 window
```

注意：不修改 `vtt-fixture.ts`。多端测试沿用现有 `multi-client-sync.spec.ts` 的手动 setup 模式（直接使用 `browser` fixture 创建 Player context），因为 `gmPage` fixture 不暴露 `browser` 对象。

## zustand Store 访问

### 问题

react-konva 的 canvas 状态和 zustand store 数据无法通过 DOM locator 验证。`page.evaluate()` 需要访问 store，但 zustand store 默认不暴露在 `window` 上。

### 方案

在 dev 模式下通过 bridge 模块暴露 store：

```typescript
// src/lib/devBridge.ts
if (import.meta.env.DEV) {
  ;(window as any).__MYVTT_STORES__ = {
    world: () => useWorldStore.getState(),
    asset: () => useAssetStore.getState(),
  }
}
```

在 `main.tsx` 的入口点 import 此模块（仅 dev 构建包含，prod 被 tree-shake 掉）。

测试中使用：

```typescript
// 读取场景背景
const bgUrl = await page.evaluate(
  () => (window as any).__MYVTT_STORES__?.world().activeScene?.atmosphere?.imageUrl,
)

// 读取战场 token 数量
const tokenCount = await page.evaluate(
  () => (window as any).__MYVTT_STORES__?.world().tokens?.length ?? 0,
)
```

## Page Object 设计

### GalleryPage

作为 `GmDockPage.gallery` 的子对象，封装 Gallery 标签页交互。

```typescript
class GalleryPage {
  uploadImage(filePath: string) // setInputFiles → 等待网格出现资产
  expectAssetVisible(name: string) // 断言缩略图 + 名称可见（含文件扩展名）
  expectAssetNotVisible(name: string) // 断言资产已消失
  rightClickAsset(name: string) // 右键点击资产瓦片
  setAsSceneBackground(name: string) // 右键 → "Set as Scene Background"
  deleteAsset(name: string) // 右键 → "Delete"
}
```

**Locator 策略**：

- 上传触发：Gallery tab 内容区域内的 `input[type="file"]` + `setInputFiles()`（绕过原生 OS 文件弹窗）
- 资产瓦片：`page.locator('div[role="button"]').filter({ has: page.locator('img[alt="name"]') })`
- 右键菜单项：`page.getByText('Delete')` / `page.getByText('Set as Scene Background')`
- **注意**：Gallery 的 `asset.name` 保留完整文件名（含扩展名），如 `test-map.png`

### BlueprintPage

作为 `GmDockPage.blueprint` 的子对象，封装 Blueprint 标签页交互。

**重要**：Blueprint 标签页的按钮文字是 `蓝图`（对应 GmDock 的 `tokens` tab），不是 `Characters`（那是 `CharacterLibraryTab`）。

```typescript
class BlueprintPage {
  uploadToken(filePath: string) // setInputFiles → 等待 token 圆形出现
  expectTokenVisible(name: string) // 断言 token 模板可见（不含扩展名）
  expectTokenNotVisible(name: string) // 断言 token 已消失
  spawnOnMap(name: string) // 右键 → "Spawn on map"（需在战术模式下）
  deleteToken(name: string) // hover → 点击 X 按钮
}
```

**Locator 策略**：

- 上传触发：Blueprint tab 内容区域内的 `input[type="file"]`
- Token 圆形：`page.locator('.rounded-full')` 筛选含对应名称文本
- Hover X 按钮：先 hover token 容器 `div`，再定位其内部的 `button`（条件渲染的删除按钮）
- Spawn 菜单：`page.getByText('Spawn on map')`
- **注意**：Blueprint 的 `asset.name` 会去掉扩展名（`file.name.replace(/\.[^.]+$/, '')`），如 `test-token`

**源码改动**：为 Blueprint 的删除按钮添加 `aria-label="Delete blueprint"`，提高 locator 可靠性。

### Page Object 层级

```
RoomPage
  └── gmDock: GmDockPage
        ├── gallery: GalleryPage      ← 新增
        ├── blueprint: BlueprintPage   ← 新增
        ├── openTab(tab)
        ├── enterCombat()
        └── exitCombat()
```

Gallery 和 Blueprint 是 GmDock 的子对象（匹配 DOM 层级），不直接挂在 RoomPage 上。

## 测试场景

### Test 1: Gallery — 上传 → 设为背景 → Player 同步 → 删除

```
步骤:
1. 手动创建房间，GM 加入（沿用 multi-client-sync 的 setup 模式）
2. GM: 打开 GmDock → Gallery 标签页
3. GM: 上传 test-map.png（通过 setInputFiles）
4. GM: 断言 "test-map.png" 出现在 Gallery 网格中（注意：含扩展名）
5. GM: 右键 test-map.png → "Set as Scene Background"
6. GM: 通过 page.evaluate 验证 __MYVTT_STORES__.world().activeScene.atmosphere.imageUrl 非空
7. [多端] 创建 Player browser context，加入同一房间
8. Player: 通过 page.evaluate 验证 atmosphere.imageUrl 非空（使用 waitForFunction 重试）
9. GM: 重新打开 Gallery 标签页（dock 可能因点击外部而折叠）
10. GM: 右键 test-map.png → "Delete"
11. GM: 断言 "test-map.png" 从 Gallery 消失
```

### Test 2: Blueprint — 上传 → Spawn → Player 同步 → 删除

```
步骤:
1. 手动创建房间，GM 加入
2. GM: 进入战术模式（Enter Combat）
3. GM: 打开 GmDock → 蓝图 标签页（tokens tab，按钮文字 "蓝图"）
4. GM: 上传 test-token.png
5. GM: 断言 "test-token" 出现在蓝图网格中（注意：不含扩展名）
6. GM: 右键 token → "Spawn on map"
7. GM: 通过 page.evaluate 验证 __MYVTT_STORES__.world().tokens.length > 0
8. [多端] 创建 Player browser context，加入同一房间
9. Player: 通过 page.evaluate + waitForFunction 验证 tokens.length > 0
10. GM: 重新打开 蓝图 标签页（dock 可能已折叠）
11. GM: hover token → 点击 delete 按钮（aria-label="Delete blueprint"）
12. GM: 断言 "test-token" 从蓝图列表消失
```

## 测试数据

使用代码生成的最小 PNG（68 bytes，1x1 像素），不需要二进制文件进 git：

```typescript
// e2e/helpers/test-assets.ts
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
)
```

文件名与断言名称对应表：

| 测试文件       | 写入文件名     | Gallery 中显示名 | Blueprint 中显示名 |
| -------------- | -------------- | ---------------- | ------------------ |
| test-map.png   | test-map.png   | test-map.png     | N/A                |
| test-token.png | test-token.png | N/A              | test-token         |

差异原因：MapDockTab 使用 `file.name` 原样作为 asset name；BlueprintDockTab 使用 `file.name.replace(/\.[^.]+$/, '')` 去掉扩展名。

## Canvas 状态验证

react-konva 渲染在 `<canvas>` 上，DOM 中没有 token 节点。采用混合策略：

| 验证目标                 | 方式                                                 |
| ------------------------ | ---------------------------------------------------- |
| Gallery 网格中的资产     | DOM locator（`img[alt]`、`div[role="button"]`）      |
| Blueprint 列表中的 token | DOM locator（`.rounded-full`、名称文本）             |
| 场景背景已设置           | `page.evaluate()` 通过 `__MYVTT_STORES__` 读取 store |
| 战场上的 token 数量      | `page.evaluate()` 通过 `__MYVTT_STORES__` 读取 store |
| 右键菜单项               | DOM locator（可见文本）                              |

## 多端同步验证

沿用 `multi-client-sync.spec.ts` 的模式——直接从 `@playwright/test` import，手动创建房间和 context：

```typescript
import { test, expect } from '@playwright/test'

test('Gallery workflow', async ({ browser }) => {
  // GM context
  const gmContext = await browser.newContext()
  const gmPage = await gmContext.newPage()
  // ... create room, join as GM

  // Player context
  const playerContext = await browser.newContext()
  const playerPage = await playerContext.newPage()
  // ... join same room as Player
})
```

Player 端验证使用 `page.waitForFunction()` 重试，等待 Socket.io 事件传播：

```typescript
await playerPage.waitForFunction(
  () => {
    const store = (window as any).__MYVTT_STORES__?.world()
    return store?.activeScene?.atmosphere?.imageUrl != null
  },
  null,
  { timeout: 10_000 },
)
```

## 等待策略

| 操作            | 等待方式                                                          |
| --------------- | ----------------------------------------------------------------- |
| 上传完成        | 等待 `img[alt="test-map.png"]` 出现（DOM locator `.toBeVisible`） |
| 设置背景生效    | `page.evaluate()` 检查 imageUrl 非空                              |
| Player 看到变化 | `page.waitForFunction()` 重试直到 store 值符合预期                |
| 删除生效        | `toBeHidden()`                                                    |
| Spawn on map    | `page.waitForFunction()` 检查 token 数量                          |
| Dock 折叠恢复   | 重新调用 `openTab()` 确保 tab 内容可见                            |

## 源码改动

除了 E2E 测试代码外，需要修改以下源码：

1. **`src/lib/devBridge.ts`**（新增）— dev-mode store bridge，暴露 `window.__MYVTT_STORES__`
2. **`src/main.tsx`**（修改）— import devBridge（dev only）
3. **`src/dock/BlueprintDockTab.tsx`**（修改）— 为 hover 删除按钮添加 `aria-label="Delete blueprint"`

## 不在范围内

| 场景           | 原因                              |
| -------------- | --------------------------------- |
| 非法 MIME 上传 | 服务端校验，unit test 覆盖        |
| 超大文件       | E2E 生成大文件太慢                |
| 撤销删除       | 前端 timer 逻辑，unit test 覆盖   |
| 网络异常       | E2E 不适合模拟                    |
| 并发竞争       | 极低概率边界                      |
| Handout 标签页 | 交互模式与 Gallery 相似，后续补充 |
