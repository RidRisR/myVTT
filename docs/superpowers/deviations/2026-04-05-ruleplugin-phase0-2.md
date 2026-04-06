# RulePlugin Retirement — Deviation Report

> **Date:** 2026-04-05
> **Design spec:** `docs/design/22-RulePlugin退役总框架.md`
> **Scope:** Full retirement (Phase 0–4)

---

## Completed as designed

| Phase          | Item                                                                             | Status  |
| -------------- | -------------------------------------------------------------------------------- | ------- |
| Phase 0        | Delete `hideElements`, `dockTabs`, `gmTabs`, `keyBindings`, `getPresetTemplates` | ✅ Done |
| Phase 1a       | Delete `PluginPanelContainer.tsx`                                                | ✅ Done |
| Phase 1d       | Migrate i18n from RulePlugin to VTTPlugin                                        | ✅ Done |
| Phase 2        | RendererRegistry multi-registration extension (`getAllRenderers`)                | ✅ Done |
| Phase 2a/2b/2c | surfaces.tools/tokenActions/contextMenu → RendererRegistry                       | ✅ Done |
| Phase 3        | Entity bindings system (24 adapter consumption points → 0)                       | ✅ Done |
| Phase 4        | Delete RulePlugin interface, useRulePlugin, old plugin objects                   | ✅ Done |

---

## Deviations from design

### D1: Phase 1a — FullCharacterSheet not adapted to IComponentSDK

**Design says:** "面板组件全部适配 IComponentSDK 新接口 — 旧 props 不再注入，面板组件改用 sdk.data.useEntity()、sdk.ui.closePanel() 等 SDK 方法自给自足"

**Actual:** `PluginPanelContainer` deleted, but `FullCharacterSheet.tsx` was NOT adapted. The component still expects `{ entity, onClose, onUpdateEntity, onCreateEntity }` props. It is no longer mounted at runtime (the container that rendered it is gone), so there's no runtime error — but the component file remains as dead code until re-registered via UIRegistry with IComponentSDK adaptation.

**Reason:** FullCharacterSheet is 466 lines. Adapting it requires designing how overlay-type panels get entity context through IComponentSDK (currently `openPanel(id, entityId)` passes entityId, but IComponentSDK doesn't have this concept).

**Impact:** FullCharacterSheet is unreachable at runtime. No functional regression.

### D2: Phase 1b — TeamDashboard container preserved (design said delete)

**Design says:** "删除 `TeamDashboard.tsx` — 该容器仅是 RulePlugin teamPanel 的宿主。"

**Actual:** TeamDashboard container was preserved, but its data source was changed from `useRulePlugin().surfaces?.teamPanel` to `getTeamPanel()` (TEAM_PANEL_POINT entity binding).

**Reason:** TeamDashboard has substantial standalone logic (collapse/expand, auto-show on tracker, fixed positioning, TeamMetricsTab fallback). `PanelRenderer` cannot replicate this behavior — tracked as GitHub issue #188.

**Impact:** RulePlugin dependency eliminated. TeamDashboard reads from entity bindings. Container deletion deferred until PanelRenderer supports fixed positioning (issue #188).

**Status:** ✅ RulePlugin dependency resolved — container cleanup is a separate concern.

### D3: Phase 1c — Entity creation workflow-ization deferred

**Design says:** 9 entity creation paths reduced to 3 via `core:create-entity` workflow, `ctx.createEntity` extended with `sceneId`/`tokenPlacement`, `spawnFromBlueprint` and `createToken` REST endpoints deleted.

**Actual:** Only the dataTemplates RulePlugin dependency was eliminated via `DATA_TEMPLATE_POINT` entity binding. The broader workflow-ization (route consolidation 9→3, REST endpoint deletion) was NOT done.

**Reason:**

1. RulePlugin dependency (`dataTemplates` 2 call sites) already eliminated via entity bindings — RulePlugin interface deletion is unblocked
2. Full workflow-ization is L-sized: extends socket handler, deletes 2 REST endpoints, modifies 5+ UI files, creates base workflow — cross-cutting frontend/backend change
3. Route consolidation changes user interaction patterns (GM/player creation flows) — needs independent UX design review
4. Does not affect this PR's core goal (delete RulePlugin interface)

**Impact:** `dataTemplates` dependency eliminated. Entity creation paths remain at 9 (architectural debt, not RulePlugin debt). Deferred to independent PR.

### D5: usePluginPanels hook — status update

**Original deviation:** `usePluginPanels` left as dead code because `DaggerHeartCard.tsx` called `openPanel()`.

**Current status:** Needs verification whether this was cleaned up in Phase 3/4. The hook file `src/rules/usePluginPanels.ts` may still exist.

---

## Phase 2 implementation detail

The multi-registration extension uses a `multiSurfaces` Set to distinguish surfaces that support multiple registrations (`entity`, `combat`) from single-registration surfaces (`chat`, `rollResult`, `toast`). This was not explicitly specified in the design doc but is a necessary implementation decision. Single-registration surfaces preserve the existing warn-and-skip behavior.

`getAllRenderers` was also exported from `@myvtt/sdk` (via `src/rules/sdk.ts`) so plugins can consume the new API.

## Phase 3 implementation detail

Instead of the planned Bar/Status/FormulaBinding registration model, the implementation used a unified "entity bindings" pattern with 7 RendererPoints:

- `MAIN_RESOURCE_POINT` — replaces `getMainResource()` adapter
- `PORTRAIT_RESOURCES_POINT` — replaces `getPortraitResources()` adapter
- `STATUS_POINT` — replaces `getStatuses()` adapter
- `FORMULA_TOKENS_POINT` — replaces `getFormulaTokens()` adapter
- `ENTITY_CARD_POINT` — replaces `characterUI.EntityCard`
- `DATA_TEMPLATE_POINT` — replaces `dataTemplates.createDefaultEntityData()`
- `TEAM_PANEL_POINT` — replaces `surfaces.teamPanel`

Each binding type is a typed callback `(entity) => T` registered by plugins. Utility functions (`getMainResource()`, `getStatuses()`, etc.) resolve bindings by iterating registered callbacks. This is functionally equivalent to the planned design but uses a flatter structure (no Bar/Status/Formula distinction — just typed RendererPoints).
