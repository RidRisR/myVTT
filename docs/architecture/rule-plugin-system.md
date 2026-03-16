# 规则插件系统

## 概述

myVTT 的骨架（场景、实体、Token、聊天）不绑定任何 TRPG 规则。规则通过 `RulePlugin` 接口插入，每个房间在创建时选择一个规则（`room_state.rule_system_id`），之后不可切换。

当前阶段（Phase 1）插件与基座一起编译，通过静态注册表加载。

## RulePlugin 接口（6+1 层）

完整定义见 `src/rules/types.ts`（约 197 行）。

```typescript
interface RulePlugin {
  id: string // 'generic' | 'daggerheart' | ...
  name: string // 显示名
  sdkVersion: '1' // SDK 版本

  // ── Layer 1: 数据适配（必需） ──
  adapters: {
    getMainResource(entity: Entity): ResourceView | null
    getPortraitResources(entity: Entity): ResourceView[]
    getStatuses(entity: Entity): StatusView[]
    getFormulaTokens(entity: Entity): Record<string, number>
  }

  // ── Layer 2: 角色 UI（必需） ──
  characterUI: {
    EntityCard: React.ComponentType<EntityCardProps>
  }

  // ── Layer 3: 骰子系统（可选） ──
  diceSystem?: {
    getRollActions(entity: Entity): RollAction[]
    evaluateRoll(rolls: number[][], total: number): JudgmentResult | null
    getDieStyles(terms: DiceTermResult[]): DieStyle[]
    getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
    getModifierOptions(): ModifierOption[]
    rollCommands?: Record<string, { resolveFormula(modifierExpr?: string): string }>
  }

  // ── Layer 4: 数据模板（可选） ──
  dataTemplates?: {
    createDefaultEntityData(): unknown
    getPresetTemplates?(): PresetTemplate[]
  }

  // ── Layer 5: UI 表面（可选） ──
  surfaces?: {
    panels?: PluginPanelDef[] // 浮动/全屏插件面板
    dockTabs?: DockTabDef[] // 底栏自定义 Tab
    gmTabs?: GMTabDef[] // GM 侧边栏自定义 Tab
    teamPanel?: React.ComponentType<TeamPanelProps> // 团队面板替换
    rollCardRenderers?: Record<string, React.ComponentType<RollCardProps>> // 自定义骰子卡片
  }

  // ── Layer 6: 隐藏基座 UI 元素（可选） ──
  hideElements?: HideableElement[]
  // HideableElement = 'dock' | 'portrait-bar' | 'chat-panel' | 'gm-panel' | 'scene-controls'

  // ── Layer 7: 规则判定 — 预留，未实现 ──
  // ruleResolution?: RuleResolutionModule
}
```

### 层的依赖关系

```
Layer 1 (adapters) ◄── 被基座通用组件调用（TokenTooltip, PortraitBar, selectors）
Layer 2 (characterUI) ◄── 被 GmSidebar / CharacterCard 容器渲染
Layer 3 (diceSystem) ◄── 被 ChatPanel 掷骰流程调用
Layer 4 (dataTemplates) ◄── 被 Entity 创建流程调用
Layer 5 (surfaces) ◄── 被基座 UI 框架注入（面板、Tab、骰子卡片）
Layer 6 (hideElements) ◄── 被基座 UI 条件渲染
Layer 7 (ruleResolution) ◄── 预留
```

## 注册与发现

```typescript
// src/rules/registry.ts — 唯一导入插件目录的文件
import { genericPlugin } from '../../plugins/generic/index'
import { daggerheartPlugin } from '../../plugins/daggerheart/index'

const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

// 获取插件（不存在时回退到 generic）
export function getRulePlugin(id: string): RulePlugin

// 注册新插件
export function registerPlugin(plugin: RulePlugin): void

// 可用插件列表（用于房间创建 UI）
export function getAvailablePlugins(): Array<{ id: string; name: string }>
```

**关键约束**：基座代码只通过 `getRulePlugin()` 访问插件，不直接导入 `plugins/` 目录。

## SDK 导出

`src/rules/sdk.ts` 是插件开发者的入口，导出：

- **类型**：RulePlugin, ResourceView, AttributeView, StatusView, CharacterEditPanelProps, CharacterDetailPanelProps, CharacterHoverPreviewProps, RollAction, DieStyle, DiceTermResult, TokenBarConfig, JudgmentResult, JudgmentDisplay, RollContext, EntityLifecycle 等（约 25 个）
- **工具函数**：插件可复用的基座能力

## 已有插件

### generic（通用）

无规则特化的基线插件。提供：

- Layer 1: 委托 `entityAdapters.ts` 从 `ruleData.resources` / `ruleData.attributes` / `ruleData.statuses` 直接读取
- Layer 2: 通用的 `GenericEntityCard` 组件

### daggerheart

Daggerheart TRPG 规则插件。提供：

- Layer 1: Daggerheart 专属资源/属性适配（HP, Stress, Hope, 6 属性）
- Layer 2: `DaggerHeartCard` 角色卡组件
- Layer 3: 二元骰（2d12 Hope/Fear）掷骰动作 + 自定义 rollCommands
- Layer 4: 默认 ruleData 模板 + 预设模板
- Layer 5: 全屏角色面板（`FullCharacterSheet`）、自定义骰子卡片（`DHRollCard`）、团队面板（`DHTeamPanel`）

## 目录结构

```
src/rules/
├── types.ts           # RulePlugin 接口 + 所有类型（约 197 行）
├── registry.ts        # 插件注册表（唯一导入 plugins/ 的文件）
└── sdk.ts             # SDK 导出

plugins/
├── generic/
│   └── index.ts       # genericPlugin
└── daggerheart/
    ├── index.ts        # daggerheartPlugin 入口
    ├── adapters.ts     # Layer 1
    ├── components/     # Layer 2 角色卡组件
    └── diceActions.ts  # Layer 3
```

## 基座如何调用插件

```typescript
// 典型调用模式
const plugin = getRulePlugin(roomState.ruleSystemId)

// Layer 1: 通用组件读取数据
const resources = plugin.adapters.getResources(entity.ruleData)
const attributes = plugin.adapters.getAttributes(entity.ruleData)

// Layer 2: 渲染角色卡
<plugin.characterUI.EditPanel entity={entity} onUpdate={handleUpdate} />

// Layer 4: 创建 Entity 时填充默认数据
const defaultRuleData = plugin.dataTemplates?.getDefaultRuleData('ephemeral')
```

## 过渡层：entityAdapters.ts

`src/shared/entityAdapters.ts` 是 Phase 1 遗留的过渡适配器，在插件系统之前提供 Entity → 资源/属性/状态的读取。

**当前仍有 6 个调用方**：

1. `TokenTooltip.tsx`
2. `selectors.ts`
3. `CharacterEditPanel.tsx`
4. `CharacterDetailPanel.tsx`
5. `CharacterHoverPreview.tsx`
6. `plugins/generic/index.ts`

**迁移计划**：逐步将调用方改为通过 `getRulePlugin().adapters` 调用，最终删除 `entityAdapters.ts`。

## 路线图

| 阶段                       | 状态      | 内容                               |
| -------------------------- | --------- | ---------------------------------- |
| Phase 1: 编译时打包        | ✅ 已完成 | 插件作为源码编译，静态注册         |
| Phase 2: 独立编译+重启加载 | 📋 规划中 | 插件编译为独立 bundle，动态 import |
| Phase 3: 热加载            | 📋 远期   | 运行时加载/卸载，无需重启          |
