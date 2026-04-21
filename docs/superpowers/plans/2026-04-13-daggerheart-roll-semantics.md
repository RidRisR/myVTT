# Daggerheart 掷骰语义补充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Daggerheart 掷骰系统补齐无 DC 判定、反应掷骰开关、`.ddr` 默认行为，以及 `ModifierPanel` 手写公式输入能力。

**Architecture:** 保留单一 Daggerheart workflow，在 `RollConfig` 中新增 `applyOutcomeEffects` 并让 `dc` 真正可空。`judge` 步骤根据是否存在 DC 生成完整判定或部分判定，`resolve` 步骤只在 `applyOutcomeEffects=true` 时结算资源后果。`ModifierPanel` 增加公式文本输入模式，并与现有结构化配置双向同步。

**Tech Stack:** TypeScript + React + Tailwind CSS + Vitest + existing workflow engine + `src/shared/diceUtils`

**Reference Spec:** `docs/superpowers/specs/2026-04-13-daggerheart-roll-semantics-design.md`

---

## File Structure

### Modified Files

| Path                                                               | Responsibility                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/rules/types.ts`                                               | 扩展 Daggerheart judgment outcome 联合类型                                    |
| `plugins/daggerheart-core/rollTypes.ts`                            | 扩展 `RollConfig` / `ActionCheckVars` 以支持 `applyOutcomeEffects` 与公式草稿 |
| `plugins/daggerheart/types.ts`                                     | 扩展模板配置类型，保留 `dc?` 并新增 `applyOutcomeEffects`                     |
| `plugins/daggerheart-core/rollTemplateUtils.ts`                    | 默认模板配置、clone / materialize 逻辑带上新字段                              |
| `plugins/daggerheart-core/RollTemplateManager.ts`                  | 修正默认模板配置与现有 TS 报错，兼容新字段                                    |
| `plugins/daggerheart-core/DiceJudge.ts`                            | 支持 `hope_unknown` / `fear_unknown` 与无 DC 判定                             |
| `plugins/daggerheart-core/index.ts`                                | 更新 `.dd` / `.ddr` 默认值、workflow judge/resolve 逻辑、input context        |
| `plugins/daggerheart-core/ui/ModifierPanel.tsx`                    | 支持可空 DC、反应掷骰开关、手写公式模式                                       |
| `plugins/daggerheart-core/ui/modifier/FormulaBar.tsx`              | 从只读 token 展示升级为可编辑输入控件/混合视图                                |
| `plugins/daggerheart-core/ui/DHActionCheckCard.tsx`                | 渲染 `hope_unknown` / `fear_unknown` 文案与无 DC 展示                         |
| `plugins/daggerheart-core/ui/bottom/DiceTab.tsx`                   | 通过统一入口触发修改后的配置，必要时开放“调整”入口                            |
| `plugins/daggerheart-core/ui/bottom/CustomTab.tsx`                 | 继续复用 `ModifierPanel`，不再要求独立自由公式输入框                          |
| `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`   | 覆盖无 DC / 反应掷骰 / `.ddr` 默认行为                                        |
| `plugins/daggerheart-core/__tests__/DiceJudge.test.ts`             | 覆盖新 outcome                                                                |
| `plugins/daggerheart-core/__tests__/rollTemplateWorkflows.test.ts` | 覆盖模板保存/恢复新字段                                                       |
| `plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx` | 覆盖新的统一入口触发                                                          |
| `plugins/daggerheart-core/rollConfigUtils.test.ts`                 | 如需要，补公式文本与 `RollConfig` 同步相关测试                                |

### New Files

| Path                                               | Responsibility                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `plugins/daggerheart-core/rollFormulaSync.ts`      | 公式字符串到 `RollConfig` 的受限同步逻辑（仅覆盖支持的语法子集） |
| `plugins/daggerheart-core/rollFormulaSync.test.ts` | 文本公式同步测试                                                 |

---

## Task 1: 扩展类型与判定语义

**Files:**

- Modify: `src/rules/types.ts`
- Modify: `plugins/daggerheart-core/rollTypes.ts`
- Modify: `plugins/daggerheart/types.ts`
- Modify: `plugins/daggerheart-core/DiceJudge.ts`
- Test: `plugins/daggerheart-core/__tests__/DiceJudge.test.ts`

- [ ] **Step 1: 先写 `DiceJudge` 新语义的失败测试**

```ts
it('returns hope_unknown without dc when hope die is higher', () => {
  const judge = new DiceJudge()
  expect(judge.evaluate([[9, 4]], 13)).toMatchObject({
    type: 'daggerheart',
    outcome: 'hope_unknown',
  })
})

it('returns fear_unknown without dc when fear die is higher', () => {
  const judge = new DiceJudge()
  expect(judge.evaluate([[4, 9]], 13)).toMatchObject({
    type: 'daggerheart',
    outcome: 'fear_unknown',
  })
})

it('returns critical_success without dc when duality dice are equal', () => {
  const judge = new DiceJudge()
  expect(judge.evaluate([[7, 7]], 14)).toMatchObject({
    type: 'daggerheart',
    outcome: 'critical_success',
  })
})
```

- [ ] **Step 2: 跑定向测试，确认它们先失败**

Run: `npx vitest run plugins/daggerheart-core/__tests__/DiceJudge.test.ts`

Expected:

- 现有 `evaluate` 签名要求 `dc`
- 或 outcome 联合类型不包含 `hope_unknown` / `fear_unknown`

- [ ] **Step 3: 最小实现类型与判定逻辑**

实现要点：

```ts
export type DaggerheartOutcome =
  | 'critical_success'
  | 'success_hope'
  | 'success_fear'
  | 'failure_hope'
  | 'failure_fear'
  | 'hope_unknown'
  | 'fear_unknown'

evaluate(rolls: number[][], total: number, dc?: number): JudgmentResult | null {
  // no dc => critical_success | hope_unknown | fear_unknown
}
```

并在：

- `RollConfig` 中新增 `applyOutcomeEffects: boolean`
- 模板配置中新增 `applyOutcomeEffects: boolean`

- [ ] **Step 4: 重新跑判定测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/__tests__/DiceJudge.test.ts`

Expected: PASS

---

## Task 2: 更新 workflow，支持无 DC 与反应掷骰

**Files:**

- Modify: `plugins/daggerheart-core/index.ts`
- Modify: `plugins/daggerheart-core/rollTypes.ts`
- Test: `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`

- [ ] **Step 1: 先写 workflow 失败测试**

新增测试覆盖：

```ts
it('emits hope_unknown when dc is undefined and hope die wins', async () => {
  // actorId + skipModifier + duality dice result [[8], [5]]
  // expect payload.dc toBeUndefined()
  // expect payload.judgment.outcome toBe('hope_unknown')
})

it('does not apply outcome side effects when applyOutcomeEffects is false', async () => {
  // expect no core:component-update even when judgment is fear/hope
})

it('registers .ddr with applyOutcomeEffects=false defaults', async () => {
  // call workflow via handle/command-equivalent data and assert payload
})
```

- [ ] **Step 2: 运行定向 workflow 测试，确认先失败**

Run: `npx vitest run plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`

Expected:

- outcome 仍为 `null` 或老结果
- `applyOutcomeEffects` 未参与 `resolve`

- [ ] **Step 3: 最小实现 workflow 逻辑**

实现要点：

```ts
const defaultConfig: RollConfig = {
  dualityDice: { hopeFace: 12, fearFace: 12 },
  diceGroups: [],
  modifiers: [],
  constantModifier: 0,
  sideEffects: [],
  dc: ctx.vars.dc,
  applyOutcomeEffects: ctx.vars.applyOutcomeEffects ?? true,
}

ctx.vars.judgment = this.dice.evaluate(rolls, rollResult.total, dc)

if (config?.applyOutcomeEffects !== true) return
```

并保留：

- `.dd` 默认 `applyOutcomeEffects=true`
- `.ddr` 默认 `applyOutcomeEffects=false`

- [ ] **Step 4: 重新跑 workflow 测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`

Expected: PASS

---

## Task 3: 修正模板配置与现有 TS 报错

**Files:**

- Modify: `plugins/daggerheart-core/rollTemplateUtils.ts`
- Modify: `plugins/daggerheart-core/RollTemplateManager.ts`
- Modify: `plugins/daggerheart/types.ts`
- Test: `plugins/daggerheart-core/__tests__/rollTemplateWorkflows.test.ts`

- [ ] **Step 1: 先写模板字段的失败测试**

```ts
it('defaults applyOutcomeEffects to true when missing from old template config', () => {
  // create old-style config without applyOutcomeEffects
  // materialize/clone should yield applyOutcomeEffects: true
})

it('preserves applyOutcomeEffects=false when editing template config', async () => {
  // add/update template and expect stored config.applyOutcomeEffects toBe(false)
})
```

- [ ] **Step 2: 跑模板测试，确认先失败**

Run: `npx vitest run plugins/daggerheart-core/__tests__/rollTemplateWorkflows.test.ts`

Expected:

- 新字段缺失
- 或默认值不符合预期

- [ ] **Step 3: 最小实现模板兼容与默认值**

实现要点：

```ts
export function createDefaultRollTemplateConfig(): DHRollTemplateConfig {
  return {
    dualityDice: { hopeFace: 12, fearFace: 12 },
    diceGroups: [],
    modifiers: [],
    constantModifier: 0,
    sideEffects: [],
    applyOutcomeEffects: true,
  }
}
```

`clone/materialize` 对缺失字段统一补 `true`，同时修复 `RollTemplateManager.ts` 当前的 TS 报错路径。

- [ ] **Step 4: 重新跑模板测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/__tests__/rollTemplateWorkflows.test.ts`

Expected: PASS

---

## Task 4: 为 `ModifierPanel` 增加可空 DC、反应掷骰和手写公式

**Files:**

- Create: `plugins/daggerheart-core/rollFormulaSync.ts`
- Test: `plugins/daggerheart-core/rollFormulaSync.test.ts`
- Modify: `plugins/daggerheart-core/ui/ModifierPanel.tsx`
- Modify: `plugins/daggerheart-core/ui/modifier/FormulaBar.tsx`

- [ ] **Step 1: 先写公式同步测试**

```ts
it('parses d20+2 into roll config without duality dice', () => {
  expect(parseFormulaToRollConfig('1d20+2')).toMatchObject({
    dualityDice: null,
    diceGroups: [{ sides: 20, count: 1, operator: '+' }],
    constantModifier: 2,
    applyOutcomeEffects: true,
  })
})

it('parses 2d20kh1+2 into a keep-high dice group', () => {
  expect(parseFormulaToRollConfig('2d20kh1+2')?.diceGroups[0]).toMatchObject({
    sides: 20,
    count: 2,
    keep: { mode: 'high', count: 1 },
  })
})
```

- [ ] **Step 2: 跑公式同步测试，确认先失败**

Run: `npx vitest run plugins/daggerheart-core/rollFormulaSync.test.ts`

Expected: module/function not found

- [ ] **Step 3: 最小实现受限公式同步器**

实现边界：

- 支持标准骰、常量、`kh/kl`
- 不尝试从纯文本恢复 attribute / experience 来源
- 文本模式下只同步到：
  - `dualityDice`
  - `diceGroups`
  - `constantModifier`
  - `dc`
  - `applyOutcomeEffects`

```ts
export function parseFormulaToRollConfig(formula: string): Partial<RollConfig> | null {
  const terms = tokenizeExpression(formula)
  // convert dice terms to duality or diceGroups
}
```

- [ ] **Step 4: 在 `ModifierPanel` 中接入文本模式与新控件**

最小 UI 变化：

- `DC` 输入框允许空字符串
- 新增 `反应掷骰` 开关
- `FormulaBar` 支持编辑态
- 文本合法时同步回当前 `rollConfig`

- [ ] **Step 5: 跑相关定向测试确认通过**

Run:

- `npx vitest run plugins/daggerheart-core/rollFormulaSync.test.ts`
- `npx vitest run plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx`

Expected: PASS

---

## Task 5: 更新聊天展示与完成验证

**Files:**

- Modify: `plugins/daggerheart-core/ui/DHActionCheckCard.tsx`
- Modify: `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`
- Modify: `plugins/daggerheart-core/__tests__/DiceJudge.test.ts`

- [ ] **Step 1: 先补展示相关失败测试**

重点：

- `hope_unknown` / `fear_unknown` 能映射到正确 display 文案
- 无 DC 时卡片不显示误导性的 success/failure

- [ ] **Step 2: 运行定向测试确认先失败**

Run:

- `npx vitest run plugins/daggerheart-core/__tests__/DiceJudge.test.ts`
- `npx vitest run plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`

- [ ] **Step 3: 最小实现展示分支**

实现要点：

- `DiceJudge.getDisplay()` 增加：
  - `judgment.hopeUnknown`
  - `judgment.fearUnknown`
- `DHActionCheckCard` 在 `dc === undefined` 时不渲染 `DC xx`

- [ ] **Step 4: 运行全套相关验证**

Run:

- `npx vitest run plugins/daggerheart-core/__tests__/DiceJudge.test.ts plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts plugins/daggerheart-core/__tests__/rollTemplateWorkflows.test.ts plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx plugins/daggerheart-core/rollConfigUtils.test.ts plugins/daggerheart-core/rollFormulaSync.test.ts`
- `npx tsc --noEmit`

Expected:

- 所有定向测试通过
- TypeScript 无错误

---

## Self-Review

- Spec coverage:
  - 无 DC 判定：Task 1, 2, 5
  - 反应掷骰独立开关：Task 2, 4
  - `.ddr` 保留：Task 2
  - `ModifierPanel` 手写公式：Task 4
  - 模板持久化新字段：Task 3
- Placeholder scan:
  - 无 `TODO` / `TBD`
  - 每个任务都包含目标文件与验证命令
- Type consistency:
  - 统一使用 `applyOutcomeEffects`
  - 无 DC 新结果统一使用 `hope_unknown` / `fear_unknown`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-13-daggerheart-roll-semantics.md`.

用户已明确要求继续执行，因此本次直接采用 **Inline Execution**，按 `superpowers:executing-plans` 继续实施。
