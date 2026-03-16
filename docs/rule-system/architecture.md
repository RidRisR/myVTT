# 规则系统架构

## 1. 动机

myVTT 提供通用骨架（场景、实体、Token、权限、聊天），规则层作为独立模块插入。不同 TRPG 规则系统（Daggerheart、DnD 5e、CoC 等）通过插件适配，骨架本身不绑定任何规则概念。

## 2. 核心原则

### 基座负责「机制」，规则负责「语义」

**机制**：事物如何运作。掷骰子的物理过程、数据同步、消息发送、UI 容器渲染。无论玩什么规则，这些都一样。

**语义**：事物意味着什么。「这次掷骰的 Hope 更高所以有好处」、「43 ≤ 65 所以技能检定成功」。这些完全取决于规则。

基座不理解任何规则概念。它知道怎么投骰子、怎么同步数据、怎么显示结果，但不知道什么是 Hope、什么是大失败。

### 规则模块是内置的（Phase 1）

当前阶段不做外部插件/脚本系统。规则模块是项目源码中的 TypeScript 文件，与基座一起编译。「插拔」的含义不是文件层面的删除，而是代码组织层面的解耦——所有与某规则相关的代码集中在一个目录下，通过 `RulePlugin` 接口与基座交互。

### 一个房间一个规则

房间创建时确定规则（`room_state.rule_system_id`），之后不可切换。避免了数据迁移和状态混乱问题。

## 3. 基座与规则的边界

### 基座提供

| 能力           | 说明                                                 | 关键文件                        |
| -------------- | ---------------------------------------------------- | ------------------------------- |
| **掷骰引擎**   | 表达式解析、随机投掷、计算结果                       | `src/shared/diceUtils.ts`       |
| **聊天系统**   | 消息发送/接收、骰子动画、消息历史                    | `src/chat/`                     |
| **数据同步**   | REST API 初始化 + Socket.io 实时广播 + SQLite 持久化 | `server/routes/`, `src/stores/` |
| **战术地图**   | Grid、Token 拖拽、缩放平移                           | `src/combat/`                   |
| **场景显示**   | 全屏氛围图、场景切换                                 | `src/scene/`                    |
| **UI 容器**    | 侧边栏框架、弹出面板、浮动 UI 定位                   | `src/gm/`, `src/identity/`      |
| **共享组件库** | ResourceBar、MiniHoldButton、useHoldRepeat           | `src/shared/ui/`                |
| **身份系统**   | 座位认领、在线状态、头像栏                           | `src/identity/`                 |

### 规则提供（通过 RulePlugin 接口）

| 层级               | 必需 | 说明                                            |
| ------------------ | ---- | ----------------------------------------------- |
| **adapters**       | ✅   | Entity → 资源/属性/状态/公式变量的读取适配      |
| **characterUI**    | ✅   | `EntityCard` 组件（角色卡 UI slot）             |
| **diceSystem**     | 可选 | 掷骰动作、判定逻辑、骰子样式、自定义投骰命令    |
| **dataTemplates**  | 可选 | 默认 ruleData 模板 + 预设模板                   |
| **surfaces**       | 可选 | 插件面板、Dock/GM Tab、团队面板、骰子卡片渲染器 |
| **hideElements**   | 可选 | 声明式隐藏基座 UI 元素                          |
| **ruleResolution** | 预留 | 规则判定（未实现）                              |

### 保持通用的部分

以下部分不做规则特化：

- **CharacterHoverPreview**：通用简要预览，通过 `adapters` 读取数据
- **PortraitBar**：头像 + 资源环，取前 2 个资源
- **战术地图**：Grid、Token 拖拽。不自动化移动规则
- **状态标签**：纯文本，不带机械效果
- **聊天文本消息**：纯文本消息与规则无关

## 4. RulePlugin 接口

完整定义见 `src/rules/types.ts`（约 197 行）。SDK 导出见 `src/rules/sdk.ts`。

```typescript
interface RulePlugin {
  id: string
  name: string

  // Layer 1: 数据适配（必需）
  adapters: {
    getResources(ruleData: unknown): ResourceView[]
    getAttributes(ruleData: unknown): AttributeView[]
    getStatuses(ruleData: unknown): StatusView[]
  }

  // Layer 2: 角色 UI（必需）
  characterUI: {
    EditPanel: React.ComponentType<CharacterEditPanelProps>
    DetailPanel: React.ComponentType<CharacterDetailPanelProps>
    HoverPreview?: React.ComponentType<CharacterHoverPreviewProps>
  }

  // Layer 3-7: 可选层
  diceSystem?: { ... }
  dataTemplates?: { ... }
  surfaces?: { ... }
  hideElements?: { ... }
  ruleResolution?: { ... }
}
```

## 5. 注册与加载

```typescript
// src/rules/registry.ts
const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin // 回退到通用插件
}
```

基座代码通过 `getRulePlugin(roomState.ruleSystemId)` 获取当前房间的插件，然后调用插件接口。只有 `registry.ts` 直接导入插件模块，其他基座代码仅通过 `getRulePlugin()` 访问。

## 6. 目录结构

```
src/rules/
├── types.ts                  # RulePlugin 接口 + 所有类型定义
├── registry.ts               # 插件注册表（唯一导入插件目录的文件）
├── sdk.ts                    # 对外导出（类型 + 工具函数）

plugins/
├── generic/                  # 通用插件（无规则特化）
│   └── index.ts
└── daggerheart/              # Daggerheart 插件
    ├── index.ts              # 插件入口，组装 RulePlugin
    ├── adapters.ts           # Layer 1 适配器
    ├── components/           # Layer 2 角色卡组件
    └── diceActions.ts        # Layer 3 掷骰动作
```

## 7. 已知 trade-off

- **接口基于有限样本设计**：RulePlugin 基于 generic + daggerheart 两个插件设计，第三个规则可能需要接口调整
- **角色卡有一定代码重复**：每个规则写自己的角色卡组件，通过共享基座组件（ResourceBar 等）减少重复
- **entityAdapters.ts 过渡层**：旧适配器仍有 6 个调用方，完全迁移到 `plugin.adapters` 是待办事项
