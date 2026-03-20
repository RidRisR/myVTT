# PR #138 验收 Bug 修复记录

## 概览

PR #138（AssetPickerPanel 重构）验收测试发现 4 个 bug。根本原因：未遵循 sandbox `PatternFloatingPanelOverlay` 模式。

## Bug 1: 面板被限制在父组件内部

**现象**: 从角色卡或汉堡菜单打开资产管理器时，面板被约束在父组件区域内，无法作为独立浮层。

**根因**: 面板使用 `position: fixed` 但 inline 渲染在有 `transform`/`backdrop-filter` 的祖先内部。这些 CSS 属性创建 CSS containing block，导致 `fixed` 定位相对于祖先而非 viewport。

祖先链：

- `MyCharacterCard.tsx:18` — `-translate-y-1/2`（transform）
- `MyCharacterCard.tsx:26` — `transform: translateX(...)`
- `MyCharacterCard.tsx:31` — `backdrop-blur-[16px]`（backdrop-filter）
- `HamburgerMenu.tsx:80` — `backdrop-blur-[16px]`

**修复**: `createPortal(panelJSX, document.body)` 将面板渲染到 `<body>` 下，完全脱离祖先 DOM 树。同时将 `z-panel`(8500) 改为 `z-ui`(1000)，确保面板 z-index < `z-popover`(5000)，Radix overlay 不会被遮挡。

**文件**: `src/asset-picker/AssetPickerPanel.tsx`, `tailwind.config.ts`

---

## Bug 2: 拖动窗口有向左上角跳变

**现象**: 开始拖动面板时，面板突然跳到左上角位置。

**根因**: `usePanelDrag` 在拖拽时将面板从 `position: fixed; inset: 0; margin: auto`（CSS 居中）切换为 `position: relative; left: 0; top: 0`，导致位置突变。

**修复**: 按照 sandbox `PatternFloatingPanelOverlay.tsx` 模式重写 `usePanelDrag`：

- 始终使用 `position: fixed` + `left/top` state 定位
- `posRef` 持有可变位置（drag handler 读取），`pos` state 驱动 React 渲染
- `handleDragStart` 零依赖，从 `posRef.current` 读取当前位置
- 面板打开时通过 `setPos` 设置初始位置为视口中心

**文件**: `src/shared/usePanelDrag.ts`

---

## Bug 3: 拖动很卡

**现象**: 拖动面板时动画不流畅，有明显卡顿。

**根因**: 原实现在拖拽时使用 `position: relative` + 变化的 `left/top`。`relative` 定位的元素参与 normal flow，每帧更新 left/top 会触发所有兄弟元素的 layout reflow。

**修复**: 改用 `position: fixed` + `left/top`。`fixed` 元素不参与 normal flow，更新 left/top 不触发兄弟 reflow。同时事件监听挂 `document`（而非 `setPointerCapture`），`dragCleanupRef` 保证卸载时清理。

**文件**: `src/shared/usePanelDrag.ts`

---

## Bug 4: 上传图片只出现在 ALL

**现象**: 在 Maps 或 Tokens 标签下上传图片，图片只出现在 ALL 标签，Maps/Tokens 中看不到。

**根因**: manage 模式下 `autoTags` prop 未传递（undefined），`worldStore.uploadAsset` 将 `undefined` fallback 为空数组 `[]`，资产没有分类标签。

**修复**: 新增 `effectiveAutoTags` 计算逻辑：

```tsx
const effectiveAutoTags = useMemo(() => {
  if (autoTags) return autoTags // select 模式由 prop 传入
  if (activeCategory) return [activeCategory] // manage 模式用当前分类
  return undefined // ALL 分类不强制标签
}, [autoTags, activeCategory])
```

传给 `<AssetGrid autoTags={effectiveAutoTags} />`。

**文件**: `src/asset-picker/AssetPickerPanel.tsx`

---

## Bug 4 遗留：ALL 标签上传无分类

**现象**: 从汉堡菜单打开资产库，在 ALL 标签下上传图片，图片只出现在 ALL，Maps/Tokens 都看不到。

**根因**: `effectiveAutoTags` 在 `activeCategory` 为 null（ALL tab）时返回 `undefined`，upload 路径 `tags: undefined` → store fallback → `[]`。

**根因层次分析**:

1. **Schema 层** — `tags: string[]` 同时承载"内容分类"（map/token，互斥、系统赋值）和"用户标签"（forest/battle，非互斥、用户管理）。分类是可选的、隐式的，导致上传时合法地产出无分类资产。
2. **UI 层** — ALL tab 是"查看过滤器"（显示所有分类），不是"操作上下文"（分类目标）。上传按钮在 ALL tab 可用，创造了"无分类上下文"的操作路径。`effectiveAutoTags` 从 UI 状态反推业务语义，在 ALL tab 上语义断裂。
3. **类型系统层** — `autoTags?: string[]` 允许 `undefined` 一路静默传递，没有任何环节强制处理"没有分类"的情况。

**状态**: 推迟到 #137（tag system schema redesign）解决。跟踪 issue: #140。

---

## 系统性预防

### Bug 1/2/3：已有正确模式但未遵循（纪律问题）

**根因分析**: 3 个 bug 源于未遵循已建立的 sandbox `PatternFloatingPanelOverlay` 模式。文档和参考实现明确规定了 `createPortal` + `fixed + left/top` + `z-ui` 的正确模式，但初始实现偏离。

**预防措施**:

| 措施                                                          | 作用                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ui-design-checklist` skill 容器选择步骤引导查阅 sandbox 模式 | 设计阶段拦截                                                                 |
| `usePanelDrag` hook 提取为可复用模块                          | 下次直接 import，不重写                                                      |
| `ui-patterns.md` 新增 Floating Panels convention              | 文档化禁止模式（`inset-0 m-auto`、`position: relative` 拖拽、inline render） |

### Bug 4：schema 设计缺陷导致合法代码产生错误结果（架构问题）

**预防措施**:

| 措施                                                    | 作用                           |
| ------------------------------------------------------- | ------------------------------ |
| #137 schema redesign：`category` 为 `NOT NULL` 枚举字段 | 从数据层消灭"无分类资产"的可能 |
| 上传 API 的 category 参数标记为 required                | 编译期强制调用者提供分类       |
| UI 原则：操作需要的上下文缺失时，禁用操作或提示补全     | 在交互层阻断无效路径           |

### 核心教训

> **view state ≠ action context**：当一个"过滤视图"和"操作上下文"共用同一个状态时，过滤视图的合法值（null = 全部）在操作语义下可能是非法的（null = 无分类）。预防方式是在类型层面区分"筛选条件"和"操作参数"，或在 schema 层面让必填字段不可能缺失。
