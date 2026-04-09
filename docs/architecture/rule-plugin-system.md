# Plugin System Architecture

## Overview

myVTT's core (scenes, entities, tokens, chat) is rule-system agnostic. All TRPG-specific behavior is injected through **VTTPlugin** — the single plugin interface. Plugins register workflows, UI components, renderers, input handlers, and entity display bindings during activation.

Each room selects a rule system at creation time (`room_state.rule_system_id`), which cannot be changed afterward. Plugins are currently compiled with the base and loaded via a static registry.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Plugin Layer (pluggable)                                    │
│                                                              │
│  VTTPlugin.onActivate(sdk):                                  │
│  ├─ sdk.defineWorkflow()       define workflows              │
│  ├─ sdk.addStep/attachStep()   extend existing workflows     │
│  ├─ sdk.registerCommand()      chat commands (.dd, .r)       │
│  ├─ sdk.registerTrigger()      log-driven triggers           │
│  ├─ sdk.ui.registerRegion()    regions (panels/overlays)      │
│  ├─ sdk.ui.registerLayer()     full-screen layers            │
│  ├─ sdk.ui.registerRenderer()  log cards, entity bindings    │
│  └─ sdk.ui.registerInputHandler() workflow input UI          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  Engine Layer (always present, not unloadable)               │
│                                                              │
│  WorkflowEngine             IDataReader                      │
│  ├─ defineWorkflow()        ├─ entity()                      │
│  ├─ runWorkflow()           ├─ component()                   │
│  └─ base workflows:        ├─ query()                        │
│     ├─ roll                 └─ formulaTokens()               │
│     ├─ quick-roll                                            │
│     ├─ core:set-selection   UIRegistry                       │
│     └─ core:send-text       ├─ regions (anchor-positioned)   │
│                             ├─ layers                        │
│  RendererRegistry            └─ inputHandlers                │
│  ├─ chat surface renderers                                   │
│  ├─ entity binding points                                    │
│  └─ rollResult configs                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  Data Layer (zustand store + REST + Socket.io)               │
│                                                              │
│  worldStore: Entity/Scene/Token CRUD + network sync          │
│  sessionStore: local UI state (selection, pendingInteraction)│
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Plugins only handle logic, not communication** — plugins write data via `ctx.updateComponent()` / `ctx.emitEntry()`; the underlying REST/Socket layer is transparent to them.
2. **Engine layer is shared infrastructure** — base workflows are not plugins; they always exist and can be imported directly.
3. **Data layer handles network and state sync** — store actions manage REST calls, optimistic updates, Socket broadcasts, and error rollback.

---

## VTTPlugin Interface

`VTTPlugin` is the only plugin interface. Defined in `src/rules/types.ts`:

```typescript
interface VTTPlugin {
  id: string
  dependencies?: string[] // other plugin IDs that must activate first
  onActivate(sdk: IPluginSDK): void // registration-time setup
  onReady?(ctx: WorkflowContext): void | Promise<void> // post-init (stores loaded)
  onDeactivate?(sdk: IPluginSDK): void // cleanup
}
```

### Lifecycle

1. **Registration** — `registerWorkflowPlugins(plugins)` stores the plugin list (called from `src/rules/registry.ts`).
2. **Phase 1: `initWorkflowSystem()`** — creates the `WorkflowEngine`, registers base workflows, then calls `onActivate(sdk)` for each plugin in order. All workflow definitions, UI registrations, and renderer bindings happen here. Purely synchronous.
3. **Phase 2: `startWorkflowTriggers(watermark)`** — calls `onReady(ctx)` for each plugin (can be async). Plugins can read real store state and create entities. After all `onReady` calls settle, the `LogStreamDispatcher` subscribes to the log stream and begins firing triggers.

### Dependencies

A plugin can declare `dependencies: ['other-plugin-id']` to ensure that plugin activates first. This allows a downstream plugin to call `sdk.getWorkflow('other-plugin:workflow-name')` and extend it with `addStep` / `attachStep`.

---

## IPluginSDK — Registration-Time API

The SDK is passed to `onActivate`. It provides workflow manipulation, command/trigger registration, and UI registration. Plugins cannot run workflows directly at registration time — that requires `WorkflowContext` (inside steps) or `IWorkflowRunner` (from UI layer).

### Workflow Operations

| Method                                  | Purpose                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `defineWorkflow(name, steps?, output?)` | Define a new workflow. Returns a typed `WorkflowHandle<TData, TOutput>`. Name must be prefixed with plugin ID (`pluginId:name`). |
| `getWorkflow(name)`                     | Look up an existing workflow by name (returns untyped handle).                                                                   |
| `addStep(handle, addition)`             | Insert a step with `before`/`after` positioning and `priority`.                                                                  |
| `attachStep(handle, addition)`          | Like `addStep` but lifecycle-bound to a target step — auto-removed if the target is removed.                                     |
| `wrapStep(handle, stepId, options)`     | Wrap an existing step (AOP-style middleware).                                                                                    |
| `replaceStep(handle, stepId, options)`  | Replace a step's implementation entirely.                                                                                        |
| `removeStep(handle, stepId)`            | Remove a step.                                                                                                                   |
| `inspectWorkflow(handle)`               | Return the ordered list of step IDs (for debugging).                                                                             |

### Command & Trigger Registration

| Method                          | Purpose                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerCommand(name, handle)` | Register a chat command (e.g., `.dd`) that maps to a workflow. Name must start with `.`.                                                                   |
| `registerTrigger(trigger)`      | Register a `TriggerDefinition` — when a log entry of type `trigger.on` arrives (matching `trigger.filter`), the specified workflow executes automatically. |

### UI Registration (`sdk.ui`)

| Method                                       | Purpose                                                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerRegion(def)`                        | Register a region (`RegionDef`) with anchor-based positioning, lifecycle (`persistent`/`on-demand`), and layer (`background`/`standard`/`overlay`). |
| `registerComponent(def)` _(deprecated)_      | Legacy wrapper — calls `registerRegion` internally. Use `registerRegion` for new code.                                                              |
| `registerLayer(def)`                         | Register a full-screen layer (`LayerDef`) at a z-order (`below-canvas`, `above-canvas`, `above-ui`).                                                |
| `registerRenderer(surface, type, component)` | Register a log entry renderer (string API) or a typed binding (RendererPoint API).                                                                  |
| `registerInputHandler(inputType, def)`       | Register an input handler component for `ctx.requestInput(inputType)`.                                                                              |

---

## RendererRegistry

The `RendererRegistry` (`src/log/rendererRegistry.ts`) is a typed, multi-surface registration system for extensible UI binding points.

### API

- **`registerRenderer(point, value)`** — typed token API using `RendererPoint<T>`.
- **`registerRenderer(surface, type, renderer)`** — legacy string API for chat renderers.
- **`getRenderer(point)`** / **`getAllRenderers(point)`** — retrieve registered values.
- **`createRendererPoint<T>(surface, type)`** — create a typed extension point token.

### Surfaces

| Surface      | Behavior                         | Example                                                          |
| ------------ | -------------------------------- | ---------------------------------------------------------------- |
| `chat`       | Single registration per type     | Log entry card renderers (e.g., `daggerheart-core:action-check`) |
| `entity`     | Multi-registration (accumulates) | Entity display bindings (resources, statuses, entity cards)      |
| `combat`     | Multi-registration               | Token actions, context menu items                                |
| `rollResult` | Single registration              | Roll result display configs                                      |

### Entity Binding Points

Pre-defined `RendererPoint` tokens in `src/log/entityBindings.ts` bridge plugins to base UI components:

| Point                      | Type                       | Purpose                                |
| -------------------------- | -------------------------- | -------------------------------------- |
| `MAIN_RESOURCE_POINT`      | `MainResourceBinding`      | Primary resource bar on token portrait |
| `PORTRAIT_RESOURCES_POINT` | `PortraitResourcesBinding` | All resource bars on entity portrait   |
| `STATUS_POINT`             | `StatusBinding`            | Status tags on entity                  |
| `FORMULA_TOKENS_POINT`     | `FormulaTokensBinding`     | `@token` resolution in dice formulas   |
| `ENTITY_CARD_POINT`        | `EntityCardBinding`        | Rule-specific entity card component    |
| `DATA_TEMPLATE_POINT`      | `DataTemplateBinding`      | Default entity data factory            |
| `TEAM_PANEL_POINT`         | `TeamPanelBinding`         | Rule-specific team dashboard component |

Each binding's `resolve()` function checks entity components and returns data only for entities it recognizes, so multiple plugins coexist safely without `ruleSystemId` filtering.

---

## WorkflowContext — Step Runtime API

Each step's `run` function receives a `WorkflowContext` providing:

| Category              | Methods                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data access**       | `read.entity(id)`, `read.component(entityId, key)`, `read.query({ has })`, `read.formulaTokens(entityId)`                                                                        |
| **Input**             | `serverRoll(dice)` — server-side dice roll; `requestInput(inputType, options)` — pause workflow until UI resolves                                                                |
| **Effects**           | `emitEntry({ type, payload, triggerable })` — emit log entry; `updateComponent(entityId, key, updater)` — write entity component; `updateTeamTracker(label, patch)` (deprecated) |
| **Entity management** | `createEntity(data)`, `deleteEntity(entityId)`                                                                                                                                   |
| **Flow control**      | `abort(reason?)`, `runWorkflow(handle, data?)` — nested workflow execution                                                                                                       |
| **Step-shared state** | `vars` — mutable data bag shared across all steps in the workflow                                                                                                                |

---

## IRegionSDK — Region Runtime API

Regions registered via `registerRegion` receive an `IRegionSDK` (`src/ui-system/types.ts`), which extends `IComponentSDK`:

| Namespace     | Methods                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `read`        | Imperative data access (`entity()`, `component()`, `query()`)                                                   |
| `data`        | Reactive hooks (`useEntity()`, `useComponent()`, `useQuery()`)                                                  |
| `workflow`    | `IWorkflowRunner` — `runWorkflow(handle, data?)`                                                                |
| `context`     | `instanceProps`, `role`, `layoutMode`                                                                           |
| `interaction` | Drag-and-drop (`dnd.makeDraggable()`, `dnd.makeDropZone()`), panel drag (`layout.startDrag()`) — play mode only |
| `awareness`   | Ephemeral real-time state (`subscribe`, `broadcast`, `clear`, `usePeers`)                                       |
| `log`         | Log stream (`subscribe(pattern, handler)`, `useEntries(pattern, options)`)                                      |
| `ui`          | Region management (`openPanel()`, `closePanel()`, `resize()`, `getPortalContainer()`)                           |

---

## Input Handler System

Plugins register input handlers via `sdk.ui.registerInputHandler(inputType, def)`. Workflow steps call `ctx.requestInput<TResult>(inputType, options)` to pause execution and display a UI component. The component receives `InputHandlerProps` with `context`, `resolve(value)`, and `cancel()` callbacks.

Example: `daggerheart-core` registers a `daggerheart-core:modifier` input handler (the ModifierPanel), and its action-check workflow's `modifier` step calls `ctx.requestInput<ModifierResult>('daggerheart-core:modifier')` to collect DC input before rolling.

---

## Trigger System

`TriggerDefinition` enables log-driven workflow execution:

```typescript
interface TriggerDefinition {
  id: string // unique, prefixed with plugin ID
  on: string // log entry type to match
  filter?: Record<string, unknown> // shallow payload equality filter
  workflow: string // workflow name to execute
  mapInput: (entry: GameLogEntry) => Record<string, unknown>
  executeAs: 'triggering-executor' // runs on the client that originated the entry
}
```

The `LogStreamDispatcher` subscribes to the log stream after `startWorkflowTriggers()`. When a new entry arrives, `TriggerRegistry.getMatchingTriggers(entry)` finds matching triggers, and the dispatcher executes the corresponding workflows.

---

## Plugin SDK Boundary

All plugin imports must go through `@myvtt/sdk` (mapped to `src/rules/sdk.ts`). Plugins may NOT import from `src/` directly. The SDK barrel re-exports:

- **Types**: `VTTPlugin`, `Entity`, `WorkflowContext`, `WorkflowHandle`, `IPluginSDK`, `IDataReader`, etc.
- **Renderer infrastructure**: `createRendererPoint`, `getAllRenderers`, `RendererPoint`, entity binding points and types.
- **Workflow helpers**: `output`, `getRollWorkflow`, `getQuickRollWorkflow`, `tokenizeExpression`, `toDiceSpecs`.
- **Data hooks**: `useEntity`, `useComponent`, `createDataReader`.
- **Component accessors**: `getIdentity`, `getToken`, `getName`, `getColor`, `getImageUrl`, etc.
- **UI utilities**: `usePluginTranslation`, `useHoldRepeat`, `useAwarenessResource`, `usePluginPanels`.

---

## Registered Plugins

Currently registered in `src/rules/registry.ts`:

| Plugin                      | ID                     | Dependencies       | What it does                                                                                                                                |
| --------------------------- | ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `genericVTTPlugin`          | `generic-bindings`     | none               | Entity display bindings for the Generic rule system (reads `rule:*` components)                                                             |
| `daggerheartCorePlugin`     | `daggerheart-core`     | none               | Daggerheart action-check workflow, DiceJudge, FearManager, HopeResolver, entity bindings, modifier input handler, fear panel, `.dd` command |
| `daggerheartCosmeticPlugin` | `daggerheart-cosmetic` | `daggerheart-core` | Lifecycle-bound dice animation step on the action-check workflow                                                                            |
| `coreUIPlugin`              | `core-ui`              | none               | Session info panel                                                                                                                          |

Additionally, `plugins/poc-ui/` contains a proof-of-concept plugin (`poc-ui`) with a hello panel and vignette layer, but it is not registered in the production registry.

---

## File Map

| Path                                    | Purpose                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/rules/types.ts`                    | `VTTPlugin` interface and all plugin-facing type definitions                        |
| `src/rules/registry.ts`                 | Static plugin registration (`registerWorkflowPlugins`)                              |
| `src/rules/sdk.ts`                      | `@myvtt/sdk` barrel — the only legal import path for plugins                        |
| `src/workflow/types.ts`                 | `IPluginSDK`, `WorkflowContext`, `WorkflowHandle`, `IDataReader`                    |
| `src/workflow/engine.ts`                | `WorkflowEngine` — step registration, ordering, execution                           |
| `src/workflow/pluginSDK.ts`             | `PluginSDK` class (registration-time) and `WorkflowRunner` class (execution-time)   |
| `src/workflow/baseWorkflows.ts`         | Base workflows: `roll`, `quick-roll`, `core:set-selection`, `core:send-text`        |
| `src/workflow/useWorkflowSDK.ts`        | `initWorkflowSystem()`, `startWorkflowTriggers()`, `useWorkflowRunner()`            |
| `src/workflow/triggerRegistry.ts`       | `TriggerRegistry` — log-entry-to-workflow matching                                  |
| `src/workflow/logStreamDispatcher.ts`   | `LogStreamDispatcher` — subscribes to log stream, dispatches triggers               |
| `src/log/rendererRegistry.ts`           | `RendererRegistry` — typed multi-surface renderer registration                      |
| `src/log/entityBindings.ts`             | Entity binding `RendererPoint` tokens and utility functions                         |
| `src/ui-system/registry.ts`             | `UIRegistry` — region, layer, and input handler storage                             |
| `src/ui-system/registrationTypes.ts`    | `IUIRegistrationSDK`, `RegionDef`, `ComponentDef` (deprecated), `LayerDef`          |
| `src/ui-system/types.ts`                | `IRegionSDK`, `IComponentSDK`, `IDnDSDK`, `IReactiveDataSDK`                        |
| `src/ui-system/regionTypes.ts`          | `AnchorPoint`, `RegionLayer`, `Viewport`, `RegionLayoutEntry`, `RegionLayoutConfig` |
| `src/ui-system/layoutEngine.ts`         | Pure layout functions: `resolvePosition`, `inferAnchor`, `clampToViewport`          |
| `src/ui-system/layoutMigration.ts`      | Legacy `{x,y}` → anchor-based layout migration                                      |
| `src/ui-system/portalManager.ts`        | Per-region portal containers with z-index layer ceilings                            |
| `src/ui-system/RegionRenderer.tsx`      | Persistent region rendering with safety isolation                                   |
| `src/ui-system/OnDemandHost.tsx`        | Ephemeral on-demand region instance rendering                                       |
| `src/ui-system/RegionEditOverlay.tsx`   | Edit-mode drag + resize overlay (Pointer Events API)                                |
| `src/ui-system/usePointerDrag.ts`       | Drag/resize handler utilities using `setPointerCapture`                             |
| `src/ui-system/inputHandlerTypes.ts`    | `InputHandlerDef`, `InputHandlerProps`, `InputResult`                               |
| `plugins/generic/vttPlugin.ts`          | Generic rule system plugin                                                          |
| `plugins/daggerheart-core/index.ts`     | Daggerheart core plugin                                                             |
| `plugins/daggerheart-cosmetic/index.ts` | Daggerheart cosmetic plugin                                                         |
| `plugins/core-ui/index.ts`              | Core UI plugin                                                                      |
