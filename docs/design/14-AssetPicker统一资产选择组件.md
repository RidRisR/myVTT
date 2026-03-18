# AssetPicker 统一资产选择组件

> **状态：设计已定**
>
> 本文档记录 AssetPicker 组件的设计，作为资产系统重构 Phase 3 的主要交付。
> 前置：Phase 1（Blueprint 提取，PR #127 ✅）、Phase 2（media_type 重命名，PR #131 ✅）

## 背景与动机

当前系统中有 5 个地方各自独立做图片上传（Maps、Blueprints、Handouts、角色头像、场景音频），每个都是自己的 `<input type="file">`，**只能上传新文件，不能从已有资产中选择**。

这导致几个问题：

1. **资产无法复用** — 想用同一张图做地图背景和 token，必须上传两次
2. **资产管理分散** — 没有统一的地方浏览、管理所有已上传的资产
3. **Dock 面板风格不统一** — Maps 是方形网格，Blueprints 是圆形 token，交互不一致

## 设计目标

- 提供统一的「浏览已有 + 上传新的」资产选择弹窗
- 通过 Hamburger 菜单提供独立的资产管理入口
- 统一 Dock 面板的展示风格（单行圆形图标）
- 引入 `@dnd-kit/core` 支持标签拖拽和网格排序

## 设计原则

- **就地使用，自动归档** — 在需要选图的地方弹出 AssetPicker，上传后自动进入统一资产池
- **Map tab 保留独立管理** — 地图有专属操作（设为背景、设为战术地图），保留独立 tab
- **Handout 暂不改动** — Handout 的整体方案未定，此次不涉及

## AssetPicker 组件设计

### 组件定位

AssetPicker 是一个 **Radix Dialog** 组件，居中弹出，支持两种模式：

- **select 模式** — 从 Blueprint 创建、角色头像等场景触发。用户选中资产后回调返回 `AssetMeta`，Dialog 关闭
- **manage 模式** — 从 Hamburger 菜单打开。纯浏览/上传/删除/改名，无选择回调

### 接口设计

```tsx
interface AssetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'select' | 'manage'
  filter?: { mediaType?: string } // 预设筛选
  autoTags?: string[] // 上传时自动打的标签
  onSelect?: (asset: AssetMeta) => void // select 模式回调
}
```

### Dialog 布局

```
┌─ 资产库 ─────────────────────────────────────────────┐
│                                                       │
│  ┌─标签筛选栏────────────────────────── 🔍 搜索 ──┐  │
│  │ [all] [map] [token] [其他标签...]               │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─图片网格（正方形卡片，4列）───────────────────┐   │
│  │ ┌ + ─┐ ┌────┐ ┌────┐ ┌────┐                  │   │
│  │ │上传│ │ img│ │ img│ │ img│                  │   │
│  │ └───┘ │name│ │name│ │name│                  │   │
│  │        └────┘ └────┘ └────┘                  │   │
│  │ ┌────┐ ┌────┐ ┌────┐ ┌────┐                  │   │
│  │ │ img│ │ img│ │ img│ │ img│                  │   │
│  │ │name│ │name│ │name│ │name│                  │   │
│  │ └────┘ └────┘ └────┘ └────┘                  │   │
│  └────────────────────────────── (可滚动) ───────┘   │
│                                                       │
│  点击选择 · 右键管理 · 拖拽标签打标签 · 拖拽排序     │
└───────────────────────────────────────────────────────┘
```

### 卡片样式

- **正方形** 96×96，图片 `object-cover` 裁剪
- 名称在下方，单行 `text-overflow: ellipsis`
- Hover 时 `scale(1.03)` 微放大
- 上传按钮固定在**第一个位置**

### 交互行为

#### select 模式

| 操作            | 行为                                      |
| --------------- | ----------------------------------------- |
| 单击图片        | 选中并回调 `onSelect(asset)`，Dialog 关闭 |
| 点击 + 上传     | 上传完成后自动选中并回调，Dialog 关闭     |
| 右键            | 弹出 ContextMenu（改名/编辑标签/删除）    |
| 拖拽标签 → 图片 | 给该资产添加标签                          |
| 拖拽图片排序    | 调整排序并持久化                          |

#### manage 模式

| 操作            | 行为                                   |
| --------------- | -------------------------------------- |
| 单击图片        | 无操作                                 |
| 点击 + 上传     | 上传后留在 Dialog 内继续管理           |
| 右键            | 弹出 ContextMenu（改名/编辑标签/删除） |
| 拖拽标签 → 图片 | 给该资产添加标签                       |
| 拖拽图片排序    | 调整排序并持久化                       |

### 右键菜单

使用 Radix ContextMenu，菜单项：

- ✏️ 重命名
- 🏷 编辑标签
- ---（分隔线）
- 🗑 删除（红色，danger variant）

### 触发场景

| 场景               | 模式   | 默认筛选          | 上传自动标签 |
| ------------------ | ------ | ----------------- | ------------ |
| Blueprint 创建     | select | `mediaType=image` | `['token']`  |
| 角色头像更换       | select | `mediaType=image` | 无           |
| Hamburger 资产管理 | manage | 无（显示全部）    | 无           |

### 数据流

- 资产数据来自 `worldStore.assets`（已有 Socket.io 实时同步）
- 上传走现有 `uploadAsset()` 流程，上传后通过 Socket.io `asset:created` 事件自动出现在网格中
- 标签筛选和搜索在客户端用 `useMemo` 过滤，不请求后端
- 排序更新通过 `PATCH /api/rooms/:roomId/assets/:id` 持久化

## 拖拽系统

### 库选型

引入 `@dnd-kit/core` + `@dnd-kit/sortable`：

- React 生态最主流的 DnD 库
- 模块化、轻量、维护活跃
- 支持排序、跨容器拖放、自定义 sensors
- 为后续拖拽需求（Blueprint 拖到地图、角色栏拖放、场景排序等）打基础

### 两种拖拽交互

#### 标签拖拽打标签

- **拖拽源**：标签筛选栏中的 tag pill（`cursor: grab`）
- **放置目标**：任意图片卡片
- **视觉反馈**：拖拽时 tag pill 跟随光标；悬停目标卡片时边框变为 accent 色 + 发光
- **释放行为**：调用 `updateAsset(assetId, { tags: [...existing, draggedTag] })`，如果标签已存在则忽略
- 标签点击仍为筛选功能，两种交互通过手势区分

#### 图片网格拖拽排序

- 使用 `@dnd-kit/sortable` 的 `SortableContext` + `useSortable`
- 拖拽时其他卡片自动让位（标准 sortable 动画）
- 释放后调用 `PATCH /api/rooms/:roomId/assets/:id` 更新 `sort_order`

### 后端变更

assets 表新增 `sort_order` 列：

```sql
ALTER TABLE assets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
```

- GET `/api/rooms/:roomId/assets` 查询改为 `ORDER BY sort_order ASC, created_at DESC`
- PATCH `/api/rooms/:roomId/assets/:id` 支持 `sortOrder` 字段
- 新增批量排序接口（可选）：`PATCH /api/rooms/:roomId/assets/reorder`，一次更新多个资产的 sort_order

## Dock 面板风格统一

### 变更范围

将 Maps tab 和 Blueprints tab 的内容面板统一为单行圆形图标风格。

### 目标布局

```
┌──────────────────────────────────────────────────────────┐
│ [标签筛选...]                                  🔍 搜索   │
│                                                          │
│  (◯)  (◯)  (◯)  (◯)  (◯)  (◯)  (◯)  (+ )     →       │
│  name  name  name  name  name  name  name  上传          │
└──────────────────────────────────────────────────────────┘
```

- 单行横向排列，超出容器宽度时**横向滚动**（`overflow-x: auto`）
- 圆形缩略图 + 下方名称标签
- 上传按钮放在最后（Dock 面板场景，非 AssetPicker）

### Gallery → Maps 重命名

- Tab 标签从 "Gallery" 改为 "Maps"（或 i18n key `dock.maps`）
- 功能不变：浏览带 `map` 标签的资产，右键设为背景/战术地图/Showcase

### Blueprints tab

- 已有圆形样式，改为单行横向滚动即可
- 标签筛选栏保留

### Handout tab

- 如果统一不复杂就顺手改，否则保持现状

## 资产管理入口

在 Hamburger 菜单中新增一项 **"资产管理"**（或 "Asset Library"），点击后以 manage 模式打开 AssetPicker Dialog。

## 不涉及的部分

- Map tab 的上传流程不走 AssetPicker（保留独立管理）
- Handout 独立表提取（后续阶段）
- 场景音频上传（非图片，不适用）
- Blueprint 拖到地图、角色栏拖放等高级拖拽（DnD 库引入后自然可扩展，但不在此次范围）

## 文件结构

| 文件                            | 职责                                  |
| ------------------------------- | ------------------------------------- |
| `src/ui/AssetPickerDialog.tsx`  | Dialog 外壳 + 模式逻辑                |
| `src/ui/AssetGrid.tsx`          | 图片网格 + sortable + 上传卡片        |
| `src/ui/AssetGridItem.tsx`      | 单个资产卡片 + 右键菜单 + drop target |
| `src/ui/DraggableTag.tsx`       | 可拖拽的标签 pill                     |
| `src/dock/MapDockTab.tsx`       | 改为单行圆形布局                      |
| `src/dock/BlueprintDockTab.tsx` | 改为单行横向滚动                      |
| `src/layout/HamburgerMenu.tsx`  | 新增资产管理入口                      |
| `server/routes/assets.ts`       | 支持 sort_order 字段                  |
| `server/schema.ts`              | assets 表添加 sort_order 列           |

## Assumptions

- 所有资产数据已通过 `worldStore.assets` 管理，Socket.io 实时同步机制已就绪
- Radix UI primitives（Dialog, ContextMenu）已在项目中引入并有成熟的封装模式
- `@dnd-kit/core` 和 `@dnd-kit/sortable` 可以共存于现有依赖栈，无版本冲突
- 资产数量在单房间内不会超过数百个，客户端筛选/排序不会有性能问题
- Map tab 的专属操作（设为背景、设为战术地图）不需要迁移到 AssetPicker

## Edge Cases

- **空状态**：无资产时显示空状态提示 + 上传按钮
- **上传失败**：显示 toast 错误提示，不关闭 Dialog
- **重复标签拖拽**：标签已存在于资产上时，拖拽操作静默忽略（不报错）
- **资产被其他客户端删除**：Socket.io `asset:deleted` 事件触发后，AssetPicker 网格实时移除该卡片；如果 select 模式中用户正在操作该资产，不会崩溃
- **并发排序**：两个 GM 同时拖拽排序时，后写入的覆盖先写入的（last-write-wins），可接受
- **搜索 + 标签筛选组合**：两者是 AND 关系，同时生效
- **大量标签**：标签筛选栏横向滚动，不换行
- **select 模式下删除资产**：允许在 select 模式下通过右键删除资产，删除后不触发 onSelect

## 关键设计决策

| 决策                 | 选择                              | 理由                                     |
| -------------------- | --------------------------------- | ---------------------------------------- |
| AssetPicker 交互形式 | Radix Dialog（模态框）            | 空间充裕，适合图片网格 + 筛选            |
| 缩略图样式           | 正方形 object-cover               | 行业标准（Foundry VTT、Roll20）          |
| 上传按钮位置         | 网格第一个位置                    | 最常用操作最显眼                         |
| manage 模式单击      | 无操作                            | YAGNI，后续按需加大图预览                |
| Map tab              | 保留独立                          | 地图有专属操作，不走 AssetPicker         |
| DnD 库               | @dnd-kit/core + @dnd-kit/sortable | React 主流，模块化，为后续拖拽需求打基础 |
| 排序持久化           | assets 表 sort_order 列           | HTTP PATCH 保持项目风格                  |
| Dock 面板风格        | 单行圆形图标 + 横向滚动           | 统一视觉，节省纵向空间                   |
| 资产管理入口         | Hamburger 菜单                    | 轻量级入口，不占 Dock tab                |
