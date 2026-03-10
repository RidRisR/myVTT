# myVTT 测试实施计划

## Context

项目已完成 Milestone 3.5，核心功能（场景、战斗、实体、骰子、展示）已稳定。现在是引入测试的最佳时机：代码结构清晰、逻辑与 UI 分离良好、测试基础设施已就绪（Vitest + testing-library + fixtures + yjs-helpers）。目标是从最高 ROI 的纯函数开始，逐步覆盖数据层 Hook，为后续迭代建立回归保护网。

## 已有基础设施

- `vite.config.ts`: Vitest 配置完成（globals, jsdom, `src/**/*.test.ts`）
- `src/__test-utils__/setup.ts`: jest-dom 扩展
- `src/__test-utils__/fixtures.ts`: `makeEntity()`, `makeToken()`, `makeBlueprint()`
- `src/__test-utils__/yjs-helpers.ts`: `createTestDoc()` 创建内存 Y.Doc
- `package.json` scripts: `test`, `test:watch`, `test:coverage`

## 实施顺序与测试用例

### Batch 1: P0-A 纯函数（高复杂度，最先写）

#### 1.1 `src/shared/__tests__/diceUtils.test.ts`

源文件：`src/shared/diceUtils.ts`（297 行，8 个函数）

**tokenizeExpression**

- 简单骰子 `"2d6"` → `[{type:'dice', sign:1, count:2, sides:6}]`
- 常量 `"5"` → `[{type:'constant', sign:1, value:5}]`
- 负号 `"-3"` → `[{type:'constant', sign:-1, value:3}]`
- 复合表达式 `"2d6+3"` → 两项
- keep/drop `"4d6kh3"` → keepDrop `{mode:'kh', count:3}`
- 多项组合 `"4d6kh3+1d20-5"` → 三项
- 默认 count `"d20"` → count=1
- 默认 kd count `"2d20kh"` → keepDrop count=1
- 无效输入：空字符串 → null，`"abc"` → null，`"2d6+abc"` → null
- 空格容忍 `" 2d6 + 3 "` → 正常解析

**validateTerm**

- 正常骰子通过
- count < 1 / count > 100 → 错误
- sides < 1 / sides > 1000 → 错误
- constant > 10000 → 错误
- kh count > dice count → 错误
- dl count >= dice count → 错误（nothing left）

**rollTerm**

- 常量项：subtotal = sign × value，allRolls 为空
- 普通骰子：mock `Math.random`，验证 allRolls 长度 = count，每个值 ∈ [1, sides]
- kh 模式：`4d6kh3` mock 返回 [1,5,3,6]，keptIndices 应保留 5,3,6 的索引
- kl 模式：保留最小的
- dh / dl 模式：丢弃最大/最小的
- sign=-1 时 subtotal 取负

**rollCompound**

- 正常表达式 `"2d6+3"` → CompoundDiceResult，total 正确
- 无效输入 → null
- 超过 20 项 → `{error: 'Too many terms'}`
- 超过 200 个骰子 → `{error: 'Too many dice'}`
- 校验失败 → `{error: ...}` 透传 validateTerm 的错误

**resolveFormula**

- `"@str+1d20"` 替换为 `"10+1d20"`（tokenProps 中 str="10"）
- HP 格式 `"@hp"` 取 current：`"15/20"` → `"15"`
- 未知 key → `{error: 'Unknown key: xxx'}`
- 非数字值 → `{error: '@key value "abc" is not numeric'}`
- token 优先于 seat
- 多个 key 替换

**generateFavoriteName**

- 无 key → 返回 formula.trim()
- 有 key → `"str+dex Roll"`

**parseDiceExpression (deprecated) + rollDice**

- 基本 `"2d6+5"` 解析
- 边界：count/sides 超限 → null

---

#### 1.2 `src/shared/__tests__/permissions.test.ts`

源文件：`src/shared/permissions.ts`（29 行，6 个函数）

**getPermission**

- seat 有记录 → 返回对应权限
- seat 无记录 → 返回 default 权限

**canSee**

- GM → 始终 true
- PL + 权限 none → false
- PL + 权限 observer → true
- PL + 权限 owner → true

**canEdit**

- GM → 始终 true
- PL + owner → true
- PL + observer → false
- PL + none → false

**defaultPCPermissions / defaultNPCPermissions / hiddenNPCPermissions**

- 验证返回结构正确

---

#### 1.3 `src/shared/__tests__/entityAdapters.test.ts`

源文件：`src/shared/entityAdapters.ts`（56 行，3 个函数）

**getEntityResources**

- null entity → `[]`
- 无 ruleData → `[]`
- 数组格式 → 原样返回
- 对象格式 `{hp: {cur:15, max:20, color:'#f00'}}` → 转为 `[{key:'hp', current:15, max:20, color:'#f00'}]`
- `current` 和 `cur` key 兼容
- 缺失字段使用默认值（current=0, max=0, color='#3b82f6'）

**getEntityAttributes**

- null entity → `[]`
- 数组格式 → 原样返回
- 对象格式：纯数字值 `{str: 10}` → `[{key:'str', value:10}]`
- 对象格式：带 category `{str: {value:10, category:'ability'}}` → `[{key:'str', value:10, category:'ability'}]`

**getEntityStatuses**

- null entity → `[]`
- 有 statuses → 原样返回
- 无 statuses → `[]`

---

### Batch 2: P0-B 纯函数（中复杂度）

#### 2.1 `src/combat/__tests__/combatUtils.test.ts`

源文件：`src/combat/combatUtils.ts`（46 行，4 个函数）

**snapToGrid**

- 正中网格 → snap 到该格
- 偏移 gridOffset → 计算正确
- 负坐标 → 正常工作

**screenToMap**

- 基本转换：`(screenX - wrapperLeft - positionX) / scale`
- scale=2 时坐标减半
- 负 positionX/Y → 正确偏移

**canDragToken**

- GM → true
- PL + null entity → false
- PL + owner entity → true
- PL + observer entity → false

---

#### 2.2 `src/shared/__tests__/panelUtils.test.ts`

源文件：`src/shared/panelUtils.ts`（15 行，1 个函数）

**adjustNumericValue**

- HP 格式 `"15/20"` + delta=-1 → `"14/20"`
- HP clamp 下限 `"0/20"` + delta=-1 → `"0/20"`
- HP clamp 上限 `"20/20"` + delta=+1 → `"20/20"`
- 纯数字 `"7"` + delta=+1 → `"8"`
- 纯数字 clamp 下限 `"0"` + delta=-1 → `"0"`

---

#### 2.3 `src/shared/__tests__/characterUtils.test.ts`

源文件：`src/shared/characterUtils.ts`（22 行，1 个函数）

**nextNpcName**

- 无同 blueprint 实体 → `"Goblin 1"`
- 已有 `"Goblin 1"` → `"Goblin 2"`
- 已有 `"Goblin 1"`, `"Goblin 3"` → `"Goblin 4"`（取 max+1）
- 实体名无编号后缀 → 当作 0 处理

---

### Batch 3: P1-A Hook 集成测试（高复杂度）

> 使用 `renderHook()` + 真实内存 Y.Doc，复用 `createTestDoc()` 和 `makeEntity()`。

#### 3.1 `src/entities/__tests__/useEntities.test.ts`

源文件：`src/entities/useEntities.ts`（246 行）

**初始化**

- 空 world → entities = []

**addPartyEntity**

- 添加后 entities 包含该实体，\_source='party'
- Y.Map 字段正确写入

**addSceneEntity**

- 需先 addScene 创建场景 + entities 子 Map
- 添加后 entities 包含该实体，\_source='scene:xxx'

**addPreparedEntity**

- 添加后 \_source='prepared'

**updateEntity（自动检测源）**

- 更新 party 实体 → Y.Map 字段变更
- 更新 prepared 实体 → 替换整个对象
- 更新 scene 实体 → 替换整个对象

**deleteEntity（自动检测源）**

- 删 party 实体 → 从 party 移除
- 删 prepared 实体 → 从 prepared 移除
- 删 scene 实体 → 从 scene entities 移除

**promoteToGM**

- scene 实体移到 prepared，scene 中删除

**getEntity**

- 按 ID 找到 → 返回
- null → null

---

#### 3.2 `src/yjs/__tests__/useScenes.test.ts`

源文件：`src/yjs/useScenes.ts`（105 行）

**readScenes / 初始化**

- 空 yScenes → scenes = []
- 预填充数据 → 按 sortOrder 排序

**addScene**

- scenes 长度 +1，字段正确
- 自动创建 entities 和 tokens 子 Y.Map

**updateScene**

- 修改 name / gridSize → 对应字段更新
- 不允许修改 id

**deleteScene**

- scenes 长度 -1

**getScene**

- 存在 → 返回完整 Scene 对象
- null id → null
- 不存在 id → null

---

### Batch 4: P1-B Hook 集成测试（中复杂度）

#### 4.1 `src/showcase/__tests__/useShowcase.test.ts`

源文件：`src/showcase/useShowcase.ts`（100 行）

**CRUD**

- addItem / updateItem / deleteItem 基本操作
- items 按 timestamp 排序

**pin / unpin**

- pinItem → pinnedItemId 更新
- unpinItem → pinnedItemId = null
- 删除 pinned item → 自动 unpin

**clearAll**

- 清空所有 items + unpin

---

#### 4.2 `src/yjs/__tests__/useRoom.test.ts`

源文件：`src/yjs/useRoom.ts`（68 行）

**初始状态**

- 空 room → mode='scene', activeSceneId=null, combatSceneId=null

**setMode**

- setMode('combat') → mode 变更
- setMode('combat') 无 combatSceneId 时 → fallback 到 activeSceneId

**enterCombat**

- 传 sceneId → combatSceneId 设为该 id
- 不传 + 无 combatSceneId → fallback 到 activeSceneId
- 不传 + 已有 combatSceneId → 保持不变

**exitCombat**

- mode 回到 'scene'

**外部变更同步**

- 直接修改 yRoom → Hook state 自动更新

---

### Batch 5: P0-C + P1-C（低价值，可选）

#### P0-C

- `tokenUtils.test.ts`: barColorForKey 确定性、readResources 守卫
- `assetUpload.test.ts`: isVideoUrl 扩展名匹配
- `roleState.test.ts`: store get/set/subscribe 基本行为

#### P1-C

- `useSceneTokens.test.ts`: 标准 CRUD
- `useHandoutAssets.test.ts`: 标准 CRUD

---

## 技术要点

- **骰子随机性**: `vi.spyOn(Math, 'random').mockReturnValue(...)` 控制返回值
- **Hook 测试**: `renderHook()` + `act()` + 真实 Y.Doc（`createTestDoc()`）
- **useEntities 场景准备**: 需先手动在 yScenes 中创建 scene Map 并添加 entities/tokens 子 Map
- **fixtures 复用**: `makeEntity()`, `makeToken()`, `makeBlueprint()` 统一创建测试数据
- **Vitest include**: `src/**/*.test.ts`，测试文件放在对应模块的 `__tests__/` 目录下

## 验证

每个 Batch 完成后：

1. `npm test` — 全部通过
2. `npm run test:coverage` — 确认目标文件覆盖率
3. `npm run build` — 确认不影响构建
