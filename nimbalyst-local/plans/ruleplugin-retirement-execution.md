---
planStatus:
  planId: plan-ruleplugin-retirement-execution
  title: "RulePlugin 退役 — 全阶段执行总纲"
  status: complete
  planType: refactor
  priority: high
  owner: claude
  stakeholders: []
  tags: [ruleplugin, retirement, refactor]
  created: "2026-04-05"
  updated: "2026-04-05"
  progress: 95
---

# RulePlugin 退役 — 全阶段执行总纲

> **设计文档**: `docs/design/22-RulePlugin退役总框架.md`
> **偏差文档**: `docs/superpowers/deviations/2026-04-05-ruleplugin-phase0-2.md`
> **已完成**: Phase 0, 1a, 1b, 1d, 2, 3, 4 — RulePlugin 接口已完全删除
> **推迟**: Phase 1c（实体创建工作流化）— 不影响 RulePlugin 退役

---

## 当前状态

| Phase | 状态 | 说明 |
|-------|------|------|
| 0 (零成本清理) | ✅ 完成 | hideElements/dockTabs/gmTabs/keyBindings/getPresetTemplates 已删 |
| 1a (panels) | ✅ 完成 | PluginPanelContainer 已删（偏差 D1：FullCharacterSheet 未适配 IComponentSDK） |
| 1b (TeamDashboard) | ✅ 完成 | 采用方案 2：保留容器，改数据源为 entity bindings（TEAM_PANEL_POINT） |
| 1c (实体创建工作流化) | ⏸️ 推迟 | dataTemplates 依赖已通过 DATA_TEMPLATE_POINT 消除；路径精简 9→3 推迟为独立 PR |
| 1d (i18n) | ✅ 完成 | usePluginTranslation 改为读 i18next namespace |
| 2 (基础设施) | ✅ 完成 | RendererRegistry 多注册扩展 getAllRenderers |
| 2a/2b/2c (surfaces 迁移) | ✅ 完成 | tools/tokenActions/contextMenu 改为 RendererRegistry |
| 3 (角色卡系统) | ✅ 完成 | 24 消费点 → entity bindings（7 个 RendererPoint） |
| 4 (基础设施清理) | ✅ 完成 | RulePlugin 接口、useRulePlugin、旧 plugin 对象全部删除 |

---

## 执行策略

### 核心原则

1. **渐进式交付**: 每个执行轮次独立可验证，产出可提交的代码
2. **superpowers 工作流**: 每个具体阶段必须使用 superpowers 技能驱动（TDD、executing-plans、debugging 等）
3. **测试驱动 + E2E 验证**: 每轮包含单元测试 + Playwright E2E 真实功能验证
4. **独立代码审查**: 每轮完成后派发**上下文独立的子代理** (superpowers:requesting-code-review) 做审查
5. **偏差记录**: 任何偏离设计文档的改动必须记录原因

### 每轮执行流程（标准化）

```
1. 使用 superpowers:writing-plans 制定本轮详细步骤
2. 使用 superpowers:executing-plans 或 superpowers:subagent-driven-development 执行
3. TypeScript 编译验证: npx tsc --noEmit
4. 单元测试: npx vitest run (关注修改文件)
5. Playwright E2E 验证: npm run test:e2e -- <相关spec>
6. 如有偏差，更新偏差文档
7. Git commit 本轮改动
8. 派发独立子代理 (superpowers:requesting-code-review) 做代码审查
9. 如审查发现问题，修复后重新验证
```

### 子代理审查协议

每轮完成后派发的审查子代理必须：
- **上下文独立**: 不继承执行上下文，从零开始读取 diff 和设计文档
- **输入**: git diff (本轮 vs 上一轮 commit)、设计文档 `docs/design/22-RulePlugin退役总框架.md`、偏差文档
- **检查清单**:
  - 类型安全（无 `any` 逃逸、RendererPoint 类型正确）
  - 向后兼容（迁移期间旧代码仍可工作）
  - 无遗漏消费点（grep 验证所有 RulePlugin 引用已处理）
  - 测试覆盖（单元 + E2E 是否充分）
  - 偏差是否合理记录
- **输出**: 审查报告 + 是否需要修复的结论

### 执行顺序

```
Round A (Phase 2 完成)          ← surfaces 迁移，M 级           ✅ 完成
    ↓
Round B (Phase 3)               ← 角色卡系统，L-XL 级          ✅ 完成
    ↓
Round C (Phase 1b 评估)         ← TeamDashboard，方案 2 执行    ✅ 完成
    ↓
Round D (Phase 1c 评估)         ← 评估后推迟（见下方说明）      ✅ 评估完成
    ↓
Round E (Phase 4)               ← 基础设施清理，S 级           ✅ 完成
    ↓
Final: 提交 PR
```

---

## Round A: Phase 2 完成 — surfaces.tools/tokenActions/contextMenu 迁移

> **superpowers 工作流**: `writing-plans` → `executing-plans` → `verification-before-completion` → `requesting-code-review`

### 范围
- DH 当前**零实现**这三个 surface 属性（null guard 返回空数组）
- 迁移 = 改消费端从 RendererRegistry 读取 + 删除 RulePlugin surface 属性
- 未来插件通过 VTTPlugin onActivate 注册

### 执行步骤

- [x] A1: 定义 typed RendererPoints (`TOOL_POINT`, `TOKEN_ACTION_POINT`, `CONTEXT_MENU_POINT`)
- [x] A2: 改造 `registerBuiltinTools.ts` — 从 RendererRegistry 读取插件工具
- [x] A3: 改造 `SelectionActionBar.tsx` — 从 RendererRegistry 读取 token actions
- [x] A4: 改造 `TokenContextMenu.tsx` — 从 RendererRegistry 读取 context menu items
- [x] A5: 从 `RulePlugin.surfaces` 删除 `tools`/`getTokenActions`/`getContextMenuItems` 类型
- [x] A6: `npx tsc --noEmit` + `npx vitest run`
- [x] A7: Git commit (`417438e`)
- [x] A8: 代码审查完成

### 涉及文件
- `src/combat/tools/registerBuiltinTools.ts`
- `src/combat/SelectionActionBar.tsx`
- `src/combat/TokenContextMenu.tsx`
- `src/rules/types.ts`（删除 surface 属性类型）
- `src/log/rendererRegistry.ts`（可能需要新增 RendererPoint 常量）

---

## Round B: Phase 3 — 角色卡系统迁移

> **superpowers 工作流**: `writing-plans` → `subagent-driven-development` (并行独立子任务) → `verification-before-completion` → `requesting-code-review`

### 范围
- 24 个 adapter 消费点 + 2 个 EntityCard 消费点
- 定义 Bar/Status/FormulaBinding/EntityCard 类型系统
- DH + Generic 插件注册声明
- 10+ 消费文件改造

### 执行步骤

#### B-I: 类型系统 + SDK
- [x] B1: 定义 entity binding 类型（MainResourceBinding, PortraitResourcesBinding, StatusBinding, FormulaTokensBinding, EntityCardBinding, DataTemplateBinding, TeamPanelBinding）
- [x] B2: 创建 7 个 typed RendererPoints（MAIN_RESOURCE_POINT 等）
- [x] B3: 从 SDK 导出新类型和 Points

#### B-II: 插件注册
- [x] B4: DH 插件在 onActivate 注册全部 7 个 binding
- [x] B5: Generic 插件转为 VTTPlugin (`plugins/generic/vttPlugin.ts`)，注册 5 个 binding
- [x] B6: 创建工具函数 `getMainResource()`, `getPortraitResources()`, `getStatuses()`, `getFormulaTokens()` 等

#### B-III: 消费端迁移
- [x] B7: `KonvaToken.tsx` — 改为 entity bindings
- [x] B8: `TokenTooltip.tsx` — 同上
- [x] B9: `PortraitBar.tsx` — 改为 entity bindings
- [x] B10: `MyCharacterCard.tsx` — 改为 EntityCardSlot
- [x] B11: `CharacterDetailPanel.tsx` — 改为 entity bindings
- [x] B12: `CharacterEditPanel.tsx` — 改为 entity bindings
- [x] B13: `CharacterHoverPreview.tsx` — 改为 entity bindings
- [x] B14: `ChatPanel.tsx` — 改为 entity bindings
- [x] B15: `selectors.ts` — 改为 entity bindings
- [x] B16: `useWorkflowSDK.ts` — 改为 entity bindings

#### B-IV: 清理 + 验证
- [x] B17: 删除 `RulePlugin.adapters` 和 `characterUI` 类型
- [x] B18: 删除 `plugins/daggerheart/adapters.ts`
- [x] B19: `npx tsc --noEmit` + `npx vitest run`
- [x] B20: Git commit (`ded7900`)
- [x] B21: 代码审查完成

### 涉及文件
**插件侧**: `plugins/daggerheart-core/index.ts`, `plugins/daggerheart/index.ts`, `plugins/generic/index.ts`
**基座侧**: KonvaToken, TokenTooltip, PortraitBar, MyCharacterCard, CharacterDetailPanel, ChatPanel, selectors, useWorkflowSDK
**迁移**: CharacterEditPanel → plugins/generic/, CharacterHoverPreview → plugins/generic/
**删除**: plugins/daggerheart/adapters.ts, RulePlugin.adapters/characterUI types

---

## Round C: Phase 1b 评估 — TeamDashboard

> **superpowers 工作流**: `brainstorming` (评估方案) → 如执行: `executing-plans` → `verification-before-completion` → `requesting-code-review`

### 阻塞分析
- issue #188: PanelRenderer 不支持固定定位 + 可折叠模式
- TeamDashboard 有独立逻辑：collapse/expand, auto-show on tracker, fixed positioning

### 评估选项
1. **增强 PanelRenderer** — 添加 fixed positioning + collapse 支持，然后迁移
2. **保持 TeamDashboard 但改为从 RendererRegistry 读取** — 不删容器，改数据源
3. **继续推迟** — 记录偏差

### 执行结果
- [x] C1: 评估 PanelRenderer 增强的工作量 — issue #188 仍阻塞
- [x] C2: 选择方案 2（保留 TeamDashboard 容器，改数据源为 TEAM_PANEL_POINT entity binding）
- [x] C3: 测试 + 审查通过，commit `6f565e5`

---

## Round D: Phase 1c 评估 — 实体创建工作流化

> **superpowers 工作流**: `brainstorming` (评估方案)

### 范围
- 9 条创建路径 → 2 核心 + 2 保留
- 涉及 5+ UI 文件 + 2 服务端 endpoint 删除
- L 级工作量

### 评估选项
1. **完整实现** — 定义 core:create-entity workflow，全部迁移
2. **最小迁移** — 仅将 dataTemplates 用法改为 entity bindings，不做路径精简
3. **继续推迟** — 记录偏差

### 执行结果
- [x] D1: 评估工作量和风险
- [x] D2: **采用混合方案（2+3）**：
  - dataTemplates 的 RulePlugin 依赖已通过 `DATA_TEMPLATE_POINT` entity binding 消除（方案 2）
  - 路径精简 9→3、REST endpoint 删除、core:create-entity workflow 推迟为独立 PR（方案 3）

### 推迟原因

**Phase 1c 的完整实现（路径精简 9→3）推迟**，原因如下：

1. **与 RulePlugin 退役目标解耦**：Phase 1c 的核心 RulePlugin 消费点是 `dataTemplates`（2 处调用），已通过 `DATA_TEMPLATE_POINT` entity binding 消除。RulePlugin 接口删除不再被 Phase 1c 阻塞。
2. **工作量为 L 级**：完整实现涉及扩展 `entity:create-request` socket handler、删除 2 个服务端 REST endpoint（`/spawn`、`/tokens/quick`）、修改 5+ UI 文件、创建 `core:create-entity` base workflow——跨越前后端，风险面广。
3. **需要独立设计**：路径精简改变了实体创建的用户交互流程，影响 GM 和玩家的操作习惯，需要独立的设计讨论和 UX 验证。
4. **不影响本 PR 交付**：RulePlugin 退役的核心目标是删除 RulePlugin 接口。Phase 1c 的路径精简是架构优化，不是退役的必要条件。

**后续计划**：Phase 1c 作为独立的架构优化 PR，在 RulePlugin 退役合并后安排。

---

## Round E: Phase 4 — 基础设施清理

> **superpowers 工作流**: `executing-plans` → `verification-before-completion` → `requesting-code-review`

### 前置条件
- Phase 0-3 消费点全部归零 ✅
- Phase 1b/1c 消费点归零或有替代方案 ✅（1b 迁移到 entity bindings，1c dataTemplates 迁移到 entity bindings）

### 执行步骤
- [x] E1: 删除 RulePlugin 接口（`src/rules/types.ts` 重写为纯 VTTPlugin 类型）
- [x] E2: 清理 `src/rules/registry.ts`（仅保留 VTTPlugin 注册逻辑）
- [x] E3: 删除 `src/rules/useRulePlugin.ts`
- [x] E4: 清理 `src/rules/sdk.ts`（保留 entity binding 导出）
- [x] E5: 删除旧 plugin 对象（`plugins/daggerheart/index.ts`、`plugins/generic/index.ts` 的 RulePlugin 实现）
- [x] E6: 清理 App.tsx（删除 useRulePlugin 引用）
- [x] E7: `npx tsc --noEmit` + `npx vitest run`
- [x] E8: Git commit (`775c84b`)
- [x] E9: lint/format 修复 (`6df63ee`)
- [x] E10: 清理死代码 registerPluginTools (`42179dd`)

### 涉及文件
- `src/rules/types.ts` (删除)
- `src/rules/registry.ts` (删除)
- `src/rules/useRulePlugin.ts` (删除)
- `src/rules/usePluginPanels.ts` (删除)
- `src/rules/sdk.ts` (清理)
- `plugins/daggerheart/index.ts` (重写)
- `plugins/generic/index.ts` (已在 Round B 转为 VTTPlugin)
- `src/layout/HamburgerMenu.tsx` (改数据源)
- `src/admin/AdminPanel.tsx` (改数据源)
- `src/App.tsx` (清理)

---

## 测试策略

### 每轮测试（三层验证）

| 层级 | 工具 | 目的 |
|------|------|------|
| **编译期** | `npx tsc --noEmit` | 类型安全、import 正确 |
| **单元/集成** | `npx vitest run` | 逻辑正确性、RendererPoint 注册行为 |
| **E2E (Playwright)** | `npm run test:e2e -- <spec>` | 真实浏览器功能验证 |

### Playwright E2E 验证矩阵

| Round | 必跑 E2E 场景 | 验证目标 |
|-------|---------------|---------|
| A | `tactical-combat.spec.ts` | Token 工具栏、右键菜单、操作栏不回归 |
| A | `smoke.spec.ts` | 基本流程不崩溃 |
| B | `chat-dice.spec.ts` | @公式变量解析、骰子判定卡片渲染 |
| B | `entity-lifecycle.spec.ts` | 角色创建/删除、肖像条资源显示 |
| B | `tactical-combat.spec.ts` | Token HP 条、状态圆点、悬浮提示 |
| B | `smoke.spec.ts` | 全局冒烟 |
| C | Team panel 相关 (如有) | TeamDashboard 折叠/展开 |
| D | Entity creation 相关 | 角色创建路径 |
| E | **全部 23 个 spec** | 全面回归 |

### E2E 失败处理

1. E2E 失败 → 使用 `superpowers:systematic-debugging` 定位根因
2. 修复后重跑失败的 spec
3. 全部通过后才 commit
4. 如果 E2E 基础设施本身有问题（非本轮改动导致），记录并跳过该 spec

### 代码审查协议

每轮完成后派发**独立上下文子代理**:
- 使用 `superpowers:requesting-code-review` 技能
- 传入本轮 git diff、设计文档、偏差文档
- 检查清单：类型安全、向后兼容、遗漏消费点、测试覆盖、偏差合理性
- 审查结论为 pass 才进入下一轮；fail 则修复后重审

---

## 偏差追踪

所有偏差记录在: `docs/superpowers/deviations/2026-04-05-ruleplugin-phase0-2.md`
新偏差将追加到该文件或创建新文件。

---

## 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Phase 3 消费点遗漏 | 运行时错误 | grep 验证 + E2E |
| Generic 插件 fallback 行为变化 | 无规则系统房间异常 | 测试 generic 模式 |
| KonvaToken Canvas 渲染 | Token 显示异常 | E2E tactical 测试 |
| _bindRuleRegistry 删除 | 循环依赖重现 | 编译验证 |
| FormulaBinding 改造 | @变量解析失败 | chat-dice E2E |
