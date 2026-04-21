# Daggerheart UI 区域实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设计文档 `docs/design/24-Daggerheart插件UI布局设计.md` 中的 5 个 UI 面板（Fear 追踪器、角色卡、在场角色列表、聊天面板、底部头像）实现为插件注册的 Region，替换遗留的硬编码面板组件。

**Architecture:** 所有 UI 面板通过 `sdk.ui.registerRegion()` 注册为 persistent region，由 `RegionRenderer` 统一渲染。组件使用 `sdk.data.useEntity()` / `sdk.data.useComponent()` 订阅数据。新增 `useActiveEntityId()` hook 让 region 获取当前座位的活跃角色。拆分小型子组件（AttributeGrid, ResourceBars 等）保持文件聚焦。

**Tech Stack:** React 19, Tailwind CSS v4 (bg-glass/text-primary/border-glass tokens), SVG for bottom avatar, zustand selectors, @myvtt/sdk hooks

**Design spec:** `docs/design/24-Daggerheart插件UI布局设计.md`
**Mockups:** `nimbalyst-local/mockups/daggerheart-*.mockup.html`

---

## File Structure

### New files

| File                                                                      | Responsibility                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `plugins/daggerheart-core/ui/DHCharacterCard.tsx`                         | 角色卡 region 组件（左侧 220px，属性+资源+阈值+经历+状态） |
| `plugins/daggerheart-core/ui/DHCharacterList.tsx`                         | 在场角色列表 region 组件（右上 220px）                     |
| `plugins/daggerheart-core/ui/DHBottomAvatar.tsx`                          | 底部头像 region 组件（130×130px，同心环结构）              |
| `plugins/daggerheart-core/ui/components/AttributeGrid.tsx`                | 3×2 属性网格，hover 骰子提示，click 掷骰                   |
| `plugins/daggerheart-core/ui/components/ResourceBars.tsx`                 | HP/Stress 条形 + Armor/Hope 离散点                         |
| `plugins/daggerheart-core/ui/components/ThresholdRow.tsx`                 | 闪避/重伤/严重阈值三格                                     |
| `plugins/daggerheart-core/ui/components/ExperienceList.tsx`               | 经历列表（名称+修正值）                                    |
| `plugins/daggerheart-core/ui/components/StatusTags.tsx`                   | 状态标签（buff/debuff/neutral）                            |
| `plugins/daggerheart-core/ui/components/MiniAvatar.tsx`                   | 迷你头像（SVG 弧形 HP/Stress）                             |
| `plugins/daggerheart-core/ui/components/RuneRing.tsx`                     | SVG 符文环 + Hope 宝石                                     |
| `plugins/daggerheart-core/ui/components/HpStressArcs.tsx`                 | SVG HP/Stress 弧形条                                       |
| `plugins/daggerheart-core/ui/components/ArmorRing.tsx`                    | SVG 护甲板环                                               |
| `plugins/daggerheart-core/__tests__/ui/DHCharacterCard.test.tsx`          | 角色卡 region 测试                                         |
| `plugins/daggerheart-core/__tests__/ui/DHCharacterList.test.tsx`          | 角色列表 region 测试                                       |
| `plugins/daggerheart-core/__tests__/ui/components/AttributeGrid.test.tsx` | 属性网格测试                                               |
| `plugins/daggerheart-core/__tests__/ui/components/ResourceBars.test.tsx`  | 资源条测试                                                 |
| `src/data/hooks.ts`                                                       | 新增 `useActiveEntityId` hook                              |

### Modified files

| File                                        | Change                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `plugins/daggerheart/types.ts`              | 新增 DHExperience, DHThresholds, DHStatuses 类型 + 扩展 DHExtras |
| `plugins/daggerheart/templates.ts`          | 新字段默认值                                                     |
| `plugins/daggerheart/i18n.ts`               | 角色卡/角色列表 UI 字符串                                        |
| `plugins/daggerheart-core/index.ts`         | 注册 4 个 region（redesigned fear + 3 new）                      |
| `plugins/daggerheart-core/ui/FearPanel.tsx` | 重新设计为浮动药丸 + 12 圆点                                     |
| `src/rules/sdk.ts`                          | 导出 `useActiveEntityId`                                         |
| `src/App.tsx`                               | 移除 `MyCharacterCard` 渲染                                      |

### Deleted files

| File                             | Reason                           |
| -------------------------------- | -------------------------------- |
| `src/layout/MyCharacterCard.tsx` | 被 `DHCharacterCard` region 替代 |

---

## Task 1: 扩展 Daggerheart 数据类型

**Files:**

- Modify: `plugins/daggerheart/types.ts`
- Test: `plugins/daggerheart/__tests__/templates.test.ts`

设计文档要求的数据字段中，现有类型缺少：经历（experiences）、防御阈值（thresholds）、状态效果（statuses）、以及 hope/armor 的 max 值。

- [ ] **Step 1: Write the failing test**

在 `plugins/daggerheart/__tests__/templates.test.ts` 添加对新类型字段的测试：

```typescript
import { DH_KEYS } from '../types'
import type { DHExperience, DHThresholds, DHStatuses } from '../types'
import { createDefaultDHEntityData } from '../templates'

describe('new DH component types', () => {
  it('should have experience keys defined', () => {
    expect(DH_KEYS.experiences).toBe('daggerheart:experiences')
    expect(DH_KEYS.thresholds).toBe('daggerheart:thresholds')
    expect(DH_KEYS.statuses).toBe('daggerheart:statuses')
  })

  it('should include new fields in default data', () => {
    const data = createDefaultDHEntityData()
    const exp = data[DH_KEYS.experiences] as DHExperience
    expect(exp.items).toEqual([])
    const thr = data[DH_KEYS.thresholds] as DHThresholds
    expect(thr.evasion).toBe(0)
    expect(thr.majorThreshold).toBe(0)
    expect(thr.severeThreshold).toBe(0)
    const sts = data[DH_KEYS.statuses] as DHStatuses
    expect(sts.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart/__tests__/templates.test.ts`
Expected: FAIL — `DHExperience`, `DHThresholds`, `DHStatuses` not found; `DH_KEYS.experiences` not defined.

- [ ] **Step 3: Implement new types in types.ts**

Add to `plugins/daggerheart/types.ts`:

```typescript
export interface DHExperienceItem {
  name: string
  modifier: number
}

export interface DHExperience {
  items: DHExperienceItem[]
}

export interface DHThresholds {
  evasion: number
  majorThreshold: number
  severeThreshold: number
}

export type StatusKind = 'buff' | 'debuff' | 'neutral'

export interface DHStatusItem {
  name: string
  kind: StatusKind
  /** Remaining rounds, undefined = permanent */
  rounds?: number
}

export interface DHStatuses {
  items: DHStatusItem[]
}
```

Extend `DH_KEYS`:

```typescript
export const DH_KEYS = {
  health: 'daggerheart:health',
  stress: 'daggerheart:stress',
  attributes: 'daggerheart:attributes',
  meta: 'daggerheart:meta',
  extras: 'daggerheart:extras',
  experiences: 'daggerheart:experiences',
  thresholds: 'daggerheart:thresholds',
  statuses: 'daggerheart:statuses',
} as const
```

Extend module augmentation:

```typescript
declare module '../../src/shared/componentTypes' {
  interface ComponentTypeMap {
    'daggerheart:health': DHHealth
    'daggerheart:stress': DHStress
    'daggerheart:attributes': DHAttributes
    'daggerheart:meta': DHMeta
    'daggerheart:extras': DHExtras
    'daggerheart:experiences': DHExperience
    'daggerheart:thresholds': DHThresholds
    'daggerheart:statuses': DHStatuses
  }
}
```

Also extend `DHExtras` with optional max values for hope and armor (optional to avoid breaking existing entities):

```typescript
export interface DHExtras {
  hope: number
  hopeMax?: number
  armor: number
  armorMax?: number
}
```

- [ ] **Step 4: Update templates.ts**

Add defaults for new types in `createDefaultDHEntityData()`:

```typescript
[DH_KEYS.extras]: { hope: 0, hopeMax: 6, armor: 0, armorMax: 4 },
[DH_KEYS.experiences]: { items: [] },
[DH_KEYS.thresholds]: { evasion: 0, majorThreshold: 0, severeThreshold: 0 },
[DH_KEYS.statuses]: { items: [] },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart/__tests__/templates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plugins/daggerheart/types.ts plugins/daggerheart/templates.ts plugins/daggerheart/__tests__/templates.test.ts
git commit -m "feat(daggerheart): add experience, threshold, status types and extend extras with max values"
```

---

## Task 2: 更新 i18n 字符串

**Files:**

- Modify: `plugins/daggerheart/i18n.ts`

角色卡 UI 需要大量双语标签（属性英文全称、资源区标签、阈值标签等）。

- [ ] **Step 1: Add new i18n keys**

在 `plugins/daggerheart/i18n.ts` 的 `zh-CN` 和 `en` sections 添加：

```typescript
// zh-CN additions:
// Character card sections
'card.section.attributes': '属性',
'card.section.resources': '资源',
'card.section.thresholds': '防御阈值',
'card.section.experiences': '经历',
'card.section.statuses': '状态',
'card.title': '角色卡',
'card.collapse': '◀ 收回',

// Attribute English names (for bilingual display)
'attr.agility.en': 'Agility',
'attr.strength.en': 'Strength',
'attr.finesse.en': 'Finesse',
'attr.instinct.en': 'Instinct',
'attr.presence.en': 'Presence',
'attr.knowledge.en': 'Knowledge',

// Resources
'res.hp': '生命',
'res.stress': '压力',
'res.armor': '护甲',
'res.hope': '希望',

// Thresholds
'threshold.evasion': '闪避',
'threshold.major': '重伤',
'threshold.severe': '严重',

// Character list
'charlist.title': '在场角色',
'charlist.enemies': '敌方',

// Fear
'fear.title': 'FEAR',

// en additions (same keys, English values):
'card.section.attributes': 'Attributes',
'card.section.resources': 'Resources',
'card.section.thresholds': 'Thresholds',
'card.section.experiences': 'Experiences',
'card.section.statuses': 'Status',
'card.title': 'Character',
'card.collapse': '◀ Collapse',
'attr.agility.en': 'Agility',
'attr.strength.en': 'Strength',
'attr.finesse.en': 'Finesse',
'attr.instinct.en': 'Instinct',
'attr.presence.en': 'Presence',
'attr.knowledge.en': 'Knowledge',
'res.hp': 'HP',
'res.stress': 'Stress',
'res.armor': 'Armor',
'res.hope': 'Hope',
'threshold.evasion': 'Evasion',
'threshold.major': 'Major',
'threshold.severe': 'Severe',
'charlist.title': 'Characters',
'charlist.enemies': 'Enemies',
'fear.title': 'FEAR',
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart/i18n.ts
git commit -m "feat(daggerheart): add i18n keys for character card, character list, and fear panel"
```

---

## Task 3: 添加 useActiveEntityId hook

**Files:**

- Modify: `src/data/hooks.ts`
- Modify: `src/rules/sdk.ts`
- Test: `src/data/__tests__/hooks.test.ts` (if exists, or create)

Region 组件需要知道当前玩家的活跃角色。现有 SDK 没有提供此 hook。

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/hooks.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// We test the logic by verifying the hook reads from identityStore
describe('useActiveEntityId', () => {
  it('should be exported from @myvtt/sdk', async () => {
    const sdk = await import('../../rules/sdk')
    expect(sdk.useActiveEntityId).toBeDefined()
    expect(typeof sdk.useActiveEntityId).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/hooks.test.ts`
Expected: FAIL — `useActiveEntityId` not found in exports.

- [ ] **Step 3: Implement useActiveEntityId**

Add to `src/data/hooks.ts`:

```typescript
import { useIdentityStore } from '../stores/identityStore'

/**
 * Reactive hook: returns the active entity ID for the current seat.
 * Re-renders only when activeCharacterId changes.
 */
export function useActiveEntityId(): string | undefined {
  return useIdentityStore((s) => {
    const mySeatId = s.mySeatId
    if (!mySeatId) return undefined
    const seat = s.seats.find((seat) => seat.id === mySeatId)
    return seat?.activeCharacterId ?? undefined
  })
}
```

- [ ] **Step 4: Export from SDK**

Add to `src/rules/sdk.ts` line 108 (the data hooks section):

```typescript
export { useEntity, useComponent, useActiveEntityId } from '../data/hooks'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/__tests__/hooks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/hooks.ts src/rules/sdk.ts src/data/__tests__/hooks.test.ts
git commit -m "feat(sdk): add useActiveEntityId hook for plugin regions to access active character"
```

---

## Task 4: 重新设计 FearPanel（浮动药丸 + 12 圆点）

**Files:**

- Modify: `plugins/daggerheart-core/ui/FearPanel.tsx`
- Modify: `plugins/daggerheart-core/index.ts` (update region size)
- Test: `plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`

当前 FearPanel 是简单的数字 + 小圆点。设计要求改为顶部居中的浮动药丸，12 个圆点 + 计数。

- [ ] **Step 1: Write the render test**

Create `plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FearPanel } from '../../ui/FearPanel'

// Mock the SDK hook
vi.mock('@myvtt/sdk', () => ({
  useComponent: vi.fn(() => ({ current: 4, max: 12 })),
  usePluginTranslation: vi.fn(() => ({ t: (k: string) => k })),
}))

describe('FearPanel', () => {
  it('renders 12 pip dots', () => {
    const { container } = render(<FearPanel />)
    const pips = container.querySelectorAll('[data-testid="fear-pip"]')
    expect(pips).toHaveLength(12)
  })

  it('shows filled count matching current value', () => {
    const { container } = render(<FearPanel />)
    const filled = container.querySelectorAll('[data-filled="true"]')
    expect(filled).toHaveLength(4)
  })

  it('displays current/max text', () => {
    render(<FearPanel />)
    expect(screen.getByText('4/12')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`
Expected: FAIL — current FearPanel has no `data-testid`, different structure.

- [ ] **Step 3: Rewrite FearPanel**

Replace `plugins/daggerheart-core/ui/FearPanel.tsx`:

```tsx
import { useComponent, usePluginTranslation } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'

interface FearTracker {
  current: number
  max: number
}

export function FearPanel() {
  const tracker = useComponent<FearTracker>(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY)
  const { t } = usePluginTranslation()
  const current = tracker?.current ?? 0
  const max = tracker?.max ?? 12

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 bg-black/30 backdrop-blur-xl rounded-[20px] border border-white/[0.06] select-none">
      <span className="text-[10px] font-semibold tracking-[1.5px] uppercase text-white/55">
        {t('fear.title')}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => {
          const filled = i < current
          return (
            <div
              key={i}
              data-testid="fear-pip"
              data-filled={filled}
              className="w-2 h-2 rounded-full transition-colors"
              style={{
                backgroundColor: filled ? '#e74c3c' : undefined,
                boxShadow: filled ? '0 0 6px rgba(231,76,60,0.5)' : undefined,
                border: filled ? undefined : '1px solid rgba(255,255,255,0.08)',
                background: filled ? '#e74c3c' : 'transparent',
              }}
            />
          )
        })}
      </div>
      <span className="text-[10px] text-white/40 tabular-nums">
        {current}/{max}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Update region registration size**

In `plugins/daggerheart-core/index.ts`, update the FearPanel region registration:

```typescript
sdk.ui.registerRegion({
  id: 'daggerheart-core:fear-panel',
  component: FearPanel as React.ComponentType<{ sdk: unknown }>,
  lifecycle: 'persistent',
  defaultSize: { width: 340, height: 40 },
  minSize: { width: 200, height: 36 },
  defaultPlacement: { anchor: 'top-left', offsetX: 200, offsetY: 12 },
  layer: 'standard',
})
```

Note: Anchor `top-left` with offsetX centers it roughly. The exact centering depends on viewport — for true centering, we use `anchor: 'center'` with negative offsetY. However, the layout engine's center anchor centers both axes. We want top-center positioning. Best approach: use `top-left` with `offsetX ≈ (viewport.width - 340) / 2`. Since defaultPlacement is static, approximate with `offsetX: 200` and let the user adjust in edit mode.

Alternative: anchor `top-left` with offsetX calculated by the layout engine would need a new anchor type. For now use `top-left` with a reasonable offset.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plugins/daggerheart-core/ui/FearPanel.tsx plugins/daggerheart-core/index.ts plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx
git commit -m "feat(daggerheart): redesign FearPanel as floating pill with 12 glowing dots"
```

---

## Task 5: 构建角色卡子组件 — AttributeGrid

**Files:**

- Create: `plugins/daggerheart-core/ui/components/AttributeGrid.tsx`
- Test: `plugins/daggerheart-core/__tests__/ui/components/AttributeGrid.test.tsx`

3×2 属性网格，每格显示中文名+英文名+数值。hover 显示骰子图标，click 触发掷骰。

- [ ] **Step 1: Write the failing test**

Create `plugins/daggerheart-core/__tests__/ui/components/AttributeGrid.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttributeGrid } from '../../../ui/components/AttributeGrid'
import type { DHAttributes } from '../../../../daggerheart/types'

const mockAttrs: DHAttributes = {
  agility: 2,
  strength: 1,
  finesse: 1,
  instinct: 0,
  presence: 0,
  knowledge: -1,
}

const mockT = (key: string) => {
  const map: Record<string, string> = {
    'attr.agility': '敏捷',
    'attr.agility.en': 'Agility',
    'attr.strength': '力量',
    'attr.strength.en': 'Strength',
    'attr.finesse': '灵巧',
    'attr.finesse.en': 'Finesse',
    'attr.instinct': '本能',
    'attr.instinct.en': 'Instinct',
    'attr.presence': '风度',
    'attr.presence.en': 'Presence',
    'attr.knowledge': '知识',
    'attr.knowledge.en': 'Knowledge',
  }
  return map[key] ?? key
}

describe('AttributeGrid', () => {
  it('renders 6 attribute cells', () => {
    const { container } = render(<AttributeGrid attrs={mockAttrs} t={mockT} onRoll={vi.fn()} />)
    expect(container.querySelectorAll('[data-testid^="attr-cell-"]')).toHaveLength(6)
  })

  it('shows positive values with + prefix in green', () => {
    render(<AttributeGrid attrs={mockAttrs} t={mockT} onRoll={vi.fn()} />)
    const agility = screen.getByTestId('attr-value-agility')
    expect(agility.textContent).toBe('+2')
    expect(agility.className).toContain('positive')
  })

  it('shows negative values in red', () => {
    render(<AttributeGrid attrs={mockAttrs} t={mockT} onRoll={vi.fn()} />)
    const knowledge = screen.getByTestId('attr-value-knowledge')
    expect(knowledge.textContent).toBe('-1')
    expect(knowledge.className).toContain('negative')
  })

  it('calls onRoll with attribute key on click', () => {
    const onRoll = vi.fn()
    render(<AttributeGrid attrs={mockAttrs} t={mockT} onRoll={onRoll} />)
    fireEvent.click(screen.getByTestId('attr-cell-agility'))
    expect(onRoll).toHaveBeenCalledWith('agility')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/components/AttributeGrid.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AttributeGrid**

Create `plugins/daggerheart-core/ui/components/AttributeGrid.tsx`:

```tsx
import type { DHAttributes } from '../../../daggerheart/types'

const ATTR_KEYS = ['agility', 'strength', 'instinct', 'knowledge', 'presence', 'finesse'] as const

interface Props {
  attrs: DHAttributes
  t: (key: string) => string
  onRoll: (attrKey: string) => void
}

export function AttributeGrid({ attrs, t, onRoll }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {ATTR_KEYS.map((key) => {
        const val = attrs[key]
        const colorClass = val > 0 ? 'positive' : val < 0 ? 'negative' : 'zero'
        return (
          <div
            key={key}
            data-testid={`attr-cell-${key}`}
            onClick={() => onRoll(key)}
            className="group relative text-center bg-white/5 border border-white/[0.04] rounded-lg py-1.5 px-1 cursor-pointer transition-colors hover:bg-white/[0.08]"
          >
            {/* Dice hint on hover */}
            <span className="absolute top-0.5 right-1 text-[7px] text-amber-300/50 opacity-0 group-hover:opacity-100 transition-opacity">
              🎲
            </span>
            <div className="text-[8px] text-white/45 tracking-wide">{t(`attr.${key}`)}</div>
            <div className="text-[6px] text-white/20 uppercase tracking-wider">
              {t(`attr.${key}.en`)}
            </div>
            <div
              data-testid={`attr-value-${key}`}
              className={`text-lg font-bold leading-tight tabular-nums ${colorClass}`}
              style={{
                color:
                  val > 0
                    ? 'rgba(46,204,113,0.9)'
                    : val < 0
                      ? 'rgba(231,76,60,0.85)'
                      : 'rgba(255,255,255,0.3)',
              }}
            >
              {val >= 0 ? '+' : ''}
              {val}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

Note: `colorClass` is used for test matching (`positive`/`negative`/`zero` in className). The actual color is set via inline style for specificity (Tailwind limitation for dynamic colors).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/components/AttributeGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/ui/components/AttributeGrid.tsx plugins/daggerheart-core/__tests__/ui/components/AttributeGrid.test.tsx
git commit -m "feat(daggerheart): add AttributeGrid component with roll-on-click"
```

---

## Task 6: 构建角色卡子组件 — ResourceBars

**Files:**

- Create: `plugins/daggerheart-core/ui/components/ResourceBars.tsx`
- Test: `plugins/daggerheart-core/__tests__/ui/components/ResourceBars.test.tsx`

HP/Stress 条形条 + Armor/Hope 离散点。

- [ ] **Step 1: Write the failing test**

Create `plugins/daggerheart-core/__tests__/ui/components/ResourceBars.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceBars } from '../../../ui/components/ResourceBars'

describe('ResourceBars', () => {
  it('renders HP bar with correct fill width', () => {
    const { container } = render(
      <ResourceBars
        hp={{ current: 3, max: 6 }}
        stress={{ current: 1, max: 6 }}
        armor={{ current: 4, max: 4 }}
        hope={{ current: 2, max: 6 }}
      />,
    )
    const hpFill = container.querySelector('[data-testid="hp-fill"]') as HTMLElement
    expect(hpFill.style.width).toBe('50%')
  })

  it('renders armor pips with correct filled count', () => {
    const { container } = render(
      <ResourceBars
        hp={{ current: 6, max: 6 }}
        stress={{ current: 0, max: 6 }}
        armor={{ current: 3, max: 4 }}
        hope={{ current: 0, max: 6 }}
      />,
    )
    const filledArmor = container.querySelectorAll('[data-testid="armor-pip"][data-filled="true"]')
    expect(filledArmor).toHaveLength(3)
  })

  it('renders hope pips with correct filled count', () => {
    const { container } = render(
      <ResourceBars
        hp={{ current: 6, max: 6 }}
        stress={{ current: 0, max: 6 }}
        armor={{ current: 4, max: 4 }}
        hope={{ current: 5, max: 6 }}
      />,
    )
    const filledHope = container.querySelectorAll('[data-testid="hope-pip"][data-filled="true"]')
    expect(filledHope).toHaveLength(5)
  })

  it('renders value text', () => {
    render(
      <ResourceBars
        hp={{ current: 3, max: 6 }}
        stress={{ current: 1, max: 6 }}
        armor={{ current: 4, max: 4 }}
        hope={{ current: 2, max: 6 }}
      />,
    )
    expect(screen.getByText('3/6')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/components/ResourceBars.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ResourceBars**

Create `plugins/daggerheart-core/ui/components/ResourceBars.tsx`:

```tsx
interface BarResource {
  current: number
  max: number
}

interface Props {
  hp: BarResource
  stress: BarResource
  armor: BarResource
  hope: BarResource
}

function Bar({
  current,
  max,
  color,
  icon,
  testId,
}: BarResource & { color: string; icon: string; testId: string }) {
  const pct = max > 0 ? Math.min(current / max, 1) * 100 : 0
  return (
    <div className="flex items-center gap-1.5 mb-1.5 last:mb-0">
      <span className="text-[10px] w-3.5 text-center" style={{ color }}>
        {icon}
      </span>
      <div className="flex-1 h-[7px] bg-white/[0.06] rounded overflow-hidden">
        <div
          data-testid={`${testId}-fill`}
          className="h-full rounded"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }}
        />
      </div>
      <span className="text-[9px] w-[30px] text-right text-white/45 tabular-nums">
        {current}/{max}
      </span>
    </div>
  )
}

function Pips({ current, max, type }: BarResource & { type: 'armor' | 'hope' }) {
  const filled =
    type === 'armor'
      ? {
          bg: 'rgba(130,195,240,0.7)',
          shadow: '0 0 4px rgba(130,195,240,0.3)',
          emptyBorder: 'rgba(130,195,240,0.12)',
        }
      : {
          bg: '#f1c40f',
          shadow: '0 0 4px rgba(241,196,15,0.4)',
          emptyBorder: 'rgba(241,196,15,0.12)',
        }
  const icon = type === 'armor' ? '☽' : '◆'
  const iconColor = type === 'armor' ? 'rgba(130,195,240,0.85)' : '#f1c40f'

  return (
    <div className="flex items-center gap-1.5 mb-1.5 last:mb-0">
      <span className="text-[9px] w-3.5 text-center" style={{ color: iconColor }}>
        {icon}
      </span>
      <div className="flex-1 flex gap-[3px] items-center">
        {Array.from({ length: max }, (_, i) => {
          const isFilled = i < current
          return (
            <div
              key={i}
              data-testid={`${type}-pip`}
              data-filled={isFilled}
              className="w-2 h-2 rounded-full"
              style={{
                background: isFilled ? filled.bg : 'transparent',
                boxShadow: isFilled ? filled.shadow : undefined,
                border: isFilled ? undefined : `1px solid ${filled.emptyBorder}`,
              }}
            />
          )
        })}
      </div>
      <span className="text-[9px] w-[30px] text-right text-white/45 tabular-nums">
        {current}/{max}
      </span>
    </div>
  )
}

export function ResourceBars({ hp, stress, armor, hope }: Props) {
  return (
    <div>
      <Bar {...hp} color="#e74c3c" icon="♥" testId="hp" />
      <Bar {...stress} color="#9b59b6" icon="✦" testId="stress" />
      <Pips {...armor} type="armor" />
      <Pips {...hope} type="hope" />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/components/ResourceBars.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/ui/components/ResourceBars.tsx plugins/daggerheart-core/__tests__/ui/components/ResourceBars.test.tsx
git commit -m "feat(daggerheart): add ResourceBars component (HP/Stress bars + Armor/Hope pips)"
```

---

## Task 7: 构建角色卡子组件 — ThresholdRow, ExperienceList, StatusTags

**Files:**

- Create: `plugins/daggerheart-core/ui/components/ThresholdRow.tsx`
- Create: `plugins/daggerheart-core/ui/components/ExperienceList.tsx`
- Create: `plugins/daggerheart-core/ui/components/StatusTags.tsx`

三个简单展示组件，逻辑轻量，合并为一个 task。

- [ ] **Step 1: Implement ThresholdRow**

Create `plugins/daggerheart-core/ui/components/ThresholdRow.tsx`:

```tsx
import type { DHThresholds } from '../../../daggerheart/types'

interface Props {
  thresholds: DHThresholds
  t: (key: string) => string
}

export function ThresholdRow({ thresholds, t }: Props) {
  const items = [
    { key: 'evasion', value: thresholds.evasion, highlight: true },
    { key: 'major', value: thresholds.majorThreshold, highlight: false },
    { key: 'severe', value: thresholds.severeThreshold, highlight: false },
  ]

  return (
    <div className="flex gap-1">
      {items.map(({ key, value, highlight }) => (
        <div
          key={key}
          className="flex-1 text-center bg-white/[0.04] border border-white/[0.04] rounded-lg py-1 px-1"
          style={highlight ? { borderColor: 'rgba(100,200,255,0.08)' } : undefined}
        >
          <div className="text-[7px] text-white/28 tracking-wide">{t(`threshold.${key}`)}</div>
          <div
            className="text-[15px] font-bold tabular-nums"
            style={{ color: highlight ? 'rgba(100,200,255,0.85)' : 'rgba(255,255,255,0.65)' }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Implement ExperienceList**

Create `plugins/daggerheart-core/ui/components/ExperienceList.tsx`:

```tsx
import type { DHExperienceItem } from '../../../daggerheart/types'

interface Props {
  items: DHExperienceItem[]
}

export function ExperienceList({ items }: Props) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-[3px]">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-2 py-1 bg-white/[0.03] border border-white/[0.03] rounded-[7px] transition-colors hover:bg-white/[0.06]"
        >
          <span className="text-[10px] text-white/55">{item.name}</span>
          <span className="text-xs font-bold text-amber-400/80 tabular-nums">+{item.modifier}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Implement StatusTags**

Create `plugins/daggerheart-core/ui/components/StatusTags.tsx`:

```tsx
import type { DHStatusItem } from '../../../daggerheart/types'

interface Props {
  items: DHStatusItem[]
}

const KIND_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  buff: {
    bg: 'rgba(46,204,113,0.12)',
    text: 'rgba(46,204,113,0.8)',
    border: 'rgba(46,204,113,0.15)',
  },
  debuff: {
    bg: 'rgba(231,76,60,0.12)',
    text: 'rgba(231,76,60,0.8)',
    border: 'rgba(231,76,60,0.15)',
  },
  neutral: {
    bg: 'rgba(241,196,15,0.1)',
    text: 'rgba(241,196,15,0.75)',
    border: 'rgba(241,196,15,0.12)',
  },
}

export function StatusTags({ items }: Props) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => {
        const style = KIND_STYLES[item.kind] ?? KIND_STYLES.neutral
        return (
          <span
            key={i}
            className="text-[8px] px-[7px] py-0.5 rounded-md font-medium"
            style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
          >
            {item.name}
            {item.rounds != null && ` ${item.rounds}r`}
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/ui/components/ThresholdRow.tsx plugins/daggerheart-core/ui/components/ExperienceList.tsx plugins/daggerheart-core/ui/components/StatusTags.tsx
git commit -m "feat(daggerheart): add ThresholdRow, ExperienceList, StatusTags sub-components"
```

---

## Task 8: 构建 DHCharacterCard region 组件

**Files:**

- Create: `plugins/daggerheart-core/ui/DHCharacterCard.tsx`
- Test: `plugins/daggerheart-core/__tests__/ui/DHCharacterCard.test.tsx`

左侧 220px 角色卡 region。使用 `useActiveEntityId` 获取活跃角色，用 `sdk.data.useEntity` / `sdk.data.useComponent` 订阅数据，组合 Task 5-7 的子组件。

- [ ] **Step 1: Write the failing test**

Create `plugins/daggerheart-core/__tests__/ui/DHCharacterCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DHCharacterCard } from '../../ui/DHCharacterCard'
import type { IRegionSDK } from '../../../../src/ui-system/types'

// Mock SDK hooks
vi.mock('@myvtt/sdk', () => ({
  useActiveEntityId: vi.fn(() => 'entity-1'),
  usePluginTranslation: vi.fn(() => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'card.title': '角色卡',
        'card.section.attributes': '属性',
        'card.section.resources': '资源',
      }
      return map[k] ?? k
    },
  })),
  useWorkflowRunner: vi.fn(() => ({ runWorkflow: vi.fn() })),
}))

const mockEntity = {
  id: 'entity-1',
  components: {
    'core:identity': { name: 'Kael Ironheart' },
    'daggerheart:health': { current: 6, max: 6 },
    'daggerheart:stress': { current: 0, max: 6 },
    'daggerheart:attributes': {
      agility: 2,
      strength: 1,
      finesse: 1,
      instinct: 0,
      presence: 0,
      knowledge: -1,
    },
    'daggerheart:meta': { tier: 3, proficiency: 2, className: 'Guardian', ancestry: 'Human' },
    'daggerheart:extras': { hope: 2, hopeMax: 6, armor: 4, armorMax: 4 },
    'daggerheart:experiences': { items: [{ name: '森林生存专家', modifier: 2 }] },
    'daggerheart:thresholds': { evasion: 12, majorThreshold: 10, severeThreshold: 22 },
    'daggerheart:statuses': { items: [{ name: '护盾术', kind: 'buff', rounds: 3 }] },
  },
}

const mockSdk = {
  data: {
    useEntity: vi.fn(() => mockEntity),
    useComponent: vi.fn((id: string, key: string) => mockEntity.components[key]),
    useQuery: vi.fn(() => []),
  },
  workflow: { runWorkflow: vi.fn().mockResolvedValue({}) },
  context: { instanceProps: {}, role: 'Player', layoutMode: 'play' },
  read: {},
  awareness: { subscribe: vi.fn(), broadcast: vi.fn(), clear: vi.fn(), usePeers: vi.fn() },
  log: { subscribe: vi.fn(), useEntries: vi.fn() },
  ui: { openPanel: vi.fn(), closePanel: vi.fn(), resize: vi.fn(), getPortalContainer: vi.fn() },
} as unknown as IRegionSDK

describe('DHCharacterCard', () => {
  it('renders character name', () => {
    render(<DHCharacterCard sdk={mockSdk} />)
    expect(screen.getByText('Kael Ironheart')).toBeInTheDocument()
  })

  it('renders class and level', () => {
    render(<DHCharacterCard sdk={mockSdk} />)
    expect(screen.getByText(/Guardian/)).toBeInTheDocument()
  })

  it('renders attributes section', () => {
    render(<DHCharacterCard sdk={mockSdk} />)
    expect(screen.getByText('属性')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/DHCharacterCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DHCharacterCard**

Create `plugins/daggerheart-core/ui/DHCharacterCard.tsx`:

```tsx
import { useState } from 'react'
import { useActiveEntityId, usePluginTranslation, useWorkflowRunner } from '@myvtt/sdk'
import { getName, getImageUrl, getColor } from '../../../src/shared/coreComponents'
import { getWorkflowEngine } from '../../../src/workflow/useWorkflowSDK'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type {
  DHHealth,
  DHStress,
  DHAttributes,
  DHMeta,
  DHExtras,
  DHExperience,
  DHThresholds,
  DHStatuses,
} from '../../daggerheart/types'
import { DH_KEYS } from '../../daggerheart/types'
import { AttributeGrid } from './components/AttributeGrid'
import { ResourceBars } from './components/ResourceBars'
import { ThresholdRow } from './components/ThresholdRow'
import { ExperienceList } from './components/ExperienceList'
import { StatusTags } from './components/StatusTags'

interface Props {
  sdk: IRegionSDK
}

export function DHCharacterCard({ sdk }: Props) {
  const activeId = useActiveEntityId()
  const entity = sdk.data.useEntity(activeId ?? '')
  const { t } = usePluginTranslation()
  const runner = useWorkflowRunner()
  const [collapsed, setCollapsed] = useState(false)

  if (!activeId || !entity) return null

  const hp = entity.components[DH_KEYS.health] as DHHealth | undefined
  const stress = entity.components[DH_KEYS.stress] as DHStress | undefined
  const attrs = entity.components[DH_KEYS.attributes] as DHAttributes | undefined
  const meta = entity.components[DH_KEYS.meta] as DHMeta | undefined
  const extras = entity.components[DH_KEYS.extras] as DHExtras | undefined
  const experiences = entity.components[DH_KEYS.experiences] as DHExperience | undefined
  const thresholds = entity.components[DH_KEYS.thresholds] as DHThresholds | undefined
  const statuses = entity.components[DH_KEYS.statuses] as DHStatuses | undefined

  const name = getName(entity)
  const imageUrl = getImageUrl(entity)
  const color = getColor(entity)

  const handleRoll = (attrKey: string) => {
    runner
      .runWorkflow(getWorkflowEngine().getWorkflow('daggerheart-core:action-check'), {
        formula: `2d12+@${attrKey}`,
        actorId: entity.id,
        rollType: 'daggerheart:dd',
      })
      .catch((err: unknown) => console.error('[DHCharacterCard] roll failed:', err))
  }

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className="w-9 py-3 bg-black/30 backdrop-blur-xl rounded-r-[10px] cursor-pointer flex flex-col items-center gap-1.5 border border-white/[0.06] border-l-0"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover"
            style={{ border: `2px solid ${color}` }}
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: color }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-white/40 text-[10px]">▶</span>
      </div>
    )
  }

  return (
    <div className="w-[220px] bg-black/[0.32] backdrop-blur-[18px] border border-white/[0.06] rounded-r-[16px] border-l-0 p-3.5 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-semibold text-white/55 uppercase tracking-[1.5px]">
          {t('card.title')}
        </span>
        <span
          className="text-[9px] text-white/25 cursor-pointer"
          onClick={() => setCollapsed(true)}
        >
          {t('card.collapse')}
        </span>
      </div>

      {/* Character header */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            style={{
              border: `2px solid rgba(255,215,100,0.25)`,
              boxShadow: '0 0 8px rgba(255,215,100,0.08)',
            }}
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-lg"
            style={{
              background: `linear-gradient(135deg, #6a3093, #4a6fa5)`,
              border: '2px solid rgba(255,215,100,0.25)',
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col gap-px">
          <div className="text-sm font-semibold tracking-wide">{name}</div>
          <div className="text-[9px] text-white/38">
            {meta?.className}
            {meta?.tier ? ` · Lv ${meta.tier}` : ''}
          </div>
        </div>
      </div>

      {/* Rune separator */}
      <RuneSeparator />

      {/* Attributes (most prominent) */}
      {attrs && (
        <Section label={t('card.section.attributes')}>
          <AttributeGrid attrs={attrs} t={t} onRoll={handleRoll} />
        </Section>
      )}

      {/* Resources */}
      {(hp || stress || extras) && (
        <Section label={t('card.section.resources')}>
          <ResourceBars
            hp={hp ?? { current: 0, max: 0 }}
            stress={stress ?? { current: 0, max: 0 }}
            armor={{ current: extras?.armor ?? 0, max: extras?.armorMax ?? 4 }}
            hope={{ current: extras?.hope ?? 0, max: extras?.hopeMax ?? 6 }}
          />
        </Section>
      )}

      {/* Thresholds */}
      {thresholds && <ThresholdRow thresholds={thresholds} t={t} />}

      <RuneSeparator />

      {/* Experiences */}
      {experiences && experiences.items.length > 0 && (
        <Section label={t('card.section.experiences')}>
          <ExperienceList items={experiences.items} />
        </Section>
      )}

      {/* Statuses */}
      {statuses && statuses.items.length > 0 && (
        <Section label={t('card.section.statuses')}>
          <StatusTags items={statuses.items} />
        </Section>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.04] rounded-[10px] p-2.5">
      <div className="text-[7px] text-white/28 uppercase tracking-[1.2px] mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function RuneSeparator() {
  return (
    <div className="flex items-center gap-1.5 my-0.5">
      <div
        className="flex-1 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,215,100,0.12), transparent)',
        }}
      />
      <div className="w-1 h-1 rounded-full bg-amber-300/20" />
      <div
        className="flex-1 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,215,100,0.12), transparent)',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/DHCharacterCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/ui/DHCharacterCard.tsx plugins/daggerheart-core/__tests__/ui/DHCharacterCard.test.tsx
git commit -m "feat(daggerheart): add DHCharacterCard region component with full attribute/resource display"
```

---

## Task 9: 注册角色卡 Region + 移除遗留组件

**Files:**

- Modify: `plugins/daggerheart-core/index.ts`
- Modify: `src/App.tsx`
- Delete: `src/layout/MyCharacterCard.tsx`

将 DHCharacterCard 注册为 persistent region，然后从 App.tsx 移除对 MyCharacterCard 的引用。

- [ ] **Step 1: Register the region in onActivate**

In `plugins/daggerheart-core/index.ts`, add import and registration:

```typescript
import { DHCharacterCard } from './ui/DHCharacterCard'

// Inside onActivate(), after FearPanel registration:
sdk.ui.registerRegion({
  id: 'daggerheart-core:character-card',
  component: DHCharacterCard as React.ComponentType<{ sdk: unknown }>,
  lifecycle: 'persistent',
  defaultSize: { width: 220, height: 600 },
  minSize: { width: 200, height: 300 },
  defaultPlacement: { anchor: 'top-left', offsetX: 0, offsetY: 80 },
  layer: 'standard',
})
```

Note: The region renderer uses `position: absolute` with anchor-based positioning. The character card needs vertical centering — the region system positions it at `top-left` with offsetY. Users can reposition in edit mode. The component itself handles overflow scrolling internally.

- [ ] **Step 2: Remove MyCharacterCard from App.tsx**

In `src/App.tsx`, remove the MyCharacterCard import and rendering (lines 577-584):

Change:

```tsx
{
  /* Left: GM sidebar or player character card */
}
{
  isGM ? (
    <GmSidebar />
  ) : (
    activeEntity && <MyCharacterCard entity={activeEntity} onUpdateEntity={handleUpdateEntity} />
  )
}
```

To:

```tsx
{
  /* Left: GM sidebar (player character card is now a plugin region) */
}
{
  isGM && <GmSidebar />
}
```

Also remove the `MyCharacterCard` import at the top of the file.

- [ ] **Step 3: Delete legacy MyCharacterCard**

```bash
rm src/layout/MyCharacterCard.tsx
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors. If there are unused import warnings, fix them.

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/index.ts src/App.tsx
git rm src/layout/MyCharacterCard.tsx
git commit -m "refactor: replace legacy MyCharacterCard with plugin-registered DHCharacterCard region"
```

---

## Task 10: 构建 MiniAvatar 子组件

**Files:**

- Create: `plugins/daggerheart-core/ui/components/MiniAvatar.tsx`

迷你头像用于角色列表。34px 圆形，SVG 弧形显示 HP/Stress 比例。

- [ ] **Step 1: Implement MiniAvatar**

Create `plugins/daggerheart-core/ui/components/MiniAvatar.tsx`:

```tsx
interface Props {
  name: string
  imageUrl?: string
  color: string
  hpRatio: number // 0..1
  stressRatio: number // 0..1
  isEnemy?: boolean
  size?: number
}

/**
 * Mini avatar with SVG arc HP/Stress indicators.
 * HP = red arc on left half, Stress = purple arc on right half.
 */
export function MiniAvatar({
  name,
  imageUrl,
  color,
  hpRatio,
  stressRatio,
  isEnemy,
  size = 34,
}: Props) {
  const r = size / 2
  const strokeW = 2.5
  const arcR = r - strokeW / 2

  // Half-circle arc paths (left = HP, right = Stress)
  // Left arc: from bottom (6 o'clock) counter-clockwise to top (12 o'clock)
  const leftArc = describeArc(r, r, arcR, 90, 90 + 180 * hpRatio)
  // Right arc: from bottom clockwise to top
  const rightArc = describeArc(r, r, arcR, 90, 90 - 180 * stressRatio)

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        {/* Background track */}
        <circle
          cx={r}
          cy={r}
          r={arcR}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeW}
        />
        {/* HP arc (left, red) */}
        {hpRatio > 0 && (
          <path
            d={leftArc}
            fill="none"
            stroke="#e74c3c"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {/* Stress arc (right, purple) */}
        {stressRatio > 0 && (
          <path
            d={rightArc}
            fill="none"
            stroke="#9b59b6"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
      </svg>
      {/* Avatar core */}
      <div
        className="absolute rounded-full overflow-hidden flex items-center justify-center text-white text-[11px] font-bold"
        style={{
          top: strokeW + 1,
          left: strokeW + 1,
          width: size - (strokeW + 1) * 2,
          height: size - (strokeW + 1) * 2,
          background: imageUrl ? undefined : color,
          border: isEnemy ? '1.5px solid #e74c3c' : undefined,
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>
      {isEnemy && (
        <div className="absolute -top-0.5 -right-0.5 text-[7px] bg-red-600 text-white rounded px-0.5 leading-tight">
          敌
        </div>
      )}
    </div>
  )
}

// SVG arc path helper
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0
  const sweep = endAngle > startAngle ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart-core/ui/components/MiniAvatar.tsx
git commit -m "feat(daggerheart): add MiniAvatar component with SVG arc HP/Stress indicators"
```

---

## Task 11: 构建 DHCharacterList region 组件

**Files:**

- Create: `plugins/daggerheart-core/ui/DHCharacterList.tsx`
- Test: `plugins/daggerheart-core/__tests__/ui/DHCharacterList.test.tsx`

右侧 220px 在场角色列表。玩家角色在上，敌方角色在下，中间分隔线。

- [ ] **Step 1: Write the failing test**

Create `plugins/daggerheart-core/__tests__/ui/DHCharacterList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DHCharacterList } from '../../ui/DHCharacterList'
import type { IRegionSDK } from '../../../../src/ui-system/types'

vi.mock('@myvtt/sdk', () => ({
  usePluginTranslation: vi.fn(() => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'charlist.title': '在场角色',
        'charlist.enemies': '敌方',
      }
      return map[k] ?? k
    },
  })),
}))

const mockEntities = [
  {
    id: 'pc-1',
    components: {
      'core:identity': { name: 'Kael', owner: 'seat-1' },
      'core:token': { color: '#3b82f6' },
      'daggerheart:health': { current: 6, max: 6 },
      'daggerheart:stress': { current: 1, max: 6 },
      'daggerheart:meta': { className: 'Guardian' },
      'daggerheart:extras': { hope: 2, hopeMax: 6, armor: 4, armorMax: 4 },
    },
  },
  {
    id: 'npc-1',
    components: {
      'core:identity': { name: 'Goblin Raider' },
      'core:token': { color: '#ef4444' },
      'daggerheart:health': { current: 3, max: 5 },
      'daggerheart:stress': { current: 0, max: 3 },
    },
  },
]

const mockSdk = {
  data: {
    useEntity: vi.fn(),
    useComponent: vi.fn(),
    useQuery: vi.fn(() => mockEntities),
  },
  context: { instanceProps: {}, role: 'GM', layoutMode: 'play' },
  workflow: { runWorkflow: vi.fn() },
  read: {},
  awareness: { subscribe: vi.fn(), broadcast: vi.fn(), clear: vi.fn(), usePeers: vi.fn() },
  log: { subscribe: vi.fn(), useEntries: vi.fn() },
  ui: { openPanel: vi.fn(), closePanel: vi.fn(), resize: vi.fn(), getPortalContainer: vi.fn() },
} as unknown as IRegionSDK

describe('DHCharacterList', () => {
  it('renders title', () => {
    render(<DHCharacterList sdk={mockSdk} />)
    expect(screen.getByText('在场角色')).toBeInTheDocument()
  })

  it('renders character names', () => {
    render(<DHCharacterList sdk={mockSdk} />)
    expect(screen.getByText('Kael')).toBeInTheDocument()
    expect(screen.getByText('Goblin Raider')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/DHCharacterList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DHCharacterList**

Create `plugins/daggerheart-core/ui/DHCharacterList.tsx`:

```tsx
import { usePluginTranslation } from '@myvtt/sdk'
import { getName, getColor, getImageUrl } from '../../../src/shared/coreComponents'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { Entity } from '../../../src/shared/entityTypes'
import type { DHHealth, DHStress, DHMeta, DHExtras } from '../../daggerheart/types'
import { DH_KEYS } from '../../daggerheart/types'
import { MiniAvatar } from './components/MiniAvatar'

interface Props {
  sdk: IRegionSDK
}

export function DHCharacterList({ sdk }: Props) {
  const { t } = usePluginTranslation()
  const entities = sdk.data.useQuery({ has: [DH_KEYS.health] })

  // Split into PCs (have owner) and enemies (no owner)
  const pcs = entities.filter((e) => {
    const id = e.components['core:identity'] as { owner?: string } | undefined
    return !!id?.owner
  })
  const enemies = entities.filter((e) => {
    const id = e.components['core:identity'] as { owner?: string } | undefined
    return !id?.owner
  })

  return (
    <div className="h-full bg-black/[0.32] backdrop-blur-[18px] border border-white/[0.06] rounded-l-[14px] border-r-0 p-3 flex flex-col gap-2 overflow-y-auto">
      <div className="text-[11px] font-semibold text-white/55 uppercase tracking-[1.5px]">
        {t('charlist.title')}
      </div>

      {/* Player characters */}
      {pcs.map((entity) => (
        <CharacterRow key={entity.id} entity={entity} />
      ))}

      {/* Enemy divider */}
      {enemies.length > 0 && (
        <>
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[8px] text-red-500/60 uppercase tracking-wider">
              {t('charlist.enemies')}
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          {enemies.map((entity) => (
            <CharacterRow key={entity.id} entity={entity} isEnemy />
          ))}
        </>
      )}
    </div>
  )
}

function CharacterRow({ entity, isEnemy }: { entity: Entity; isEnemy?: boolean }) {
  const name = getName(entity)
  const color = getColor(entity)
  const imageUrl = getImageUrl(entity)
  const hp = entity.components[DH_KEYS.health] as DHHealth | undefined
  const stress = entity.components[DH_KEYS.stress] as DHStress | undefined
  const meta = entity.components[DH_KEYS.meta] as DHMeta | undefined
  const extras = entity.components[DH_KEYS.extras] as DHExtras | undefined

  const hpRatio = hp && hp.max > 0 ? hp.current / hp.max : 0
  const stressRatio = stress && stress.max > 0 ? stress.current / stress.max : 0

  return (
    <div className="flex items-center gap-2 py-1 px-1 rounded-lg transition-colors hover:bg-white/[0.04]">
      <MiniAvatar
        name={name}
        imageUrl={imageUrl}
        color={color}
        hpRatio={hpRatio}
        stressRatio={stressRatio}
        isEnemy={isEnemy}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate">{name}</div>
        {meta?.className && (
          <div className="text-[8px] text-white/30 truncate">{meta.className}</div>
        )}
        {/* Micro stats */}
        <div className="flex gap-1.5 mt-0.5">
          {hp && (
            <span className="text-[8px] text-red-400/60 tabular-nums">
              {hp.current}/{hp.max}
            </span>
          )}
          {stress && !isEnemy && (
            <span className="text-[8px] text-purple-400/60 tabular-nums">
              {stress.current}/{stress.max}
            </span>
          )}
          {extras && !isEnemy && (
            <>
              <span className="text-[8px] text-sky-300/60 tabular-nums">🛡{extras.armor}</span>
              <span className="text-[8px] text-amber-300/60 tabular-nums">✦{extras.hope}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/DHCharacterList.test.tsx`
Expected: PASS

- [ ] **Step 5: Register the region**

In `plugins/daggerheart-core/index.ts`, add:

```typescript
import { DHCharacterList } from './ui/DHCharacterList'

// Inside onActivate():
sdk.ui.registerRegion({
  id: 'daggerheart-core:character-list',
  component: DHCharacterList as React.ComponentType<{ sdk: unknown }>,
  lifecycle: 'persistent',
  defaultSize: { width: 220, height: 400 },
  minSize: { width: 180, height: 200 },
  defaultPlacement: { anchor: 'top-right', offsetX: 0, offsetY: 60 },
  layer: 'standard',
})
```

- [ ] **Step 6: Commit**

```bash
git add plugins/daggerheart-core/ui/DHCharacterList.tsx plugins/daggerheart-core/__tests__/ui/DHCharacterList.test.tsx plugins/daggerheart-core/index.ts
git commit -m "feat(daggerheart): add DHCharacterList region with mini avatars and player/enemy sections"
```

---

## Task 12: 构建底部头像 SVG 子组件

**Files:**

- Create: `plugins/daggerheart-core/ui/components/RuneRing.tsx`
- Create: `plugins/daggerheart-core/ui/components/HpStressArcs.tsx`
- Create: `plugins/daggerheart-core/ui/components/ArmorRing.tsx`

底部头像的三个 SVG 层组件。这些是纯展示组件，逻辑在比例计算和 SVG path 生成。

- [ ] **Step 1: Implement RuneRing**

Create `plugins/daggerheart-core/ui/components/RuneRing.tsx`:

```tsx
interface Props {
  size: number // diameter
  hopeCount: number // filled hope gems (0..hopeMax)
  hopeMax: number // total hope gem slots
}

// Ogham-inspired rune characters for decorative ring
const RUNES = '᚛᚜ᚐᚑᚒᚓᚔᚕᚖᚗᚘᚙᚚ᚛᚜ᚐᚑᚒᚓᚔᚕᚖᚗ'

export function RuneRing({ size, hopeCount, hopeMax }: Props) {
  const r = size / 2
  const runeR = r - 4 // rune text radius

  // Place hope gems evenly on the top arc (from -90° to +90°, i.e. top half)
  const gemAngles = Array.from({ length: hopeMax }, (_, i) => {
    const span = 150 // degrees covered by gems
    const startAngle = -90 - span / 2
    return startAngle + (span / (hopeMax - 1 || 1)) * i
  })

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0"
      style={{ animation: 'spin 80s linear infinite' }}
    >
      {/* Rune text on circular path */}
      <defs>
        <path
          id="rune-path"
          d={`M ${r},${r} m -${runeR},0 a ${runeR},${runeR} 0 1,1 ${runeR * 2},0 a ${runeR},${runeR} 0 1,1 -${runeR * 2},0`}
        />
      </defs>
      <text fill="rgba(255,215,100,0.08)" fontSize="8" letterSpacing="2">
        <textPath href="#rune-path">{RUNES}</textPath>
      </text>

      {/* Hope gems (NOT rotating — counter-rotate to stay fixed) */}
      <g style={{ animation: 'spin 80s linear infinite reverse' }}>
        {gemAngles.map((angle, i) => {
          const filled = i < hopeCount
          const rad = (angle * Math.PI) / 180
          const cx = r + (r - 8) * Math.cos(rad)
          const cy = r + (r - 8) * Math.sin(rad)
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={4}
              fill={filled ? '#f1c40f' : 'rgba(241,196,15,0.06)'}
              stroke={filled ? 'rgba(241,196,15,0.6)' : 'rgba(241,196,15,0.12)'}
              strokeWidth={0.5}
              style={filled ? { filter: 'drop-shadow(0 0 3px rgba(241,196,15,0.5))' } : undefined}
            />
          )
        })}
      </g>
    </svg>
  )
}
```

Note: CSS `@keyframes spin` should be defined in global styles or via Tailwind's `animate-spin` utility (which is already available). The `80s` duration is custom — add a style tag or use inline animation.

- [ ] **Step 2: Implement HpStressArcs**

Create `plugins/daggerheart-core/ui/components/HpStressArcs.tsx`:

```tsx
interface Props {
  size: number // diameter of the arc ring
  hpRatio: number // 0..1
  stressRatio: number // 0..1
}

export function HpStressArcs({ size, hpRatio, stressRatio }: Props) {
  const r = size / 2
  const strokeW = 4
  const arcR = r - strokeW / 2

  // HP: left semicircle from bottom (180°) up to top (0°)
  // Full arc = 180°. Fill portion = hpRatio * 180.
  const hpAngle = hpRatio * 180
  const hpPath = hpAngle > 0 ? describeArc(r, r, arcR, 180, 180 - hpAngle) : ''

  // Stress: right semicircle from bottom (180°) up to top (360°)
  const stressAngle = stressRatio * 180
  const stressPath = stressAngle > 0 ? describeArc(r, r, arcR, 180, 180 + stressAngle) : ''

  return (
    <svg
      width={size}
      height={size}
      className="absolute"
      style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      {/* Background track */}
      <circle
        cx={r}
        cy={r}
        r={arcR}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={strokeW}
      />
      {/* HP arc (red, left side) */}
      {hpPath && (
        <path
          d={hpPath}
          fill="none"
          stroke="#e74c3c"
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(231,76,60,0.4))' }}
        />
      )}
      {/* Stress arc (purple, right side) */}
      {stressPath && (
        <path
          d={stressPath}
          fill="none"
          stroke="#9b59b6"
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(155,89,182,0.4))' }}
        />
      )}
    </svg>
  )
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const s = polarToCartesian(cx, cy, r, startAngle)
  const e = polarToCartesian(cx, cy, r, endAngle)
  const large = Math.abs(endAngle - startAngle) > 180 ? 1 : 0
  const sweep = endAngle > startAngle ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
```

- [ ] **Step 3: Implement ArmorRing**

Create `plugins/daggerheart-core/ui/components/ArmorRing.tsx`:

```tsx
interface Props {
  size: number // diameter
  armorCurrent: number
  armorMax: number
}

export function ArmorRing({ size, armorCurrent, armorMax }: Props) {
  if (armorMax === 0) return null

  const r = size / 2
  const strokeW = 5
  const arcR = r - strokeW / 2
  const circumference = 2 * Math.PI * arcR
  const gap = 3 // gap between segments in px
  const totalGap = gap * armorMax
  const segmentLen = (circumference - totalGap) / armorMax

  return (
    <svg
      width={size}
      height={size}
      className="absolute"
      style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      {Array.from({ length: armorMax }, (_, i) => {
        const filled = i < armorCurrent
        const offset = i * (segmentLen + gap)
        return (
          <circle
            key={i}
            cx={r}
            cy={r}
            r={arcR}
            fill="none"
            stroke={filled ? 'rgba(130,195,240,0.65)' : 'rgba(0,0,0,0.3)'}
            strokeWidth={strokeW}
            strokeDasharray={`${segmentLen} ${circumference - segmentLen}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={filled ? { filter: 'drop-shadow(0 0 2px rgba(130,195,240,0.3))' } : undefined}
          />
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/ui/components/RuneRing.tsx plugins/daggerheart-core/ui/components/HpStressArcs.tsx plugins/daggerheart-core/ui/components/ArmorRing.tsx
git commit -m "feat(daggerheart): add SVG components for bottom avatar (RuneRing, HpStressArcs, ArmorRing)"
```

---

## Task 13: 构建 DHBottomAvatar region 组件

**Files:**

- Create: `plugins/daggerheart-core/ui/DHBottomAvatar.tsx`
- Test: `plugins/daggerheart-core/__tests__/ui/DHBottomAvatar.test.tsx`

底部居中 130×130px 头像，5 层同心结构。

- [ ] **Step 1: Write the failing test**

Create `plugins/daggerheart-core/__tests__/ui/DHBottomAvatar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DHBottomAvatar } from '../../ui/DHBottomAvatar'
import type { IRegionSDK } from '../../../../src/ui-system/types'

vi.mock('@myvtt/sdk', () => ({
  useActiveEntityId: vi.fn(() => 'entity-1'),
}))

const mockEntity = {
  id: 'entity-1',
  components: {
    'core:identity': { name: 'Kael' },
    'core:token': { color: '#3b82f6' },
    'daggerheart:health': { current: 4, max: 6 },
    'daggerheart:stress': { current: 1, max: 6 },
    'daggerheart:extras': { hope: 3, hopeMax: 6, armor: 2, armorMax: 4 },
  },
}

const mockSdk = {
  data: {
    useEntity: vi.fn(() => mockEntity),
    useComponent: vi.fn((id: string, key: string) => mockEntity.components[key]),
    useQuery: vi.fn(() => []),
  },
  context: { instanceProps: {}, role: 'Player', layoutMode: 'play' },
  workflow: { runWorkflow: vi.fn() },
  read: {},
  awareness: { subscribe: vi.fn(), broadcast: vi.fn(), clear: vi.fn(), usePeers: vi.fn() },
  log: { subscribe: vi.fn(), useEntries: vi.fn() },
  ui: { openPanel: vi.fn(), closePanel: vi.fn(), resize: vi.fn(), getPortalContainer: vi.fn() },
} as unknown as IRegionSDK

describe('DHBottomAvatar', () => {
  it('renders character name', () => {
    render(<DHBottomAvatar sdk={mockSdk} />)
    expect(screen.getByText('Kael')).toBeInTheDocument()
  })

  it('renders nothing when no active entity', () => {
    const { useActiveEntityId } = (await import('@myvtt/sdk')) as {
      useActiveEntityId: ReturnType<typeof vi.fn>
    }
    useActiveEntityId.mockReturnValue(undefined)
    const { container } = render(
      <DHBottomAvatar
        sdk={
          {
            ...mockSdk,
            data: { ...mockSdk.data, useEntity: vi.fn(() => undefined) },
          } as unknown as IRegionSDK
        }
      />,
    )
    expect(container.innerHTML).toBe('')
  })
})
```

Note: The test for "renders nothing" may need adjustment depending on mock setup. The key assertion is that the component renders the name and handles missing entity gracefully.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/DHBottomAvatar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DHBottomAvatar**

Create `plugins/daggerheart-core/ui/DHBottomAvatar.tsx`:

```tsx
import { useActiveEntityId } from '@myvtt/sdk'
import { getName, getImageUrl, getColor } from '../../../src/shared/coreComponents'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { DHHealth, DHStress, DHExtras } from '../../daggerheart/types'
import { DH_KEYS } from '../../daggerheart/types'
import { RuneRing } from './components/RuneRing'
import { HpStressArcs } from './components/HpStressArcs'
import { ArmorRing } from './components/ArmorRing'

interface Props {
  sdk: IRegionSDK
}

const OUTER = 126 // rune ring diameter
const ARC = 110 // HP/Stress arc diameter
const ARMOR = 82 // armor ring diameter
const CORE = 52 // avatar core diameter

export function DHBottomAvatar({ sdk }: Props) {
  const activeId = useActiveEntityId()
  const entity = sdk.data.useEntity(activeId ?? '')

  if (!activeId || !entity) return null

  const name = getName(entity)
  const imageUrl = getImageUrl(entity)
  const color = getColor(entity)
  const hp = entity.components[DH_KEYS.health] as DHHealth | undefined
  const stress = entity.components[DH_KEYS.stress] as DHStress | undefined
  const extras = entity.components[DH_KEYS.extras] as DHExtras | undefined

  const hpRatio = hp && hp.max > 0 ? hp.current / hp.max : 0
  const stressRatio = stress && stress.max > 0 ? stress.current / stress.max : 0

  return (
    <div className="flex flex-col items-center select-none">
      {/* Concentric ring container */}
      <div className="relative" style={{ width: OUTER, height: OUTER }}>
        {/* Layer 1: Rune ring + Hope gems */}
        <RuneRing size={OUTER} hopeCount={extras?.hope ?? 0} hopeMax={extras?.hopeMax ?? 6} />

        {/* Layer 2: HP/Stress arcs */}
        <HpStressArcs size={ARC} hpRatio={hpRatio} stressRatio={stressRatio} />

        {/* Layer 3: Armor plate ring */}
        <ArmorRing
          size={ARMOR}
          armorCurrent={extras?.armor ?? 0}
          armorMax={extras?.armorMax ?? 0}
        />

        {/* Layer 4: Avatar core */}
        <div
          className="absolute rounded-full overflow-hidden"
          style={{
            width: CORE,
            height: CORE,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            border: '2px solid rgba(255,215,100,0.4)',
            boxShadow: '0 0 12px rgba(255,215,100,0.15)',
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-lg font-bold"
              style={{ background: `linear-gradient(135deg, #6a3093, #4a6fa5)` }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Layer 5: Nickname */}
      <div className="mt-1 text-[10px] text-white/60 font-medium tracking-wide">{name}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/DHBottomAvatar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/ui/DHBottomAvatar.tsx plugins/daggerheart-core/__tests__/ui/DHBottomAvatar.test.tsx
git commit -m "feat(daggerheart): add DHBottomAvatar region with 5-layer concentric structure"
```

---

## Task 14: 注册底部头像 Region + 最终集成

**Files:**

- Modify: `plugins/daggerheart-core/index.ts`

注册 DHBottomAvatar region，并确保所有 4 个 region 的注册顺序和 placement 正确。

- [ ] **Step 1: Register bottom avatar region**

In `plugins/daggerheart-core/index.ts`, add:

```typescript
import { DHBottomAvatar } from './ui/DHBottomAvatar'

// Inside onActivate():
sdk.ui.registerRegion({
  id: 'daggerheart-core:bottom-avatar',
  component: DHBottomAvatar as React.ComponentType<{ sdk: unknown }>,
  lifecycle: 'persistent',
  defaultSize: { width: 140, height: 160 },
  minSize: { width: 120, height: 140 },
  defaultPlacement: { anchor: 'bottom-left', offsetX: 400, offsetY: -10 },
  layer: 'standard',
})
```

Note: `bottom-left` + offsetX approximates bottom-center. For true centering, use `anchor: 'bottom-left'` with `offsetX = (viewport.width - 140) / 2`, but since defaultPlacement is static, use a reasonable offset. Users can adjust via edit mode.

- [ ] **Step 2: Verify all 4 regions register correctly**

Ensure `onActivate` now has these registrations:

1. `daggerheart-core:fear-panel` — top center (pill, 340×40)
2. `daggerheart-core:character-card` — left center (card, 220×600)
3. `daggerheart-core:character-list` — top-right (list, 220×400)
4. `daggerheart-core:bottom-avatar` — bottom center (avatar, 140×160)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run plugins/daggerheart-core/`
Expected: All tests PASS

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/index.ts
git commit -m "feat(daggerheart): register bottom avatar region and finalize all 4 UI regions"
```

---

## Task 15: 添加 CSS keyframes + 视觉验证

**Files:**

- May need to add a small CSS snippet for the 80s spin animation

底部头像的符文环需要 80 秒慢速旋转动画。Tailwind 默认的 `animate-spin` 是 1s。

- [ ] **Step 1: Check if custom animation is needed**

Tailwind's `animate-spin` uses `animation: spin 1s linear infinite`. The rune ring needs 80s. Options:

1. Use inline `style={{ animation: 'spin 80s linear infinite' }}` — works because Tailwind defines `@keyframes spin` globally.
2. The RuneRing component already uses this inline approach.

Verify: the inline `animation: 'spin 80s linear infinite'` should work because Tailwind's preflight CSS includes the `spin` keyframe. No additional CSS needed.

- [ ] **Step 2: Visual verification**

Open the app in dev mode and verify:

1. Fear tracker appears as a floating pill at the top
2. Character card appears on the left with attributes, resources, thresholds, experiences, statuses
3. Character list appears on the right with mini avatars
4. Bottom avatar shows with rotating rune ring, HP/Stress arcs, armor plates

Use the layout edit mode (if available) to adjust region positions.

- [ ] **Step 3: Commit any adjustments**

If visual verification reveals needed tweaks (colors, spacing, sizes), fix and commit:

```bash
git add -u
git commit -m "fix(daggerheart): visual polish for UI regions"
```

---

## E2E Test Consideration

After all regions are implemented, an E2E test should verify:

1. Loading a room with daggerheart plugin activates all 4 regions
2. Selecting an active character populates the character card and bottom avatar
3. Fear tracker displays and updates correctly
4. Character list shows all entities in the room

This E2E test is out of scope for this plan (it depends on the full app being wired up) but should be written as a follow-up task.

---

## Summary of Region Registrations

| Region ID                         | Component       | Anchor               | Size    | Layer    |
| --------------------------------- | --------------- | -------------------- | ------- | -------- |
| `daggerheart-core:fear-panel`     | FearPanel       | top-left + offset    | 340×40  | standard |
| `daggerheart-core:character-card` | DHCharacterCard | top-left             | 220×600 | standard |
| `daggerheart-core:character-list` | DHCharacterList | top-right            | 220×400 | standard |
| `daggerheart-core:bottom-avatar`  | DHBottomAvatar  | bottom-left + offset | 140×160 | standard |
