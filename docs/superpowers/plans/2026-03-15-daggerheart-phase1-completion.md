# Phase 1 补完：插件系统接线 + DaggerHeart 完整角色卡 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标（Goal）：** 补全插件系统的剩余接线点，实现 DaggerHeart FullCharacterSheet，使 GM 能端到端验证 DaggerHeart 模式（切换系统 → 创建角色 → 打开完整角色卡编辑）。

**架构（Architecture）：** 分四个任务：(1) Portal 面板系统（基础设施，无规则系统依赖）；(2) 房间游戏系统切换（GM 设置）；(3) 机械接线任务（实体默认数据 + KonvaToken）；(4) DaggerHeart FullCharacterSheet（主功能）。Task 4 依赖 Task 1 的 Portal 系统；其余任务互相独立。

**技术栈（Tech Stack）：** React 19, zustand v5, Tailwind CSS v4, TypeScript strict, vitest v4, react-konva

---

## 文件结构（File Structure）

**新建（Create）：**
- `src/layout/PluginPanelContainer.tsx` — 基座 Portal 容器，将插件面板渲染到 `document.body`
- `src/rules/usePluginPanels.ts` — 插件内部调用的 hook，用于打开/关闭 plugin 面板
- `server/__tests__/scenarios/rule-system-switch.test.ts` — 规则系统切换集成测试
- `src/rules/__tests__/usePluginPanels.test.ts` — usePluginPanels 单元测试
- `plugins/daggerheart/ui/FullCharacterSheet.tsx` — DaggerHeart 完整角色卡（编辑模式）
- `plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx` — FullCharacterSheet 单元测试

**修改（Modify）：**
- `src/stores/uiStore.ts` — 新增 `ActivePluginPanel` 类型 + 面板状态 + open/close actions
- `src/rules/sdk.ts` — 导出 `usePluginPanels`
- `src/App.tsx` — 挂载 `<PluginPanelContainer>`
- `src/stores/worldStore.ts` — 新增 `setRuleSystem` 动作
- `src/rules/registry.ts` — 新增 `getAvailablePlugins()` 工具函数
- `src/layout/HamburgerMenu.tsx` — GM 专属游戏系统选择器
- `src/dock/CharacterLibraryTab.tsx` — 创建实体时使用插件默认 ruleData
- `src/combat/KonvaToken.tsx` — 使用 `plugin.adapters` 替代 `entityAdapters`
- `src/layout/PortraitBar.tsx` — 可编辑锁定状态改用 `<Card readonly={false} />`
- `plugins/daggerheart/DaggerHeartCard.tsx` — 非只读时显示"打开完整角色卡"按钮
- `plugins/daggerheart/index.ts` — 在 `surfaces.panels` 中注册 FullCharacterSheet

---

## Chunk 1：插件面板 Portal 系统 + 房间系统切换

### Task 1：插件面板 Portal 系统（PluginPanelContainer）

**读取前置文件（先读，再写）：**
- `src/stores/uiStore.ts`（了解现有 state 结构，修改它）
- `src/rules/types.ts`（了解 `PluginPanelDef` / `PluginPanelProps`）
- `src/rules/sdk.ts`（了解当前导出列表）
- `src/App.tsx`（找到 `<PortraitBar>` 附近，在其后挂载 `<PluginPanelContainer>`）

**Files:**
- Modify: `src/stores/uiStore.ts`
- Create: `src/rules/usePluginPanels.ts`
- Create: `src/rules/__tests__/usePluginPanels.test.ts`
- Create: `src/layout/PluginPanelContainer.tsx`
- Modify: `src/rules/sdk.ts`
- Modify: `src/App.tsx`

---

- [ ] **Step 1：为 uiStore 写失败测试**

新建 `src/rules/__tests__/usePluginPanels.test.ts`：

```typescript
// src/rules/__tests__/usePluginPanels.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { usePluginPanels } from '../usePluginPanels'
import { useUiStore } from '../../stores/uiStore'

beforeEach(() => {
  useUiStore.setState({ activePluginPanels: [] } as never)
})

describe('usePluginPanels', () => {
  it('openPanel adds panel to active list', () => {
    const { result } = renderHook(() => usePluginPanels())
    act(() => result.current.openPanel('dh-full-sheet', 'entity-1'))
    expect(useUiStore.getState().activePluginPanels).toEqual([
      { panelId: 'dh-full-sheet', entityId: 'entity-1' },
    ])
  })

  it('openPanel with same panelId replaces instead of duplicating', () => {
    const { result } = renderHook(() => usePluginPanels())
    act(() => result.current.openPanel('dh-full-sheet', 'entity-1'))
    act(() => result.current.openPanel('dh-full-sheet', 'entity-2'))
    expect(useUiStore.getState().activePluginPanels).toHaveLength(1)
    expect(useUiStore.getState().activePluginPanels[0].entityId).toBe('entity-2')
  })

  it('closePanel removes panel from active list', () => {
    useUiStore.setState({
      activePluginPanels: [{ panelId: 'dh-full-sheet', entityId: 'e1' }],
    } as never)
    const { result } = renderHook(() => usePluginPanels())
    act(() => result.current.closePanel('dh-full-sheet'))
    expect(useUiStore.getState().activePluginPanels).toEqual([])
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test -- src/rules/__tests__/usePluginPanels.test.ts
```

期望失败：`Cannot find module '../usePluginPanels'`

- [ ] **Step 3：在 uiStore 中新增 panel state**

在 `src/stores/uiStore.ts` 中：

在文件顶部类型定义部分新增：
```typescript
export interface ActivePluginPanel {
  panelId: string
  entityId?: string
}
```

在 `UiState` interface 新增（在 `gmSidebarCollapsed` 之后）：
```typescript
  // Plugin panel portal
  activePluginPanels: ActivePluginPanel[]
  openPluginPanel: (panelId: string, entityId?: string) => void
  closePluginPanel: (panelId: string) => void
```

在 `useUiStore` 的 create 函数初始值中新增：
```typescript
  activePluginPanels: [],
  openPluginPanel: (panelId, entityId) =>
    set((s) => ({
      activePluginPanels: [
        ...s.activePluginPanels.filter((p) => p.panelId !== panelId),
        { panelId, entityId },
      ],
    })),
  closePluginPanel: (panelId) =>
    set((s) => ({
      activePluginPanels: s.activePluginPanels.filter((p) => p.panelId !== panelId),
    })),
```

- [ ] **Step 4：创建 usePluginPanels hook**

新建 `src/rules/usePluginPanels.ts`：

```typescript
// src/rules/usePluginPanels.ts
import { useUiStore } from '../stores/uiStore'

export function usePluginPanels() {
  const openPanel = useUiStore((s) => s.openPluginPanel)
  const closePanel = useUiStore((s) => s.closePluginPanel)
  return { openPanel, closePanel }
}
```

- [ ] **Step 5：运行测试，确认通过**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test -- src/rules/__tests__/usePluginPanels.test.ts
```

期望：3/3 tests pass

- [ ] **Step 6：创建 PluginPanelContainer**

新建 `src/layout/PluginPanelContainer.tsx`：

```typescript
// src/layout/PluginPanelContainer.tsx
import { createPortal } from 'react-dom'
import type { Entity } from '../shared/entityTypes'
import { useUiStore } from '../stores/uiStore'
import { useRulePlugin } from '../rules/useRulePlugin'
import { useWorldStore } from '../stores/worldStore'

export function PluginPanelContainer() {
  const activePanels = useUiStore((s) => s.activePluginPanels)
  const closePluginPanel = useUiStore((s) => s.closePluginPanel)
  const plugin = useRulePlugin()
  const entities = useWorldStore((s) => s.entities)
  const updateEntity = useWorldStore((s) => s.updateEntity)

  const panelDefs = plugin.surfaces?.panels ?? []

  const handleUpdateEntity = (id: string, patch: Partial<Entity>) => {
    updateEntity(id, patch)
  }

  // onCreateEntity is used by preset-import features (e.g. DHLibraryTab) — not yet implemented.
  // Portal layer does not own entity construction logic; stub satisfies the PluginPanelProps contract.
  const handleCreateEntity = (_data: Partial<Entity>): void => {}

  if (activePanels.length === 0) return null

  return createPortal(
    <>
      {activePanels.map((activePanel) => {
        const def = panelDefs.find((p) => p.id === activePanel.panelId)
        if (!def) return null

        const entity = activePanel.entityId ? entities[activePanel.entityId] : undefined
        const Component = def.component
        const onClose = () => closePluginPanel(activePanel.panelId)

        if (def.placement === 'fullscreen-overlay') {
          return (
            <div
              key={activePanel.panelId}
              className="fixed inset-0 z-modal flex items-start justify-center overflow-y-auto"
            >
              {/* Backdrop */}
              <div className="fixed inset-0 bg-black/70" onClick={onClose} />
              {/* Panel */}
              <div className="relative z-[1] w-full max-w-3xl my-8 mx-4">
                <Component
                  entity={entity}
                  onClose={onClose}
                  onUpdateEntity={handleUpdateEntity}
                  onCreateEntity={handleCreateEntity}
                />
              </div>
            </div>
          )
        }

        // floating placement
        return (
          <div
            key={activePanel.panelId}
            className="fixed inset-0 z-overlay flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto">
              <Component
                entity={entity}
                onClose={onClose}
                onUpdateEntity={handleUpdateEntity}
                onCreateEntity={handleCreateEntity}
              />
            </div>
          </div>
        )
      })}
    </>,
    document.body,
  )
}
```

- [ ] **Step 7：在 sdk.ts 导出 usePluginPanels**

在 `src/rules/sdk.ts` 中，在工具 hook 导出区：
1. 新增一行：
```typescript
export { usePluginPanels } from './usePluginPanels'
```
2. 删除已过期的注释行（如存在）：
```typescript
// usePluginPanels will be added when surfaces/panels system is implemented
```

- [ ] **Step 8：在 App.tsx 挂载 PluginPanelContainer**

在 `src/App.tsx` 中：
1. 新增 import：`import { PluginPanelContainer } from './layout/PluginPanelContainer'`
2. 在 `RoomSession` 渲染的 JSX 中，在 `</ToastProvider>` 结束标签之前，紧接 `<PortraitBar>` 后面（或 ChatPanel 之后）添加：

```tsx
{/* Plugin panel portal — renders active plugin panels at high z-index */}
<PluginPanelContainer />
```

- [ ] **Step 9：运行全部测试**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test
```

期望：全部测试通过，0 ESLint 错误

- [ ] **Step 10：Commit**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && git add src/stores/uiStore.ts src/rules/usePluginPanels.ts src/rules/__tests__/usePluginPanels.test.ts src/layout/PluginPanelContainer.tsx src/rules/sdk.ts src/App.tsx && git commit -m "feat: plugin panel portal system (PluginPanelContainer + usePluginPanels)"
```

---

### Task 2：房间游戏系统切换

**读取前置文件（先读，再写）：**
- `src/stores/worldStore.ts`（了解 `setActiveScene` 模式，在其旁边添加 `setRuleSystem`）
- `src/rules/registry.ts`（添加 `getAvailablePlugins()` 工具函数）
- `src/layout/HamburgerMenu.tsx`（了解现有 props 结构，添加 GM 系统选择器）
- `server/routes/state.ts`（确认 `ruleSystemId` 已在 PATCH handler 中处理，无需修改）

**Files:**
- Modify: `src/stores/worldStore.ts`
- Modify: `src/rules/registry.ts`
- Modify: `src/layout/HamburgerMenu.tsx`
- Create: `server/__tests__/scenarios/rule-system-switch.test.ts`

---

- [ ] **Step 1：写集成测试（失败）**

新建 `server/__tests__/scenarios/rule-system-switch.test.ts`：

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, waitForSocketEvent, type TestContext } from '../helpers/test-server'

describe('rule system switch', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await setupTestRoom('rule-system-test')
  })
  afterAll(() => ctx.cleanup())

  it('defaults to generic on room creation', async () => {
    const res = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect(res.status).toBe(200)
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('generic')
  })

  it('PATCH ruleSystemId updates DB and emits socket event', async () => {
    const eventPromise = waitForSocketEvent<{ ruleSystemId: string }>(
      ctx.socket,
      'room:state:updated',
    )

    const res = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, {
      ruleSystemId: 'daggerheart',
    })
    expect(res.status).toBe(200)
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('daggerheart')

    const event = await eventPromise
    expect(event.ruleSystemId).toBe('daggerheart')
  })

  it('persists across GET after PATCH', async () => {
    const res = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('daggerheart')
  })

  it('can switch back to generic', async () => {
    const res = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, {
      ruleSystemId: 'generic',
    })
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('generic')
  })
})
```

- [ ] **Step 2：运行测试，确认结果**

```bash
npm test -- server/__tests__/scenarios/rule-system-switch.test.ts
```

期望：前 2 个测试（defaults to generic, PATCH + socket）应通过（server 路由已存在）；后 2 个是确认性测试也应通过。如果全通过，继续；如有失败，先排查路由问题。

- [ ] **Step 3：在 worldStore 新增 setRuleSystem**

在 `src/stores/worldStore.ts` 的 `WorldState` interface 中，在 `setActiveScene` 之后新增：
```typescript
  setRuleSystem: (id: string) => Promise<void>
```

在实现部分（`setActiveScene` 实现旁边）新增：
```typescript
  setRuleSystem: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/state`, { ruleSystemId: id })
    // No local update needed — 'room:state:updated' socket event handles it
  },
```

- [ ] **Step 4：在 registry.ts 新增 getAvailablePlugins**

在 `src/rules/registry.ts` 中，在 `getRulePlugin` 函数之后新增：

```typescript
export function getAvailablePlugins(): Array<{ id: string; name: string }> {
  return Array.from(registry.entries()).map(([id, p]) => ({ id, name: p.name }))
}
```

- [ ] **Step 5：修改 HamburgerMenu 添加游戏系统选择器**

在 `src/layout/HamburgerMenu.tsx` 中：

1. 修改文件顶部 React import，添加 `useMemo`（当前为 `useState, useEffect, useRef`）：
```typescript
import { useState, useEffect, useRef, useMemo } from 'react'
```

2. 新增 imports：
```typescript
import { useWorldStore } from '../stores/worldStore'
import { getAvailablePlugins } from '../rules/registry'
```

2. 在 `HamburgerMenu` 组件体内，`const [open, setOpen]` 之后新增 hooks（注意：`getAvailablePlugins()` 返回新数组，必须用 `useMemo` 包裹以避免每次渲染重新分配）：
```typescript
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  const setRuleSystem = useWorldStore((s) => s.setRuleSystem)
  const availablePlugins = useMemo(() => getAvailablePlugins(), [])
  const isGM = mySeat.role === 'GM'
```
（在文件顶部确保 `useMemo` 已从 `'react'` 中导入）

3. 在 `ThemeToggle` 之后、`Leave Seat` 按钮之前，新增 GM 专属系统选择器区块：

```tsx
{isGM && (
  <>
    <div className="h-px bg-border-glass mx-2 my-0.5" />
    <div className="px-3 py-2">
      <div className="text-[10px] text-text-muted/40 uppercase tracking-wider mb-1.5">
        游戏系统
      </div>
      <div className="flex flex-col gap-0.5">
        {availablePlugins.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setRuleSystem(p.id)
              setOpen(false)
            }}
            className={`w-full px-2.5 py-1.5 rounded-md text-xs text-left transition-colors duration-fast ${
              ruleSystemId === p.id
                ? 'bg-accent/20 text-accent font-semibold'
                : 'text-text-muted hover:bg-hover hover:text-text-primary'
            }`}
          >
            {p.name}
            {ruleSystemId === p.id && (
              <span className="ml-1 text-[10px] opacity-60">（当前）</span>
            )}
          </button>
        ))}
      </div>
    </div>
  </>
)}
```

- [ ] **Step 6：运行全部测试**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test
```

期望：全部测试通过

- [ ] **Step 7：Commit**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && git add src/stores/worldStore.ts src/rules/registry.ts src/layout/HamburgerMenu.tsx server/__tests__/scenarios/rule-system-switch.test.ts && git commit -m "feat: room rule system switch — worldStore.setRuleSystem + HamburgerMenu picker"
```

---

## Chunk 2：机械接线任务 + DaggerHeart 完整角色卡

### Task 3：机械接线任务（实体默认数据 + KonvaToken 适配器）

**读取前置文件（先读，再写）：**
- `src/dock/CharacterLibraryTab.tsx`（找到 `handleCreate`，约第 41-59 行）
- `src/combat/KonvaToken.tsx`（找到 `getEntityResources` / `getEntityStatuses` 调用，约第 55-60 行）

**Files:**
- Modify: `src/dock/CharacterLibraryTab.tsx`
- Modify: `src/combat/KonvaToken.tsx`
- Modify: `src/layout/PortraitBar.tsx`（portrait ring 和 status dot 也走 plugin adapters）

这三个改动是机械性接线，不需要新增测试（被现有测试覆盖）。

---

- [ ] **Step 1：CharacterLibraryTab — 使用插件默认数据**

在 `src/dock/CharacterLibraryTab.tsx` 中：

1. 在现有 imports 之后新增：
```typescript
import { useRulePlugin } from '../rules/useRulePlugin'
```

2. 在组件体内，现有 hooks 之后新增：
```typescript
  const plugin = useRulePlugin()
```

3. 修改 `handleCreate` 中的 `ruleData: null` 为：
```typescript
      ruleData: plugin.dataTemplates?.createDefaultEntityData() ?? null,
```

- [ ] **Step 2：KonvaToken — 使用 plugin adapters**

在 `src/combat/KonvaToken.tsx` 中：

1. 删除 import（如果不再使用则删除整行）：
```typescript
import { getEntityResources, getEntityStatuses } from '../shared/entityAdapters'
```
改为：
```typescript
import { useRulePlugin } from '../rules/useRulePlugin'
```

2. 在 `KonvaToken` 组件体内，`const rawColor` 之前新增：
```typescript
  const plugin = useRulePlugin()
```

3. 替换 `resources` / `mainResource` / `hasHp` / `hpPct` 四行（约第 55-58 行）：

原来：
```typescript
  const resources = getEntityResources(entity)
  const mainResource = resources[0]
  const hasHp = mainResource !== undefined && mainResource.max > 0
  const hpPct = hasHp ? Math.min(mainResource.current / mainResource.max, 1) : 0
```

替换为：
```typescript
  const mainResource = entity ? plugin.adapters.getMainResource(entity) : null
  const hasHp = mainResource !== null && mainResource.max > 0
  const hpPct = hasHp ? Math.min(mainResource.current / mainResource.max, 1) : 0
```

4. 替换 `getEntityStatuses` 调用（约第 60 行）：

原来：
```typescript
  const statuses = getEntityStatuses(entity)
```

替换为：
```typescript
  const statuses = entity ? plugin.adapters.getStatuses(entity) : []
```

5. 如果 `entityAdapters` 在此文件中不再有其他引用，import 行已经替换完毕。

- [ ] **Step 3：PortraitBar — 使用 plugin adapters 替代 entityAdapters**

在 `src/layout/PortraitBar.tsx` 中：

先读取该文件，找到 `getEntityResources` 和 `getEntityStatuses` 的调用位置（用于 portrait ring 渲染和 status dot）。

1. 新增 import：
```typescript
import { useRulePlugin } from '../rules/useRulePlugin'
```

2. 在组件体内（所有其他 hooks 之后，任何 early return 之前）新增：
```typescript
  const plugin = useRulePlugin()
```

3. 将所有 `getEntityResources(someEntity)` 替换为 `plugin.adapters.getPortraitResources(someEntity)`（注意：portrait bar 用 `getPortraitResources`，返回多条资源用于显示多个圆环）

4. 将所有 `getEntityStatuses(someEntity)` 替换为 `plugin.adapters.getStatuses(someEntity)`

5. 如果 `getEntityResources` 和 `getEntityStatuses` 在整个文件中不再被引用，删除 `entityAdapters` import（**注意**：`CharacterEditPanel` 的 import 也可能需要同步检查，见 Task 4 Step 7）

- [ ] **Step 4：运行全部测试**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test
```

期望：全部测试通过，0 ESLint 错误（TypeScript strict 模式下需确认 `entity` null-check 无报错）

- [ ] **Step 5：Commit**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && git add src/dock/CharacterLibraryTab.tsx src/combat/KonvaToken.tsx src/layout/PortraitBar.tsx && git commit -m "feat: wire plugin adapters — entity default data + KonvaToken + PortraitBar"
```

---

### Task 4：DaggerHeart 完整角色卡（FullCharacterSheet）

**读取前置文件（先读，再写）：**
- `plugins/daggerheart/types.ts`（了解 `DHRuleData` 字段结构）
- `plugins/daggerheart/DaggerHeartCard.tsx`（了解现有只读卡片结构）
- `plugins/daggerheart/index.ts`（了解 surfaces 注册方式）
- `src/layout/PortraitBar.tsx`（找到可编辑锁定状态分支，约第 490-510 行，改为 `<Card readonly={false} />`）
- `src/rules/types.ts`（确认 `PluginPanelProps` 接口）

**Files:**
- Create: `plugins/daggerheart/ui/FullCharacterSheet.tsx`
- Create: `plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx`
- Modify: `plugins/daggerheart/DaggerHeartCard.tsx`
- Modify: `plugins/daggerheart/index.ts`
- Modify: `src/layout/PortraitBar.tsx`

---

- [ ] **Step 1：写 FullCharacterSheet 失败测试**

新建 `plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx`：

```typescript
// plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FullCharacterSheet } from '../ui/FullCharacterSheet'
import type { Entity } from '@myvtt/sdk'

const mockEntity: Entity = {
  id: 'e1',
  name: '测试角色',
  imageUrl: '',
  color: '#3b82f6',
  width: 1,
  height: 1,
  notes: '',
  lifecycle: 'persistent',
  permissions: { default: 'none', seats: {} },
  ruleData: {
    agility: 2,
    strength: 1,
    finesse: 0,
    instinct: 1,
    presence: 2,
    knowledge: -1,
    tier: 1,
    proficiency: 3,
    className: '盗贼',
    ancestry: '人类',
    // hp.current = 17 — unique value so getByDisplayValue('17') is unambiguous
    hp: { current: 17, max: 20 },
    stress: { current: 1, max: 6 },
    hope: 2,
    armor: 2,
  },
}

describe('FullCharacterSheet', () => {
  it('renders entity name', () => {
    render(
      <FullCharacterSheet
        entity={mockEntity}
        onClose={vi.fn()}
        onUpdateEntity={vi.fn()}
        onCreateEntity={vi.fn()}
      />,
    )
    expect(screen.getByText('测试角色')).toBeTruthy()
  })

  it('calls onUpdateEntity with ruleData patch when HP current changes', () => {
    const onUpdateEntity = vi.fn()
    render(
      <FullCharacterSheet
        entity={mockEntity}
        onClose={vi.fn()}
        onUpdateEntity={onUpdateEntity}
        onCreateEntity={vi.fn()}
      />,
    )
    // ResourceField uses an uncontrolled input (defaultValue).
    // Must fireEvent.change first to set the DOM value, then fireEvent.blur to trigger the handler.
    // hp.current = 17 is a unique value in the fixture — getByDisplayValue is unambiguous.
    const hpCurrentInput = screen.getByDisplayValue('17')
    fireEvent.change(hpCurrentInput, { target: { value: '15' } })
    fireEvent.blur(hpCurrentInput)
    // Should call with patched hp
    expect(onUpdateEntity).toHaveBeenCalledWith('e1', {
      ruleData: expect.objectContaining({ hp: { current: 15, max: 20 } }),
    })
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FullCharacterSheet
        entity={mockEntity}
        onClose={onClose}
        onUpdateEntity={vi.fn()}
        onCreateEntity={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /关闭|close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test -- plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx
```

期望失败：`Cannot find module '../ui/FullCharacterSheet'`

- [ ] **Step 3：创建 FullCharacterSheet 组件**

新建 `plugins/daggerheart/ui/FullCharacterSheet.tsx`：

```typescript
// plugins/daggerheart/ui/FullCharacterSheet.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { PluginPanelProps } from '@myvtt/sdk'
import type { DHRuleData } from '../types'

const ATTRS = [
  { key: 'agility', label: '敏捷' },
  { key: 'strength', label: '力量' },
  { key: 'finesse', label: '精巧' },
  { key: 'instinct', label: '本能' },
  { key: 'presence', label: '临场' },
  { key: 'knowledge', label: '知识' },
] as const

type AttrKey = (typeof ATTRS)[number]['key']

export function FullCharacterSheet({ entity, onClose, onUpdateEntity }: PluginPanelProps) {
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState(entity?.name ?? '')

  if (!entity) {
    return (
      <div className="bg-glass backdrop-blur-[16px] rounded-2xl border border-border-glass p-8 text-text-muted text-center">
        无角色数据
      </div>
    )
  }

  const d = (entity.ruleData ?? {}) as Partial<DHRuleData>

  const updateDH = (patch: Partial<DHRuleData>) => {
    const current = (entity.ruleData ?? {}) as DHRuleData
    onUpdateEntity(entity.id, { ruleData: { ...current, ...patch } })
  }

  const updateHP = (patch: Partial<DHRuleData['hp']>) => {
    const cur = d.hp ?? { current: 0, max: 0 }
    updateDH({ hp: { ...cur, ...patch } })
  }

  const updateStress = (patch: Partial<DHRuleData['stress']>) => {
    const cur = d.stress ?? { current: 0, max: 0 }
    updateDH({ stress: { ...cur, ...patch } })
  }

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== entity.name) {
      onUpdateEntity(entity.id, { name: trimmed })
    }
    setEditingName(false)
  }

  return (
    <div className="bg-glass backdrop-blur-[20px] rounded-2xl border border-border-glass shadow-[0_24px_64px_rgba(0,0,0,0.5)] font-sans text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-glass">
        <div className="flex items-center gap-3">
          {entity.imageUrl ? (
            <img
              src={entity.imageUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
              style={{ border: `2px solid ${entity.color}` }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold"
              style={{ background: entity.color }}
            >
              {entity.name.charAt(0).toUpperCase()}
            </div>
          )}
          {editingName ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') {
                  setEditingName(false)
                  setEditName(entity.name)
                }
              }}
              className="px-2 py-0.5 border border-border-glass rounded-md text-lg font-bold bg-surface text-white outline-none"
            />
          ) : (
            <span
              className="text-lg font-bold cursor-text hover:opacity-80"
              onClick={() => {
                setEditName(entity.name)
                setEditingName(true)
              }}
            >
              {entity.name}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="p-1.5 rounded-lg text-text-muted hover:bg-hover hover:text-text-primary transition-colors duration-fast"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 grid grid-cols-2 gap-6">
        {/* Left: Identity + Attributes */}
        <div className="flex flex-col gap-5">
          {/* Identity */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              身份
            </div>
            <div className="grid grid-cols-2 gap-2">
              <IdentityField
                label="职业"
                value={d.className ?? ''}
                onChange={(v) => updateDH({ className: v })}
              />
              <IdentityField
                label="血统"
                value={d.ancestry ?? ''}
                onChange={(v) => updateDH({ ancestry: v })}
              />
            </div>
          </div>

          {/* Tier + Proficiency */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              成长
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted/40 block mb-1">等级</label>
                <div className="flex gap-1">
                  {([1, 2, 3, 4] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateDH({ tier: t })}
                      className={`flex-1 py-1 rounded text-xs font-bold transition-colors duration-fast ${
                        (d.tier ?? 1) === t
                          ? 'bg-accent text-white'
                          : 'bg-black/20 text-text-muted/50 hover:bg-black/40'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <NumberField
                label="熟练值"
                value={d.proficiency ?? 1}
                min={1}
                max={6}
                onChange={(v) => updateDH({ proficiency: v })}
              />
            </div>
          </div>

          {/* Six Attributes */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              核心属性
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ATTRS.map(({ key, label }) => (
                <AttrField
                  key={key}
                  label={label}
                  value={(d[key as AttrKey] as number) ?? 0}
                  onChange={(v) => updateDH({ [key]: v } as Partial<DHRuleData>)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Resources */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              资源
            </div>
            <div className="flex flex-col gap-3">
              <ResourceField
                label="生命值 HP"
                color="#ef4444"
                current={d.hp?.current ?? 0}
                max={d.hp?.max ?? 0}
                onCurrentChange={(v) => updateHP({ current: v })}
                onMaxChange={(v) => updateHP({ max: v })}
              />
              <ResourceField
                label="压力 Stress"
                color="#f97316"
                current={d.stress?.current ?? 0}
                max={d.stress?.max ?? 0}
                onCurrentChange={(v) => updateStress({ current: v })}
                onMaxChange={(v) => updateStress({ max: v })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="希望 Hope"
                  value={d.hope ?? 0}
                  min={0}
                  max={99}
                  onChange={(v) => updateDH({ hope: v })}
                />
                <NumberField
                  label="护甲 Armor"
                  value={d.armor ?? 0}
                  min={0}
                  max={6}
                  onChange={(v) => updateDH({ armor: v })}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50 mb-2">
              备注
            </div>
            <textarea
              value={entity.notes}
              onChange={(e) => onUpdateEntity(entity.id, { notes: e.target.value })}
              placeholder="角色背景、笔记..."
              rows={6}
              className="w-full px-3 py-2 bg-black/20 border border-border-glass rounded-lg text-sm text-text-primary placeholder:text-text-muted/25 outline-none resize-none focus:border-accent/50 transition-colors duration-fast"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IdentityField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted/40 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="w-full px-2 py-1 bg-black/20 border border-border-glass rounded text-xs text-text-primary outline-none focus:border-accent/50 transition-colors duration-fast"
      />
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted/40 block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value)
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
        }}
        className="w-full px-2 py-1 bg-black/20 border border-border-glass rounded text-sm font-bold text-text-primary outline-none focus:border-accent/50 transition-colors duration-fast text-center"
      />
    </div>
  )
}

function AttrField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center bg-black/20 rounded-lg py-2 px-1 border border-border-glass/50">
      <span className="text-[9px] text-text-muted/50 uppercase mb-1">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(value - 1)}
          className="w-5 h-5 flex items-center justify-center text-text-muted/40 hover:text-danger transition-colors duration-fast text-xs"
        >
          −
        </button>
        <span className="text-base font-bold text-text-primary min-w-[24px] text-center">
          {value >= 0 ? '+' : ''}
          {value}
        </span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-5 h-5 flex items-center justify-center text-text-muted/40 hover:text-success transition-colors duration-fast text-xs"
        >
          ＋
        </button>
      </div>
    </div>
  )
}

function ResourceField({
  label,
  color,
  current,
  max,
  onCurrentChange,
  onMaxChange,
}: {
  label: string
  color: string
  current: number
  max: number
  onCurrentChange: (v: number) => void
  onMaxChange: (v: number) => void
}) {
  const pct = max > 0 ? Math.min(current / max, 1) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold" style={{ color }}>
          {label}
        </span>
        <div className="flex items-center gap-1 text-xs">
          <input
            key={`cur-${current}`}
            defaultValue={current}
            onBlur={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v)) onCurrentChange(Math.max(0, Math.min(v, max)))
              else e.target.value = String(current)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-8 text-center bg-black/30 border border-border-glass rounded text-text-primary font-bold outline-none focus:border-accent/50 py-0.5"
          />
          <span className="text-text-muted/30">/</span>
          <input
            key={`max-${max}`}
            defaultValue={max}
            onBlur={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v) && v > 0) onMaxChange(v)
              else e.target.value = String(max)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-8 text-center bg-black/30 border border-border-glass rounded text-text-muted font-bold outline-none focus:border-accent/50 py-0.5"
          />
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test -- plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx
```

期望：3/3 tests pass

- [ ] **Step 5：在 DaggerHeartCard 中新增"打开完整角色卡"按钮**

在 `plugins/daggerheart/DaggerHeartCard.tsx` 中：

1. 新增 import：
```typescript
import { usePluginPanels } from '@myvtt/sdk'
```

2. 修改函数签名，解构 `readonly` 和 `entity`：
```typescript
export function DaggerHeartCard({ entity, readonly }: EntityCardProps) {
```
（原来只有 `{ entity }`，在 `EntityCardProps` 中 `readonly?: boolean` 已存在）

3. 在组件体内，`const d = ...` 之后新增：
```typescript
  const { openPanel } = usePluginPanels()
```

4. 在 JSX 的最外层 `div` 内，`{d && (...)}` 之后，新增：
```tsx
{!readonly && (
  <button
    onClick={() => openPanel('dh-full-sheet', entity.id)}
    className="mt-2 w-full py-1.5 text-[11px] text-text-muted/50 bg-black/20 hover:bg-black/40 rounded-md transition-colors duration-fast"
  >
    完整角色卡 →
  </button>
)}
```

- [ ] **Step 6：在 daggerheart/index.ts 中注册 FullCharacterSheet**

在 `plugins/daggerheart/index.ts` 中：

1. 新增 import：
```typescript
import { FullCharacterSheet } from './ui/FullCharacterSheet'
```

2. 修改 `surfaces` 字段，新增 `panels`：
```typescript
  surfaces: {
    panels: [
      {
        id: 'dh-full-sheet',
        component: FullCharacterSheet,
        placement: 'fullscreen-overlay' as const,
      },
    ],
    rollCardRenderers: {
      'daggerheart:dd': DHRollCard,
    },
  },
```

- [ ] **Step 7：修改 PortraitBar 可编辑分支**

在 `src/layout/PortraitBar.tsx` 中，找到可编辑锁定状态的分支（在 `isLocked` 条件内，`isEditable` 为 true 的分支）。

**找到这段代码**（搜索 `CharacterEditPanel`）：
```tsx
isEditable ? (
  // Plugin's FullCharacterSheet will replace this when surfaces/panels land.
  <CharacterEditPanel
    character={popoverEntity}
    onUpdateCharacter={onUpdateEntity}
    onClose={() => onInspectCharacter(null)}
  />
) : (
```

**替换为：**
```tsx
isEditable ? (
  // Plugin handles editing — DH uses DaggerHeartCard + openPanel('dh-full-sheet')
  // Generic plugin uses CharacterEditPanel wrapped in GenericEntityCard
  <Card
    entity={popoverEntity}
    onUpdate={(patch) => onUpdateEntity(popoverEntity.id, patch)}
    readonly={false}
  />
) : (
```

同时，检查文件顶部的 imports：
- `import { CharacterEditPanel }` — 此修改后不再被引用，**删除**
- `import { getEntityResources, getEntityStatuses }` — 已在 Task 3 Step 3 被 plugin adapters 替换，**确认已删除**（Task 3 已处理）

- [ ] **Step 8：运行全部测试**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && npm test
```

期望：全部测试通过，0 ESLint 错误

- [ ] **Step 9：Commit**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/feat/daggerheart-plugin && git add plugins/daggerheart/ui/FullCharacterSheet.tsx plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx plugins/daggerheart/DaggerHeartCard.tsx plugins/daggerheart/index.ts src/layout/PortraitBar.tsx && git commit -m "feat: DaggerHeart FullCharacterSheet — full character editor with plugin panel portal"
```

---

## 验收流程（Acceptance）

完成所有 Task 后，GM 可以端到端验证：

1. 打开 HamburgerMenu → 选择「Daggerheart」→ 房间切换到 DH 模式
2. GM Dock → 角色库 → 新建角色 → `ruleData` 自动填充 DH 默认值（全 0）
3. PortraitBar 人像出现 → 点击锁定 → 显示 `DaggerHeartCard`（HP/压力/希望/六维）
4. 点击「完整角色卡 →」→ FullCharacterSheet 以全屏覆盖打开
5. 编辑属性/HP/备注 → 实时持久化到服务器
6. 战斗地图上的 Token HP 血条通过 DH adapter 显示（HP 从 `ruleData.hp` 读取）
