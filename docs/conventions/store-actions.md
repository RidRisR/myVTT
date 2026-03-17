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
