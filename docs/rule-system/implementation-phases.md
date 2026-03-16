# 分阶段实施计划

## 概述

规则插件系统分三个阶段实施，当前 Phase 1 已完成。

---

## Phase 1: 编译时打包 ✅ 已完成

插件作为项目源码中的 TypeScript 模块，与基座一起编译。

### 已完成的工作

| 步骤        | 内容                                                 | 状态 |
| ----------- | ---------------------------------------------------- | ---- |
| 类型定义    | `src/rules/types.ts` — RulePlugin 7 层接口、所有类型 | ✅   |
| 注册机制    | `src/rules/registry.ts` — `getRulePlugin(id)` 注册表 | ✅   |
| SDK 导出    | `src/rules/sdk.ts` — 约 25 个类型 + 4 个 utility     | ✅   |
| 通用插件    | `plugins/generic/index.ts` — 无规则特化的基线插件    | ✅   |
| Daggerheart | `plugins/daggerheart/` — adapters + 角色卡 + 掷骰    | ✅   |
| 基座集成    | 基座通过 `getRulePlugin()` 调用插件，不直接导入      | ✅   |
| 房间规则    | `room_state.rule_system_id` + `plugin_config`        | ✅   |

### 当前已有插件

| 插件        | ID            | 说明                                        |
| ----------- | ------------- | ------------------------------------------- |
| Generic     | `generic`     | 通用插件，提供基本资源/属性适配，无规则特化 |
| Daggerheart | `daggerheart` | 二元骰（Hope/Fear）、6 属性、专属角色卡     |

### 待清理

- `src/shared/entityAdapters.ts`：Phase 1 遗留的过渡适配器，仍有 6 个调用方（TokenTooltip、selectors、CharacterEditPanel、CharacterDetailPanel、CharacterHoverPreview、plugins/generic）。需逐步迁移到 `plugin.adapters`

---

## Phase 2: 独立编译 + 重启加载 📋 规划中

**目标**：插件可独立编译为 bundle，放入约定目录后重启服务即可加载。

方向（待细化）：

- 插件编译为独立 JS bundle
- 服务启动时扫描插件目录，动态 `import()` 加载
- 插件 manifest 描述元数据（id, name, version, dependencies）
- 插件沙箱：限制可访问的 API 表面

---

## Phase 3: 热加载 📋 远期规划

**目标**：运行时动态加载/卸载插件，无需重启。

这是远期目标，Phase 2 稳定后再考虑。

---

## 关键文件索引

| 文件                           | 说明                                    |
| ------------------------------ | --------------------------------------- |
| `src/rules/types.ts`           | RulePlugin 接口 + 所有类型（约 197 行） |
| `src/rules/registry.ts`        | 插件注册表                              |
| `src/rules/sdk.ts`             | SDK 导出                                |
| `plugins/generic/index.ts`     | 通用插件                                |
| `plugins/daggerheart/index.ts` | Daggerheart 插件入口                    |
| `src/shared/entityAdapters.ts` | 过渡适配器（待迁移）                    |

## 复用清单

| 基座组件           | 路径                               | 插件可复用    |
| ------------------ | ---------------------------------- | ------------- |
| `rollCompound()`   | `src/shared/diceUtils.ts`          | 掷骰核心      |
| `resolveFormula()` | `src/shared/diceUtils.ts`          | @变量替换     |
| `ResourceBar`      | `src/shared/ui/ResourceBar.tsx`    | 角色卡资源条  |
| `MiniHoldButton`   | `src/shared/ui/MiniHoldButton.tsx` | 长按按钮      |
| `useHoldRepeat`    | `src/shared/useHoldRepeat.ts`      | 长按加速 hook |
