# myVTT 文档索引

## 架构文档 (`architecture/`)

当前系统架构的技术文档，描述**已实现**的系统全貌。

| 文档                                                        | 说明                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [overview.md](architecture/overview.md)                     | 系统全貌：技术栈、数据流、模块地图、部署拓扑               |
| [data-model.md](architecture/data-model.md)                 | SQLite schema、Entity/Scene/Token 数据模型、JSON 字段策略  |
| [state-management.md](architecture/state-management.md)     | zustand stores、Socket.io 事件、乐观更新、Selector 规则    |
| [tactical-system.md](architecture/tactical-system.md)       | KonvaMap 层级、Token 拖拽、Archive save/load、战术模式进出 |
| [rule-plugin-system.md](architecture/rule-plugin-system.md) | RulePlugin 7 层接口、注册机制、SDK 边界                    |

## 设计决策记录 (`design/`)

每篇文档记录一个功能区域的设计决策，头部标注当前状态。
**已实现的设计文档不留在此目录 —— 完成即归档至 `archive/design-history/`。**

| 文档                                                                                  | 状态          | 说明                                               |
| ------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------- |
| [01-产品愿景与设计理念.md](design/01-产品愿景与设计理念.md)                           | ✅ 活跃参考   | 核心设计哲学、两种模式、对标产品                   |
| [06-身份系统与WebSocket鉴权方案设计.md](design/06-身份系统与WebSocket鉴权方案设计.md) | ⚠️ 需重新设计 | Yjs 时代方案，当前仅供概念参考                     |
| [07-权限与数据隔离方案设计.md](design/07-权限与数据隔离方案设计.md)                   | ⚠️ 需重新设计 | Yjs 时代方案，当前仅供概念参考                     |
| [12-Schema字段归属迁移设计.md](design/12-Schema字段归属迁移设计.md)                   | 📋 规划中     | 字段归属迁移设计                                   |
| [13-资产与角色系统统一设计.md](design/13-资产与角色系统统一设计.md)                   | 📋 规划中     | 资产与角色统一设计                                 |
| [15-v2-Workflow系统现状.md](design/15-v2-Workflow系统现状.md)                         | ✅ 活跃参考   | Workflow 引擎当前实现状态（权威参考）              |
| [16-事件日志与骰子系统架构.md](design/16-事件日志与骰子系统架构.md)                   | 🚧 实施中     | 事件日志设计，Dispatcher/渲染器待接入（见 doc 17） |
| [17-插件系统演进路线.md](design/17-插件系统演进路线.md)                               | ✅ 活跃参考   | 插件系统三轨道演进计划                             |
| [18-系统架构现状与演进分析.md](design/18-系统架构现状与演进分析.md)                   | ✅ 活跃参考   | 全系统成熟度评估与路线图                           |

## 规则系统 (`rule-system/`)

规则插件游戏规则参考。

| 文档                                         | 说明                                           |
| -------------------------------------------- | ---------------------------------------------- |
| [daggerheart.md](rule-system/daggerheart.md) | Daggerheart 规则设计：二元骰、属性、资源、判定 |

## 计划 (`plans/`)

当前活跃的迁移计划与执行记录。

| 文档                                                             | 说明                                   |
| ---------------------------------------------------------------- | -------------------------------------- |
| [migration-master-plan.md](plans/migration-master-plan.md)       | 插件系统 6 阶段迁移总计划（全部完成）  |
| [phase4-entity-components.md](plans/phase4-entity-components.md) | Phase 4 Entity.components 详细执行计划 |

## 开发规范 (`conventions/`)

团队（包括 AI agent）必须遵守的操作规范。CLAUDE.md 必读门禁引用这些文件。

| 文档                                                             | 说明                                               |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| [store-actions.md](conventions/store-actions.md)                 | Store action 编写规范（REST → Socket → zustand）   |
| [server-infrastructure.md](conventions/server-infrastructure.md) | 服务端路由/中间件编写规范                          |
| [bug-fix-workflow.md](conventions/bug-fix-workflow.md)           | Bug 修复流程（根因分析 → 回归测试 → 系统性预防）   |
| [git-workflow.md](conventions/git-workflow.md)                   | Git 分支/提交/PR 规范                              |
| [ui-patterns.md](conventions/ui-patterns.md)                     | UI 组件与样式规范                                  |
| [sandbox-authoring.md](conventions/sandbox-authoring.md)         | Sandbox 模式编写规范                               |
| [code-quality.md](conventions/code-quality.md)                   | 代码质量：Prettier、ESLint、TypeScript、测试金字塔 |
| [preview-cli.md](conventions/preview-cli.md)                     | 多分支 Preview CLI 使用指南                        |

## 测试 (`testing/`)

| 文档                                                       | 说明                         |
| ---------------------------------------------------------- | ---------------------------- |
| [strategy.md](testing/strategy.md)                         | 测试策略：四层金字塔、优先级 |
| [plan.md](testing/plan.md)                                 | P0/P1 测试用例与具体实施     |
| [runtime-bug-analysis.md](testing/runtime-bug-analysis.md) | 运行时 bug 分析记录          |

## 归档 (`archive/`)

> 以下文档仅供历史参考，不再维护。

| 目录/文件                       | 说明                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `yjs-architecture/`             | Yjs 时代的架构文档（已迁移到 REST+Socket.io+SQLite）    |
| `design-discussion-2026-03-16/` | 早期设计讨论记录                                        |
| `design-history/`               | 已实现的设计决策记录（09, 10, 11, 14, 15, 15a, 16a 等） |
| `exploration-2026-03/`          | 插件系统研究探索文档（研究阶段，已结束）                |
| `superpowers-plans-2026-03/`    | 已完成的 AI agent 执行计划                              |
| `superpowers/`                  | 早期 AI agent 规格文件                                  |
| `implementation-plan.md`        | Yjs 时代实施计划（408 行）                              |
| `backlog.md`                    | 旧版待办（引用 Yjs）                                    |

---

## 文档治理模型

### 核心原则

**架构文档是真理，设计文档是历史。"完成"就等于归档。**

- `docs/architecture/` 和 `docs/conventions/` 是 **Living Docs**：代码改变时必须同步更新，永远反映当前实现。
- `docs/design/` 是 **Decision Records**：记录"为什么这样设计"，实现后归档，**永远不在原地更新**。
- `docs/archive/` 是 **只读历史**：永久保留，供追溯，不再维护。

### 设计文档状态

每篇 `design/` 文档开头**必须有状态行**：

```markdown
> **状态**：📋 规划中 | 2026-03-26
```

三种有效状态（无"已完成"——完成就归档）：

| 状态          | 含义                                     | 生命周期                  |
| ------------- | ---------------------------------------- | ------------------------- |
| `📋 规划中`   | 尚未开始实现                             | 稳定，不漂移              |
| `🚧 实施中`   | 当前 Sprint 正在实现                     | 短暂，Sprint 结束必须消失 |
| `✅ 活跃参考` | 该文档本身是权威参考（如 15-v2、17、18） | 主动维护，等同 Living Doc |

### 各类文档维护规则

| 目录            | 类型            | 触发更新的事件                   |
| --------------- | --------------- | -------------------------------- |
| `architecture/` | Living Doc      | 任何影响系统架构的 PR 合并后     |
| `conventions/`  | Living Doc      | 团队决定改变开发规范时           |
| `design/`       | Decision Record | **不更新**，过时时归档并写新文档 |
| `plans/`        | Active Plan     | PR 合并后归档，新任务时创建      |
| `archive/`      | 只读历史        | 只增加，不修改                   |

### 归档触发条件

1. **设计文档**：对应特性已实现，`architecture/` 已完整描述技术细节 → 移入 `archive/design-history/`
2. **探索文档**：研究阶段结束，结论已体现在设计或架构文档中 → 立即移入 `archive/exploration-{date}/`
3. **执行计划**（superpowers/plans/）：对应 PR 已合并 → 移入 `archive/superpowers-plans-{date}/`
4. **偏差记录**（`*a-*.md`）：已合并入主文档 → 移入 `archive/design-history/`

### 如何判断"设计文档是否可以归档"？

问以下两个问题：

1. 这个特性是否已经实现？
2. 如果有人想了解"这个系统的 X 功能是怎么工作的"，`docs/architecture/` 能否完整回答？

两个答案都是"是" → 归档设计文档。
