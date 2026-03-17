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

每篇文档记录一个功能区域的设计决策。头部标注实现状态：

- ✅ = 已实现（可能有偏差说明）
- 📋 = 规划中，未实现

| 文档                                                                                  | 状态 | 说明                                                        |
| ------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| [01-产品愿景与设计理念.md](design/01-产品愿景与设计理念.md)                           | ✅   | 核心设计哲学、两种模式、对标产品                            |
| [06-身份系统与WebSocket鉴权方案设计.md](design/06-身份系统与WebSocket鉴权方案设计.md) | 📋   | JWT + 用户账号 + Socket.io 鉴权（Yjs 时代设计，需重新设计） |
| [07-权限与数据隔离方案设计.md](design/07-权限与数据隔离方案设计.md)                   | 📋   | 服务端数据隔离（Yjs 时代设计，需重新设计）                  |
| [09-实体生命周期重构设计.md](design/09-实体生命周期重构设计.md)                       | ✅   | 三值生命周期、Scene-Entity M2M、Blueprint 互转              |
| [10-战斗系统与Token数据模型重构设计.md](design/10-战斗系统与Token数据模型重构设计.md) | ✅   | Token 规范化、per-scene tactical_state、Archive 系统        |
| [11-规则插件系统架构设计.md](design/11-规则插件系统架构设计.md)                       | ✅   | RulePlugin 接口、Phase 1 编译时打包                         |

## 规则系统 (`rule-system/`)

规则插件开发者文档。

| 文档                                                             | 说明                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| [architecture.md](rule-system/architecture.md)                   | 基座与规则的边界、RulePlugin 接口概览          |
| [daggerheart.md](rule-system/daggerheart.md)                     | Daggerheart 规则设计：二元骰、属性、资源、判定 |
| [implementation-phases.md](rule-system/implementation-phases.md) | 分阶段实施计划与进度                           |

## 开发规范 (`conventions/`)

团队（包括 AI agent）必须遵守的操作规范。CLAUDE.md 必读门禁引用这些文件。

| 文档                                                             | 说明                                             |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| [store-actions.md](conventions/store-actions.md)                 | Store action 编写规范（REST → Socket → zustand） |
| [server-infrastructure.md](conventions/server-infrastructure.md) | 服务端路由/中间件编写规范                        |
| [bug-fix-workflow.md](conventions/bug-fix-workflow.md)           | Bug 修复流程（根因分析 → 回归测试 → 系统性预防） |
| [git-workflow.md](conventions/git-workflow.md)                   | Git 分支/提交/PR 规范                            |
| [preview-cli.md](conventions/preview-cli.md)                     | 多分支 Preview CLI 使用指南                      |

## 测试 (`testing/`)

| 文档                                                       | 说明                         |
| ---------------------------------------------------------- | ---------------------------- |
| [strategy.md](testing/strategy.md)                         | 测试策略：四层金字塔、优先级 |
| [plan.md](testing/plan.md)                                 | P0/P1 测试用例与具体实施     |
| [runtime-bug-analysis.md](testing/runtime-bug-analysis.md) | 运行时 bug 分析记录          |

## 归档 (`archive/`)

> 以下文档仅供历史参考，不再维护。

| 目录/文件                       | 说明                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `yjs-architecture/`             | Yjs 时代的架构文档（已迁移到 REST+Socket.io+SQLite） |
| `design-discussion-2026-03-16/` | 早期设计讨论记录                                     |
| `superpowers/`                  | 已完成的 AI agent 执行计划和规格文件                 |
| `implementation-plan.md`        | Yjs 时代实施计划（408 行）                           |
| `backlog.md`                    | 旧版待办（引用 Yjs）                                 |
