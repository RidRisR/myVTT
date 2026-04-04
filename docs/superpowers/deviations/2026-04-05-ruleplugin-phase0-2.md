# RulePlugin Retirement Phase 0-2 — Deviation Report

> **Date:** 2026-04-05
> **Design spec:** `docs/design/22-RulePlugin退役总框架.md`
> **Scope:** Phase 0, Phase 1a (partial), Phase 1d, Phase 2

---

## Completed as designed

| Phase | Item | Status |
|-------|------|--------|
| Phase 0 | Delete `hideElements`, `dockTabs`, `gmTabs`, `keyBindings`, `getPresetTemplates` | ✅ Done |
| Phase 1d | Migrate i18n from RulePlugin to VTTPlugin | ✅ Done |
| Phase 2 | RendererRegistry multi-registration extension (`getAllRenderers`) | ✅ Done |
| Phase 1a | Delete `PluginPanelContainer.tsx` | ✅ Done |

---

## Deviations from design

### D1: Phase 1a — FullCharacterSheet not adapted to IComponentSDK

**Design says:** "面板组件全部适配 IComponentSDK 新接口 — 旧 props 不再注入，面板组件改用 sdk.data.useEntity()、sdk.ui.closePanel() 等 SDK 方法自给自足"

**Actual:** `PluginPanelContainer` deleted, but `FullCharacterSheet.tsx` was NOT adapted. The component still expects `{ entity, onClose, onUpdateEntity, onCreateEntity }` props. It is no longer mounted at runtime (the container that rendered it is gone), so there's no runtime error — but the component file remains as dead code until Phase 3 re-registers it via UIRegistry with IComponentSDK adaptation.

**Reason:** FullCharacterSheet is 466 lines. Adapting it requires designing how overlay-type panels get entity context through IComponentSDK (currently `openPanel(id, entityId)` passes entityId, but IComponentSDK doesn't have this concept). This is a Phase 3 design concern.

**Impact:** FullCharacterSheet is unreachable at runtime. `DaggerHeartCard` calls `openPanel('dh-full-sheet', entityId)` via `usePluginPanels`, but nothing renders the result (`activePluginPanels` state is written but never consumed). No functional regression.

### D2: Phase 1b — TeamDashboard not deleted

**Design says:** "删除 `TeamDashboard.tsx` — 该容器仅是 RulePlugin teamPanel 的宿主。"

**Actual:** TeamDashboard was NOT deleted.

**Reason:** TeamDashboard has substantial standalone logic (collapse/expand, auto-show on tracker, fixed positioning, TeamMetricsTab fallback). `PanelRenderer` cannot replicate this behavior — tracked as GitHub issue #188. Deferred to a later PR.

**Impact:** TeamDashboard still consumes `useRulePlugin().surfaces?.teamPanel`. This RulePlugin dependency remains active.

### D3: Phase 1c — Entity creation workflow-ization deferred

**Design says:** 9 entity creation paths reduced to 3 via `core:create-entity` workflow, `ctx.createEntity` extended with `sceneId`/`tokenPlacement`, `spawnFromBlueprint` and `createToken` REST endpoints deleted.

**Actual:** Not attempted in this PR.

**Reason:** Phase 1c is estimated as L. It involves: extending `entity:create-request` socket handler with new params, deleting 2 server REST endpoints, modifying 5+ UI call sites, deleting `createEphemeralNpcInScene` and `createToken` worldStore methods, creating a `core:create-entity` base workflow. This deserves its own design doc and PR.

**Impact:** `dataTemplates` RulePlugin property remains active (2 call sites: CharacterLibraryTab, PortraitBar).

### D4: Phase 3 and Phase 4 deferred

**Reason:** Phase 3 (adapters/EntityCard/Bar/Status/FormulaBinding) depends on Phase 2 being complete (done now), but is L-XL scope (~500-600 lines across 10+ files). Phase 4 depends on all prior phases. Both deferred to follow-up PRs.

### D5: usePluginPanels hook left as dead code

**Design says (not explicitly):** `usePluginPanels` should be deleted when PluginPanelContainer is deleted.

**Actual:** `usePluginPanels` hook remains because `DaggerHeartCard.tsx` still calls `openPanel('dh-full-sheet', entityId)`. The call is now a no-op at runtime (writes to uiStore but nothing renders it).

**Reason:** Deleting `usePluginPanels` would require modifying `DaggerHeartCard.tsx`, which is part of Phase 3 (EntityCard migration). Left as-is to keep this PR focused.

---

## Phase 2 implementation detail

The multi-registration extension uses a `multiSurfaces` Set to distinguish surfaces that support multiple registrations (`entity`, `combat`) from single-registration surfaces (`chat`, `rollResult`, `toast`). This was not explicitly specified in the design doc but is a necessary implementation decision. Single-registration surfaces preserve the existing warn-and-skip behavior.

`getAllRenderers` was also exported from `@myvtt/sdk` (via `src/rules/sdk.ts`) so plugins can consume the new API in future phases.
