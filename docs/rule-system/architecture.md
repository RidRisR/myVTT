# 规则系统架构

## 1. 动机

当前 myVTT 的掷骰体验纯手动：玩家输入 `.r 2d6+@STR`，没有一键掷骰，没有判定结果，没有规则感知。角色卡、属性结构、骰子显示都是通用的，无法针对特定 TRPG 规则做优化。

目标是引入「规则系统」层，让基座保持通用的同时，允许针对特定规则（首先是 Daggerheart）做深度定制。

## 2. 核心原则

### 基座负责「机制」，规则负责「语义」

**机制**：事物如何运作。掷骰子的物理过程、数据同步、消息发送、UI 容器渲染。无论玩什么规则，这些都一样。

**语义**：事物意味着什么。「这次掷骰的 Hope 更高所以有好处」、「43 ≤ 65 所以技能检定成功」。这些完全取决于规则。

基座不理解任何规则概念。它知道怎么投骰子、怎么同步数据、怎么显示结果，但不知道什么是 Hope、什么是大失败。

### 规则模块是内置的

不做外部插件/脚本系统。规则模块是项目源码中的 TypeScript 文件，与基座一起编译。「插拔」的含义不是文件层面的删除，而是代码组织层面的解耦 — 所有与某规则相关的代码集中在一个目录下，通过接口与基座交互。

### 一个房间一个规则

房间创建时确定规则，之后不可切换。避免了数据迁移和状态混乱问题。（当前开发阶段直接硬编码 Daggerheart，房间选择功能后续再做。）

## 3. 基座与规则的边界

### 基座提供

| 能力 | 说明 | 关键文件 |
|------|------|----------|
| **掷骰引擎** | 表达式解析、随机投掷、计算结果 | `src/shared/diceUtils.ts` |
| **聊天系统** | 消息发送/接收、骰子动画、消息历史 | `src/chat/` |
| **数据同步** | Yjs CRDT 同步、LevelDB 持久化 | `src/App.tsx`, `server/` |
| **战斗地图** | Grid、Token 拖拽、缩放平移 | `src/combat/` |
| **场景显示** | 全屏场景图、场景切换 | `src/scenes/` |
| **UI 容器** | 侧边栏框架、弹出面板、浮动 UI 定位 | `src/layout/` |
| **共享组件库** | ResourceBar、MiniHoldButton、useHoldRepeat | `src/shared/ui/` |
| **身份系统** | 座位认领、在线状态、头像栏 | `src/identity/` |

### 规则提供

| 能力 | 说明 |
|------|------|
| **角色卡组件** | 完整的 React 组件，自由使用共享组件库 |
| **角色初始化数据** | 默认属性列表、默认资源列表 |
| **掷骰动作** | 可点击的按钮列表（名称 + 公式） |
| **判定逻辑** | 投掷结果 → 判定结果（Success+Hope / 困难成功 / ...） |
| **骰子样式** | 骰子着色配置（Hope=金色, Fear=紫色） |
| **判定显示** | 判定结果的文字、颜色、严重度 |
| **修正选项** | 投掷前可用的修正开关（奖惩骰、优势等） |

### 保持通用的部分

以下部分不做规则特化：

- **CharacterHoverPreview**：通用简要预览，显示资源条 + 属性值
- **PortraitBar**：头像 + 资源环，取前 2 个资源
- **战斗地图**：Grid、Token 拖拽。不自动化移动规则
- **状态标签**：纯文本，不带机械效果
- **聊天文本消息**：纯文本消息与规则无关

## 4. RuleSystem 接口

接口遵循最小化原则 — 只定义当前实现确实需要的方法，不预测未来。随着更多规则实现，接口自然演化。

```typescript
// src/rules/types.ts

interface RuleSystem {
  id: string
  name: string

  // ── 角色初始化 ──
  getDefaultAttributes(): Attribute[]
  getDefaultResources(): Resource[]

  // ── 角色卡 ──
  // 完整的 React 组件，由规则自由实现
  // 可引用基座的共享组件：ResourceBar, MiniHoldButton 等
  CharacterCard: React.ComponentType<CharacterCardProps>

  // ── 掷骰动作 ──
  // 根据角色当前状态返回可用动作列表
  getRollActions(character: Character): RollAction[]

  // ── 判定 ──
  evaluateRoll(
    termResults: DiceTermResult[],
    total: number,
    context: RollContext
  ): JudgmentResult | null

  // ── 显示定制 ──
  getDieStyles(termResults: DiceTermResult[]): DieStyle[]
  getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay

  // ── 修正选项 ──
  getModifierOptions(): ModifierOption[]
}

// ── 基座为角色卡组件提供的 props ──
interface CharacterCardProps {
  character: Character
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void
  onRollAction: (action: RollAction) => void
}
```

### 关键类型定义

```typescript
// 掷骰动作
interface RollAction {
  id: string
  name: string       // "Agility Check"
  formula: string    // "2d12+@Agility"
  category?: string  // "action", "skill", "combat"
  targetAttributeKey?: string  // CoC: 对比哪个属性/技能值
}

// 修正选项
interface ModifierOption {
  id: string
  label: string           // "奖励骰", "优势"
  type: 'toggle'
  mutuallyExclusiveWith?: string
}

// 判定结果（每个规则定义自己的 shape）
type JudgmentResult =
  | { type: 'daggerheart'; hopeDie: number; fearDie: number; outcome: DaggerheartOutcome }
  | { type: 'coc'; roll: number; targetValue: number; successLevel: CoCSuccessLevel }
  | { type: 'target_check'; total: number; dc: number; success: boolean; margin: number }

// 判定显示配置
interface JudgmentDisplay {
  text: string        // "成功 (Hope)"
  color: string       // "#22c55e"
  severity: 'critical' | 'success' | 'partial' | 'failure' | 'fumble'
}

// 骰子样式
interface DieStyle {
  termIndex: number
  dieIndex: number
  label?: string     // "Hope"
  color?: string     // "#f59e0b"
}

// 投掷上下文
interface RollContext {
  dc?: number                // 难度值
  targetValue?: number       // 对比值（CoC 技能值）
  activeModifierIds: string[] // 激活的修正选项
  tempModifier: number       // 临时 +/- 修正
}
```

## 5. 基座需要提供的接口/扩展点

规则模块不直接操作基座内部组件。基座通过以下方式接纳规则的输出：

### 5.1 角色卡容器

`MyCharacterCard.tsx` 重构为容器壳：

```
┌─ 侧边栏框架 (基座) ─────────────┐
│ 打开/关闭动画、定位、外框样式     │
│                                  │
│  ┌─ 角色卡内容 (规则提供) ─────┐ │
│  │ DaggerheartCard / CoCCard  │ │
│  │ 自由使用 ResourceBar 等     │ │
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

基座负责侧边栏的展开/折叠、定位、z-index。内容完全由规则组件决定。

### 5.2 ChatRollMessage 扩展

ChatRollMessage 新增可选字段，基座的聊天系统负责序列化/同步：

```typescript
interface ChatRollMessage {
  // ...existing fields (expression, terms, total, etc.)
  actionName?: string          // "Agility Check"
  judgment?: JudgmentResult    // 判定结果数据
  modifiersApplied?: string[]  // ["奖励骰"]
}
```

### 5.3 DiceResultCard 判定区域

DiceResultCard 在总数下方预留判定显示区域：

```
┌─ DiceResultCard ────────────┐
│ [🎲7] [🎲4] +2             │  ← 骰子动画 (支持 DieStyle 着色)
│ ─────────────               │
│ 总计: 13                     │
│ ┌─ 判定标签 ──────────────┐ │  ← 如果 judgment 存在
│ │ 成功 (Hope) ✨           │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 5.4 DiceReel 着色

DiceReel 接受 `color?: string` prop。基座不关心为什么要着色（Hope/Fear 是规则概念），只负责渲染。

### 5.5 RollConfirmPanel

基座提供通用的投掷确认面板组件：

```
┌─ RollConfirmPanel (基座) ──────────┐
│  动作名: Agility Check              │
│  公式: 2d12 + @Agility → 2d12 + 2  │
│  ──────────────────────             │
│  临时修正: [+/-] [__0__]            │
│  ──────────────────────             │
│  ☐ 修正选项 A    (规则注册)          │
│  ☐ 修正选项 B    (规则注册)          │
│  ──────────────────────             │
│  难度值 DC: [__15__]  (可选)         │
│  ──────────────────────             │
│         [ 🎲 投掷！ ]              │
└─────────────────────────────────────┘
```

面板框架是基座组件，修正选项内容来自 `ruleSystem.getModifierOptions()`。

## 6. 数据模型调整

### Attribute 加 category

```typescript
interface Attribute {
  key: string
  value: number
  category?: string  // 规则用来分组。CoC: "characteristic" | "skill"
}
```

基座的 CharacterHoverPreview 等通用组件可以按 category 分组显示。

### favorites → rollActions 迁移

现有 `Character.favorites?: DiceFavorite[]` 保留做向后兼容。规则模块通过 `getRollActions()` 动态生成动作列表，不依赖持久化的 favorites。

## 7. 掷骰流程

```
用户点击角色卡掷骰按钮
  │
  ▼
基座弹出 RollConfirmPanel
  │ 显示公式 + 规则提供的修正选项 + DC 输入
  │
  ▼
用户点击「投掷！」
  │
  ▼
基座执行掷骰:
  │ 1. resolveFormula() — @变量替换
  │ 2. 应用修正（临时 +/-，规则特定修正）
  │ 3. rollCompound() — 物理掷骰
  │
  ▼
规则执行判定:
  │ ruleSystem.evaluateRoll(termResults, total, context)
  │ → JudgmentResult
  │
  ▼
规则生成显示:
  │ ruleSystem.getDieStyles() → DieStyle[]
  │ ruleSystem.getJudgmentDisplay() → JudgmentDisplay
  │
  ▼
基座发送消息:
  │ ChatRollMessage { ..., actionName, judgment, modifiersApplied }
  │ → Yjs 同步到所有客户端
  │
  ▼
基座渲染结果:
  DiceResultCard + DiceReel (应用着色) + JudgmentBadge (显示判定)
```

## 8. 目录结构

```
src/
├── rules/
│   ├── types.ts                  # RuleSystem 接口 + 所有类型
│   ├── registry.ts               # getRuleSystem(id) 注册表
│   ├── daggerheart/
│   │   ├── index.ts              # DaggerheartRuleSystem 实现
│   │   ├── DaggerheartCard.tsx   # 角色卡组件
│   │   └── judgment.ts           # Hope/Fear 判定逻辑
│   └── (未来)
│       ├── coc/
│       └── freeform/
│
├── dice/                         # 基座掷骰 UI 组件
│   ├── RollConfirmPanel.tsx      # 投掷确认面板
│   └── JudgmentBadge.tsx         # 判定标签
│
├── shared/
│   ├── diceUtils.ts              # 掷骰引擎 (不改)
│   ├── tokenTypes.ts             # Attribute 加 category
│   └── ui/
│       ├── ResourceBar.tsx       # 共享 (规则可引用)
│       └── MiniHoldButton.tsx    # 共享 (规则可引用)
│
├── chat/
│   ├── chatTypes.ts              # ChatRollMessage 扩展
│   ├── DiceResultCard.tsx        # 判定区域 + DieStyle
│   ├── DiceReel.tsx              # color prop
│   └── ...
│
└── layout/
    └── MyCharacterCard.tsx       # 重构为容器壳
```

## 9. 已知的 trade-off

### 接口可能需要迭代

RuleSystem 接口基于一个规则（Daggerheart）设计，第二个规则（CoC）可能需要接口调整。这是有意为之的 — 先做一个做透，再提炼抽象。

### 角色卡有一定代码重复

每个规则写自己的角色卡组件（~200-400 行 JSX）。这些组件共享小组件（ResourceBar 等）但整体布局独立。对于 2-3 个规则来说，这是合理的换取完全自由度的代价。

### UI 定制的边界

规则模块不返回骰子动画组件，只返回样式配置（DieStyle）。如果某个规则需要基座不支持的显示能力，需要先给基座加能力。这限制了规则的显示自由度，但保持了基座的控制权。

### 修正系统的简化

当前设计中修正选项是简单的 toggle。CoC 的奖惩骰实际上需要特殊的骰子投掷逻辑（多个十位骰取最低/最高），这超出了简单 toggle 的范围。到 CoC 实现时需要扩展修正系统，可能让规则模块提供自定义的掷骰逻辑。

## 10. Phase 2: 目标系统（设计预留）

Phase 2 在 Phase 1 完成后再细化。当前只记录方向：

- `resolveFormula` 扩展 `@target.KEY` 语法
- 战斗模式下的目标选择 UI（点击 token 设为目标）
- RuleSystem 接口扩展 `getTargetActions(attacker, target)`
- 攻击流程：投掷 → 判定命中 → 自动投伤害 → **确认面板** → 扣除 HP
- 半自动模式：伤害计算后弹出确认，玩家/GM 可调整后确认扣除
