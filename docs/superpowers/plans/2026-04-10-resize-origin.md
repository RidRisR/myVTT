---
status: draft
scope: Region resizeOrigin — 控制编程式 resize 的增长方向
estimated_tasks: 6
---

# Region `resizeOrigin` 系统能力

## 目标

让 Region 声明 resize 时哪个点保持固定，而非硬编码 top-left 增长。
例如 `resizeOrigin: 'center-left'` → 左边居中点不动，宽度向右扩，高度上下均分。

## 核心公式

每个 anchor/origin 对应一个 factor `(fx, fy)` ∈ [0,1]²：

| 点            | fx  | fy  |
| ------------- | --- | --- |
| top-left      | 0   | 0   |
| top-center    | 0.5 | 0   |
| top-right     | 1   | 0   |
| center-left   | 0   | 0.5 |
| center        | 0.5 | 0.5 |
| center-right  | 1   | 0.5 |
| bottom-left   | 0   | 1   |
| bottom-center | 0.5 | 1   |
| bottom-right  | 1   | 1   |

resize 时的偏移补偿：

```
dw = newWidth - oldWidth
dh = newHeight - oldHeight
dOffsetX = (anchorFactor.x - resizeOriginFactor.x) × dw
dOffsetY = (anchorFactor.y - resizeOriginFactor.y) × dh
```

验证：

- anchor=top-left (0,0), origin=top-left (0,0) → 补偿=0 ← 当前行为 ✓
- anchor=top-left (0,0), origin=center-left (0,0.5) → dOffsetY = -0.5×dh ← top 上移，高度上下均分 ✓
- anchor=top-right (1,0), origin=top-right (1,0) → 补偿=0 ← 右边界固定 ✓

## 本次范围

仅编程式 `sdk.ui.resize()`。Edit mode 拖拽 resize handle 留作后续。

## 任务

### Task 1: 类型定义

**文件**: `regionTypes.ts`, `registrationTypes.ts`

- 新增 `ResizeOrigin` 9 宫格类型
- `RegionLayoutEntry` 加 `resizeOrigin?: ResizeOrigin`
- `RegionDef` 加 `resizeOrigin?: ResizeOrigin`

### Task 2: 布局引擎工具函数

**文件**: `layoutEngine.ts`

- `resizeOriginFactor(origin: ResizeOrigin): { x: number; y: number }`
- `anchorFactor(anchor: AnchorPoint): { x: number; y: number }` — 复用 anchorBase 的映射逻辑
- `computeResizeCompensation(oldSize, newSize, anchor, resizeOrigin): { dOffsetX, dOffsetY }`
- 对应单测 (`layoutEngine.test.ts`)

### Task 3: layoutStore 补偿逻辑

**文件**: `layoutStore.ts`

在 `updateEntry()` 中，当 partial 含 width/height 变化且 entry 有 resizeOrigin 时，
计算偏移补偿并一起写入。

对应单测 (`layoutStore.test.ts`)。

### Task 4: Layout 入口播种

**文件**: `App.tsx` (auto-populate useEffect)

`addEntry()` 时从 `RegionDef.resizeOrigin` 复制到 entry。
旧 entry 无 resizeOrigin → `undefined` → 不补偿 → 向后兼容。

### Task 5: CharacterCard 使用

**文件**: `plugins/daggerheart-core/index.ts`, `CharacterCard.tsx`

Region 注册加 `resizeOrigin: 'center-left'`。
验证展开/收起动画为纯水平抽屉。

### Task 6: 最终验证

- `tsc -b` 通过
- 所有相关测试通过
- 手动确认 CharacterCard 展开方向正确
