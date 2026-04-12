---
status: draft
scope: PlayerBottomPanel 设计审查修复 — 收起高度、展开截断、z-index 冲突
estimated_tasks: 4
---

# PlayerBottomPanel 设计审查与修复

## 背景

通过 Playwright 对玩家底部面板进行视觉审查，发现以下问题：

### 问题 1: 收起状态高度太低 ⚠️ 严重

- **现状**: 收起高度 28px，展开按钮仅 16×16px / `text-[7px]` / `text-white/25`
- **实测**: Playwright 点击展开按钮超时，被 chat-toggle 和 resource `−` 按钮拦截
- **根因**: 28px 过矮，展开按钮太小且默认对比度极低，易与其他 UI 元素重叠

### 问题 2: 展开状态资源面板被截断 ⚠️ 严重

- **现状**: `EXPANDED_SIZE = { height: 188 }`，外层 `overflow-hidden`
- **实测**: HP/Stress/Hope/Armor 资源卡片只露出顶部标签，数值和进度条被裁剪
- **根因**: 内容实际高度 ~198px (collapse btn 20 + tabs 32 + tab content 80 + divider 1 + resource 65)，超出 188px 容器

### 问题 3: 展开按钮与聊天区域 z-index 冲突 🟡 中等

- **现状**: 收起态面板被聊天输入栏的元素遮挡
- **Playwright 日志**: `chat-toggle` 和 resource `−` 按钮 intercepts pointer events

### 问题 4: 收起态 hover 资源按钮误触展开按钮 🟢 低

- **现状**: ResourceItem 的 ±按钮 `hidden group-hover:flex`，hover 出现后挡住展开按钮
- **缓解**: 增大收起态高度后自然缓解

### 附注: i18n key 未翻译（不在本次范围）

- 截图可见 `fear.label`、`input_placeholder` 等原始 key

## 任务

### Task 1: 更新尺寸常量与 Region 注册

**文件:**

- 修改: `plugins/daggerheart-core/ui/PlayerBottomPanel.tsx`
- 修改: `plugins/daggerheart-core/index.ts`

- [ ] **Step 1: 更新 PlayerBottomPanel 尺寸常量**

`plugins/daggerheart-core/ui/PlayerBottomPanel.tsx:33-34`:

```ts
// Before
const COLLAPSED_SIZE = { width: 480, height: 28 }
const EXPANDED_SIZE = { width: 480, height: 188 }

// After
const COLLAPSED_SIZE = { width: 480, height: 36 }
const EXPANDED_SIZE = { width: 480, height: 220 }
```

- [ ] **Step 2: 更新 Region 注册的 defaultSize 和 minSize**

`plugins/daggerheart-core/index.ts` (registerRegion 调用):

```ts
// Before
defaultSize: { width: 480, height: 28 },
minSize: { width: 400, height: 28 },

// After
defaultSize: { width: 480, height: 36 },
minSize: { width: 400, height: 36 },
```

### Task 2: 增大收起态 CollapsedBar

**文件:**

- 修改: `plugins/daggerheart-core/ui/bottom/CollapsedBar.tsx`

- [ ] **Step 1: 增大 bar 高度**

Line 69: `h-7` → `h-9` (28px → 36px)

- [ ] **Step 2: 增大展开按钮尺寸与对比度**

Lines 125-132:

```tsx
// Before
className = 'w-4 h-4 flex items-center justify-center text-[7px] text-white/25 ...'

// After
className = 'w-5 h-5 flex items-center justify-center text-[9px] text-white/40 ...'
```

### Task 3: 更新测试断言

**文件:**

- 修改: `plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx`

- [ ] **Step 1: 更新所有尺寸断言**
- `height: 28` → `height: 36`
- `height: 188` → `height: 220`

### Task 4: 验证

- [ ] **Step 1: 单元测试**

```bash
npx vitest run plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc -b
```

- [ ] **Step 3: Playwright 视觉验证**
- 进入 Daggerheart 房间，以 PL 加入
- 截图收起态：确认高度合理、展开按钮可见
- Playwright 点击展开按钮（无需 JS hack，应能直接点击）
- 截图展开态：确认 4 个资源卡片完整可见

- [ ] **Step 4: E2E 测试**

```bash
npx playwright test e2e/scenarios/daggerheart-player-bottom-panel.spec.ts
```
