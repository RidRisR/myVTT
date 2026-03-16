# E2E 资源管理测试设计

## 概述

为 Gallery（地图/背景）和 Blueprint（Token 蓝图）两个资产类型新增端到端测试，验证完整的用户工作流：上传 → 使用 → 多端同步 → 删除。

## 决策记录

| 决策点   | 选择                                | 理由                                         |
| -------- | ----------------------------------- | -------------------------------------------- |
| 覆盖范围 | Gallery + Blueprint（不含 Handout） | 核心工作流，Handout 使用频率低且交互模式相似 |
| 多端同步 | 包含 Player 验证                    | 资源的核心价值是让玩家看到效果               |
| 撤销功能 | 不测试                              | 纯前端 timer 逻辑，unit test 已覆盖          |
| 文件组织 | 单文件多 test()，每个 test 独立房间 | 故障隔离 + fixture 自动清理                  |

## 文件结构

```
e2e/
  helpers/
    test-assets.ts              — 代码生成最小 PNG 测试图片
  pages/
    gallery.page.ts             — Gallery 标签页 Page Object
    blueprint.page.ts           — Blueprint 标签页 Page Object
  scenarios/
    asset-management.spec.ts    — 两个独立 test()
  fixtures/
    vtt-fixture.ts              — 扩展：增加 testAssets fixture
  pages/
    room.page.ts                — 扩展：挂载 gallery / blueprint page object
```

## Page Object 设计

### GalleryPage

挂载于 `RoomPage.gallery`，封装 Gallery 标签页交互。

```typescript
class GalleryPage {
  // 核心方法
  uploadImage(filePath: string) // setInputFiles → 等待网格出现资产
  expectAssetVisible(name: string) // 断言缩略图 + 名称可见
  expectAssetNotVisible(name: string) // 断言资产已消失
  rightClickAsset(name: string) // 右键点击资产瓦片
  setAsSceneBackground(name: string) // 右键 → "Set as Scene Background"
  deleteAsset(name: string) // 右键 → "Delete"
}
```

**Locator 策略**：

- 上传触发：`page.locator('input[type="file"][accept*="image"]')` + `setInputFiles()`（绕过原生 OS 文件弹窗）
- 资产瓦片：`page.locator('div[role="button"]').filter({ has: page.locator('img[alt="name"]') })`
- 右键菜单项：`page.getByText('Delete')` / `page.getByText('Set as Scene Background')`

### BlueprintPage

挂载于 `RoomPage.blueprint`，封装 Blueprint 标签页交互。

```typescript
class BlueprintPage {
  // 核心方法
  uploadToken(filePath: string) // setInputFiles → 等待 token 圆形出现
  expectTokenVisible(name: string) // 断言 token 模板可见
  expectTokenNotVisible(name: string) // 断言 token 已消失
  spawnOnMap(name: string) // 右键 → "Spawn on map"
  deleteToken(name: string) // hover → 点击 X 按钮
}
```

**Locator 策略**：

- 上传触发：Blueprint tab 内的 `input[type="file"][accept="image/*"]`
- Token 圆形：`page.locator('.rounded-full')` 筛选含对应名称
- Hover X 按钮：先 hover token 元素，再定位出现的 X 按钮
- Spawn 菜单：`page.getByText('Spawn on map')`

## 测试场景

### Test 1: Gallery — 上传 → 设为背景 → Player 同步 → 删除

```
步骤:
1. [fixture] 自动创建房间，GM 加入
2. GM: 打开 GmDock → Gallery 标签页
3. GM: 上传 test-map.png（通过 setInputFiles）
4. GM: 断言 "test-map" 出现在 Gallery 网格中
5. GM: 右键 test-map → "Set as Scene Background"
6. [多端] 创建 Player browser context，加入同一房间
7. Player: 验证场景背景已设置（page.evaluate 读取 store）
8. GM: 右键 test-map → "Delete"
9. GM: 断言 "test-map" 从 Gallery 消失
```

### Test 2: Blueprint — 上传 → Spawn → Player 同步 → 删除

```
步骤:
1. [fixture] 自动创建房间，GM 加入
2. GM: 进入战术模式（Enter Combat）
3. GM: 打开 GmDock → Characters 标签页（即 Blueprint tab）
4. GM: 上传 test-token.png
5. GM: 断言 token 圆形模板出现在蓝图网格中
6. GM: 右键 token → "Spawn on map"
7. GM: 验证战场上 token 数量增加（page.evaluate 读取 store）
8. [多端] 创建 Player browser context，加入同一房间
9. Player: 验证战场画布可见且有 token（page.evaluate 读取 token 列表）
10. GM: 回到 Characters 标签，hover token → 点击 X 删除
11. GM: 断言 token 模板从蓝图列表消失
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

在 fixture 中写入 `/tmp/myvtt-e2e-assets/`，通过 `testAssets` fixture 提供路径。

## Canvas 状态验证

react-konva 渲染在 `<canvas>` 上，DOM 中没有 token 节点。采用混合策略：

| 验证目标                 | 方式                                            |
| ------------------------ | ----------------------------------------------- |
| Gallery 网格中的资产     | DOM locator（`img[alt]`、`div[role="button"]`） |
| Blueprint 列表中的 token | DOM locator（`.rounded-full`、名称文本）        |
| 场景背景已设置           | `page.evaluate()` 读取 zustand store            |
| 战场上的 token 数量      | `page.evaluate()` 读取 zustand store            |
| 右键菜单项               | DOM locator（可见文本）                         |

## 多端同步验证

使用 Playwright `browser.newContext()` 创建 Player 独立会话，与现有 `multi-client-sync.spec.ts` 模式一致：

```typescript
const playerContext = await browser.newContext()
const playerPage = await playerContext.newPage()
```

Player 端验证使用 `expect().toPass({ timeout: 10_000 })` 重试，等待 Socket.io 事件传播。

## 等待策略

| 操作            | 等待方式                                 |
| --------------- | ---------------------------------------- |
| 上传完成        | 等待 `img[alt="filename"]` 出现          |
| 设置背景生效    | `page.evaluate()` 轮询直到 imageUrl 非空 |
| Player 看到变化 | `expect().toPass()` 重试                 |
| 删除生效        | `toBeHidden()`                           |
| Spawn on map    | `page.evaluate()` 检查 token 数量        |

## 不在范围内

| 场景           | 原因                              |
| -------------- | --------------------------------- |
| 非法 MIME 上传 | 服务端校验，unit test 覆盖        |
| 超大文件       | E2E 生成大文件太慢                |
| 撤销删除       | 前端 timer 逻辑，unit test 覆盖   |
| 网络异常       | E2E 不适合模拟                    |
| 并发竞争       | 极低概率边界                      |
| Handout 标签页 | 交互模式与 Gallery 相似，后续补充 |
