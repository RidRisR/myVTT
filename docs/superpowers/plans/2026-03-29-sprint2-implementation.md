# Sprint 2 Implementation Plan

> **状态**：✅ 已完成 | 2026-03-29 | PR #174

**Goal:** Implement Sprint 2 of the plugin system evolution — server RNG purification, roll workflow retirement, groupId grouping, judgment emitEntry, and RendererRegistry.

**Architecture:** Log entries become the complete source of truth. Server is pure RNG (no business logic). Workflows emit business results as log entries. RendererRegistry with (surface, type) keying provides pluggable rendering. Filtering and rendering are independent concerns.

**Tech Stack:** TypeScript, React, Socket.io, SQLite, zustand, vitest

**Design doc:** `docs/plans/sprint2-exploration.md` — all design decisions and rationale.

### Implementation Notes

- **R2 roll workflow**: Initially retired (Task 5), then restored in a follow-up commit after discussion. Roll workflow is the sole place computing `total` after R1 removed it from the server. See `sprint2-deviations.md` deviation 8.
- **groupId**: Changed from optional to required after recognizing the "backward compat" argument was baseless (no old entries exist).
- **RendererRegistry**: Uses `unknown` not `any` for entry props.
- **E2E tests**: Added cross-client judgment visibility and groupId integration tests. Server integration tests for groupId storage/broadcast also added.

---

## File Structure

### New Files

- `src/log/rendererRegistry.ts` — RendererRegistry with (surface, type) keying
- `src/log/rendererRegistry.test.ts` — Registry unit tests
- `src/log/CardShell.tsx` — Shared card shell component (Avatar + name + time + border)
- `src/log/LogEntryCard.tsx` — Entry rendering dispatcher (registry lookup + fallback)
- `src/log/renderers/TextEntryRenderer.tsx` — core:text renderer
- `src/log/renderers/RollResultRenderer.tsx` — core:roll-result renderer
- `plugins/daggerheart-core/DHJudgmentRenderer.tsx` — dh:judgment renderer

### Modified Files

- `server/logHandler.ts` — Remove total from roll-request; accept/store groupId
- `server/schema.ts` — Add group_id column to game_log
- `src/shared/logTypes.ts` — Add groupId to types; remove total from core:roll-result payload
- `src/workflow/context.ts` — Accept groupId option; auto-inject into emitEntry/serverRoll; pass to nested workflows
- `src/workflow/types.ts` — Extend IWorkflowRunner with ChainContext parameter
- `src/workflow/pluginSDK.ts` — Extend WorkflowRunner for ChainContext; add registerRenderer to PluginSDK
- `src/workflow/logStreamDispatcher.ts` — New groupId + causedBy at trigger boundaries
- `src/workflow/baseWorkflows.ts` — Remove roll workflow; inline into quick-roll
- `src/workflow/useWorkflowSDK.ts` — Pass ChainContext through initWorkflowSystem
- `src/workflow/index.ts` — Remove getRollWorkflow export; add renderer exports
- `plugins/daggerheart-core/rollSteps.ts` — Direct serverRoll + emitEntry for judgment
- `plugins/daggerheart/types.ts` — Add LogPayloadMap augmentation for dh:judgment
- `plugins/daggerheart/index.ts` — Register dh:judgment renderer; update surfaces
- `src/rules/sdk.ts` — Remove getRollWorkflow export; add renderer exports
- `src/chat/ChatPanel.tsx` — Filter logic + LogEntryCard + remove logEntryToChatMessage
- `src/chat/MessageScrollArea.tsx` — Accept GameLogEntry[] instead of ChatMessage[]
- `src/chat/ToastStack.tsx` — Accept GameLogEntry[] instead of ChatMessage[]
- `src/chat/DiceResultCard.tsx` — Change DiceAnimContent props from ChatRollMessage to independent fields
- `src/ui-system/registrationTypes.ts` — Add registerRenderer to IUIRegistrationSDK

---

## Task 1: R1 — Server RNG Purification

**Files:**

- Modify: `server/logHandler.ts:140-155`
- Modify: `src/shared/logTypes.ts:41-65`
- Modify: `server/__tests__/scenarios/game-log.test.ts`
- Modify: `src/workflow/context.test.ts`

- [x] **Step 1: Remove total from server roll-request handler**

In `server/logHandler.ts`, remove the total calculation line and the `total` assignment in the payload:

```typescript
// DELETE this line (~144):
// const total = rolls.flat().reduce((a, b) => a + b, 0)

// In payload construction, remove:
// total,
```

- [x] **Step 2: Remove total from LogPayloadMap['core:roll-result']**

In `src/shared/logTypes.ts`, remove `total: number` from the `core:roll-result` entry in `LogPayloadMap`.

- [x] **Step 3: Update server tests**

Update any test assertions that check for `total` in `core:roll-result` payload. The entry should no longer contain `total`.

- [x] **Step 4: Fix any TypeScript compilation errors**

Run `npx tsc -b --noEmit` and fix any consumers that reference `entry.payload.total` on `core:roll-result` entries. The main consumer is `DiceResultCard.tsx` which already recomputes total via `buildCompoundResult`.

- [x] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [x] **Step 6: Commit**

```
feat(R1): remove total from server core:roll-result — pure RNG
```

---

## Task 2: G1 — groupId Types + Schema

**Files:**

- Modify: `src/shared/logTypes.ts`
- Modify: `server/schema.ts`
- Modify: `server/logHandler.ts`
- Modify: `server/logUtils.ts` (rowToEntry)

- [x] **Step 1: Add groupId to type definitions**

In `src/shared/logTypes.ts`:

- Add `groupId?: string` to `GameLogEntry`
- Add `groupId?: string` to `LogEntrySubmission`
- Add `groupId?: string` to `RollRequest`

- [x] **Step 2: Add group_id column to schema**

In `server/schema.ts`, add `group_id TEXT` column to the `game_log` CREATE TABLE statement, and add an index.

- [x] **Step 3: Update server INSERT statements to include group_id**

In `server/logHandler.ts`, BOTH INSERT statements (~line 66 and ~line 160) need:

- Add `group_id` to the column list
- Add `submission.groupId ?? null` (or `request.groupId ?? null`) to the VALUES

Specifically, the column list changes from:
`(id, type, origin, executor, parent_id, chain_depth, triggerable, visibility, base_seq, payload, timestamp)`
to:
`(id, type, origin, executor, parent_id, group_id, chain_depth, triggerable, visibility, base_seq, payload, timestamp)`

And add the corresponding value parameter after `parentId ?? null`.

- [x] **Step 4: Update rowToEntry to read group_id**

In `server/logUtils.ts`, add to the `rowToEntry` function:

```typescript
groupId: (row.group_id as string | null) ?? undefined,
```

- [x] **Step 5: Update schema test**

In `server/__tests__/schema.test.ts`, update the expected column list to include `group_id`.

- [x] **Step 6: Design note on nullability**

`groupId` is `?: string` (optional) because:

- Old entries in the database don't have group_id (NULL)
- The client `createWorkflowContext` will ALWAYS generate a groupId for new entries (Task 3)
- This is a transitional design — NOT a sign that groupId can be omitted

- [x] **Step 4: Run all tests**

Run: `npx vitest run`

- [x] **Step 5: Commit**

```
feat(G1): add groupId to log types and schema
```

---

## Task 3: G1 — Context groupId Auto-Injection

**Files:**

- Modify: `src/workflow/context.ts`
- Modify: `src/workflow/context.test.ts`
- Modify: `src/workflow/types.ts`
- Modify: `src/workflow/pluginSDK.ts`

- [x] **Step 1: Write tests for groupId auto-injection**

In `src/workflow/context.test.ts`, add tests:

- `emitEntry auto-injects groupId from context options`
- `serverRoll auto-injects groupId from context options`
- `nested runWorkflow inherits parent groupId`
- `default groupId is generated when not provided`

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/workflow/context.test.ts`

- [x] **Step 3: Add ChainContext to context options**

In `src/workflow/context.ts`:

- Add to `ContextOptions`: `groupId?: string`, `chainDepth?: number`, `causedBy?: string`
- At the top of `createWorkflowContext`, generate groupId if not provided: `const groupId = options?.groupId ?? uuidv7()`
- In `emitEntry`: auto-inject `groupId` into submission
- In `serverRoll`: auto-inject `groupId` into request
- In `updateComponent` and `updateTeamTracker`: auto-inject `groupId`
- In `runWorkflow`: pass `groupId` to nested context options

- [x] **Step 4: Extend IWorkflowRunner with ChainContext**

In `src/workflow/types.ts`, add:

```typescript
export interface ChainContext {
  groupId?: string
  causedBy?: string
  chainDepth?: number
}
```

Extend `IWorkflowRunner.runWorkflow` with optional third parameter `chainCtx?: ChainContext`.

- [x] **Step 5: Update WorkflowRunner to pass ChainContext**

In `src/workflow/pluginSDK.ts`, modify `WorkflowRunner.runWorkflow` to accept and pass `ChainContext` to `createWorkflowContext`.

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run`

- [x] **Step 7: Commit**

```
feat(G1): auto-inject groupId in workflow context
```

---

## Task 4: G1 — Dispatcher causedBy at Trigger Boundary

**Files:**

- Modify: `src/workflow/logStreamDispatcher.ts`
- Modify: `src/workflow/logStreamDispatcher.test.ts`
- Modify: `src/workflow/useWorkflowSDK.ts`
- Modify: `src/workflow/__tests__/initWorkflowSystem.test.ts`

- [x] **Step 1: Write test for causedBy propagation**

In `src/workflow/logStreamDispatcher.test.ts`, add test:

- When dispatcher triggers a workflow, `runWorkflow` is called with `chainCtx` containing: new groupId, causedBy = entry.id, chainDepth = entry.chainDepth + 1

- [x] **Step 2: Update LogStreamDispatcher to pass ChainContext**

In `src/workflow/logStreamDispatcher.ts`:

```typescript
await this.runner.runWorkflow({ name: trigger.workflow } as WorkflowHandle, input, {
  groupId: uuidv7(),
  causedBy: entry.id,
  chainDepth: entry.chainDepth + 1,
})
```

Add `import { uuidv7 } from '../shared/uuidv7'` at top.

- [x] **Step 3: Update initWorkflowSystem dispatcher creation**

In `src/workflow/useWorkflowSDK.ts`, ensure the WorkflowRunner passed to LogStreamDispatcher supports the ChainContext parameter.

- [x] **Step 4: Run tests**

Run: `npx vitest run`

- [x] **Step 5: Commit**

```
feat(G1): dispatcher creates new groupId + causedBy at trigger boundary
```

---

## Task 5: R2 — Roll Workflow Retirement

**Files:**

- Modify: `src/workflow/baseWorkflows.ts`
- Modify: `plugins/daggerheart-core/rollSteps.ts`
- Modify: `src/workflow/index.ts`
- Modify: `src/rules/sdk.ts`
- Modify: `src/workflow/__tests__/commandSystem.test.ts`
- Modify: `plugins/daggerheart-core/__tests__/rollSteps.test.ts`

- [x] **Step 1: Inline roll logic into quick-roll**

In `src/workflow/baseWorkflows.ts`:

- Remove the entire `roll` workflow definition (`_rollWorkflow`, `getRollWorkflow`)
- Rewrite `quick-roll` step 'roll' to directly: resolve @tokens, tokenize expression, call `ctx.serverRoll()`, compute total via `buildCompoundResult()`
- Remove `RollOutput` interface (no longer used as workflow output)

- [x] **Step 2: Update dh:action-check to use direct serverRoll**

In `plugins/daggerheart-core/rollSteps.ts`:

- Remove import of `getRollWorkflow`
- Rewrite step 'roll' to: resolve @tokens, tokenize, call `ctx.serverRoll()` directly
- The step should set `ctx.vars.rolls` and `ctx.vars.total` from the server response + `buildCompoundResult`

- [x] **Step 3: Remove getRollWorkflow from exports**

- `src/workflow/index.ts`: Remove `getRollWorkflow` export
- `src/rules/sdk.ts`: Remove `getRollWorkflow` export

- [x] **Step 4: Fix compilation and tests**

Run `npx tsc -b --noEmit` to find broken references. Update test files that used `getRollWorkflow`.

- [x] **Step 5: Run all tests**

Run: `npx vitest run`

- [x] **Step 6: Commit**

```
feat(R2): retire roll workflow — direct ctx.serverRoll() calls
```

---

## Task 6: J1 — Judgment emitEntry

**Files:**

- Modify: `plugins/daggerheart/types.ts`
- Modify: `plugins/daggerheart-core/rollSteps.ts`

- [x] **Step 1: Add dh:judgment to LogPayloadMap**

In `plugins/daggerheart/types.ts`, add module augmentation for `LogPayloadMap`:

```typescript
declare module '../../src/shared/logTypes' {
  interface LogPayloadMap {
    'dh:judgment': {
      formula: string
      rolls: number[][]
      total: number
      judgment: { type: string; outcome: string }
    }
  }
}
```

- [x] **Step 2: Add emit step to dh:action-check**

In `plugins/daggerheart-core/rollSteps.ts`, add a new step `'dh:emit-judgment'` after `'dh:judge'`:

```typescript
{
  id: 'dh:emit-judgment',
  run: (ctx) => {
    const judgment = ctx.vars.judgment
    if (!judgment) return
    ctx.emitEntry({
      type: 'dh:judgment',
      payload: {
        formula: ctx.vars.formula,
        rolls: ctx.vars.rolls,
        total: ctx.vars.total,
        judgment,
      },
      triggerable: true,
    })
  },
}
```

- [x] **Step 3: Remove announceEvent from display step**

In the `display` step, remove `ctx.events.emit(announceEvent, ...)`. Keep `toastEvent` (local UI feedback).

- [x] **Step 4: Run tests**

Run: `npx vitest run`

- [x] **Step 5: Commit**

```
feat(J1): dh:judgment emitEntry for cross-client visibility
```

---

## Task 7: A3 Step 1 — RendererRegistry

**Files:**

- Create: `src/log/rendererRegistry.ts`
- Create: `src/log/rendererRegistry.test.ts`
- Modify: `src/ui-system/registrationTypes.ts`
- Modify: `src/workflow/pluginSDK.ts`

- [x] **Step 1: Write RendererRegistry tests**

Create `src/log/rendererRegistry.test.ts`:

- `register and get renderer by (surface, type)`
- `get returns undefined for unregistered (surface, type)`
- `first registration wins (no overwrite)`
- `different surfaces can have different renderers for same type`
- `clear removes all registrations`

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/log/rendererRegistry.test.ts`

- [x] **Step 3: Implement RendererRegistry**

Create `src/log/rendererRegistry.ts`:

```typescript
import type { GameLogEntry } from '../shared/logTypes'

export interface LogEntryRendererProps {
  entry: GameLogEntry
  isNew?: boolean
}

export type LogEntryRenderer = React.ComponentType<LogEntryRendererProps>

const registry = new Map<string, LogEntryRenderer>()

function key(surface: string, type: string): string {
  return `${surface}::${type}`
}

export function registerRenderer(surface: string, type: string, renderer: LogEntryRenderer): void {
  const k = key(surface, type)
  if (registry.has(k)) {
    console.warn(`Renderer for "${surface}::${type}" already registered, skipping`)
    return
  }
  registry.set(k, renderer)
}

export function getRenderer(surface: string, type: string): LogEntryRenderer | undefined {
  return registry.get(key(surface, type))
}

export function clearRenderers(): void {
  registry.clear()
}
```

- [x] **Step 4: Add registerRenderer to IUIRegistrationSDK**

In `src/ui-system/registrationTypes.ts`, add:

```typescript
registerRenderer(surface: string, type: string, renderer: React.ComponentType<{ entry: unknown; isNew?: boolean }>): void
```

- [x] **Step 5: Implement in PluginSDK**

In `src/workflow/pluginSDK.ts`, add `registerRenderer` to the `ui` property in PluginSDK constructor.

- [x] **Step 6: Run tests**

Run: `npx vitest run`

- [x] **Step 7: Commit**

```
feat(A3-1): RendererRegistry with (surface, type) keying
```

---

## Task 8: A3 Step 2 — Base Renderers + CardShell

**Files:**

- Create: `src/log/CardShell.tsx`
- Create: `src/log/renderers/TextEntryRenderer.tsx`
- Create: `src/log/renderers/RollResultRenderer.tsx`
- Modify: `src/chat/DiceResultCard.tsx` — refactor DiceAnimContent props
- Modify: `src/workflow/baseWorkflows.ts` — register base renderers

- [x] **Step 1: Refactor DiceAnimContent props**

In `src/chat/DiceResultCard.tsx`, change `DiceAnimContentProps` from `{ message: ChatRollMessage, ... }` to independent fields:

```typescript
interface DiceAnimContentProps {
  formula: string
  resolvedFormula?: string
  rolls: number[][]
  isNew: boolean
  dieConfigs?: DieConfig[]
  footer?: { text: string; color: string }
  totalColor?: string
}
```

Update the function body to use these props instead of `message.formula`, `message.rolls`, etc. Keep `DiceResultCard` as a thin wrapper that extracts fields from `ChatRollMessage` for backward compatibility during migration.

- [x] **Step 2: Create CardShell component**

Create `src/log/CardShell.tsx` — extract the common card layout (Avatar + name + timestamp + configurable border) from MessageCard. Accept `entry: GameLogEntry`, `isNew`, `variant: 'default' | 'accent'`, and `children`.

- [x] **Step 3: Create TextEntryRenderer**

Create `src/log/renderers/TextEntryRenderer.tsx` — renders `core:text` entries using CardShell + text content.

- [x] **Step 4: Create RollResultRenderer**

Create `src/log/renderers/RollResultRenderer.tsx` — renders `core:roll-result` entries using CardShell variant="accent" + DiceAnimContent.

- [x] **Step 5: Register base renderers**

In `src/workflow/baseWorkflows.ts` (or a new `src/log/registerBaseRenderers.ts`), register the base renderers for the 'chat' surface:

```typescript
registerRenderer('chat', 'core:text', TextEntryRenderer)
registerRenderer('chat', 'core:roll-result', RollResultRenderer)
```

- [x] **Step 6: Run tests + type check**

Run: `npx tsc -b --noEmit && npx vitest run`

- [x] **Step 7: Commit**

```
feat(A3-2): base renderers for core:text and core:roll-result
```

---

## Task 9: A3 Step 3 — Plugin Renderer (dh:judgment)

**Files:**

- Create: `plugins/daggerheart-core/DHJudgmentRenderer.tsx`
- Modify: `plugins/daggerheart-core/rollSteps.ts` — register renderer

- [x] **Step 1: Create DHJudgmentRenderer**

Create `plugins/daggerheart-core/DHJudgmentRenderer.tsx` — renders dh:judgment entries with dice animation + judgment badge. Uses CardShell variant="accent" and DiceAnimContent with Daggerheart-specific die configs (Hope/Fear colors).

- [x] **Step 2: Register renderer in plugin activation**

In `plugins/daggerheart-core/rollSteps.ts`, in `registerDHCoreSteps`:

```typescript
sdk.ui.registerRenderer('chat', 'dh:judgment', DHJudgmentRenderer)
```

- [x] **Step 3: Run tests + type check**

Run: `npx tsc -b --noEmit && npx vitest run`

- [x] **Step 4: Commit**

```
feat(A3-3): dh:judgment renderer replaces rollCardRenderers
```

---

## Task 10: A3 Step 4 — ChatPanel Migration

**Files:**

- Create: `src/log/LogEntryCard.tsx`
- Modify: `src/chat/ChatPanel.tsx`
- Modify: `src/chat/MessageScrollArea.tsx`
- Modify: `src/chat/ToastStack.tsx`

- [x] **Step 1: Create LogEntryCard with fallback**

Create `src/log/LogEntryCard.tsx`:

```typescript
export function LogEntryCard({ entry, isNew }: { entry: GameLogEntry; isNew?: boolean }) {
  const Renderer = getRenderer('chat', entry.type)
  if (Renderer) return <Renderer entry={entry} isNew={isNew} />

  // Temporary fallback — old path (remove after full migration)
  const chatMsg = logEntryToChatMessage(entry)
  if (!chatMsg) return null
  return <MessageCard message={chatMsg} isNew={isNew} />
}
```

- [x] **Step 2: Migrate MessageScrollArea to GameLogEntry[]**

Change `MessageScrollAreaProps` to accept `entries: GameLogEntry[]` and `newEntryIds: Set<string>`. Render `LogEntryCard` instead of `MessageCard`.

- [x] **Step 3: Migrate ToastStack to GameLogEntry[]**

Change `ToastItem` to `{ entry: GameLogEntry; timestamp: number }`. Render `LogEntryCard` instead of `MessageCard`.

- [x] **Step 4: Update ChatPanel**

- Replace `logEntryToChatMessage` filter+map with a type-based filter:
  ```typescript
  const CHAT_TYPES = new Set(['core:text', 'core:roll-result', 'dh:judgment'])
  const visibleEntries = useMemo(
    () => logEntries.filter((e) => CHAT_TYPES.has(e.type)),
    [logEntries],
  )
  ```
- Pass `visibleEntries` (GameLogEntry[]) to MessageScrollArea
- Update toast logic to use GameLogEntry instead of ChatMessage

- [x] **Step 5: Remove old code**

Once all types render through the registry:

- Delete `logEntryToChatMessage()` from ChatPanel
- Remove fallback path from LogEntryCard
- Remove `ChatMessage` types from `src/shared/chatTypes.ts` (keep `MessageOrigin` and `getDisplayIdentity`)
- Clean up unused imports

- [x] **Step 6: Run full test suite + type check**

Run: `npx tsc -b --noEmit && npx vitest run`

- [x] **Step 7: Commit**

```
feat(A3-4): ChatPanel migrated to RendererRegistry
```

---

## Task 11: Deviation Documentation + Final Cleanup

**Files:**

- Create: `docs/plans/sprint2-deviations.md`
- Modify: `docs/archive/design-history/16a-实现偏差说明.md`

- [x] **Step 1: Write Sprint 2 deviation document**

Document any deviations from the exploration doc that occurred during implementation.

- [x] **Step 2: Update deviation doc references**

Update deviation #8 (total field) and #12 (causal chain) with Sprint 2 status.

- [x] **Step 3: Run final verification**

```bash
npx tsc -b --noEmit
npx vitest run
npx prettier --check "src/**/*.{ts,tsx}" "server/**/*.ts" "plugins/**/*.{ts,tsx}"
npx eslint src/ server/ plugins/ --ext .ts,.tsx
```

- [x] **Step 4: Commit**

```
docs: Sprint 2 deviation record
```
