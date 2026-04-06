# RulePlugin Phase 0: Dead Property Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all zero-consumer properties from the RulePlugin interface and their associated type definitions and SDK exports.

**Architecture:** Pure deletion — remove dead code from `types.ts` (interface properties + type definitions) and `sdk.ts` (re-exports). No behavioral changes. Partial work already done: type definitions for `PresetTemplate`, `DockTabDef`, `GMTabDef`, `HideableElement`, `KeyBinding` have been deleted from `types.ts`, but the RulePlugin interface still references them (causing TS errors). This plan completes the cleanup.

**Tech Stack:** TypeScript

---

### Task 1: Complete types.ts cleanup — remove dead interface properties

**Files:**

- Modify: `src/rules/types.ts:184-203`

**Context:** The type definitions (`PresetTemplate`, `DockTabDef`, `GMTabDef`, `HideableElement`, `KeyBinding`) have already been deleted from this file. But the `RulePlugin` interface at lines 184-203 still references them in `surfaces` (`dockTabs?: DockTabDef[]`, `gmTabs?: GMTabDef[]`, `keyBindings?: KeyBinding[]`) and `hideElements?: HideableElement[]`. These references now cause TypeScript compile errors. Also remove the unused `ToolDefinition` import at line 5 — it's only used by `surfaces.tools` which stays, so check first.

- [ ] **Step 1: Remove dead properties from RulePlugin.surfaces**

Remove `dockTabs`, `gmTabs`, `keyBindings` from the `surfaces` object and `hideElements` from the top-level interface. The result should be:

```typescript
  // Layer 4: UI surfaces (optional)
  surfaces?: {
    panels?: PluginPanelDef[]
    teamPanel?: React.ComponentType<TeamPanelProps>

    // ── map integration ──
    tools?: ToolDefinition[]
    getTokenActions?: (ctx: TokenActionContext) => TokenAction[]
    getContextMenuItems?: (ctx: ContextMenuContext) => ContextMenuItem[]
  }

  // Layer 5: Rule resolution — reserved, not implemented
  // ruleResolution?: RuleResolutionModule
```

Note: `hideElements` (Layer 5) and its comment are deleted. The old "Layer 6" comment for rule resolution becomes "Layer 5".

- [ ] **Step 2: Check if ToolDefinition import is still needed**

`ToolDefinition` is imported at line 5: `import type { ToolDefinition } from '../combat/tools/types'`. It is still used by `surfaces.tools?: ToolDefinition[]`, so it stays. No action needed.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors (or only pre-existing errors unrelated to this change)

---

### Task 2: Remove dead type exports from sdk.ts

**Files:**

- Modify: `src/rules/sdk.ts:6-31`

**Context:** `sdk.ts` re-exports `PresetTemplate`, `DockTabDef`, `GMTabDef`, `HideableElement`, `KeyBinding` from `./types`. These types no longer exist. Remove the 5 dead re-exports.

- [ ] **Step 1: Remove the 5 dead type re-exports**

Change the type export block from:

```typescript
export type {
  RulePlugin,
  PluginI18n,
  ResourceView,
  StatusView,
  EntityCardProps,
  PluginPanelDef,
  PluginPanelProps,
  TeamPanelProps,
  PresetTemplate,
  DockTabDef,
  GMTabDef,
  HideableElement,
  JudgmentResult,
  JudgmentDisplay,
  DaggerheartOutcome,
  DieConfig,
  RenderDiceOptions,
  TokenAction,
  TokenActionContext,
  TargetingRequest,
  TargetInfo,
  ContextMenuItem,
  ContextMenuContext,
  KeyBinding,
} from './types'
```

To:

```typescript
export type {
  RulePlugin,
  PluginI18n,
  ResourceView,
  StatusView,
  EntityCardProps,
  PluginPanelDef,
  PluginPanelProps,
  TeamPanelProps,
  JudgmentResult,
  JudgmentDisplay,
  DaggerheartOutcome,
  DieConfig,
  RenderDiceOptions,
  TokenAction,
  TokenActionContext,
  TargetingRequest,
  TargetInfo,
  ContextMenuItem,
  ContextMenuContext,
} from './types'
```

Removed: `PresetTemplate`, `DockTabDef`, `GMTabDef`, `HideableElement`, `KeyBinding`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

### Task 3: Run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass. No test references the deleted types — confirmed by grep during planning.

- [ ] **Step 2: Run TypeScript strict check one more time**

Run: `npx tsc --noEmit`
Expected: Clean

---

### Task 4: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add src/rules/types.ts src/rules/sdk.ts
git commit -m "refactor: remove dead RulePlugin properties (Phase 0)

Delete zero-consumer interface properties and their type definitions:
- hideElements (Layer 5)
- dockTabs, gmTabs, keyBindings (surfaces)
- getPresetTemplates (dataTemplates)
- PresetTemplate, DockTabDef, GMTabDef, HideableElement, KeyBinding types
- Corresponding SDK re-exports

Part of RulePlugin retirement framework (doc 22, Phase 0)."
```

---

### Task 5: E2E smoke test

- [ ] **Step 1: Run E2E tests**

Run: `npx playwright test 2>&1 | tail -20`
Expected: All E2E tests pass. This is a pure type deletion — no runtime behavior changes, so E2E should be unaffected.
