# 19 — DaggerHeart 插件演进：头脑风暴记录

> **状态**：✅ 活跃参考 | 2026-03-30
> 目标：通过完善 DaggerHeart 插件，推动 RulePlugin → VTTPlugin 迁移，同时验证和补全基座基础设施

---

## 总体目标

1. **逐步退役 RulePlugin**，将其声明式能力迁移到 VTTPlugin 命令式体系
2. **通过 DaggerHeart 实际需求**发现基座中尚未完善的基础设施
3. **实现一个真正可用的掷骰系统**，包括交互式 modifier 面板、Hope/Fear 数据存储与面板

---

## 方向 A：实体系统泛化

### 背景

当前 Entity 只用于表达角色（PC/NPC）。Hope/Fear 等全局变量存在独立的 `team_trackers` 表中。未来会有更多实体类型（物品、能力卡、法术等）。

### 已达成的设计决策

#### 1. 类型标识：标记组件模式（Tag Component）

**决策：不加 `type` 字段，用组件名本身表达类型。**

```
entity_components:
  entity_id = 'hero-001'
  component_key = 'core:character'   ← 组件名就是类型
  data = {}                          ← 可携带类型级元数据
```

- 查询所有角色：`WHERE component_key = 'core:character'`（纯索引命中，无需 JSON 解析）
- 前端判断：`'core:character' in entity.components`
- **类型定义权交给插件**，基座不需要知道有哪些类型存在
- 不存在"反向查询实体类型"的实际场景——永远是插件问"这是不是我认识的东西"
- 和 Unity DOTS 的 Tag Component、炉石传说的 CARDTYPE tag 是同一模式
- **不需要 schema 变更**

#### 2. 关系模型：关系组件模式

**决策：实体间关系也通过组件表达，不新增表或字段。**

```
entity_components:
  entity_id = 'sword-001'
  component_key = 'core:owned-by'
  data = { "ownerId": "hero-001", "slot": "main-hand" }
```

- 关系种类由插件定义（`core:owned-by`、`daggerheart:attuned-to` 等）
- 反向查询需 JSON 解析，但 VTT 规模（数百实体）下无性能问题
- **不需要 schema 变更**

#### 3. Tracker 迁移

`team_trackers` 表未来迁移为普通实体 + tracker 标记组件：

```
entity: hope-fear-tracker
components:
  'core:tracker': { current: 3, max: 10, color: '#fbbf24' }
  'core:identity': { name: 'Hope', ... }
```

lifecycle 设为 `persistent`，无 owner（房间级全局）。

### 核心原则

- **一切通过组件，不加新字段/新表**，除非被证明真的有必要
- 实体的类型边界不由基座决定，完全取决于插件开发者如何编写组件
- `entities` 表和 `entity_components` 表 schema 保持不变

---

## 方向 B：工作流交互面板

> **结论已产出** → 详见 [20-UI 注册系统扩展方案](20-UI注册系统扩展方案.md)

### 能力评估结论

经过深入讨论，发现现有基础设施覆盖了绝大多数需求：

- **持久面板**：`registerComponent` + `PanelRenderer` ✅
- **面板内弹出**：Radix Portal 默认渲染到 body，绕过 `overflow:hidden` ✅
- **日志卡片**：`RendererRegistry` ✅
- **跨玩家交互**：workflow 编排模式（日志 + trigger 串联），不需要跨客户端 UI 推送 ✅

### 唯一基础设施缺口

`requestInput` ↔ 瞬态 UI 桥接：需要 `registerInputHandler(inputType, component)` 让插件注册输入处理组件，系统自动串联 workflow 暂停 → 渲染组件 → 用户操作 → workflow 恢复。

### 关键设计决策

- 组件自行决定渲染形态（Dialog / Popover / 自定义），平台不约束
- 默认无超时，取消返回 Result 类型（非异常）
- workflow 只知道输入类型名（语义契约），不知道具体组件
- 跨玩家交互通过 workflow 编排解决，`requestInput` 保持纯本地

---

## 方向 C：插件迁移（RulePlugin → VTTPlugin）

### 背景

目前 RulePlugin 承担的能力需要逐步迁移到 VTTPlugin：

| RulePlugin 能力 | 迁移目标 | 状态 |
|----------------|---------|------|
| `adapters`（getMainResource, getFormulaTokens 等） | VTTPlugin 通过组件直接读取 | 未开始 |
| `characterUI.EntityCard` | `sdk.ui.registerComponent` | 未开始 |
| `diceSystem.evaluateRoll / getJudgmentDisplay` | 工作流步骤 + RendererRegistry | 部分完成 |
| `surfaces.panels / teamPanel` | `sdk.ui.registerComponent` | 未开始 |
| `dataTemplates` | Blueprint 系统 | 未开始 |

### 计划

以角色卡（EntityCard）作为第一个迁移目标。具体方案待设计。

---

## 待讨论话题

- [x] modifier 面板的具体交互形态 → 组件自决（Radix Dialog/Popover），见 doc 20
- [x] 瞬态 UI 表面系统的具体设计方案 → `registerInputHandler` + Portal 渲染，见 doc 20
- [x] EntityCard 迁移到 VTTPlugin 的具体步骤 → 肖像栏暴露注册点 + 统一 SDK，见 doc 20
- [x] 三个方向的优先级排序 → UI 系统是唯一架构阻塞项，实体系统和迁移是设计决策
- [ ] 掷骰工作流的完整链路设计（命令 → modifier → 掷骰 → 判定 → 渲染）
- [ ] Hope/Fear 面板的具体需求和 UI 形态
