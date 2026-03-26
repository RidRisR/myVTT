# 文档重组讨论记录 — 2026-03-16

> 本文档记录 myVTT 文档重组过程中的逐项审查结论。
> 讨论议程见 [plan](/.claude/plans/glimmering-discovering-gizmo.md)

---

## 议题 0：产品愿景与设计理念 ✅

**文件**: `docs/design/01-产品愿景与设计理念.md`

### 结论

| 项目               | 结论                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 四项设计哲学       | ✅ 全部仍适用，无需修改                                                                                                                                                                                                |
| 战术叠加 vs 切屏   | ✅ **已解决** — SceneViewer `backdrop-blur-[8px]` + `bg-deep/50` 毛玻璃，TacticalPanel `fixed inset-0 z-tactical` 浮层 + `radial-gradient` 暗角融合，400ms/250ms 同步动画。doc 01 第 70 行的 ⚠️ 标注应更新为「已实现」 |
| Alchemy RPG 对标   | ✅ 保持，补充差异点：更多自定义插件 + 更方便的轻备团                                                                                                                                                                   |
| Showcase / Handout | 🔴 **空白状态** — Showcase 有完整后端 CRUD + Socket.io 事件，Handout 是遗留本地代码（无 REST API），概念未定义清楚。标注为「需重新设计」                                                                               |

### Action Items

- [ ] doc 01 第 70 行 ⚠️ 警告更新为已实现
- [ ] Showcase/Handout 区域标注为「待设计」
- [ ] 现有 `handoutAssets` 代码清理时决定去留

---

## 议题 1：系统架构全貌 ✅

**文件**: 无（需新建 `architecture/overview.md`）

### 结论

| 决定             | 内容                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| overview.md 骨架 | 技术栈 + 数据流图 + 前端模块地图(18目录) + 服务端模块(11路由) + 部署拓扑 + 各专题文档链接 |
| overview.md 粒度 | 高层视角，细节放各专题文档（渐进披露）                                                    |
| CLAUDE.md 改造   | 三层结构：① 必读门禁 ② 防错速查（Gotchas/CodeQuality/UI/设计原则）③ 精简摘要+链接         |
| Socket.io 事件表 | 放到 state-management.md，不在 overview 中展开                                            |

### CLAUDE.md 三层结构设计

```
第一层：必读门禁（Keep as-is）
  → 「做 X 之前必须先读 Y」——防错第一关

第二层：防错速查（Keep as-is）
  → Architecture Gotchas / Code Quality / UI Patterns / Design Principles
  → 标准：「agent 不知道这条信息会写出错误代码吗？」→ 是则保留

第三层：架构速览（Slim → 摘要+链接）
  → Entity System / State Management / Server Architecture
  → 各 3-5 行摘要 + 链接 architecture/ 详细文档
```

### Action Items

- [ ] 新建 `docs/architecture/overview.md`
- [ ] CLAUDE.md 第三层精简（Entity/State/Server），添加指向 architecture/ 的链接

---

## 议题 2：数据模型与 Schema ✅

**文件**: 无（需新建 `architecture/data-model.md`）
**参考**: `server/schema.ts` (1全局+13房间表), `src/shared/entityTypes.ts`

### Schema 概览

**全局**: rooms (注册表)

**房间基础**: room_state (单行，activeSceneId/tacticalMode/pluginConfig), seats, scenes

**实体核心**: entities (lifecycle/permissions/ruleData), scene_entities (M2M + visible)

**战术系统**: tactical_state (per-scene), tactical_tokens (UNIQUE scene+entity), archives, archive_tokens (snapshot)

**辅助**: chat_messages, assets, team_trackers, showcase_items

### 审查结论

| #   | 问题                                         | 结论                                                                                                                                                                     |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `rule_system_id` 的位置                      | 🔴 **需迁移** — 当前在 `room_state`（可随时修改），应移到 `rooms` 全局表（创建时确定，不可修改）。`PATCH /state` 不再接受此字段                                          |
| 2   | `active_archive_id` 的位置                   | 🔴 **需迁移** — 从 `room_state` 移到 `tactical_state`（per-scene）。理由：archive 属于 scene，active_archive 应跟着 scene；持久化可在刷新后保留；UI 可高亮当前加载的存档 |
| 3   | `UNIQUE(scene_id, entity_id)`                | ✅ **有意设计** — 同一实体同场景只能有一个 Token                                                                                                                         |
| 4   | Entity.width/height vs MapToken.width/height | ✅ **不冗余** — Entity 是默认占地尺寸，Token 是实际尺寸（可独立修改，如 enlarge/reduce）。见 design doc 10 议题 1                                                        |
| 5   | chat_messages sender 冗余                    | ✅ **有意设计** — 无 FK 到 seats，历史消息保留发送时的快照信息                                                                                                           |
| 6   | archive_tokens.snapshot_data                 | ✅ **符合设计** — ephemeral 存完整快照，reusable/persistent 存 null + original_entity_id 引用                                                                            |
| 7   | archive load 的 scene_entity 检查            | ✅ **已实现** — `archives.ts:269` 的 orphan 查询正确用 `NOT EXISTS scene_entities` 区分场景角色/战术对象。但只处理 ephemeral，reusable 战术对象不清理（边界场景少见）    |
| 8   | entityTypes.ts 中的 SceneV2                  | 🔴 **死代码** — 全项目无 import，连同 ArchiveData 一起删除                                                                                                               |

### Action Items

- [ ] `rule_system_id` 从 `room_state` 迁移到 `rooms` 全局表
- [ ] `active_archive_id` 从 `room_state` 迁移到 `tactical_state`（per-scene）
- [ ] 删除 `entityTypes.ts` 中的 `SceneV2` 和 `ArchiveData` 死代码
- [ ] 新建 `docs/architecture/data-model.md`

---

## 议题 3：状态管理与数据同步 ✅

**文件**: 无（需新建 `architecture/state-management.md`）
**参考**: `src/stores/worldStore.ts` (1003行), `identityStore.ts` (196行), `uiStore.ts` (140行), `assetStore.ts` (128行), `selectors.ts` (87行)

### Store 架构概览

| Store         | 行数 | 状态切片 | Actions | Socket 事件 | 持久化                  |
| ------------- | ---- | -------- | ------- | ----------- | ----------------------- |
| worldStore    | 1003 | 14       | 48      | 31          | 无（服务端持久）        |
| identityStore | 196  | 3        | 7       | 5           | sessionStorage (seatId) |
| uiStore       | 140  | 11       | 13      | 0           | localStorage (theme)    |
| assetStore    | 128  | 2        | 7       | 0           | 无                      |
| selectors     | 87   | —        | 13 函数 | —           | —                       |

### 审查结论

| #   | 问题                    | 结论                                                                                                                                                                                 |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | worldStore 是否需要拆分 | ✅ **暂不拆分** — 内部已按资源分组，跨资源操作（如 loadArchive 涉及 entities/tokens/tactical/archives）在单 store 中更简单。超过 1500 行再考虑                                       |
| 2   | 乐观更新策略            | ✅ **策略一致** — 仅 3 处使用乐观更新（createEphemeralNpcInScene、spawnEphemeralTokenAtPosition、pinShowcaseItem），其余等 Socket 事件。只在「用户期望即时反馈」的场景使用，无需统一 |
| 3   | N+1 初始化请求          | ⚠️ **backlog 优化项** — `loadAll()` 执行 7+1+N 个 REST 请求（N = 场景数量的 per-scene entity 请求）。可优化为服务端批量端点 `/api/rooms/:roomId/scene-entities`                      |
| 4   | Handout actions 无 API  | ⚠️ **已知遗留** — 议题 0 已标注「待设计」                                                                                                                                            |
| 5   | freshChatIds 2500ms     | ✅ **正常机制** — 新消息高亮动画，2500ms 后自动移除。原子写入已有回归测试覆盖（worldStore.test.ts:444）。硬编码值优先级低                                                            |

### state-management.md 内容范围

- Store 职责表 + 数据流图
- init 时序图（7+1+N 并行请求 → Socket 注册 → cleanup）
- Socket 事件完整清单（31 个 world + 5 个 identity）
- 乐观更新策略说明（3 处及其理由）
- Selector 稳定性规则（从 CLAUDE.md 扩展的详细版）
- 持久化策略（sessionStorage/localStorage 的使用场景）

### Action Items

- [ ] 新建 `docs/architecture/state-management.md`
- [ ] N+1 初始化请求记入 backlog

## 议题 4：实体系统 ✅

**文件**: `docs/design/09-实体生命周期重构设计.md`（已实现）+ `docs/design/10-战斗系统与Token数据模型重构设计.md`
**参考**: `server/routes/entities.ts`, `server/routes/scenes.ts`, `src/shared/entityTypes.ts`, `src/shared/entityAdapters.ts`

### 核心设计落地情况

| 设计                                          | 状态                                                |
| --------------------------------------------- | --------------------------------------------------- |
| 三值 lifecycle: ephemeral/reusable/persistent | ✅ 已落地                                           |
| scene_entities M2M + visible 候场             | ✅ 已落地                                           |
| persistent 自动关联所有新场景                 | ✅ 已落地                                           |
| 右键创建 → ephemeral Entity + Token           | ✅ 已落地                                           |
| Blueprint spawn → ephemeral Entity + Token    | ✅ 已落地                                           |
| Entity 删除 → FK CASCADE 清理 tokens          | ✅ 已落地（doc 10 取代了 doc 09 的 token 降级方案） |
| 权限模型 `{ default, seats }`                 | ✅ 已落地                                           |

### 审查结论

| #   | 问题                       | 结论                                                                                                                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | entityAdapters.ts 能否删除 | ❌ **不能** — 仍有 6 个源文件活跃引用（TokenTooltip、selectors、CharacterEditPanel/DetailPanel/HoverPreview、generic plugin）。迁移到 plugin.adapters 尚未完成。标注为「待迁移」                        |
| 2   | doc 09 与实现的偏差        | ⚠️ 3 处偏差被 doc 10 取代（size→width+height、token降级→CASCADE、匿名token消除）；1 处 UI 简化（3 tab→2 tab）；**延迟删除+Toast 撤销**未完全落地（assetStore 有 softRemove，entity/scene 删除无此机制） |
| 3   | doc 09 状态标注            | ✅ 头部加 `> ✅ 核心模型已落地（2026-03-15）。部分 UI 细节（延迟删除+Toast）未实现。doc 10 取代了 token 相关设计。`                                                                                     |

### Action Items

- [ ] doc 09 头部加实现状态标注
- [ ] entityAdapters.ts → plugin.adapters 迁移记入 backlog
- [ ] 延迟删除 + Toast 撤销（entity/scene）记入 backlog

## 议题 5：战术模式系统 ✅

**文件**: `docs/design/10-战斗系统与Token数据模型重构设计.md`（700+ 行，大部分已落地）
**参考**: `src/combat/KonvaMap.tsx`, `server/routes/tactical.ts`, `server/routes/archives.ts`

### 落地情况

| 设计（doc 10）                                 | 状态                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Token 必须有 entityId（无匿名 Token）          | ✅ 已落地                                                                        |
| tactical_tokens SQL 表（非 JSON blob）         | ✅ 已落地                                                                        |
| per-scene tactical_state                       | ✅ 已落地                                                                        |
| archive save/load 机制（含 scene_entity 检查） | ✅ 已落地                                                                        |
| enter/exit tactical = UI 模式切换（不清数据）  | ✅ 已落地                                                                        |
| KonvaMap 拆分（hooks 提取）                    | ✅ 已落地                                                                        |
| 术语统一 combat→tactical, encounter→archive    | ✅ 已落地                                                                        |
| 先攻系统                                       | ⏳ 只预留字段（initiative_position, round_number, current_turn_token_id），无 UI |

### 结论

doc 10 核心设计全部已落地。先攻系统延后到规则接口阶段。

标注：`> ✅ 核心已落地（2026-03-15）。先攻系统延后。`

需新建 `docs/architecture/tactical-system.md`，内容：KonvaMap 层级结构、Token 拖拽数据流、archive save/load 机制、enter/exit 语义。

### Action Items

- [ ] doc 10 头部加实现状态标注
- [ ] 新建 `docs/architecture/tactical-system.md`

---

## 议题 6：规则插件系统 ✅

**文件**: `docs/design/11-规则插件系统架构设计.md` + `docs/rule-system/`
**参考**: `src/rules/types.ts` (197行), `src/rules/registry.ts`, `src/rules/sdk.ts`, `plugins/generic/`, `plugins/daggerheart/`

### 当前实现

| 组件                      | 状态                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `RulePlugin` 接口（7 层） | ✅ 完整定义（adapters + characterUI 必选，Layer 3-7 可选） |
| 静态注册（registry.ts）   | ✅ generic + daggerheart                                   |
| SDK 边界（sdk.ts）        | ✅ 导出类型 + utility                                      |
| useRulePlugin() hook      | ✅ room.ruleSystemId → getRulePlugin()                     |
| generic 插件              | ✅ 最小实现（委托 entityAdapters）                         |
| daggerheart 插件          | ✅ 完整实现（adapters + diceSystem + templates + UI）      |

### 三份文档的定位

| 文档                                 | 定位                                            | 状态                                                                         |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `architecture/rule-plugin-system.md` | **架构层**：插件系统当前如何与基座集成          | 🆕 需新建                                                                    |
| `rule-system/`                       | **开发者层**：怎么写插件 + Daggerheart 规则细节 | ⚠️ 需重写（`architecture.md` 引用 Yjs，`implementation-phases.md` 进度过时） |
| `design/11`                          | **决策层**：为什么这样设计 + 3 阶段演化路线图   | ✅ 保留，标注 Phase 1 已完成                                                 |

### 审查结论

| #   | 问题                                     | 结论                                                                                                                               |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | rule-system/ 与 design/11 关系           | ✅ **分开保留** — design/11 记录决策理由，rule-system/ 面向插件开发者，architecture/ 描述当前架构                                  |
| 2   | Phase 1→2 路径                           | ⏳ **仍在 roadmap** — 当前 Phase 1（编译时静态打包）。Phase 2（独立编译+重启加载）未实现                                           |
| 3   | entityAdapters vs plugin.adapters 不一致 | ⚠️ **已知** — entityAdapters 的 ResourceView 用 `key`，rules/types.ts 的 ResourceView 用 `label`。待 entityAdapters 迁移完成后统一 |

### Action Items

- [ ] 新建 `docs/architecture/rule-plugin-system.md`
- [ ] 重写 `docs/rule-system/architecture.md`（去 Yjs 引用）
- [ ] 重写 `docs/rule-system/implementation-phases.md`（更新进度）
- [ ] doc 11 头部加状态标注：Phase 1 已完成

---

## 议题 7：聊天与骰子系统 ✅

**参考**: `src/chat/`, `server/routes/chat.ts`, `src/shared/diceUtils.ts`

### 结论

- 实现完整且稳定：ChatPanel + DiceReel + 服务端 RNG
- 骰子防伪已解决：服务端生成随机数（非客户端），Yjs 阶段的 docs/design/03-05 防伪设计已过时并删除
- Daggerheart 骰子通过插件 diceSystem layer 实现（`.dd` 命令）
- 不需要独立架构文档，并入 overview 的模块描述

### Action Items

- 无（docs/design/03-05 已在 git 中标记删除，确认不需要恢复）

---

## 议题 8：场景与氛围系统 ✅

**参考**: `src/scene/SceneViewer.tsx`, `AmbientAudio.tsx`, `particles.ts`

### 结论

- 实现完整：全屏背景 + 6 种粒子预设 + 环境音频 + GM 专属场景
- 简单且稳定，不需要独立架构文档，并入 overview

### Action Items

- 无

---

## 议题 9：GM 工具与界面 ✅

**参考**: `src/gm/` (GmSidebar + GmDock + SceneLibrary 等)

### 结论

- GmSidebar 2 tab (archives/entities) + GmDock 4 tab (blueprints/characters/handouts/maps)
- 不需要独立架构文档
- GM 身份伪造风险见议题 10

### Action Items

- 无

---

## 议题 10：身份与座位系统 ✅

**文件**: `docs/design/06-身份系统与WebSocket鉴权方案设计.md`（未实现）, `docs/design/07-权限与数据隔离方案设计.md`（未实现）

### 当前实现

- seats 表 + identityStore + `auth:update` Socket 事件
- **无 JWT、无用户账号**，`user_id` 字段存在但未使用
- Socket.io auth 只验证 roomId 存在，不验证身份
- `withRole` 中间件读 header `X-MyVTT-Role`，任何人可伪造 GM

### 结论

| #   | 问题                 | 结论                                                             |
| --- | -------------------- | ---------------------------------------------------------------- |
| 1   | 身份系统是否在路线图 | ✅ **是** — doc 06/07 仍是下一阶段重点                           |
| 2   | 文档处理             | doc 06/07 保留，标注「📋 规划中 — 未实现」                       |
| 3   | 安全风险             | ⚠️ 在 overview.md 中明确标注「当前无鉴权，任何人可伪造 GM 身份」 |

### Action Items

- [ ] doc 06 头部加状态标注：「📋 规划中 — 未实现」
- [ ] doc 07 头部加状态标注：「📋 规划中 — 未实现」
- [ ] overview.md 中标注当前无鉴权的安全限制

## 议题 11：素材管理系统 ✅

- Assets 统一表（image/blueprint/map/audio），Blueprint 机制已在议题 4 讨论
- 不需要独立文档，并入 data-model.md 的 assets 部分

---

## 议题 12：展示材料系统 ✅

- Showcase 有完整 CRUD + pin/unpin + Socket 事件
- Handout 是纯本地状态（议题 0 已标注「待设计」）
- 不需要独立文档

---

## 议题 13：测试策略 ✅

- `testing/strategy.md` 第 2 层引用 Yjs Hook 测试，需去除 Yjs 引用
- CI workflow 已有（GitHub Actions），覆盖率阈值已配置

### Action Items

- [ ] 更新 `docs/testing/strategy.md`（去 Yjs 引用）

---

## 议题 14：开发规范 ✅

- conventions/ 4 个文件全部仍然准确，无需修改
- CLAUDE.md "Architecture Gotchas" 保留在 CLAUDE.md（防错速查层）

### Action Items

- 无

---

## 全局总结

### 需新建的文档（5 个）

| 文档                                 | 内容                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| `architecture/overview.md`           | 系统全貌：技术栈、数据流、模块地图、部署拓扑、安全限制      |
| `architecture/data-model.md`         | SQLite schema + Entity/Scene/Token 数据模型 + JSON 字段策略 |
| `architecture/state-management.md`   | Store 职责 + Socket 事件清单 + 乐观更新 + Selector 规则     |
| `architecture/tactical-system.md`    | KonvaMap 层级 + Token 拖拽 + archive save/load + enter/exit |
| `architecture/rule-plugin-system.md` | RulePlugin 7 层接口 + 注册机制 + SDK 边界                   |

### 需重写的文档（4 个）

| 文档                                   | 原因                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `docs/README.md`                       | 当前索引不完整，缺少 design/、conventions/、superpowers/ |
| `rule-system/architecture.md`          | 引用 Yjs                                                 |
| `rule-system/implementation-phases.md` | 进度过时                                                 |
| `testing/strategy.md`                  | 第 2 层引用 Yjs Hook 测试                                |

### 需标注状态的设计文档（6 个）

| 文档   | 标注                                                  |
| ------ | ----------------------------------------------------- |
| doc 01 | 更新第 70 行 ⚠️ 为已实现                              |
| doc 06 | 📋 规划中 — 未实现                                    |
| doc 07 | 📋 规划中 — 未实现                                    |
| doc 09 | ✅ 核心已落地，部分 UI 未实现，doc 10 取代 token 设计 |
| doc 10 | ✅ 核心已落地，先攻系统延后                           |
| doc 11 | ✅ Phase 1 已完成                                     |

### 需归档的文档

| 来源                                     | 归档位置                                |
| ---------------------------------------- | --------------------------------------- |
| `architecture/` 4 个 Yjs 文件            | `archive/yjs-architecture/`             |
| `design/02`                              | `archive/`                              |
| `implementation-plan.md`                 | `archive/`                              |
| `design-discussion-archieved-2026-3-16/` | `archive/design-discussion-2026-03-16/` |
| `superpowers/` 已完成的 plans/specs      | `archive/superpowers/`                  |

### 需清理的代码

| 项目                                                        | 类型        |
| ----------------------------------------------------------- | ----------- |
| `entityTypes.ts` 中的 `SceneV2` + `ArchiveData`             | 死代码删除  |
| `rule_system_id` 从 `room_state` 迁移到 `rooms`             | Schema 迁移 |
| `active_archive_id` 从 `room_state` 迁移到 `tactical_state` | Schema 迁移 |

### CLAUDE.md 改造

三层结构：① 必读门禁 ② 防错速查 ③ 精简摘要+链接 architecture/

### Backlog 新增

- N+1 初始化请求优化（批量 scene-entities 端点）
- entityAdapters.ts → plugin.adapters 迁移
- 延迟删除 + Toast 撤销（entity/scene）
- Handout/Showcase 概念重新设计
