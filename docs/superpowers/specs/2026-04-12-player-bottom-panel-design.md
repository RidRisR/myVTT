# 玩家底部面板设计 — Player Action Bar

> **状态**：🔄 实施中（底部面板三 Tab 均已可用；剩余扩展项集中在自由公式与聊天展示统一） | 2026-04-12

## 概述

为 Daggerheart 玩家界面增加一个**屏幕底部居中的独立 Region 面板**，整合掷骰快捷操作和角色资源监控，解决当前玩家界面下方区域空旷的问题。

## 设计决策记录

| 决策项                | 结论                           | 理由                                                  |
| --------------------- | ------------------------------ | ----------------------------------------------------- |
| 面板位置              | 屏幕底部居中，独立 Region      | 与角色卡无关，不侵入现有组件                          |
| 面板行为              | 可折叠：默认紧凑横条，可展开   | 折叠态保持实用价值，不遮挡地图                        |
| 投骰方式              | Tab 切换：属性 / 自定义 / 骰子 | 分层满足不同频率的投骰需求                            |
| 资源面板              | 实时数值 + 快捷 +/- 操作       | 脱离角色卡的快捷资源操控台                            |
| 可见性                | 仅玩家可见                     | GM 有自己的工具集                                     |
| 模板存储              | 持久化到 entity component      | 与角色/实体同步，支持未来 NPC 扩展                    |
| Experience 标识       | `key + name + modifier`        | `key` 负责稳定引用，`name` 负责显示                   |
| Experience key 作用域 | entity-local 唯一              | 不要求跨实体全局唯一，运行时按 `(entityId, key)` 解析 |

## Mockup

**文件**：`nimbalyst-local/mockups/daggerheart-player-bottom-panel.mockup.html`

## UI 结构

### 折叠态（28px 高）

紧凑横条，从左到右：

```
[ 🎲 ] | HP 12/20 | S 3/6 | H 4/6 | A 2/3  [▲]
```

- **🎲 按钮**：点击展开投骰面板
- **资源数值**：HP / Stress(S) / Hope(H) / Armor(A) 的当前值/最大值，颜色编码
- **+/- 按钮**：hover 面板时显示，用于快捷调整
- **▲ 按钮**：展开面板

### 展开态

上下布局，共三层：

```
┌─────────────────────────────────────────────┐
│  ▼ (折叠按钮)                                │
│  ┌─────┬──────┬──────┐                      │
│  │ 属性 │ 自定义 │ 骰子  │  ← Tab 切换         │
│  └─────┴──────┴──────┘                      │
│  ┌──────────────────────────────────────┐   │
│  │         Tab 内容区域                   │   │
│  └──────────────────────────────────────┘   │
│  ─────────────────────────────────────────  │
│  ┌─────┬────────┬───────┬────────┐         │
│  │ HP  │ Stress │ Hope  │ Armor  │  ← 资源  │
│  └─────┴────────┴───────┴────────┘         │
└─────────────────────────────────────────────┘
```

### Tab 1：属性（快捷行动检定）

统一 `.roll-card` 卡片样式，6 列网格：

| 敏捷   | 力量   | 灵巧   | 直觉   | 风度   | 学识   |
| ------ | ------ | ------ | ------ | ------ | ------ |
| +3     | +1     | +2     | 0      | −1     | +2     |
| 2d12+3 | 2d12+1 | 2d12+2 | 2d12+0 | 2d12−1 | 2d12+2 |

- 点击即投 Daggerheart 行动检定（2d12+属性值）
- 数值从角色 entity 实时读取
- 正值绿色、负值红色、零灰色

### Tab 2：自定义（掷骰模板）

统一 `.roll-card` 卡片样式，3 列网格：

- 玩家保存的掷骰模板：图标 + 名称 + 公式（如 ⚔️ 近战伤害 2d6+3）
- 点击一键投骰
- 支持添加 / 编辑 / 删除模板
- 底部有自由公式输入框
- 模板数据持久化到 entity component：`daggerheart:roll-templates`
- 模板中的动态修正不保存为僵化数值，而保存对当前 entity 的 attribute / experience 引用

### Tab 3：骰子（通用掷骰）

统一 `.roll-card` 卡片样式，6 列网格：

| d4  | d6  | d8  | d10  | d12  | d20  |
| --- | --- | --- | ---- | ---- | ---- |
| 1-4 | 1-6 | 1-8 | 1-10 | 1-12 | 1-20 |

- 单击投一颗
- 右键设数量（角标 badge 显示倍数）
- 底部有自由公式输入框
- 结果发送到聊天

### 资源操控台（展开态底部，所有 Tab 共享）

4 个资源卡片，每个包含：

- 标签（HP / Stress / Hope / Armor）
- 大字数值 + 最大值
- 进度条
- +/- 操作按钮
- 点击数值可直接编辑

## 视觉设计

- **统一卡片基底**：`.roll-card` 类，相同边框（`#ffffff08`）、背景（`#ffffff04`）、圆角（6px）、hover 效果（金色边框 + 微光）
- **面板背景**：`backdrop-filter: blur(20px)` 半透明玻璃效果
- **颜色编码**：HP 红、Stress 紫、Hope 金、Armor 蓝
- **风格**：与现有 Alchemy RPG 暗色调一致

## 技术实现要点

- 注册为独立 Region（`lifecycle: 'persistent'`, `anchor: 'bottom-center'`, `layer: 'standard'`）
- 读取角色数据通过 `sdk.data.useComponent()`
- 资源操作复用现有 `charcard-update-res` / `charcard-update-extras` workflow
- 属性投骰复用现有 `action-check` workflow
- Dice tab 当前通过 `action-check + initialRollConfig` 走统一 workflow
- 自定义模板数据新增 entity component（`daggerheart:roll-templates`）
- Experience 数据新增稳定 `key`，供模板动态引用
- 通用骰子投骰是否拆出独立 workflow，延后到模板系统完成后再决定

## 当前实现进度

- [x] `RollConfig` / `RollExecutionResult` 数据层已定义
- [x] `action-check` 已改为统一的 5 步 workflow
- [x] 聊天中的 action check 展示已适配新 payload
- [x] `bottom-center` 锚点能力已加入 UI 系统
- [x] 新版 `ModifierPanel` 主界面已组装完成
- [x] 角色卡已切换到 `preselectedAttribute` / `skipModifier` 触发协议
- [x] `PlayerBottomPanel` 主组件与 `CollapsedBar` / `AttributeTab` / `DiceTab` / `ResourceSection` 已创建
- [x] `PlayerBottomPanel` 已注册为 `bottom-center` persistent region
- [x] `CustomTab` 已接入真实模板数据
- [x] `daggerheart:roll-templates` 组件、CRUD workflow 与模板配置编辑 workflow 已接入
- [x] Experience 已引入稳定 `key`

## 分期范围

### v1 交付范围

- 底部面板折叠态 + 展开态框架
- `Attribute` tab 可用，走统一 action-check workflow
- 底部资源区可显示并修改 HP / Stress / Hope / Armor
- `Custom` tab 暂为占位空状态
- `Dice` tab 已支持最小可用交互（点击预置骰组，`Shift+click` 直掷）

### 延后到 v2 的内容

- 非 action-check 掷骰结果在聊天中的统一展示
- 如有必要，再拆出通用掷骰 workflow（支持任意公式）

## 后续实现重点

当前掷骰流程基础改造、底部面板三 Tab 和模板系统均已完成，接下来应按以下顺序推进：

1. 收尾非 action-check 掷骰的聊天展示统一
2. 视需要增加自由公式 workflow
3. 再评估 `DiceTab` 的数量 / 右键配置等增强交互

**→ 当前架构决策和模板系统实现都已完成，下一步是扩展能力而不是核心返工。**
