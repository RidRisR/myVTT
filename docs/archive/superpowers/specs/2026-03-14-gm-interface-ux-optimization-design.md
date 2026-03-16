# GM 界面可用性优化设计

## 背景

当前 GM 界面存在以下可用性问题：

1. **遭遇预设无管理入口**：数据层已支持一个场景多个 encounter，但 UI 层无法浏览、创建、激活预设
2. **实体管理分散**：实体只能通过 PortraitBar 右键菜单操作，无集中管理面板
3. **蓝图无分类**：asset.tags 字段已存在但 UI 无标签筛选功能
4. **删除体验不一致**：场景和图片有确认弹窗，蓝图/handout/token 无确认直接删除
5. **左侧空间浪费**：GM 不需要 MyCharacterCard，左侧空间可更好利用

本次优化的目标是通过 5 个模块的改动，系统性提升 GM 界面的可用性和操作效率。

---

## 模块一：左侧 GM 侧边栏

### 设计决策

- GM 视图中，左侧 `MyCharacterCard` 替换为 **GM 侧边栏**（总宽 280px = 36px Tab + 244px 内容）
- 玩家视图保留 `MyCharacterCard` 不变
- 侧面 Tab 使用**纯图标**风格（36px 宽），左边框高亮选中 Tab
- 侧边栏支持收起（收起时只显示 36px Tab 栏）

### Tab 列表

| 图标 | Tab  | 内容                   |
| ---- | ---- | ---------------------- |
| ⚔️   | 遭遇 | 当前场景的遭遇预设列表 |
| 📋   | 实体 | 全局实体管理面板       |

### GM 角色检测

`App.tsx` 中已有 `isGM` 变量（`mySeat.role === 'GM'`，约 L273），直接复用条件渲染即可。

### 关键文件

- 新建：`src/gm/GmSidebar.tsx`（主容器，根据 Tab 切换内容）
- 修改：`src/App.tsx`（GM 视图条件渲染：`isGM ? <GmSidebar/> : <MyCharacterCard/>`）
- 复用：`src/stores/uiStore.ts`（新增 `gmSidebarTab`、`gmSidebarCollapsed` 状态）

---

## 模块二：遭遇预设管理

### 交互流程

1. 进入场景 → 遭遇 Tab 自动显示当前场景的预设列表
2. 列表顶部高亮「当前运行中」的遭遇（绿色指示灯 + 金色边框），可能为空白状态
3. 下方显示预设列表，每个预设显示：
   - 地图缩略图（48×34px，无地图显示 ∅ 占位）
   - 预设名称
   - token 数量 + 地图状态标记（✓/✗）
   - ⋮ 更多操作按钮
4. 底部固定操作栏：「▶ 激活」「💾 保存」按钮
5. 「+ 新建遭遇预设」按钮

### 操作定义

| 操作     | 触发方式            | 说明                                                                                              |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| 激活预设 | 底部「▶ 激活」按钮  | 调用 `worldStore.activateEncounter(sceneId, selectedEncounterId)`。按钮仅在选中某个预设时启用     |
| 保存快照 | 底部「💾 保存」按钮 | 调用 `worldStore.saveEncounter(sceneId, activeEncounterId)`。按钮仅在战斗运行中且有活跃遭遇时启用 |
| 新建预设 | 「+ 新建」按钮      | 弹出输入框 → POST encounters API                                                                  |
| 重命名   | ⋮ 菜单              | 内联编辑名称 → PATCH encounters API                                                               |
| 复制预设 | ⋮ 菜单              | 复制数据 → POST 创建新预设                                                                        |
| 删除预设 | ⋮ 菜单（长按）      | 长按确认 + Toast 撤销                                                                             |

### 数据流

- 预设列表：`GET /api/rooms/:roomId/scenes/:sceneId/encounters` → 本地状态
- **Socket.io 事件处理**：当前 `worldStore.ts` 中 `encounter:created`/`encounter:updated`/`encounter:deleted` 事件处理器为空（no-op）。需实现这些 handler，当事件对应的 sceneId 匹配当前活跃场景时，增量更新本地 encounters 状态
- 切换场景时自动重新拉取该场景的预设列表

### 状态设计

```typescript
// worldStore 中新增字段
encounters: EncounterPreset[]  // 当前活跃场景的预设列表（切换场景时重新拉取）
_encounterSceneId: string | null  // 标记 encounters 属于哪个场景，避免显示过期数据

interface EncounterPreset {
  id: string
  name: string
  mapUrl: string
  mapWidth: number
  mapHeight: number
  grid: GridConfig
  tokens: Record<string, EncounterToken>
  gmOnly: boolean
}
```

### 选中态与按钮启用/禁用

- 面板维护 `selectedEncounterId` 本地状态
- 「▶ 激活」：仅当选中某个预设时启用
- 「💾 保存」：仅当战斗运行中（`combatInfo !== null`）且 `room.activeEncounterId` 不为 null 时启用
- 运行中的预设（`id === room.activeEncounterId`）始终高亮显示

### 空状态

场景无任何遭遇预设时，显示引导文案："此场景暂无遭遇预设。点击下方按钮创建你的第一个战斗场景。"配合「+ 新建遭遇预设」按钮。

### 复制预设

复制时：完整复制 tokens、grid、mapUrl 等所有字段，名称追加"（副本）"后缀，gmOnly 继承原值。

### 关键文件

- 新建：`src/gm/EncounterPanel.tsx`（遭遇预设列表面板）
- 新建：`src/gm/EncounterCard.tsx`（单个预设卡片组件）
- 复用：`src/stores/worldStore.ts` 已有 actions：`activateEncounter`、`saveEncounter`、`endCombat`
- 扩展：`worldStore` 需新增：`encounters` + `_encounterSceneId` 状态字段、`fetchEncounters(sceneId)` action、`createEncounter` / `deleteEncounter` / `updateEncounter` / `duplicateEncounter` actions
- 修改：`worldStore` Socket.io handler — 实现 `encounter:created`/`encounter:updated`/`encounter:deleted` 事件处理

---

## 模块三：实体管理面板

### 面板结构

```
┌─ 搜索栏 [🔍 搜索...] ─── [全部] [PC] [NPC] ─┐
├─ 队伍成员 (persistent) ──────────────────────┤
│  [头像] 战士 Grok  HP 45/52  ● 在线           │
│  [头像] 法师 Elara HP 28/30  ● 在线           │
├─ 场景 NPC ────────────────────────────────────┤
│  [头像] 哥布林队长 HP 21/21  ⋮                │
│  [头像] 哥布林 x3  HP 7/7    ⋮                │
├─ [+ 新建实体 / 从蓝图创建] ──────────────────┤
└─ 底部操作栏: [📝 编辑] [🔗 场景] [🗑 删除] ──┘
```

### 操作定义

| 操作       | 触发方式                | 说明                                                     |
| ---------- | ----------------------- | -------------------------------------------------------- |
| 选中实体   | 单击                    | 高亮选中，底部操作栏显示对应按钮                         |
| 编辑实体   | 双击 / 底部「编辑」     | 打开编辑面板（复用 `src/layout/CharacterEditPanel.tsx`） |
| 新建实体   | 「+ 新建」按钮          | 弹出创建表单                                             |
| 从蓝图创建 | 「+ 新建」下拉          | 选择蓝图 → 创建实体并填充默认属性                        |
| 添加到场景 | 右键菜单 / 底部「场景」 | 调用 `worldStore.addEntityToScene()`                     |
| 从场景移除 | 右键菜单                | 调用 `worldStore.removeEntityFromScene()`                |
| 删除实体   | 底部「删除」（长按）    | 长按确认 + Toast 撤销                                    |
| 拖拽到地图 | 拖拽实体行              | 在战斗模式下创建 token                                   |

### 分组逻辑

- **队伍成员**：`persistent === true` 的实体
- **场景 NPC**：`persistent === false` 且在当前场景 `sceneEntityMap[activeSceneId]` 中的实体
- 筛选 chip 可按 PC（有 owner seat）/NPC 过滤

### 关键文件

- 新建：`src/gm/EntityPanel.tsx`（实体列表面板）
- 新建：`src/gm/EntityRow.tsx`（实体行组件）
- 复用：`src/stores/worldStore.ts` 已有 actions：`addEntity`、`updateEntity`、`deleteEntity`、`addEntityToScene`、`removeEntityFromScene`
- 复用：`src/layout/CharacterEditPanel.tsx`（实体编辑面板，已有完整的实体编辑 UI）
- 当前为单选模式；多选批量操作不在本次范围内

---

## 模块四：蓝图标签系统

### TokenDockTab 变更

在现有蓝图网格上方新增**标签筛选栏**：

```
┌─ [全部] [人形] [野兽] [魔法生物] [亡灵] [物件] [+自定义] ─┐
├─ 蓝图网格（按标签筛选结果）──────────────────────────────────┤
│  [token1] [token2] [token3] [token4] [+上传]                 │
└──────────────────────────────────────────────────────────────┘
```

### 标签管理

- **默认预设标签**：人形、野兽、魔法生物、亡灵、物件（首次使用时提供，不自动创建）
- **自由标签**：GM 可输入任意文本作为标签
- **自动补全**：输入时显示已使用过的标签列表
- **多标签筛选**：点击多个 chip 取交集（AND 逻辑）
- **标签编辑入口**：蓝图右键菜单「编辑标签」→ 弹出标签输入框

### 数据存储

- 使用已有的 `asset.tags: string[]` 字段（asset 表的 `tags` JSON 列）
- 更新标签：`PATCH /api/rooms/:roomId/assets/:id` + `{ tags: [...] }`
- 服务器端 `tags` 存储在 `extra.tags` JSON 字段中，但客户端 `assetApi.updateAsset()` 发送顶层 `tags` 字段，服务器路由自动合并到 `extra.tags`（已有逻辑，无需修改）
- 无需新增后端 API

### 关键文件

- 修改：`src/dock/TokenDockTab.tsx`（添加标签筛选栏 + 筛选逻辑）
- 新建：`src/shared/ui/TagInput.tsx`（标签输入组件，支持自动补全）
- 新建：`src/shared/ui/TagFilterBar.tsx`（标签筛选条组件）
- 复用：`src/stores/assetStore.ts` 已有 `update()` action

---

## 模块五：统一删除体验

### 删除策略

| 数据类型        | 删除方式               | 删除后反馈      |
| --------------- | ---------------------- | --------------- |
| Token（战斗中） | **单击**删除           | Toast + 5s 撤销 |
| 场景            | **长按** ~1s（进度圈） | Toast + 5s 撤销 |
| 实体（PC/NPC）  | **长按** ~1s           | Toast + 5s 撤销 |
| 蓝图            | **长按** ~1s           | Toast + 5s 撤销 |
| 图片/音频资产   | **长按** ~1s           | Toast + 5s 撤销 |
| Handout         | **长按** ~1s           | Toast + 5s 撤销 |
| 遭遇预设        | **长按** ~1s           | Toast + 5s 撤销 |

### 技术实现

#### `useHoldToConfirm` Hook

全新 hook（与 `useHoldRepeat` 逻辑不同——`useHoldRepeat` 是按住重复触发，`useHoldToConfirm` 是按住一段时间后单次确认）：

```typescript
function useHoldToConfirm(options: {
  onConfirm: () => void
  duration?: number // 默认 1000ms
  onProgress?: (progress: number) => void
}): {
  onPointerDown: () => void
  onPointerUp: () => void
  onPointerLeave: () => void
  progress: number // 0-1，用于驱动进度圈
  isHolding: boolean
}
```

#### 删除 + Toast 撤销

采用「立即删除 + 撤销重建」策略（不使用延迟删除，避免多客户端不一致问题）：

```typescript
function useUndoableDelete(options: {
  deleteFn: () => Promise<void> // 立即发送 DELETE 请求
  recreateFn: () => Promise<void> // 撤销时重新 POST 创建（使用删除前缓存的数据）
  label: string // Toast 显示的名称
  undoWindowMs?: number // 撤销窗口，默认 5000ms
})
```

流程：

1. 删除触发 → **立即**发送 DELETE 请求到服务器（确保多客户端一致）
2. 服务器广播 Socket.io 删除事件，所有客户端同步移除
3. 显示 Toast「已删除 {label} — [撤销]」（5s 窗口）
4. 点击撤销 → 用缓存的数据重新 POST 创建（新 ID），恢复到列表中
5. 撤销后的项会获得新 ID（因为是重新创建），但数据内容完全一致

**注意**：调用方需在触发删除前缓存完整数据（shallow copy），供撤销时使用。

#### 迁移清单

移除现有 ConfirmDialog 用法：

- `src/gm/SceneListPanel.tsx`：场景删除确认 → 改为长按 + Toast
- `src/dock/MapDockTab.tsx`：资产删除确认 → 改为长按 + Toast

补充缺失的删除反馈：

- `src/dock/TokenDockTab.tsx`：蓝图删除（当前无确认无反馈）→ 长按 + Toast
- `src/dock/HandoutDockTab.tsx`：Handout 删除 → 长按 + Toast
- `src/gm/GmDock.tsx`：Token 删除 → Toast 撤销（单击保留）

### 关键文件

- 新建：`src/shared/useHoldToConfirm.ts`
- 新建：`src/shared/useUndoableDelete.ts`
- 修改：上述 5 个文件的删除逻辑
- 复用：`src/shared/ui/Toast` 系统（`useToast` + `ToastProvider`）

---

## 键盘无障碍

长按删除交互仅适用于鼠标/触摸。键盘用户的替代方案：聚焦到删除按钮后按 Enter 键触发内联确认（按钮文字变为「再按确认」，2s 后自动恢复）。此交互作为 `useHoldToConfirm` hook 的内置 `onKeyDown` handler 提供。

---

## 不在本次范围内

- 玩家视图变更（保持现状）
- 角色卡重设计（仅 GM 视图隐藏角色卡）
- 右侧面板变更（Team Dashboard + Chat 保持不变）
- ConfirmDialog 组件本身不删除（可能其他地方仍需使用）
