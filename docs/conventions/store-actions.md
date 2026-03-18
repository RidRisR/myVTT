# Store Action Convention

## Rule

All user actions involving API calls **MUST** be Store methods (`src/stores/*.ts`).
Component onClick handlers **MUST** be single-line calls.

```
✅ <button onClick={() => worldStore.spawnFromBlueprint(bp, sceneId)} />
❌ <button onClick={() => { addEntity(); addToScene(); addToken(); }} />
```

## Why

Store methods can be called directly in Node.js integration tests, verifying the full chain (Store → HTTP → SQLite → Socket → Store).
Multi-step async logic in component closures cannot be tested without a browser.

## Compliance

1. **Component files must NOT import the `api` module** — ESLint `no-restricted-imports` enforces this automatically (see `eslint.config.js`)
2. **Every new user-visible flow** must have a corresponding integration test (`server/__tests__/scenarios/*.test.ts`)

## Verification

- **Code level**: ESLint `no-restricted-imports` blocks violations at commit time
- **Test level**: PR review checks for corresponding integration tests

## Single Source of Truth Rule

Each type of business data **MUST** have exactly one Store as its source of truth. If a new Store covers fields from an old Store, the old fields must be removed in the same PR.

Violation symptoms: data exists but disappears on refresh, data appears in the wrong UI tab, inconsistent state between Stores.

## Integration Test Standards

- Test files: `server/__tests__/scenarios/*.test.ts` (Node environment, real server)
- Entry point is a **Store method** or **raw HTTP call** (simulating button clicks)
- Use `setupTestRoom()` to create temp room + test server; call `cleanup()` to tear down
- **Dual verification**: after each operation, assert both Store state (`getState()`) and server state (`GET` request)
- Pure Node.js (no browser, no mocks) — use `// @vitest-environment node` pragma

## Error Handling Convention

Errors must be surfaced to users at the appropriate layer. Never silently swallow errors.

### Layer Model

| Layer                     | Responsibility               | Pattern                                               |
| ------------------------- | ---------------------------- | ----------------------------------------------------- |
| **API** (`shared/api.ts`) | Throw on HTTP errors         | `throw new Error(msg)` — never catch here             |
| **Store** (`stores/*.ts`) | Propagate to caller          | Do NOT wrap in try/catch — let the component handle   |
| **Component** (`*.tsx`)   | Show user feedback           | `try/catch` → `toast('error', msg)` + `console.error` |
| **ErrorBoundary**         | Catch-all for render crashes | Already in place (`ui/ErrorBoundary.tsx`)             |

### Rules

1. **User-initiated async operations** (upload, save, delete) in components:

   ```tsx
   try {
     await storeAction()
   } catch (err) {
     console.error('Context:', err)
     toast('error', t('namespace.error_key'))
   }
   ```

2. **Initialization errors** (room connect, data load):

   ```tsx
   catch (err) {
     console.error('Init failed:', err)
     setErrorState(err instanceof Error ? err.message : 'Unknown error')
   }
   ```

   Then render an error UI instead of the normal component.

3. **NEVER** use `console.error` alone without user-visible feedback.
   The only exception is `ErrorBoundary` which logs AND renders a fallback UI.

### Toast types

- `'error'` — operation failed, user should retry or report
- `'success'` — operation completed (use sparingly)
- `'undo'` — destructive action with undo option
- `'info'` — neutral notification
