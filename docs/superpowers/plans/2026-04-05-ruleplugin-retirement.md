# RulePlugin Retirement — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the RulePlugin retirement framework (doc 22) — remove all RulePlugin consumption points and migrate to VTTPlugin + RendererRegistry.

**Architecture:** Phased migration. Phase 0 (done). This plan covers Phase 1d, Phase 2, Phase 1a, Phase 1b. Phase 1c (entity creation workflow-ization) and Phase 3 (adapters/Bar/Status/FormulaBinding) are deferred to a follow-up PR due to scope.

**Tech Stack:** TypeScript, React, RendererRegistry, UIRegistry, i18next

---

## Scope for this PR

| Phase                                | Included    | Reason                                                                                   |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| Phase 0                              | ✅ Done     | Committed as `8e09329`                                                                   |
| Phase 1d (i18n)                      | ✅ This PR  | S — straightforward i18n re-routing                                                      |
| Phase 2 (RendererRegistry multi-reg) | ✅ This PR  | M — infrastructure extension, no RulePlugin dependency                                   |
| Phase 1a (panels)                    | ⚠️ Partial  | Delete PluginPanelContainer; FullCharacterSheet IComponentSDK adaptation is L, may defer |
| Phase 1b (teamPanel)                 | ⏸️ Deferred | Blocked by PanelRenderer limitations (issue #188)                                        |
| Phase 1c (entity creation)           | ⏸️ Deferred | L — needs its own design + PR                                                            |
| Phase 3 (adapters)                   | ⏸️ Deferred | L-XL — depends on Phase 2                                                                |
| Phase 4 (cleanup)                    | ⏸️ Deferred | Depends on Phase 1-3 complete                                                            |

---

### Task 1: Phase 1d — Migrate i18n from RulePlugin to VTTPlugin

**Files:**

- Modify: `src/i18n/pluginI18n.ts`
- Modify: `src/rules/registry.ts`
- Modify: `plugins/daggerheart-core/index.ts`

The current `usePluginTranslation()` hook reads translations from `useRulePlugin().i18n.resources` — manually looking up keys in a flat dict. Meanwhile, `loadPluginI18n()` in registry.ts already loads translations into i18next as namespace `plugin-{id}`.

Migration: Make VTTPlugin load its own i18n in `onActivate`, and `usePluginTranslation()` reads from i18next namespace directly instead of going through RulePlugin.

- [ ] **Step 1: Read current pluginI18n.ts and understand the hook**

File: `src/i18n/pluginI18n.ts` — 30 lines. Hook calls `useRulePlugin()` to get `plugin.i18n?.resources`, then manually looks up keys. Need to replace with `useTranslation('plugin-{pluginId}')` from i18next.

Problem: The hook doesn't know the pluginId — it gets translations from the active RulePlugin. After migration, we need a way to determine the active plugin's i18n namespace. Options:

- A) Hardcode `plugin-daggerheart` (bad — defeats purpose)
- B) Read room's ruleSystemId from worldStore (same as current, just different lookup)
- C) Each consumer passes pluginId (breaks current API)

Simplest: keep reading ruleSystemId from worldStore, use it to construct `plugin-{ruleSystemId}` namespace, call `i18next.t()` with that namespace. This removes the RulePlugin dependency while keeping the same semantics.

- [ ] **Step 2: Update `usePluginTranslation` to use i18next directly**

Replace the hook body: instead of reading `plugin.i18n?.resources` and doing manual lookup, use `useTranslation('plugin-{ruleSystemId}')`.

```typescript
// src/i18n/pluginI18n.ts
import { useTranslation } from 'react-i18next'
import { useWorldStore } from '../stores/worldStore'

export function usePluginTranslation() {
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  const ns = `plugin-${ruleSystemId}`
  const { t, i18n } = useTranslation(ns)
  return { t, language: i18n.language }
}
```

- [ ] **Step 3: Move i18n loading into DH VTTPlugin onActivate**

Currently `loadPluginI18n(plugin)` in registry.ts loads i18n for RulePlugins. DH's translations (`plugins/daggerheart/i18n.ts`) need to be loaded in the VTTPlugin `onActivate` instead. Add to `plugins/daggerheart-core/index.ts`:

```typescript
import i18next from 'i18next'
import { daggerheartI18n } from '../daggerheart/i18n'

// In onActivate:
if (daggerheartI18n?.resources && i18next.isInitialized) {
  for (const [lng, translations] of Object.entries(daggerheartI18n.resources)) {
    i18next.addResourceBundle(lng, 'plugin-daggerheart', translations, true, true)
  }
}
```

- [ ] **Step 4: Remove loadPluginI18n from registry.ts**

Delete the `loadPluginI18n` function and its calls in `registry.ts`. The i18n loading now happens in plugin `onActivate`.

- [ ] **Step 5: Verify TypeScript compiles + run tests**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: Clean compile, all tests pass.

- [ ] **Step 6: Commit**

```
feat: migrate i18n from RulePlugin to VTTPlugin (Phase 1d)
```

---

### Task 2: Phase 2 — RendererRegistry multi-registration extension

**Files:**

- Modify: `src/log/rendererRegistry.ts`
- Create: `src/log/__tests__/rendererRegistry-multi.test.ts`

Extend RendererRegistry to support same-key multiple registrations via `getAllRenderers()`. Keep existing `getRenderer()` backward-compatible (returns first registered value).

- [ ] **Step 1: Write failing tests for multi-registration**

```typescript
// src/log/__tests__/rendererRegistry-multi.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  getRenderer,
  getAllRenderers,
  clearRenderers,
  createRendererPoint,
} from '../rendererRegistry'

describe('getAllRenderers (multi-registration)', () => {
  beforeEach(() => clearRenderers())

  it('returns empty array when no registrations exist', () => {
    expect(getAllRenderers('entity', 'bar')).toEqual([])
  })

  it('returns single item after one registration', () => {
    registerRenderer('entity', 'bar', { label: 'HP' })
    expect(getAllRenderers('entity', 'bar')).toEqual([{ label: 'HP' }])
  })

  it('accumulates multiple registrations under same key', () => {
    registerRenderer('entity', 'bar', { label: 'HP' })
    registerRenderer('entity', 'bar', { label: 'Stress' })
    expect(getAllRenderers('entity', 'bar')).toEqual([{ label: 'HP' }, { label: 'Stress' }])
  })

  it('getRenderer still returns first registered value (backward compat)', () => {
    registerRenderer('entity', 'bar', { label: 'HP' })
    registerRenderer('entity', 'bar', { label: 'Stress' })
    expect(getRenderer('entity', 'bar')).toEqual({ label: 'HP' })
  })

  it('works with typed RendererPoint tokens', () => {
    const point = createRendererPoint<{ label: string }>('entity', 'bar')
    registerRenderer(point, { label: 'HP' })
    registerRenderer(point, { label: 'Stress' })
    expect(getAllRenderers(point)).toHaveLength(2)
  })

  it('clearRenderers removes all multi-registrations', () => {
    registerRenderer('entity', 'bar', { label: 'HP' })
    registerRenderer('entity', 'bar', { label: 'Stress' })
    clearRenderers()
    expect(getAllRenderers('entity', 'bar')).toEqual([])
  })

  it('single-value surfaces still warn on duplicate (backward compat)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerRenderer('chat', 'core:text', () => null)
    registerRenderer('chat', 'core:text', () => null) // should warn
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest run src/log/__tests__/rendererRegistry-multi.test.ts`
Expected: FAIL — `getAllRenderers` not exported.

- [ ] **Step 3: Implement multi-registration in rendererRegistry.ts**

Change internal storage from `Map<string, any>` to `Map<string, any[]>`. Add `getAllRenderers` function. Keep `getRenderer` returning first item. The `registerRenderer` behavior changes:

- For keys in multi-registration surfaces (`entity::*`), always append.
- For other keys (`chat::*`, `rollResult::*`), keep existing warn-and-skip behavior.

Implementation approach: Use a Set of surface prefixes that support multi-registration. Default: single-registration with warn. Surfaces can opt in to multi-registration.

```typescript
const multiSurfaces = new Set(['entity', 'combat'])

// In registerRenderer implementation:
if (registry.has(k)) {
  if (multiSurfaces.has(surface)) {
    registry.get(k)!.push(val)
    return
  }
  console.warn(`[RendererRegistry] "${k}" already registered, skipping`)
  return
}
registry.set(k, [val])
```

Add `getAllRenderers` overloads matching existing pattern:

```typescript
export function getAllRenderers<T>(point: RendererPoint<T>): T[]
export function getAllRenderers(surface: string, type: string): unknown[]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/log/__tests__/rendererRegistry-multi.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regression**

Run: `node_modules/.bin/vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```
feat: add multi-registration support to RendererRegistry (Phase 2)
```

---

### Task 3: Phase 1a — Delete PluginPanelContainer

**Files:**

- Delete: `src/layout/PluginPanelContainer.tsx`
- Modify: `src/App.tsx` (remove PluginPanelContainer import and render)
- Modify: `plugins/daggerheart/index.ts` (remove surfaces.panels)

Note: FullCharacterSheet IComponentSDK adaptation is deferred — the panel is already registered via UIRegistry by `daggerheart-core` plugin (FearPanel pattern). FullCharacterSheet adaptation requires designing how the overlay-type panel gets entity context, which is a Phase 3 concern.

For now, we delete the dead container and remove the RulePlugin surfaces.panels reference. DH's `FullCharacterSheet` was the only panel registered via RulePlugin. It will need adaptation in a follow-up, but the `PluginPanelContainer` itself is dead code once the RulePlugin panel reference is removed.

- [ ] **Step 1: Remove PluginPanelContainer from App.tsx**

Remove the import and the `<PluginPanelContainer />` render.

- [ ] **Step 2: Delete PluginPanelContainer.tsx**

Delete the file entirely.

- [ ] **Step 3: Remove surfaces.panels from daggerheart RulePlugin**

In `plugins/daggerheart/index.ts`, remove the `panels` array from `surfaces`. (Note: `teamPanel` stays for now — Phase 1b is deferred.)

- [ ] **Step 4: Verify TypeScript compiles + run tests**

- [ ] **Step 5: Commit**

```
refactor: delete PluginPanelContainer — panels now UIRegistry-driven (Phase 1a)
```

---

### Task 4: Create PR

- [ ] **Step 1: Push branch and create PR**

Push the worktree branch and create a PR against main with:

- Summary of Phase 0 + 1a + 1d + 2 changes
- Link to doc 22
- Deviation doc reference

---

### Task 5: Write deviation doc

- [ ] **Step 1: Create deviation document**

Create `docs/superpowers/deviations/2026-04-05-ruleplugin-phase0-2.md` documenting:

- What was planned vs what was implemented
- Phase 1b deferred (PanelRenderer limitation, issue #188)
- Phase 1c deferred (entity creation workflow-ization — scope too large)
- Phase 1a partial (PluginPanelContainer deleted, but FullCharacterSheet not yet adapted to IComponentSDK)
- Phase 3/4 deferred (depends on Phase 1c + 2)
